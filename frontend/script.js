/**
 * SlugRoute | UCSC Map Logic
 */

const CONFIG = {
    DEFAULT_TERM: "2262",
    CAMPUS_CENTER: {
        lat: 36.9914,
        lng: -122.0608
    },
    UCSC_BOUNDS: {
        north: 38.00,
        south: 36.00,
        west: -123.00,
        east: -121.00
    },
    ZOOM: {
        CAMPUS: 15,
        BUILDING: 18
    },
    COLOR_POOL: [
        "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
        "#911eb4", "#42d4f4", "#f032e6", "#bfef45", "#fabed4",
        "#469990", "#dcbeff", "#9A6324", "#fffac8", "#800000",
        "#aaffc3", "#808000", "#ffd8b1", "#000075", "#a9a9a9"
    ]
};

// Global State
let map;
let markers = [];
let activeInfoWindow = null;
let currentOfferings = [];
let lastSearchResults = [];
let pendingSelections = {};
let savedCourses = JSON.parse(localStorage.getItem("slugroute_saved")) || [];
let AdvancedMarkerElement;
let userLocation;
let suggestionTimeout;

/**
 * ColorManager assigns unique colors to each class number
 */
const ColorManager = {
    assignments: {},

    getColor: function(classNumber) {
        if (ColorManager.assignments[classNumber]) {
            return ColorManager.assignments[classNumber];
        }

        const usedColors = Object.values(ColorManager.assignments);
        const nextColor = CONFIG.COLOR_POOL.find(function(c) {
            return !usedColors.includes(c);
        }) || CONFIG.COLOR_POOL[0];

        ColorManager.assignments[classNumber] = nextColor;
        return nextColor;
    },

    releaseColor: function(classNumber) {
        delete ColorManager.assignments[classNumber];
    }
};

/**
 * utils provides formatting and logic helpers
 */
