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
let lastSearchResults = []; // Buffer for search results
let pendingSelections = {}; // Tracks highlighted rows in the dropdown
let savedCourses = JSON.parse(localStorage.getItem("slugroute_saved")) || [];
let AdvancedMarkerElement;

/**
 * ColorManager assigns unique colors to each class number
 */
const ColorManager = {
    assignments: {},

    getColor: function (classNumber) {
        if (ColorManager.assignments[classNumber]) {
            return ColorManager.assignments[classNumber];
        }

        const usedColors = Object.values(ColorManager.assignments);
        const nextColor = CONFIG.COLOR_POOL.find(function (c) {
            return !usedColors.includes(c);
        }) || CONFIG.COLOR_POOL[0];

        ColorManager.assignments[classNumber] = nextColor;
        return nextColor;
    },

    releaseColor: function (classNumber) {
        delete ColorManager.assignments[classNumber];
    }
};

/**
 * utils provides formatting and logic helpers
 */
const utils = {
    formatCourseCode: function (input) {
        // Formats "cse115a" to "CSE 115A"
        return input.trim().toUpperCase().replace(/([A-Z]+)(\d+)/, "$1 $2");
    },

    getTermName: function (term) {
        const terms = {
            "2260": "Winter 2026",
            "2262": "Spring 2026",
            "2264": "Summer 2026"
        };
        return terms[term] || term;
    },

    getFilterCategory: function (type) {
        const t = type.toUpperCase();
        if (t === "LBS" || t === "LAB") {
            return "LAB";
        }
        if (t === "DIS") {
            return "DIS";
        }
        return "LEC";
    },

    // Helper to get raw SVG paths for reuse in UI badges
    getIconPath: function (category) {
        if (category === "LEC") {
            return "M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z";
        }
        if (category === "LAB") {
            return "M3 3h18v18H3z";
        }
        return "M12 2L2 21H22L12 2Z"; // Triangle
    },

    getHeartSvg: function (isSaved) {
        const fill = isSaved ? "#ef4444" : "none";
        const stroke = isSaved ? "#ef4444" : "#64748b";
        return `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: all 0.2s ease;">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        `;
    },

    getEyeSvg: function (isVisible) {
        const stroke = "#64748b";
        if (isVisible) {
            return `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="transition: all 0.2s ease;">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            `;
        }
        return `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="opacity: 0.35; transition: all 0.2s ease;">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    }
};

/**
 * createMarkerElement builds the SVG icon for map pins
 */
function createMarkerElement(type, color, count = 1) {
    const category = utils.getFilterCategory(type);
    const div = document.createElement('div');
    div.style.lineHeight = '0';

    // Numbered circle for clustered meetings
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
                      style="pointer-events: none; user-select: none;">${count}</text>
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
 * highlightSidebarCard visually highlights a card when hovering map items
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

    container.innerHTML = currentOfferings.map(function (course) {
        const isSaved = savedCourses.some(function (s) {
            return s.class_number === course.class_number;
        });
        const color = ColorManager.getColor(course.class_number);
        const isVisible = course.visible !== false;

        // Generate Meeting Tags with individual removal
        const meetingTagsHtml = course.meetings.map(function(m, index) {
            const cat = utils.getFilterCategory(m.type);
            const symbol = cat === 'LEC' ? '★' : (cat === 'LAB' ? '■' : '▲');
            const displayTime = m.time && m.time.trim() !== "" ? m.time : "TBA";

            // Online status check (handles Remote, Online, or empty building)
            const bldRaw = m.building || "";
            const isOnline = bldRaw.toLowerCase().includes("online") ||
                             bldRaw.toLowerCase().includes("remote") ||
                             bldRaw.trim() === "";

            const locationDisplay = isOnline ? `<span class="online-tag">Online Instruction</span>` : m.building;

            return `
                <div class="sidebar-meeting-tag">
                    <div class="tag-info">
                        <div class="tag-row">
                            <span style="color: ${color}">${symbol}</span>
                            <strong>${m.type}:</strong> ${displayTime}
                        </div>
                        <div class="tag-row location-row">
                            ${locationDisplay}
                        </div>
                    </div>
                    <button class="tag-remove-btn" onclick="event.stopPropagation(); removeMeeting('${course.class_number}', ${index})">✕</button>
                </div>
            `;
        }).join("");

        return `
            <div class="course-card ${!isVisible ? 'hidden-offering' : ''}" id="card-${course.class_number}" onclick="focusClass('${course.class_number}')" style="border-left: 10px solid ${isVisible ? color : '#e2e8f0'}">
                <div class="card-header">
                    <div class="course-header-row">
                        <h4>${course.course_code}</h4>
                        <span class="course-id-tag">#${course.class_number}</span>
                    </div>
                    <div class="card-actions">
                        <button class="save-btn" title="Toggle Map Visibility" onclick="event.stopPropagation(); toggleVisibility('${course.class_number}')">
                            ${utils.getEyeSvg(isVisible)}
                        </button>
                        <button class="save-btn" onclick="event.stopPropagation(); toggleSaveCourse('${course.class_number}')">
                            ${utils.getHeartSvg(isSaved)}
                        </button>
                        <button class="remove-btn" onclick="event.stopPropagation(); removeResult('${course.class_number}')">✕</button>
                    </div>
                </div>
                <div class="card-body">
                    <div class="course-instructor">${course.instructor}</div>
                    <div class="course-term-tag">${utils.getTermName(course.term)}</div>
                    <div class="sidebar-tags-container">
                        ${meetingTagsHtml}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

/**
 * toggleVisibility switches the visible flag and refreshes map
 */
function toggleVisibility(classNum) {
    const offering = currentOfferings.find(function (o) {
        return o.class_number === classNum;
    });

    if (offering) {
        offering.visible = offering.visible === false ? true : false;
        refreshMapAndUI();
    }
}

/**
 * removeMeeting deletes a specific section from the schedule list
 */
function removeMeeting(classNum, meetingIndex) {
    const offering = currentOfferings.find(function (o) {
        return o.class_number === classNum;
    });

    if (offering && offering.meetings.length > 1) {
        offering.meetings.splice(meetingIndex, 1);

        const savedIdx = savedCourses.findIndex(function (s) {
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
 * renderSavedList updates the "Saved for Later" sidebar section
 */
function renderSavedList() {
    const container = document.getElementById("saved-classes");

    if (savedCourses.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">No saved classes.</p>";
        return;
    }

    container.innerHTML = savedCourses.map(function (course) {
        const lecMeet = course.meetings.find(function (m) {
            return utils.getFilterCategory(m.type) === "LEC";
        });
        const timeStr = lecMeet ? lecMeet.time : (course.meetings[0] ? course.meetings[0].time : "Time TBD");

        return `
            <div class="course-card" onclick="addSavedToResults('${course.class_number}')">
                <div class="card-header">
                    <div>
                        <h4>${course.course_code}</h4>
                        <div class="course-instructor">${course.instructor}</div>
                        <div class="course-term-tag" style="margin-top: 2px;">${utils.getTermName(course.term)}</div>
                        <div class="course-card-time">🕒 ${timeStr}</div>
                    </div>
                    <button class="save-btn" onclick="event.stopPropagation(); toggleSaveCourse('${course.class_number}')">${utils.getHeartSvg(true)}</button>
                </div>
            </div>
        `;
    }).join("");
}

/**
 * groupDataByLocation clusters meeting data if they happen at the same building
 */
function groupDataByLocation(offerings) {
    const locationMap = {};

    offerings.forEach(function (offering) {
        // SKIP hidden offerings
        if (offering.visible === false) {
            return;
        }

        const classColor = ColorManager.getColor(offering.class_number);
        offering.meetings.forEach(function (meet) {
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
 * buildInfoWindowHtml creates the HTML string for a Google Maps InfoWindow
 */
function buildInfoWindowHtml(locationGroup, activeFilters) {
    let offeringsHtml = "";
    let visibleCount = 0;

    Object.entries(locationGroup.offerings).forEach(function ([classNum, off]) {
        const visibleMeetings = off.meetings.filter(function (m) {
            return activeFilters.includes(utils.getFilterCategory(m.type));
        });

        if (visibleMeetings.length > 0) {
            visibleCount++;
            offeringsHtml += `<div class="offering-group" style="border-left: 5px solid ${off.color}; padding-left: 8px; cursor: pointer;"
                        onmouseenter="highlightSidebarCard('${classNum}', true)"
                        onmouseleave="highlightSidebarCard('${classNum}', false)"
                        onclick="focusClass('${classNum}')">
                <div class="course-code" style="font-weight:800; color:#003c6c; margin-bottom:4px;">
                    ${off.courseCode} <i style="font-weight: 400; font-size: 0.9em; color: #64748b;">(${utils.getTermName(off.term)})</i>
                </div>
                <div class="meetings-list">`;

            visibleMeetings.forEach(function (m) {
                const type = m.type.toUpperCase();
                const cat = utils.getFilterCategory(type);
                const badgeClass = type === "LEC" ? "lec" : (type === "DIS" ? "dis" : "lab");
                const iconPath = utils.getIconPath(cat);
                const iconHtml = `<svg width="10" height="10" viewBox="0 0 24 24" style="fill:white; margin-right:4px;"><path d="${iconPath}"/></svg>`;
                const roomStr = m.room_number ? `#${m.room_number}` : "";
                const timeStr = m.time || "TBA";

                offeringsHtml += `<div class="meeting-card">
                    <div class="meeting-header">
                        <span class="type-badge ${badgeClass}">${iconHtml}${type}</span>
                        <span class="instructor-name">${m.instructor || "Staff"}</span>
                    </div>
                    <div class="meeting-meta">${roomStr} | 🕒 ${timeStr}</div>
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
        ${locationGroup.imageUrl ? `<img src="${locationGroup.imageUrl}" style="width:100%; height:120px; object-fit:cover; border-radius: 8px; margin-bottom: 8px;">` : ''}
        ${offeringsHtml}
    </div>`;
}

/**
 * searchCourse handles API call and initializing dropdown selection state
 */
async function searchCourse() {
    const input = document.getElementById("course-input");
    const preview = document.getElementById("search-preview");
    const term = document.getElementById("term-select").value;
    const courseCode = utils.formatCourseCode(input.value);

    if (!courseCode) {
        return;
    }

    // 1. Immediately show the dropdown and the loading skeletons
    preview.innerHTML = `
        <div class="loading-skeleton" style="margin: 16px; height: 80px; width: calc(100% - 32px);"></div>
        <div class="loading-skeleton" style="margin: 16px; height: 80px; width: calc(100% - 32px);"></div>
    `;
    preview.style.display = "block";

    try {
        // 2. Perform the fetch and a 400ms delay in parallel
        const [response] = await Promise.all([
            fetch(`/api/course/${term}/${encodeURIComponent(courseCode)}`),
            new Promise(function (resolve) {
                setTimeout(resolve, 400);
            })
        ]);

        const results = await response.json();

        if (!Array.isArray(results) || results.length === 0) {
            preview.innerHTML = `<p class="empty-msg" style="border:none; padding: 20px;">No results found for "${courseCode}"</p>`;
            return;
        }

        lastSearchResults = results;
        pendingSelections = {};

        results.forEach(function (offering) {
            pendingSelections[offering.class_number] = [];
            offering.meetings.forEach(function (m, idx) {
                if (utils.getFilterCategory(m.type) === 'LEC') {
                    pendingSelections[offering.class_number].push(idx);
                }
            });
        });

        renderSearchPreview();
    } catch (err) {
        console.error("Search failed:", err);
        preview.innerHTML = "<p class=\"empty-msg\" style=\"border:none;\">Error fetching results.</p>";
    }
}

/**
 * renderSearchPreview populates the dropdown
 */
function renderSearchPreview() {
    const container = document.getElementById("search-preview");

    container.innerHTML = lastSearchResults.map(function(offering) {
        const cn = offering.class_number;
        const allMeets = offering.meetings;
        const validSections = allMeets.filter(function (m) {
            return utils.getFilterCategory(m.type) !== 'LEC' &&
                   m.lat !== 0 &&
                   m.time && m.time.trim() !== "";
        });

        const lecMeet = allMeets.find(function (m) {
            return utils.getFilterCategory(m.type) === 'LEC';
        });
        const lecTime = lecMeet ? lecMeet.time : "Time TBD";

        return `
            <div class="preview-offering" onclick="event.stopPropagation();">
                <div class="preview-header">
                    <div class="preview-header-info">
                        <h4>${offering.course_code} - ${offering.instructor}</h4>
                        <div class="preview-sub-meta">🕒 ${lecTime} | Class #${cn}</div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        <button class="preview-lecture-only-btn" onclick="event.stopPropagation(); commitSelection('${cn}')">Add</button>
                        ${validSections.length > 0 ? `<button class="preview-add-all" onclick="event.stopPropagation(); toggleAllSections('${cn}')">Add All</button>` : ''}
                    </div>
                </div>
                <div class="preview-sections-list">
                    ${allMeets.map((meet, index) => {
                        if (utils.getFilterCategory(meet.type) === 'LEC') {
                            return '';
                        }
                        if (meet.lat === 0 || !meet.time || meet.time.trim() === "") {
                            return '';
                        }

                        const isSelected = pendingSelections[cn].includes(index);
                        const rowClass = isSelected ? 'preview-section-item selected' : 'preview-section-item';
                        const actionText = isSelected ? '- Remove' : '+ Add My Section';

                        return `
                            <div class="${rowClass}" onclick="event.stopPropagation(); togglePendingSection('${cn}', ${index})">
                                <span>${meet.type} | ${meet.time} (${meet.instructor || 'Staff'})</span>
                                <span class="add-tag">${actionText}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }).join('');
}

/**
 * togglePendingSection handles the persistence "checklist" behavior
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
 * toggleAllSections handles "Add All" shortcut inside dropdown
 */
function toggleAllSections(classNum) {
    const offering = lastSearchResults.find(function (o) {
        return o.class_number === classNum;
    });
    pendingSelections[classNum] = [];
    offering.meetings.forEach(function (m, idx) {
        if (utils.getFilterCategory(m.type) === 'LEC' || (m.lat !== 0 && m.time && m.time.trim() !== "")) {
            pendingSelections[classNum].push(idx);
        }
    });
    renderSearchPreview();
}

/**
 * commitSelection pushes highlights to the map and sidebar
 */
function commitSelection(classNum) {
    const original = lastSearchResults.find(function (o) {
        return o.class_number === classNum;
    });
    const indices = pendingSelections[classNum];
    const filteredMeetings = original.meetings.filter(function (m, idx) {
        return indices.includes(idx);
    });

    let active = currentOfferings.find(function (o) {
        return o.class_number === classNum;
    });

    if (active) {
        active.meetings = filteredMeetings;
    } else {
        currentOfferings.push({ ...original, meetings: filteredMeetings, visible: true });
    }

    const sIdx = savedCourses.findIndex(function (s) {
        return s.class_number === classNum;
    });

    if (sIdx > -1) {
        savedCourses[sIdx] = currentOfferings.find(function (o) {
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
 * smartFitBounds: Centers the map while accounting for the fixed sidebar
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

    // Define the "Off-limits" areas for the Map Camera
    const padding = {
        top: 50,    // Space for top UI
        right: 50,
        bottom: 50,
        // If sidebar is open, shift the "center" of the map to the right
        left: (isSidebarOpen && !isMobile) ? 400 : 50
    };

    // TEMPORARILY lift restriction to prevent camera snap issues
    map.setOptions({ restriction: null });

    map.fitBounds(bounds, padding);

    // Optional: Limit max zoom so it doesn't zoom in too tight on a single building
    const listener = google.maps.event.addListener(map, 'idle', function() {
        if (map.getZoom() > 18) {
            map.setZoom(18);
        }

        // Restore restriction after movement settles
        map.setOptions({
            restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false }
        });

        google.maps.event.removeListener(listener);
    });
}

/**
 * focusClass treats the course as a whole
 */
function focusClass(classNumber) {
    const offering = currentOfferings.find(function (o) {
        return o.class_number === classNumber;
    });

    if (!offering) {
        return;
    }

    // Ensure it's visible if focusing
    if (offering.visible === false) {
        offering.visible = true;
        refreshMapAndUI();
    }

    const bounds = new google.maps.LatLngBounds();
    let validMeetings = offering.meetings.filter(function (m) {
        return m.lat && m.lat !== 0;
    });

    if (validMeetings.length === 0) {
        return;
    }

    validMeetings.forEach(function (m) {
        bounds.extend({ lat: m.lat, lng: m.lng });
    });

    smartFitBounds(bounds);

    // Ensure the sidebar scrolls to the card and highlights it
    const sidebarElement = document.getElementById(`card-${classNumber}`);
    if (sidebarElement) {
        sidebarElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightSidebarCard(classNumber, true);
        // Remove highlight after a delay to indicate "arrival"
        setTimeout(function () {
            highlightSidebarCard(classNumber, false);
        }, 2000);
    }

    // Mobile UX: Auto-close sidebar so user can see the map
    if (window.innerWidth < 768) {
        document.getElementById("sidebar").classList.add("closed");
    }
}

/**
 * updateMarkers toggles visibility of markers based on checkbox filters
 */
function updateMarkers() {
    const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map(function (cb) {
        return cb.value;
    });

    markers.forEach(function (m) {
        const isVisible = m.categories.some(function (cat) {
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
 * refreshMapAndUI fully clears and redraws map elements
 */
function refreshMapAndUI() {
    markers.forEach(function (m) {
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
        marker.addListener("click", function () {
            const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map(function (cb) {
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
            activeInfoWindow.open({ map: map, anchor: marker });
        });

        markers.push(marker);
    }

    // Determine marker visibility BEFORE calculating bounds
    updateMarkers();

    // Only include currently visible markers in the zoom/pan target
    markers.forEach(function (m) {
        if (m.map) {
            bounds.extend(m.position);
        }
    });

    if (!bounds.isEmpty()) {
        smartFitBounds(bounds);
    }
}

/**
 * clearResults empties the current view
 */
function clearResults() {
    if (activeInfoWindow) {
        activeInfoWindow.close();
        activeInfoWindow = null;
    }
    currentOfferings.forEach(function (c) {
        ColorManager.releaseColor(c.class_number);
    });
    currentOfferings = [];
    refreshMapAndUI();
}

/**
 * removeResult removes a single card from the results
 */
function removeResult(classNum) {
    if (activeInfoWindow) {
        activeInfoWindow.close();
        activeInfoWindow = null;
    }
    ColorManager.releaseColor(classNum);
    currentOfferings = currentOfferings.filter(function (c) {
        return c.class_number !== classNum;
    });
    refreshMapAndUI();
}

/**
 * toggleSaveCourse adds/removes course from localStorage
 */
function toggleSaveCourse(classNum) {
    const offering = currentOfferings.find(function (o) {
        return o.class_number === classNum;
    }) || savedCourses.find(function (o) {
        return o.class_number === classNum;
    });

    const index = savedCourses.findIndex(function (o) {
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

/**
 * addSavedToResults brings a saved course back into the active map view
 */
async function addSavedToResults(classNum) {
    const course = savedCourses.find(function (c) {
        return c.class_number === classNum;
    });

    if (course) {
        const alreadyIn = currentOfferings.find(function (c) {
            return c.class_number === classNum;
        });

        if (!alreadyIn) {
            currentOfferings.push({ ...course, visible: true });
            refreshMapAndUI();
        }
    }
    focusClass(classNum);
}

/**
 * addAllSavedToResults brings every saved course into active view
 */
function addAllSavedToResults() {
    savedCourses.forEach(function (course) {
        const alreadyIn = currentOfferings.find(function (c) {
            return c.class_number === course.class_number;
        });
        if (!alreadyIn) {
            currentOfferings.push({ ...course, visible: true });
        }
    });
    refreshMapAndUI();
}

/**
 * initMap starts the Google Maps engine
 */
async function initMap() {
    document.getElementById("sidebar-toggle").onclick = function () {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.toggle("closed");
        setTimeout(function () {
            if (currentOfferings.length > 0) {
                const bounds = new google.maps.LatLngBounds();
                markers.forEach(function (m) {
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

    document.querySelectorAll(".filter-type").forEach(function (cb) {
        cb.onchange = function () {
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

    map.addListener("click", function () {
        if (activeInfoWindow) {
            activeInfoWindow.close();
            activeInfoWindow = null;
        }
    });

    refreshMapAndUI();
}