const utils = {
    formatCourseCode: function(input) {
        return input.trim().toUpperCase().replace(/([A-Z]+)(\d+)/, "$1 $2");
    },

    getTermName: function(term) {
        const year = "20" + term.substring(1, 3);
        const suffix = term.charAt(3);
        let season = "Unknown";

        if (suffix === "0") {
            season = "Winter";
        } else if (suffix === "2") {
            season = "Spring";
        } else if (suffix === "4") {
            season = "Summer";
        } else if (suffix === "8") {
            season = "Fall";
        }

        return `${season} ${year}`;
    },

    getFilterCategory: function(type) {
        const t = type.toUpperCase();
        if (t === "LBS" || t === "LAB") {
            return "LAB";
        }
        if (t === "DIS") {
            return "DIS";
        }
        return "LEC";
    },

    getClassStatus: function(meeting) {
        const timeStr = (meeting.time || "").toUpperCase();
        const bldStr = (meeting.building || "").toUpperCase();

        if (timeStr.includes("CANCELLED") || bldStr.includes("CANCELLED")) {
            return "CANCELLED";
        }
        if (timeStr.includes("TBA") || bldStr.includes("TBA") || bldStr.trim() === "" || bldStr === "N/A") {
            return "TBD";
        }
        if (bldStr.includes("ONLINE") || bldStr.includes("REMOTE")) {
            return "ONLINE";
        }

        return "PHYSICAL";
    },

    getIconPath: function(category) {
        if (category === "LEC") {
            return "M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z";
        }
        if (category === "LAB") {
            return "M3 3h18v18H3z";
        }
        return "M12 2L2 21H22L12 2Z";
    },

    getHeartSvg: function(isSaved) {
        const fill = isSaved ? "#ef4444" : "none";
        const stroke = isSaved ? "#ef4444" : "#64748b";
        return `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="action-svg">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        `;
    },

    getEyeSvg: function(isVisible) {
        const stroke = "#64748b";
        if (isVisible) {
            return `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            `;
        }
        return `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg dimmed">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    }
};

/**
 * showToast displays a temporary alert message to the user
 */
function showToast(message, type = "error") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(function() {
        toast.classList.add("fade-out");
        setTimeout(function() {
            toast.remove();
        }, 500);
    }, 3000);
}

/**
 * populateTerms fetches available academic terms
 */
async function populateTerms() {
    const termSelect = document.getElementById("term-select");
    try {
        const response = await fetch('/api/terms');
        const terms = await response.json();

        if (!terms || terms.length === 0) {
            termSelect.innerHTML = "<option value=\"\">No Data Found</option>";
            return;
        }

        termSelect.innerHTML = "";

        const now = new Date();
        const m = now.getMonth() + 1;
        const y = now.getFullYear().toString().slice(-2);

        let season = "0";
        if (m >= 4 && m <= 6) {
            season = "2";
        }
        if (m >= 7 && m <= 8) {
            season = "4";
        }
        if (m >= 9) {
            season = "8";
        }

        const idealTerm = `2${y}${season}`;

        terms.forEach(function(t) {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = utils.getTermName(t);
            if (t === idealTerm) {
                opt.selected = true;
            }
            termSelect.appendChild(opt);
        });

    } catch (err) {
        console.error("Failed to load terms:", err);
        termSelect.innerHTML = "<option value=\"\">API Error</option>";
    }
}

/**
 * createMarkerElement builds the SVG icon for map pins
 */
function createMarkerElement(type, color, count = 1) {
    const category = utils.getFilterCategory(type);
    const div = document.createElement('div');
    div.className = 'marker-wrapper';

    if (count > 1) {
        div.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="38" height="38" class="marker-svg">
                <circle cx="17" cy="17" r="15" fill="${color}" stroke="#ffffff" stroke-width="2"/>
                <text x="17" y="17"
                      font-family="Inter, sans-serif"
                      font-weight="800"
                      font-size="14"
                      fill="white"
                      text-anchor="middle"
                      dominant-baseline="central"
                      class="marker-text">${count}</text>
            </svg>
        `;
        return div;
    }

    const path = utils.getIconPath(category);
    div.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="34" height="34" class="marker-svg">
            <path d="${path}" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        </svg>
    `;
    return div;
}

/**
 * highlightSidebarCard visually highlights a card
 */
function highlightSidebarCard(classNumber, active) {
    const el = document.getElementById(`card-${classNumber}`);
    if (el) {
        if (active) {
            el.classList.add('highlight');
        } else {
            el.classList.remove('highlight');
        }
    }
}

/**
 * renderSearchList updates the "Current Results" sidebar section
 */
function renderSearchList() {
    const container = document.getElementById("search-results");

    if (currentOfferings.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">Search for a course to see sections here.</p>";
        return;
    }

    container.innerHTML = currentOfferings.map(function(course) {
        const isSaved = savedCourses.some(function(s) {
            return s.class_number === course.class_number;
        });
        const color = ColorManager.getColor(course.class_number);
        const isVisible = course.visible !== false;

        const meetingTagsHtml = course.meetings.map(function(m, index) {
            const status = utils.getClassStatus(m);
            const cat = utils.getFilterCategory(m.type);
            const symbol = cat === 'LEC' ? '★' : (cat === 'LAB' ? '■' : '▲');
            const displayTime = m.time && m.time.trim() !== "" ? m.time : "TBA";

            let locationHtml = `<span class="loc-text">${m.building}</span>`;
            if (status === "ONLINE") {
                locationHtml = `<span class="online-tag">Online Instruction</span>`;
            } else if (status === "CANCELLED") {
                locationHtml = `<span class="cancelled-tag">Cancelled</span>`;
            } else if (status === "TBD") {
                locationHtml = `<span class="tbd-tag">Location TBA</span>`;
            }

            return `
                <div class="sidebar-meeting-tag" style="--accent-color: ${color}">
                    <div class="tag-content">
                        <div class="tag-top">
                            <span class="tag-symbol" style="color: ${color}">${symbol}</span>
                            <span class="tag-label">${m.type}</span>
                            ${locationHtml}
                        </div>
                        <div class="tag-bottom">
                            <span class="tag-time">${displayTime}</span>
                        </div>
                    </div>
                    <button class="tag-remove-btn" title="Remove Section" data-class="${course.class_number}" data-index="${index}">✕</button>
                </div>
            `;
        }).join("");

        return `
            <div class="course-card ${!isVisible ? 'hidden-offering' : ''}" id="card-${course.class_number}" data-class="${course.class_number}" style="--accent-color: ${isVisible ? color : '#e2e8f0'}">
                <div class="card-header">
                    <div class="card-info-group">
                        <h4>${course.course_code}</h4>
                        <div class="course-meta-row">
                            <span class="course-instructor" title="${course.instructor}">${course.instructor}</span>
                            <span class="course-id-tag">#${course.class_number}</span>
                        </div>
                        <div class="course-term-tag">${utils.getTermName(course.term)}</div>
                    </div>
                    <div class="card-actions">
                        <button class="save-btn vis-toggle" title="Toggle Visibility" data-class="${course.class_number}">
                            ${utils.getEyeSvg(isVisible)}
                        </button>
                        <button class="save-btn save-toggle" title="Save Course" data-class="${course.class_number}">
                            ${utils.getHeartSvg(isSaved)}
                        </button>
                        <button class="remove-btn result-remove" title="Clear Result" data-class="${course.class_number}">✕</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="sidebar-tags-container">
                        ${meetingTagsHtml}
                    </div>
                </div>
            </div>
        `;
    }).join("");

    attachListListeners();
}

/**
 * attachListListeners attaches event listeners for dynamically created sidebar items
 */
function attachListListeners() {
    document.querySelectorAll(".vis-toggle").forEach(function(btn) {
        btn.onclick = function(e) {
            e.stopPropagation();
            toggleVisibility(this.dataset.class);
        };
    });

    document.querySelectorAll(".save-toggle").forEach(function(btn) {
        btn.onclick = function(e) {
            e.stopPropagation();
            toggleSaveCourse(this.dataset.class);
        };
    });

    document.querySelectorAll(".result-remove").forEach(function(btn) {
        btn.onclick = function(e) {
            e.stopPropagation();
            removeResult(this.dataset.class);
        };
    });

    document.querySelectorAll(".tag-remove-btn").forEach(function(btn) {
        btn.onclick = function(e) {
            e.stopPropagation();
            removeMeeting(this.dataset.class, parseInt(this.dataset.index));
        };
    });

    document.querySelectorAll(".course-card").forEach(function(card) {
        card.onclick = function() {
            focusClass(this.dataset.class);
        };
    });
}

/**
 * toggleVisibility switches the visible flag
 */
function toggleVisibility(classNum) {
    const offering = currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (offering) {
        offering.visible = offering.visible === false ? true : false;
        refreshMapAndUI();
    }
}

/**
 * removeMeeting deletes a specific section
 */
function removeMeeting(classNum, meetingIndex) {
    const offering = currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (offering && offering.meetings.length > 1) {
        offering.meetings.splice(meetingIndex, 1);

        const savedIdx = savedCourses.findIndex(function(s) {
            return s.class_number === classNum;
        });

        if (savedIdx > -1) {
            savedCourses[savedIdx] = offering;
            localStorage.setItem("slugroute_saved", JSON.stringify(savedCourses));
        }

        refreshMapAndUI();
    } else {
        removeResult(classNum);
    }
}

/**
 * renderSavedList updates the "Saved for Later" section
 */
function renderSavedList() {
    const container = document.getElementById("saved-classes");

    if (savedCourses.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">No saved classes.</p>";
        return;
    }

    container.innerHTML = savedCourses.map(function(course) {
        const color = ColorManager.getColor(course.class_number);
        const lecMeet = course.meetings.find(function(m) {
            return utils.getFilterCategory(m.type) === "LEC";
        });
        const timeStr = lecMeet ? lecMeet.time : (course.meetings[0] ? course.meetings[0].time : "Time TBD");

        return `
            <div class="course-card saved-item-card" data-class="${course.class_number}" style="--accent-color: ${color}">
                <div class="card-header">
                    <div class="card-info-group">
                        <h4>${course.course_code}</h4>
                        <div class="course-instructor" title="${course.instructor}">${course.instructor}</div>
                        <div class="course-term-tag">${utils.getTermName(course.term)}</div>
                        <div class="course-card-time">🕒 ${timeStr}</div>
                    </div>
                    <div class="card-actions">
                        <button class="save-btn save-toggle" data-class="${course.class_number}">
                            ${utils.getHeartSvg(true)}
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join("");

    document.querySelectorAll(".saved-item-card").forEach(function(card) {
        card.onclick = function() {
            addSavedToResults(this.dataset.class);
        };
    });

    document.querySelectorAll(".saved-item-card .save-toggle").forEach(function(btn) {
        btn.onclick = function(e) {
            e.stopPropagation();
            toggleSaveCourse(this.dataset.class);
        };
    });
}

/**
 * groupDataByLocation clusters meeting data
 */
function groupDataByLocation(offerings) {
    const locationMap = {};

    offerings.forEach(function(offering) {
        if (offering.visible === false) {
            return;
        }

        const classColor = ColorManager.getColor(offering.class_number);
        offering.meetings.forEach(function(meet) {
            if (!meet.lat || meet.lat === 0 || isNaN(meet.lat)) {
                return;
            }

            const locKey = `${meet.lat},${meet.lng}`;

            if (!locationMap[locKey]) {
                locationMap[locKey] = {
                    lat: meet.lat,
                    lng: meet.lng,
                    building: meet.building,
                    imageUrl: meet.image_url || '',
                    offerings: {},
                    totalMeetings: 0,
                    highestPriorityType: "DIS",
                    filterCategories: []
                };
            }

            const cat = utils.getFilterCategory(meet.type);
            locationMap[locKey].totalMeetings++;

            if (!locationMap[locKey].filterCategories.includes(cat)) {
                locationMap[locKey].filterCategories.push(cat);
            }

            if (cat === "LEC") {
                locationMap[locKey].highestPriorityType = "LEC";
            } else if (cat === "LAB" && locationMap[locKey].highestPriorityType !== "LEC") {
                locationMap[locKey].highestPriorityType = "LAB";
            }

            if (!locationMap[locKey].offerings[offering.class_number]) {
                locationMap[locKey].offerings[offering.class_number] = {
                    courseCode: offering.course_code,
                    term: offering.term,
                    color: classColor,
                    meetings: []
                };
            }
            locationMap[locKey].offerings[offering.class_number].meetings.push(meet);
        });
    });
    return locationMap;
}

/**
 * buildInfoWindowHtml creates HTML for Google Maps InfoWindow
 */
function buildInfoWindowHtml(locationGroup, activeFilters) {
    let offeringsHtml = "";
    let visibleCount = 0;

    Object.entries(locationGroup.offerings).forEach(function([classNum, off]) {
        const visibleMeetings = off.meetings.filter(function(m) {
            return activeFilters.includes(utils.getFilterCategory(m.type));
        });

        if (visibleMeetings.length > 0) {
            visibleCount++;
            offeringsHtml += `<div class="iw-offering" style="--accent-color: ${off.color}" data-class="${classNum}">
                <div class="course-code iw-course-code">
                    ${off.courseCode} <i class="iw-term-label">(${utils.getTermName(off.term)})</i>
                </div>
                <div class="meetings-list">`;

            visibleMeetings.forEach(function(m) {
                const type = m.type.toUpperCase();
                const cat = utils.getFilterCategory(type);
                const iconPath = utils.getIconPath(cat);
                const roomStr = m.room_number ? `${m.room_number}` : "TBA";
                const timeStr = m.time || "TBA";

                offeringsHtml += `<div class="meeting-card">
                    <div class="meeting-row-top">
                        <div class="meeting-identity">
                            <span class="type-badge">
                                <svg width="10" height="10" viewBox="0 0 24 24" class="iw-badge-icon">
                                    <path d="${iconPath}" fill="white"/>
                                </svg>${type}
                            </span>
                            <span class="instructor-name">${m.instructor || "Staff"}</span>
                        </div>
                        <div class="room-number-badge">Rm ${roomStr}</div>
                    </div>
                    <div class="meeting-row-bottom">
                        <span class="meeting-time-text">🕒 ${timeStr}</span>
                    </div>
                </div>`;
            });
            offeringsHtml += `</div></div>`;
        }
    });

    if (visibleCount === 0) {
        return "";
    }

    return `<div class="iw-container">
        <div class="iw-header"><h3>📍 ${locationGroup.building}</h3></div>
        ${locationGroup.imageUrl ? `<img src="${locationGroup.imageUrl}" class="iw-image" onerror="this.style.display='none'">` : ''}
        ${offeringsHtml}
    </div>`;
}

/**
 * fetchSuggestions handles autocomplete logic
 */
async function fetchSuggestions(query) {
    const term = document.getElementById("term-select").value;
    const preview = document.getElementById("search-preview");

    if (query.length < 2) {
        preview.style.display = "none";
        return;
    }

    try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(query)}&term=${term}`);
        const data = await response.json();

        if (data && data.length > 0) {
            preview.innerHTML = `<div class="suggestion-header">Suggestions</div>` +
                data.map(function(s) {
                    return `<div class="suggestion-item" data-val="${s}">${s}</div>`;
                }).join("");

            document.querySelectorAll(".suggestion-item").forEach(function(item) {
                item.onclick = function(e) {
                    e.stopPropagation(); // CRITICAL: Stop bubble so window.onclick closer doesn't trigger
                    const val = this.dataset.val;
                    document.getElementById("course-input").value = val;
                    // Trigger search selector
                    searchCourse();
                };
            });
            preview.style.display = "block";
        }
    } catch (err) {
        console.error("Suggestion fetch failed");
    }
}

/**
 * searchCourse handles API call
 */
async function searchCourse() {
    const input = document.getElementById("course-input");
    const preview = document.getElementById("search-preview");
    const term = document.getElementById("term-select").value;
    const courseCode = utils.formatCourseCode(input.value);

    if (!courseCode) {
        return;
    }

    preview.innerHTML = `<div class="loading-skeleton skeleton-preview"></div>`;
    preview.style.display = "block";

    try {
        const [response] = await Promise.all([
            fetch(`/api/course/${term}/${encodeURIComponent(courseCode)}`),
            new Promise(function(resolve) {
                setTimeout(resolve, 400);
            })
        ]);

        const results = await response.json();

        if (!Array.isArray(results) || results.length === 0) {
            preview.innerHTML = `<p class="empty-msg no-border-padding">No results found for "${courseCode}"</p>`;
            return;
        }

        lastSearchResults = results;
        pendingSelections = {};

        results.forEach(function(offering) {
            pendingSelections[offering.class_number] = [];
            offering.meetings.forEach(function(m, idx) {
                if (utils.getFilterCategory(m.type) === 'LEC') {
                    pendingSelections[offering.class_number].push(idx);
                }
            });
        });

        renderSearchPreview();
    } catch (err) {
        console.error("Search failed:", err);
        preview.innerHTML = "<p class=\"empty-msg no-border\">Error fetching results.</p>";
    }
}

/**
 * renderSearchPreview populates the dropdown with a "Schedule Builder" layout
 */
function renderSearchPreview() {
    const container = document.getElementById("search-preview");

    container.innerHTML = lastSearchResults.map(function(offering) {
        const cn = offering.class_number;
        const allMeets = offering.meetings;
        const lecMeet = allMeets.find(m => utils.getFilterCategory(m.type) === 'LEC');

        const displayableSections = allMeets.filter(meet => {
            const isLec = utils.getFilterCategory(meet.type) === 'LEC';
            return !isLec && meet.time && meet.time.trim() !== "";
        });

        const hasDisplayableSections = displayableSections.length > 0;

        const renderableSections = displayableSections.filter(meet => {
            return utils.getClassStatus(meet) === 'PHYSICAL';
        });

        const showAddAll = renderableSections.length > 0;

        return `
            <div class="preview-offering" id="preview-offering-${cn}">
                <div class="preview-header">
                    <div class="preview-header-info">
                        <div class="preview-course-title">${offering.course_code}</div>
                        <div class="preview-course-meta">
                            <span class="preview-course-instructor" title="${offering.instructor}">${offering.instructor}</span>
                            <span class="preview-course-id">#${cn}</span>
                        </div>
                        <div class="preview-sub-meta">🕒 ${lecMeet ? lecMeet.time : "TBA"}</div>
                    </div>
                    <div class="header-action-container">
                        <button class="preview-commit-btn commit-select-btn" data-class="${cn}">Add to Map</button>
                        ${showAddAll ? `<button class="preview-add-all-btn toggle-all-btn" data-class="${cn}">+ All</button>` : ''}
                    </div>
                </div>
                ${hasDisplayableSections ? `
                    <div class="preview-sections-list">
                        <div class="preview-section-label">Available Sections</div>
                        ${allMeets.map((meet, index) => {
                            const isLec = utils.getFilterCategory(meet.type) === 'LEC';
                            const status = utils.getClassStatus(meet);

                            if (isLec || !meet.time || meet.time.trim() === "") {
                                return '';
                            }

                            const isSelected = pendingSelections[cn].includes(index);
                            const rowClass = isSelected ? 'preview-section-item selected' : 'preview-section-item';

                            return `
                                <div class="${rowClass} preview-sec-row" data-class="${cn}" data-index="${index}">
                                    <div class="checkbox-wrapper">
                                        <div class="custom-checkbox ${isSelected ? 'checked' : ''}"></div>
                                    </div>
                                    <div class="preview-item-info">
                                        <div class="sec-time-row">
                                            <span class="sec-type">${meet.type}</span>
                                            <span class="sec-time">${meet.time}</span>
                                        </div>
                                        <div class="sec-meta-row">
                                            <span class="sec-instructor" title="${meet.instructor || 'Staff'}">${meet.instructor || 'Staff'}</span>
                                            ${status !== 'PHYSICAL' ? `<span class="status-mini-tag ${status.toLowerCase()}">${status}</span>` : ''}
                                        </div>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    attachPreviewListeners();
}

/**
 * attachPreviewListeners attaches listeners to dropdown elements
 */
function attachPreviewListeners() {
    document.querySelectorAll(".preview-sec-row").forEach(function(row) {
        row.onclick = function(e) {
            e.stopPropagation();
            togglePendingSection(this.dataset.class, parseInt(this.dataset.index));
        };
    });

    document.querySelectorAll(".commit-select-btn").forEach(function(btn) {
        btn.onclick = function(e) {
            e.stopPropagation();
            commitSelection(this.dataset.class);
        };
    });

    document.querySelectorAll(".toggle-all-btn").forEach(function(btn) {
        btn.onclick = function(e) {
            e.stopPropagation();
            toggleAllSections(this.dataset.class);
        };
    });

    document.querySelectorAll(".preview-offering").forEach(function(o) {
        o.onclick = function(e) {
            e.stopPropagation();
        };
    });
}

/**
 * togglePendingSection handles checklist behavior
 */
function togglePendingSection(classNum, index) {
    const list = pendingSelections[classNum];
    const idx = list.indexOf(index);
    if (idx > -1) {
        list.splice(idx, 1);
    } else {
        list.push(index);
    }
    renderSearchPreview();
}

/**
 * toggleAllSections handles Add All shortcut
 */
function toggleAllSections(classNum) {
    const offering = lastSearchResults.find(function(o) {
        return o.class_number === classNum;
    });
    pendingSelections[classNum] = offering.meetings.map((m, idx) => idx).filter(function(idx) {
        return offering.meetings[idx].time && offering.meetings[idx].time.trim() !== "";
    });
    renderSearchPreview();
}

/**
 * commitSelection handles validation and mapping
 */
function commitSelection(classNum) {
    const original = lastSearchResults.find(function(o) {
        return o.class_number === classNum;
    });
    const indices = pendingSelections[classNum];
    const filteredMeetings = original.meetings.filter(function(m, idx) {
        return indices.includes(idx);
    });

    for (let i = 0; i < filteredMeetings.length; i++) {
        const m = filteredMeetings[i];
        const status = utils.getClassStatus(m);

        if (status === "CANCELLED") {
            showToast(`The ${m.type} for this course is Cancelled and cannot be mapped.`);
            return;
        }
        if (status === "TBD") {
            showToast(`The location for this ${m.type} is TBA. Please check back later.`);
            return;
        }
    }

    let active = currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (active) {
        active.meetings = filteredMeetings;
    } else {
        currentOfferings.push({ ...original, meetings: filteredMeetings, visible: true });
    }

    const sIdx = savedCourses.findIndex(function(s) {
        return s.class_number === classNum;
    });

    if (sIdx > -1) {
        savedCourses[sIdx] = currentOfferings.find(function(o) {
            return o.class_number === classNum;
        });
        localStorage.setItem("slugroute_saved", JSON.stringify(savedCourses));
    }

    document.getElementById("search-preview").style.display = "none";
    refreshMapAndUI();
    focusClass(classNum);
}

/**
 * Global window click listener for closing dropdown
 */
window.onclick = function(e) {
    if (!e.target.closest('.search-container')) {
        const preview = document.getElementById("search-preview");
        if (preview) {
            preview.style.display = "none";
            renderSearchList();
        }
    }
};

/**
 * smartFitBounds: Centers the map
 */
function smartFitBounds(bounds) {
    if (bounds.isEmpty()) {
        return;
    }

    if (activeInfoWindow) {
        activeInfoWindow.close();
        activeInfoWindow = null;
    }

    const isSidebarOpen = !document.getElementById("sidebar").classList.contains("closed");
    const isMobile = window.innerWidth < 768;


    const padding = {
        top: 100,
        right: 50,
        bottom: 50,
        left: (isSidebarOpen && !isMobile) ? 400 : 50
    };

    map.setOptions({ restriction: null });
    map.fitBounds(bounds, padding);

    const listener = google.maps.event.addListener(map, 'idle', function() {
        if (map.getZoom() > 18) {
            map.setZoom(18);
        }

        map.setOptions({
            restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false }
        });

        google.maps.event.removeListener(listener);
    });
}

/**
 * focusClass centers map on specific course
 */
function focusClass(classNumber) {
    const offering = currentOfferings.find(function(o) {
        return o.class_number === classNumber;
    });

    if (!offering) {
        return;
    }

    if (offering.visible === false) {
        offering.visible = true;
        refreshMapAndUI();
    }

    const bounds = new google.maps.LatLngBounds();
    let validMeetings = offering.meetings.filter(function(m) {
        return m.lat && m.lat !== 0;
    });

    if (validMeetings.length === 0) {
        return;
    }

    validMeetings.forEach(function(m) {
        bounds.extend({ lat: m.lat, lng: m.lng });
    });

    smartFitBounds(bounds);

    const sidebarElement = document.getElementById(`card-${classNumber}`);
    if (sidebarElement) {
        sidebarElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightSidebarCard(classNumber, true);
        setTimeout(function() {
            highlightSidebarCard(classNumber, false);
        }, 2000);
    }

    if (window.innerWidth < 768) {
        document.getElementById("sidebar").classList.add("closed");
    }
}

/**
 * updateMarkers toggles visibility
 */
function updateMarkers() {
    const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map(function(cb) {
        return cb.value;
    });

    markers.forEach(function(m) {
        const isVisible = m.categories.some(function(cat) {
            return activeFilters.includes(cat);
        });
        m.map = isVisible ? map : null;

        if (!isVisible && activeInfoWindow && activeInfoWindow.getAnchor() === m) {
            activeInfoWindow.close();
            activeInfoWindow = null;
        }
    });
}

/**
 * refreshMapAndUI redraw logic
 */
function refreshMapAndUI() {
    markers.forEach(function(m) {
        m.map = null;
    });
    markers = [];

    if (activeInfoWindow) {
        activeInfoWindow.close();
        activeInfoWindow = null;
    }

    renderSearchList();
    renderSavedList();

    if (currentOfferings.length === 0) {
        return;
    }

    const locationGroups = groupDataByLocation(currentOfferings);
    const bounds = new google.maps.LatLngBounds();

    for (const key in locationGroups) {
        const group = locationGroups[key];
        const uniqueCourseIDs = Object.keys(group.offerings);
        const markerColor = uniqueCourseIDs.length > 1 ? "#232323" : group.offerings[uniqueCourseIDs[0]].color;

        const marker = new AdvancedMarkerElement({
            map: map,
            position: { lat: group.lat, lng: group.lng },
            content: createMarkerElement(group.highestPriorityType, markerColor, group.totalMeetings)
        });

        marker.categories = group.filterCategories;
        marker.addListener("click", function() {
            const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map(function(cb) {
                return cb.value;
            });
            const content = buildInfoWindowHtml(group, activeFilters);
            if (!content) {
                return;
            }

            if (activeInfoWindow) {
                activeInfoWindow.close();
                activeInfoWindow = null;
            }

            activeInfoWindow = new google.maps.InfoWindow({ content: content });

            google.maps.event.addListener(activeInfoWindow, 'domready', function() {
                const iwOfferings = document.querySelectorAll('.iw-offering');
                iwOfferings.forEach(function(el) {
                    el.onmouseenter = function() {
                        highlightSidebarCard(this.dataset.class, true);
                    };
                    el.onmouseleave = function() {
                        highlightSidebarCard(this.dataset.class, false);
                    };
                    el.onclick = function() {
                        focusClass(this.dataset.class);
                    };
                });
            });

            activeInfoWindow.open({ map: map, anchor: marker });
        });

        markers.push(marker);
    }

    updateMarkers();

    markers.forEach(function(m) {
        if (m.map) {
            bounds.extend(m.position);
        }
    });

    if (!bounds.isEmpty()) {
        smartFitBounds(bounds);
    }
}

/**
 * clearResults empties current view
 */
function clearResults() {
    if (activeInfoWindow) {
        activeInfoWindow.close();
        activeInfoWindow = null;
    }
    currentOfferings.forEach(function(c) {
        ColorManager.releaseColor(c.class_number);
    });
    currentOfferings = [];
    refreshMapAndUI();
}

/**
 * removeResult removes a single card
 */
function removeResult(classNum) {
    if (activeInfoWindow) {
        activeInfoWindow.close();
        activeInfoWindow = null;
    }
    ColorManager.releaseColor(classNum);
    currentOfferings = currentOfferings.filter(function(c) {
        return c.class_number !== classNum;
    });
    refreshMapAndUI();
}

/**
 * toggleSaveCourse handles persistence
 */
function toggleSaveCourse(classNum) {
    const offering = currentOfferings.find(function(o) {
        return o.class_number === classNum;
    }) || savedCourses.find(function(o) {
        return o.class_number === classNum;
    });

    const index = savedCourses.findIndex(function(o) {
        return o.class_number === classNum;
    });

    if (index > -1) {
        savedCourses.splice(index, 1);
    } else if (offering) {
        savedCourses.push(offering);
    }

    localStorage.setItem("slugroute_saved", JSON.stringify(savedCourses));
    renderSavedList();
    renderSearchList();
}

async function addSavedToResults(classNum) {
    const course = savedCourses.find(function(c) {
        return c.class_number === classNum;
    });
    if (course) {
        const alreadyIn = currentOfferings.find(function(c) {
            return c.class_number === classNum;
        });
        if (!alreadyIn) {
            currentOfferings.push({ ...course, visible: true });
            refreshMapAndUI();
        }
    }
    focusClass(classNum);
}

function addAllSavedToResults() {
    savedCourses.forEach(function(course) {
        const alreadyIn = currentOfferings.find(function(c) {
            return c.class_number === course.class_number;
        });
        if (!alreadyIn) {
            currentOfferings.push({ ...course, visible: true });
        }
    });
    refreshMapAndUI();
}

/**
 * initMap starts engine
 */
async function initMap() {
    await populateTerms();

    const courseInput = document.getElementById("course-input");
    courseInput.oninput = function(e) {
        clearTimeout(suggestionTimeout);
        suggestionTimeout = setTimeout(function() {
            fetchSuggestions(e.target.value);
        }, 200);
    };

    document.getElementById("search-form").onsubmit = function(e) {
        e.preventDefault();
        searchCourse();
    };

    document.getElementById("sidebar-toggle").onclick = function() {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.toggle("closed");
        setTimeout(function() {
            if (currentOfferings.length > 0) {
                const bounds = new google.maps.LatLngBounds();
                markers.forEach(function(m) {
                    if (m.map) {
                        bounds.extend(m.position);
                    }
                });
                if (!bounds.isEmpty()) {
                    smartFitBounds(bounds);
                }
            }
            google.maps.event.trigger(map, 'resize');
        }, 350);
    };

    document.getElementById("clear-results-btn").onclick = function() {
        clearResults();
    };

    document.getElementById("add-all-saved-btn").onclick = function() {
        addAllSavedToResults();
    };

    document.querySelectorAll(".filter-type").forEach(function(cb) {
        cb.onchange = function() {
            updateMarkers();
        };
    });

    const { Map } = await google.maps.importLibrary("maps");
    const markerLib = await google.maps.importLibrary("marker");
    AdvancedMarkerElement = markerLib.AdvancedMarkerElement;

    map = new Map(document.getElementById("map"), {
        center: CONFIG.CAMPUS_CENTER,
        zoom: CONFIG.ZOOM.CAMPUS,
        mapId: "75ccfb1714f1ad1ed6ac3269",
        restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false },
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    map.addListener("click", function() {
        if (activeInfoWindow) {
            activeInfoWindow.close();
            activeInfoWindow = null;
        }
    });

    document.getElementById("locate-btn").onclick = function() {
        requestLocation();
    };

    document.getElementById("allow-location-btn").onclick = function() {
        allowLocation();
    };

    document.getElementById("deny-location-btn").onclick = function() {
        denyLocation();
    };

    requestLocation();
    refreshMapAndUI();
}

// Location helpers
function requestLocation() {
    document.getElementById('location-modal').style.display = 'block';
}

function allowLocation() {
    document.getElementById('location-modal').style.display = 'none';
    document.getElementById('locate-btn').style.display = 'none';
    navigator.geolocation.getCurrentPosition(function(position) {
        const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
        const youAreHereDiv = document.createElement('div');
        youAreHereDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="10" fill="#4285F4" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`;
        new AdvancedMarkerElement({ map: map, position: userPos, content: youAreHereDiv, title: "Current Location" });
    });
}

function denyLocation() {
    document.getElementById('location-modal').style.display = 'none';
}
