import { CONFIG } from './config.js';
import { AppState } from './state.js';
import { utils } from './utils.js';
import { ColorManager } from './managers.js';

/**
 * showToast displays a temporary alert message to the user
 */
export function showToast(message, type = "error") {
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
 * populateTerms fetches available academic terms and selects the ideal one
 */
export async function populateTerms() {
    const termSelect = document.getElementById("term-select");
    try {
        const response = await fetch('/api/terms');
        const terms = await response.json();

        if (!terms || terms.length === 0) {
            termSelect.innerHTML = "<option value=\"\">No Data Found</option>";
            return;
        }

        termSelect.innerHTML = "";
        const idealTerm = utils.calculateIdealTerm();

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
export function createMarkerElement(type, color, count = 1) {
    const category = utils.getFilterCategory(type);
    const div = document.createElement('div');
    div.className = 'marker-wrapper';

    if (count > 1) {
        div.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 34 34" width="38" height="38" class="marker-svg">
                <circle cx="17" cy="17" r="15" fill="${color}" stroke="#ffffff" stroke-width="2"/>
                <text x="17" y="17" font-family="Inter, sans-serif" font-weight="800" font-size="14" fill="white" text-anchor="middle" dominant-baseline="central" class="marker-text">${count}</text>
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
 * highlightSidebarCard visually highlights a card in the results sidebar and map InfoWindow
 */
export function highlightSidebarCard(classNumber, active, meetingIndex = null) {
    const sidebarEl = document.getElementById(`card-${classNumber}`);
    const iwEl = document.querySelector(`.iw-offering[data-class="${classNumber}"]`);

    const updateElement = (el) => {
        if (!el) return;

        if (meetingIndex === null) {
            if (active) {
                el.classList.add('highlight');
            } else {
                el.classList.remove('highlight');
                el.querySelectorAll('.highlight').forEach(node => node.classList.remove('highlight'));
            }
        } else {
            const selector = el.classList.contains('course-card')
                ? `.sidebar-meeting-tag[data-index="${meetingIndex}"]`
                : `.iw-meeting-card[data-index="${meetingIndex}"]`;

            const tag = el.querySelector(selector);
            if (tag) {
                if (active) {
                    tag.classList.add('highlight');
                } else {
                    tag.classList.remove('highlight');
                }
            }

            if (active) {
                el.classList.add('highlight');
            }
        }
    };

    updateElement(sidebarEl);
    updateElement(iwEl);
}

/**
 * renderMeetingTag builds the HTML for a single meeting row in a sidebar card
 */
export function renderMeetingTag(course, m, index, color) {
    const status = utils.getClassStatus(m);
    const cat = utils.getFilterCategory(m.type);
    const symbol = cat === 'LEC' ? utils.getIcon('star', 12, color) : (cat === 'LAB' ? utils.getIcon('square', 10, color) : utils.getIcon('triangle', 12, color));
    const displayTime = m.time && m.time.trim() !== "" ? m.time : "TBA";

    let locationHtml = `<span class="loc-text" title="${m.building}">${m.building}</span>`;
    if (status === "ONLINE") {
        locationHtml = `<span class="online-tag">Online Instruction</span>`;
    } else if (status === "CANCELLED") {
        locationHtml = `<span class="cancelled-tag">Cancelled</span>`;
    } else if (status === "TBD") {
        locationHtml = `<span class="tbd-tag">Location TBA</span>`;
    }

    return `
        <div class="sidebar-meeting-tag" style="--accent-color: ${color}" data-class="${course.class_number}" data-index="${index}">
            <div class="tag-content">
                <div class="tag-top">
                    <span class="tag-symbol" style="color: ${color}">${symbol}</span>
                    <span class="tag-label">${m.type}</span>
                    ${locationHtml}
                </div>
                <div class="tag-bottom">
                    <span class="tag-time">${utils.getIcon('clock', 11)} ${displayTime}</span>
                </div>
            </div>
            <button class="tag-remove-btn" title="Remove Section" data-class="${course.class_number}" data-index="${index}">✕</button>
        </div>
    `;
}

/**
 * renderSearchList updates the "Current Results" sidebar section
 */
export function renderSearchList() {
    const container = document.getElementById("search-results");

    if (AppState.currentOfferings.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">Search for a course to see sections here.</p>";
        return;
    }

    container.innerHTML = AppState.currentOfferings.map(function(course) {
        const isSaved = AppState.savedCourses.some(function(s) {
            return s.class_number === course.class_number;
        });
        const color = ColorManager.getColor(course.class_number);
        const isVisible = course.visible !== false;

        const meetingTagsHtml = course.meetings.map(function(m, index) {
            return renderMeetingTag(course, m, index, color);
        }).join("");

        return `
            <div class="course-card ${!isVisible ? 'hidden-offering' : ''}" id="card-${course.class_number}" data-class="${course.class_number}" style="--accent-color: ${isVisible ? color : '#e2e8f0'}">
                <div class="card-header">
                    <div class="card-info-group">
                        <div class="card-title-row" title="${course.course_code}, #${course.class_number}">
                            <h4>${course.course_code}</h4>
                            <span class="course-id-tag">#${course.class_number}</span>
                        </div>
                        <div class="course-meta-row">
                            <span class="course-instructor" title="${course.instructor}">${course.instructor}</span>
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
}

/**
 * renderSavedList updates the "Saved for Later" section
 */
export function renderSavedList() {
    const container = document.getElementById("saved-classes");

    if (AppState.savedCourses.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">No saved classes.</p>";
        return;
    }

    container.innerHTML = AppState.savedCourses.map(function(course) {
        const color = ColorManager.getColor(course.class_number);
        const lecMeet = course.meetings.find(function(m) {
            return utils.getFilterCategory(m.type) === "LEC";
        });
        const timeStr = lecMeet ? lecMeet.time : (course.meetings[0] ? course.meetings[0].time : "Time TBD");

        return `
            <div class="course-card saved-item-card" data-class="${course.class_number}" style="--accent-color: ${color}">
                <div class="card-header">
                    <div class="card-info-group">
                        <div class="card-title-row" title="${course.course_code}, #${course.class_number}">
                            <h4>${course.course_code}</h4>
                            <span class="course-id-tag">#${course.class_number}</span>
                        </div>
                        <div class="course-instructor" title="${course.instructor}">${course.instructor}</div>
                        <div class="course-term-tag">${utils.getTermName(course.term)}</div>
                        <div class="course-card-time">${utils.getIcon('clock', 12)} ${timeStr}</div>
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
}

/**
 * setupSidebarDelegation handles all clicks and bidirectional hover highlighting in sidebars
 */
export function setupSidebarDelegation() {
    const containers = [
        { id: 'search-results', handler: handleSearchResultsClick },
        { id: 'saved-classes', handler: handleSavedClassesClick }
    ];

    containers.forEach(function(config) {
        const el = document.getElementById(config.id);
        if (!el) {
            return;
        }

        el.onclick = function(e) {
            const target = e.target;

            const visBtn = target.closest('.vis-toggle');
            if (visBtn) {
                e.stopPropagation();
                toggleVisibility(visBtn.dataset.class);
                return;
            }

            const saveBtn = target.closest('.save-toggle');
            if (saveBtn) {
                e.stopPropagation();
                toggleSaveCourse(saveBtn.dataset.class);
                return;
            }

            const removeBtn = target.closest('.result-remove');
            if (removeBtn) {
                e.stopPropagation();
                removeResult(removeBtn.dataset.class);
                return;
            }

            const tagRemoveBtn = target.closest('.tag-remove-btn');
            if (tagRemoveBtn) {
                e.stopPropagation();
                removeMeeting(tagRemoveBtn.dataset.class, parseInt(tagRemoveBtn.dataset.index));
                return;
            }

            const tag = target.closest('.sidebar-meeting-tag');
            if (tag) {
                e.stopPropagation();
                focusClass(tag.dataset.class, parseInt(tag.dataset.index));
                return;
            }

            const card = target.closest('.course-card');
            if (card) {
                config.handler(card.dataset.class);
            }
        };

        el.onmouseover = function(e) {
            const card = e.target.closest('.course-card');
            if (card) {
                highlightSidebarCard(card.dataset.class, true);
            }
        };

        el.onmouseout = function(e) {
            const card = e.target.closest('.course-card');
            if (card) {
                highlightSidebarCard(card.dataset.class, false);
            }
        };
    });
}

function handleSearchResultsClick(classNum) {
    focusClass(classNum);
}

function handleSavedClassesClick(classNum) {
    addSavedToResults(classNum);
}

/**
 * toggleVisibility switches the visible flag for a course on the map
 */
export function toggleVisibility(classNum) {
    const offering = AppState.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (offering) {
        offering.visible = (offering.visible === false);
        refreshMapAndUI();
    }
}

/**
 * removeMeeting deletes a specific section from a course result
 */
export function removeMeeting(classNum, meetingIndex) {
    const offering = AppState.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (offering && offering.meetings.length > 1) {
        offering.meetings.splice(meetingIndex, 1);

        const savedIdx = AppState.savedCourses.findIndex(function(s) {
            return s.class_number === classNum;
        });

        if (savedIdx > -1) {
            AppState.savedCourses[savedIdx] = offering;
            localStorage.setItem("slugroute_saved", JSON.stringify(AppState.savedCourses));
        }

        refreshMapAndUI();
    } else {
        removeResult(classNum);
    }
}

/**
 * groupDataByLocation clusters meeting data into location points
 */
export function groupDataByLocation(offerings) {
    const locationMap = {};

    offerings.forEach(function(offering) {
        if (offering.visible === false) {
            return;
        }

        const classColor = ColorManager.getColor(offering.class_number);
        offering.meetings.forEach(function(meet, mIndex) {
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
            locationMap[locKey].offerings[offering.class_number].meetings.push({ ...meet, originalIndex: mIndex });
        });
    });
    return locationMap;
}

/**
 * buildInfoWindowHtml creates the content for Google Maps info windows
 */
export function buildInfoWindowHtml(locationGroup, activeFilters) {
    let offeringsHtml = "";
    let visibleCount = 0;

    Object.entries(locationGroup.offerings).forEach(function([classNum, off]) {
        const visibleMeetings = off.meetings.filter(function(m) {
            return activeFilters.includes(utils.getFilterCategory(m.type));
        });

        if (visibleMeetings.length > 0) {
            visibleCount++;
            offeringsHtml += `<div class="iw-offering" style="--accent-color: ${off.color}" data-class="${classNum}">
                <div class="course-code iw-course-code" title="${off.courseCode}">
                    ${off.courseCode} <i class="iw-term-label">(${utils.getTermName(off.term)})</i>
                </div>
                <div class="meetings-list">`;

            visibleMeetings.forEach(function(m) {
                const type = m.type.toUpperCase();
                const cat = utils.getFilterCategory(type);
                const iconPath = utils.getIconPath(cat);
                const roomStr = m.room_number ? `${m.room_number}` : "TBA";
                const timeStr = m.time || "TBA";

                offeringsHtml += `<div class="meeting-card iw-meeting-card" data-class="${classNum}" data-index="${m.originalIndex}">
                    <div class="meeting-row-top">
                        <div class="meeting-identity">
                            <span class="type-badge">
                                <svg width="10" height="10" viewBox="0 0 24 24" class="iw-badge-icon">
                                    <path d="${iconPath}" fill="white"/>
                                </svg>${type}
                            </span>
                            <span class="instructor-name" title="${m.instructor || 'Staff'}">${m.instructor || "Staff"}</span>
                        </div>
                        <div class="room-number-badge">Rm ${roomStr}</div>
                    </div>
                    <div class="meeting-row-bottom">
                        <span class="meeting-time-text">${utils.getIcon('clock', 12)} ${timeStr}</span>
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
        <div class="iw-header">
            <div class="iw-title-row">
                <h3 title="${locationGroup.building}">${utils.getIcon('pin', 16, 'var(--ucsc-blue)')} ${locationGroup.building}</h3>
                <button class="iw-directions-btn" onclick="getDirections(${locationGroup.lat}, ${locationGroup.lng})" title="Get Directions">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                        <path d="M4.5,20 v-11 c0-1.1,0.9-2,2-2 h9 v-3 l6,5 l-6,5 v-3 h-7.5 v6.5 H4.5 z"/>
                    </svg>
                </button>
            </div>
        </div>
        ${locationGroup.imageUrl ? `<img src="${locationGroup.imageUrl}" class="iw-image" onerror="this.style.display='none'">` : ''}
        ${offeringsHtml}
    </div>`;
}

/**
 * fetchSuggestions handles autocomplete logic for the search bar
 */
export async function fetchSuggestions(query) {
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
                    return `<div class="suggestion-item" data-val="${s}" title="${s}">${s}</div>`;
                }).join("");

            document.querySelectorAll(".suggestion-item").forEach(function(item) {
                item.onclick = function(e) {
                    e.stopPropagation();
                    const val = this.dataset.val;
                    document.getElementById("course-input").value = val;
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
 * searchCourse handles API call for course sections
 */
export async function searchCourse() {
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

        AppState.lastSearchResults = results;
        AppState.pendingSelections = {};

        results.forEach(function(offering) {
            AppState.pendingSelections[offering.class_number] = [];
            offering.meetings.forEach(function(m, idx) {
                if (utils.getFilterCategory(m.type) === 'LEC') {
                    AppState.pendingSelections[offering.class_number].push(idx);
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
 * renderPreviewSectionRow builds the HTML for a single section checkbox in the preview
 */
export function renderPreviewSectionRow(meet, index, cn) {
    const isLec = utils.getFilterCategory(meet.type) === 'LEC';
    const status = utils.getClassStatus(meet);

    if (isLec || !meet.time || meet.time.trim() === "") {
        return '';
    }

    const isSelected = AppState.pendingSelections[cn].includes(index);
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
}

/**
 * renderSearchPreview populates the dropdown with a "Schedule Builder" layout
 */
export function renderSearchPreview() {
    const container = document.getElementById("search-preview");

    container.innerHTML = AppState.lastSearchResults.map(function(offering) {
        const cn = offering.class_number;
        const allMeets = offering.meetings;
        const lecMeet = allMeets.find(m => utils.getFilterCategory(m.type) === 'LEC');

        const displayableSections = allMeets.filter(meet => {
            const isLec = utils.getFilterCategory(meet.type) === 'LEC';
            return !isLec && meet.time && meet.time.trim() !== "";
        });

        const showAddAll = displayableSections.some(meet => utils.getClassStatus(meet) === 'PHYSICAL');

        return `
            <div class="preview-offering" id="preview-offering-${cn}">
                <div class="preview-header">
                    <div class="preview-header-info">
                        <div class="preview-course-title" title="${offering.course_code}">${offering.course_code}</div>
                        <div class="preview-course-meta">
                            <span class="preview-course-instructor" title="${offering.instructor}">${offering.instructor}</span>
                            <span class="preview-course-id">#${cn}</span>
                        </div>
                        <div class="preview-sub-meta">${utils.getIcon('clock', 12)} ${lecMeet ? lecMeet.time : "TBA"}</div>
                    </div>
                    <div class="header-action-container">
                        <button class="preview-commit-btn commit-select-btn" data-class="${cn}">Add to Map</button>
                        ${showAddAll ? `<button class="preview-add-all-btn toggle-all-btn" data-class="${cn}">+ All</button>` : ''}
                    </div>
                </div>
                ${displayableSections.length > 0 ? `
                    <div class="preview-sections-list">
                        <div class="preview-section-label">Available Sections</div>
                        ${allMeets.map((meet, index) => renderPreviewSectionRow(meet, index, cn)).join('')}
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
export function attachPreviewListeners() {
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
 * togglePendingSection handles checklist behavior in the search preview
 */
export function togglePendingSection(classNum, index) {
    const list = AppState.pendingSelections[classNum];
    const idx = list.indexOf(index);
    if (idx > -1) {
        list.splice(idx, 1);
    } else {
        list.push(index);
    }
    renderSearchPreview();
}

/**
 * toggleAllSections handles the "Add All" shortcut in search preview
 */
export function toggleAllSections(classNum) {
    const offering = AppState.lastSearchResults.find(function(o) {
        return o.class_number === classNum;
    });
    AppState.pendingSelections[classNum] = offering.meetings.map((m, idx) => idx).filter(function(idx) {
        return offering.meetings[idx].time && offering.meetings[idx].time.trim() !== "";
    });
    renderSearchPreview();
}

/**
 * commitSelection handles validation and mapping of selected sections
 */
export function commitSelection(classNum) {
    const original = AppState.lastSearchResults.find(function(o) {
        return o.class_number === classNum;
    });
    const indices = AppState.pendingSelections[classNum];
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

    let active = AppState.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (active) {
        active.meetings = filteredMeetings;
    } else {
        AppState.currentOfferings.push({ ...original, meetings: filteredMeetings, visible: true });
    }

    const sIdx = AppState.savedCourses.findIndex(function(s) {
        return s.class_number === classNum;
    });

    if (sIdx > -1) {
        AppState.savedCourses[sIdx] = AppState.currentOfferings.find(function(o) {
            return o.class_number === classNum;
        });
        localStorage.setItem("slugroute_saved", JSON.stringify(AppState.savedCourses));
    }

    document.getElementById("course-input").value = "";
    document.getElementById("search-preview").style.display = "none";
    refreshMapAndUI();
    focusClass(classNum);
}

/**
 * smartFitBounds: Centers the map, handling the offset for the sidebar
 */
export function smartFitBounds(bounds) {
    if (bounds.isEmpty()) {
        return;
    }

    if (AppState.activeInfoWindow) {
        AppState.activeInfoWindow.close();
    }

    const isSidebarOpen = !document.getElementById("sidebar").classList.contains("closed");
    const isMobile = window.innerWidth < 768;

    const isSinglePoint = bounds.getNorthEast().equals(bounds.getSouthWest());

    if (isSinglePoint) {
        const center = bounds.getCenter();
        AppState.map.setOptions({ restriction: null });
        AppState.map.setZoom(CONFIG.ZOOM.BUILDING);
        AppState.map.panTo(center);

        if (isSidebarOpen && !isMobile) {
            AppState.map.panBy(-175, 0);
        }

        setTimeout(() => {
            AppState.map.setOptions({
                restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false }
            });
        }, 400);

    } else {
        const padding = {
            top: 100,
            right: 100,
            bottom: 50,
            left: (isSidebarOpen && !isMobile) ? 550 : 50
        };

        AppState.map.setOptions({ restriction: null });
        AppState.map.fitBounds(bounds, padding);

        const listener = google.maps.event.addListener(AppState.map, 'idle', function() {
            if (AppState.map.getZoom() > 18) {
                AppState.map.setZoom(18);
            }
            AppState.map.setOptions({
                restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false }
            });
            google.maps.event.removeListener(listener);
        });
    }
}

export function focusClass(classNumber, meetingIndex = null) {
    const offering = AppState.currentOfferings.find(function(o) {
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

    if (meetingIndex !== null && offering.meetings[meetingIndex]) {
        const m = offering.meetings[meetingIndex];
        if (m.lat && m.lat !== 0) {
            bounds.extend({ lat: m.lat, lng: m.lng });
        } else {
            validMeetings.forEach(function(m) {
                bounds.extend({ lat: m.lat, lng: m.lng });
            });
        }
    } else {
        validMeetings.forEach(function(m) {
            bounds.extend({ lat: m.lat, lng: m.lng });
        });
    }

    smartFitBounds(bounds);

    const sidebarElement = document.getElementById(`card-${classNumber}`);
    if (sidebarElement) {
        sidebarElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        highlightSidebarCard(classNumber, true, meetingIndex);
        setTimeout(function() {
            highlightSidebarCard(classNumber, false, meetingIndex);
        }, 2000);
    }

    if (window.innerWidth < 768) {
        document.getElementById("sidebar").classList.add("closed");
    }
}

/**
 * updateMarkers toggles marker visibility based on sidebar filters
 */
export function updateMarkers() {
    const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map(function(cb) {
        return cb.value;
    });

    AppState.markers.forEach(function(m) {
        const isVisible = m.categories.some(function(cat) {
            return activeFilters.includes(cat);
        });
        m.map = isVisible ? AppState.map : null;
    });

    if (AppState.currentDestination) {
        const destMarker = AppState.markers.find(function(m) {
            return m.position.lat === AppState.currentDestination.lat && m.position.lng === AppState.currentDestination.lng;
        });

        if (destMarker && !destMarker.map) {
            if (AppState.directionsRenderer) {
                AppState.directionsRenderer.setPath([]);
            }
            if (AppState.routeLabelWindow) {
                AppState.routeLabelWindow.close();
            }
            AppState.lastRoute = null;
            AppState.currentDestination = null;
        }
    }

    if (AppState.activeInfoWindow && AppState.activeInfoWindow.getMap()) {
        const anchor = AppState.activeInfoWindow.getAnchor();
        if (anchor) {
            if (!anchor.map) {
                AppState.activeInfoWindow.close();
            } else {
                const content = buildInfoWindowHtml(anchor.locationGroup, activeFilters);
                if (!content) {
                    AppState.activeInfoWindow.close();
                } else {
                    AppState.activeInfoWindow.setContent(content);
                }
            }
        }
    }
}

/**
 * refreshMapAndUI triggers a complete redraw of map pins and sidebars
 */
export function refreshMapAndUI(shouldFitBounds = true) {
    AppState.markers.forEach(function(m) {
        m.map = null;
    });
    AppState.markers = [];

    if (AppState.activeInfoWindow) {
        AppState.activeInfoWindow.close();
    }

    renderSearchList();
    renderSavedList();

    if (AppState.currentOfferings.length === 0) {
        return;
    }

    const locationGroups = groupDataByLocation(AppState.currentOfferings);

    if (AppState.currentDestination) {
        const destKey = `${AppState.currentDestination.lat},${AppState.currentDestination.lng}`;
        if (!locationGroups[destKey]) {
            if (AppState.directionsRenderer) {
                AppState.directionsRenderer.setPath([]);
            }
            if (AppState.routeLabelWindow) {
                AppState.routeLabelWindow.close();
            }
            AppState.lastRoute = null;
            AppState.currentDestination = null;
        }
    }

    const bounds = new google.maps.LatLngBounds();

    for (const key in locationGroups) {
        const group = locationGroups[key];
        const uniqueCourseIDs = Object.keys(group.offerings);
        const markerColor = uniqueCourseIDs.length > 1 ? "#232323" : group.offerings[uniqueCourseIDs[0]].color;

        const marker = new AppState.AdvancedMarkerElement({
            map: AppState.map,
            position: { lat: group.lat, lng: group.lng },
            content: createMarkerElement(group.highestPriorityType, markerColor, group.totalMeetings)
        });

        marker.categories = group.filterCategories;
        marker.locationGroup = group;
        marker.addListener("click", function() {
            const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map(function(cb) {
                return cb.value;
            });
            const content = buildInfoWindowHtml(group, activeFilters);
            if (!content) {
                return;
            }

            AppState.activeInfoWindow.setContent(content);
            AppState.activeInfoWindow.open({ map: AppState.map, anchor: marker });
        });

        AppState.markers.push(marker);
    }

    updateMarkers();

    AppState.markers.forEach(function(m) {
        if (m.map) {
            bounds.extend(m.position);
        }
    });

    if (shouldFitBounds && !bounds.isEmpty()) {
        smartFitBounds(bounds);
    }
}

/**
 * clearResults empties current results and map
 */
export function clearResults() {
    if (AppState.activeInfoWindow) {
        AppState.activeInfoWindow.close();
    }
    if (AppState.routeLabelWindow) {
        AppState.routeLabelWindow.close();
    }
    if (AppState.directionsRenderer) {
        AppState.directionsRenderer.setPath([]);
    }
    AppState.lastRoute = null;
    AppState.currentDestination = null;
    AppState.currentOfferings.forEach(function(c) {
        ColorManager.releaseColor(c.class_number);
    });
    AppState.currentOfferings = [];
    refreshMapAndUI();
}

/**
 * removeResult removes a single course card from the results
 */
export function removeResult(classNum) {
    if (AppState.activeInfoWindow) {
        AppState.activeInfoWindow.close();
    }
    ColorManager.releaseColor(classNum);
    AppState.currentOfferings = AppState.currentOfferings.filter(function(c) {
        return c.class_number !== classNum;
    });
    refreshMapAndUI();
}

/**
 * toggleSaveCourse handles persistence to localStorage
 */
export function toggleSaveCourse(classNum) {
    const offering = AppState.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    }) || AppState.savedCourses.find(function(o) {
        return o.class_number === classNum;
    });

    const index = AppState.savedCourses.findIndex(function(o) {
        return o.class_number === classNum;
    });

    if (index > -1) {
        AppState.savedCourses.splice(index, 1);
    } else if (offering) {
        AppState.savedCourses.push(offering);
    }

    localStorage.setItem("slugroute_saved", JSON.stringify(AppState.savedCourses));
    renderSavedList();
    renderSearchList();
}

/**
 * addSavedToResults adds a single saved course to the map
 */
export async function addSavedToResults(classNum) {
    const course = AppState.savedCourses.find(function(c) {
        return c.class_number === classNum;
    });
    if (course) {
        const alreadyIn = AppState.currentOfferings.find(function(c) {
            return c.class_number === classNum;
        });
        if (!alreadyIn) {
            AppState.currentOfferings.push({ ...course, visible: true });
            refreshMapAndUI();
        }
    }
    focusClass(classNum);
}

/**
 * addAllSavedToResults batches saved items into the results sidebar
 */
export function addAllSavedToResults() {
    AppState.savedCourses.forEach(function(course) {
        const alreadyIn = AppState.currentOfferings.find(function(c) {
            return c.class_number === course.class_number;
        });
        if (!alreadyIn) {
            AppState.currentOfferings.push({ ...course, visible: true });
        }
    });
    refreshMapAndUI();
}

/**
 * updateStartMarker handles the blue user location pin
 */
export function updateStartMarker(position, title) {
    if (AppState.activeInfoWindow) {
        AppState.activeInfoWindow.close();
    }
    if (AppState.startMarker) {
        AppState.startMarker.position = position;
        AppState.startMarker.map = AppState.map;
    } else {
        const youAreHereDiv = document.createElement('div');
        youAreHereDiv.style.transform = 'translateY(50%)';
        youAreHereDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="10" fill="#4285F4" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`;
        AppState.startMarker = new AppState.AdvancedMarkerElement({
            map: AppState.map,
            position: position,
            content: youAreHereDiv,
            title: title
        });
    }
    AppState.map.panTo(position);
    AppState.map.setZoom(18);
}

/**
 * displayRouteBubble places a stat bubble at the midpoint of the route path
 */
export function displayRouteBubble(path, durationSec, distanceMeters) {
    if (!AppState.routeLabelWindow) {
        AppState.routeLabelWindow = new google.maps.InfoWindow({
            disableAutoPan: true,
            headerDisabled: true
        });
    }

    const midIdx = Math.floor(path.length / 2);
    const midPoint = path[midIdx];
    const minutes = Math.round(durationSec / 60);
    const miles = (distanceMeters / 1609.34).toFixed(1);

    const content = `
        <div class="route-bubble-container">
            <div class="route-bubble-time">
                ${utils.getIcon('walk', 14, 'currentColor')}
                <span>${minutes} min</span>
            </div>
            <div class="route-bubble-dist">${miles} miles</div>
        </div>
    `;

    AppState.routeLabelWindow.setContent(content);
    AppState.routeLabelWindow.setPosition(midPoint);
    AppState.routeLabelWindow.open(AppState.map);
}

/**
 * getDirections calculates a walking route from startMarker to destination
 */
export async function getDirections(lat, lng) {
    if (AppState.directionsRenderer) {
        AppState.directionsRenderer.setPath([]);
    }
    if (AppState.routeLabelWindow) {
        AppState.routeLabelWindow.close();
    }

    AppState.currentDestination = { lat: parseFloat(lat), lng: parseFloat(lng) };

    if (!AppState.startMarker) {
        showToast("Please set your starting location first using the GPS or Pin buttons.", "error");
        return;
    }

    const requestBody = {
        origin: {
            location: {
                latLng: {
                    latitude: AppState.startMarker.position.lat,
                    longitude: AppState.startMarker.position.lng
                }
            }
        },
        destination: {
            location: {
                latLng: {
                    latitude: AppState.currentDestination.lat,
                    longitude: AppState.currentDestination.lng
                }
            }
        },
        travelMode: "WALK",
        computeAlternativeRoutes: false,
        routeModifiers: {
            avoidTolls: false,
            avoidHighways: false,
            avoidFerries: false
        }
    };

    try {
        const response = await fetch('/api/routes-proxy', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            AppState.lastRoute = route;

            const snappedPath = google.maps.geometry.encoding.decodePath(route.polyline.encodedPolyline);

            const fullPath = [
                AppState.startMarker.position,
                ...snappedPath,
                AppState.currentDestination
            ];

            AppState.directionsRenderer.setPath(fullPath);

            const durationSec = parseInt(route.duration.replace('s', ''));
            const distanceMeters = route.distanceMeters;

            displayRouteBubble(snappedPath, durationSec, distanceMeters);

            const viewport = route.viewport;
            const bounds = new google.maps.LatLngBounds(
                { lat: viewport.low.latitude, lng: viewport.low.longitude },
                { lat: viewport.high.latitude, lng: viewport.high.longitude }
            );

            smartFitBounds(bounds);

            if (window.innerWidth < 768) {
                document.getElementById("sidebar").classList.add("closed");
            }
        } else {
            showToast("Could find no route to this building.", "error");
        }
    } catch (err) {
        console.error("Routes API Error:", err);
        showToast("Error connecting to the routing service.", "error");
    }
}

// Attach to window for Google Maps InfoWindow HTML callback
window.getDirections = getDirections;

/**
 * setupSearchUI initializes the search input and form listeners
 */
export function setupSearchUI() {
    const courseInput = document.getElementById("course-input");
    courseInput.oninput = function(e) {
        clearTimeout(AppState.suggestionTimeout);
        AppState.suggestionTimeout = setTimeout(function() {
            fetchSuggestions(e.target.value);
        }, 200);
    };

    document.getElementById("search-form").onsubmit = function(e) {
        e.preventDefault();
        searchCourse();
    };

    window.onclick = function(e) {
        if (!e.target.closest('.search-container')) {
            const preview = document.getElementById("search-preview");
            if (preview) {
                preview.style.display = "none";
            }
        }
    };
}

/**
 * setupMapControls initializes custom UI buttons on the map
 */
export function setupMapControls() {
    document.getElementById("sidebar-toggle").onclick = function() {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.toggle("closed");
        setTimeout(function() {
            if (AppState.currentOfferings.length > 0) {
                const bounds = new google.maps.LatLngBounds();
                AppState.markers.forEach(function(m) {
                    if (m.map) {
                        bounds.extend(m.position);
                    }
                });
                if (!bounds.isEmpty()) {
                    smartFitBounds(bounds);
                }
            }
            google.maps.event.trigger(AppState.map, 'resize');
        }, 350);
    };

    document.getElementById("theme-toggle").onclick = async function() {
        const currentCenter = AppState.map.getCenter();
        const currentZoom = AppState.map.getZoom();

        // PRESERVE LOCATION DATA
        const currentStartPos = AppState.startMarker ? AppState.startMarker.position : null;
        const currentDestPos = AppState.currentDestination;
        const routeToRestore = AppState.lastRoute;

        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('slugroute_theme', newTheme);

        if (AppState.map) {
            if (AppState.activeInfoWindow) {
                AppState.activeInfoWindow.close();
                AppState.activeInfoWindow = null;
            }
            if (AppState.routeLabelWindow) {
                AppState.routeLabelWindow.close();
                AppState.routeLabelWindow = null;
            }

            await initializeGoogleServices();

            AppState.map.setZoom(currentZoom);
            AppState.map.setCenter(currentCenter);

            // RESTORE START MARKER
            if (currentStartPos) {
                updateStartMarker(currentStartPos, "Starting Point");
            }

            // RESTORE ROUTE
            if (routeToRestore && currentDestPos && currentStartPos) {
                AppState.lastRoute = routeToRestore;
                AppState.currentDestination = currentDestPos;
                const snappedPath = google.maps.geometry.encoding.decodePath(AppState.lastRoute.polyline.encodedPolyline);
                const fullPath = [
                    currentStartPos,
                    ...snappedPath,
                    currentDestPos
                ];
                AppState.directionsRenderer.setPath(fullPath);

                const durationSec = parseInt(AppState.lastRoute.duration.replace('s', ''));
                const distanceMeters = AppState.lastRoute.distanceMeters;
                displayRouteBubble(snappedPath, durationSec, distanceMeters);
            }

            refreshMapAndUI(false);
        }
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

    document.getElementById("recenter-ui-btn").onclick = function() {
        if (AppState.activeInfoWindow) {
            AppState.activeInfoWindow.close();
        }
        AppState.map.setZoom(CONFIG.ZOOM.CAMPUS);
        AppState.map.panTo(CONFIG.CAMPUS_CENTER);
    };

    document.getElementById("clear-route-btn").onclick = function() {
        if (AppState.directionsRenderer) {
            AppState.directionsRenderer.setPath([]);
        }
        if (AppState.routeLabelWindow) {
            AppState.routeLabelWindow.close();
        }
        AppState.lastRoute = null;
        AppState.currentDestination = null;
    };

    document.getElementById("grab-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'block';
    };

    document.getElementById("choose-location-btn").onclick = function() {
        toggleChooseLocationMode();
    };

    document.getElementById("allow-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'none';

        if (AppState.directionsRenderer) {
            AppState.directionsRenderer.setPath([]);
            AppState.lastRoute = null;
        }
        if (AppState.routeLabelWindow) {
            AppState.routeLabelWindow.close();
        }

        navigator.geolocation.getCurrentPosition(function(position) {
            const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
            updateStartMarker(userPos, "Current Location");
        }, null, { enableHighAccuracy: true });
    };

    document.getElementById("deny-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'none';
    };
}

/**
 * toggleChooseLocationMode switches the crosshair cursor for pinning location
 */
export function toggleChooseLocationMode() {
    AppState.isChoosingLocation = !AppState.isChoosingLocation;
    const btn = document.getElementById("choose-location-btn");
    if (AppState.isChoosingLocation) {
        if (AppState.directionsRenderer) {
            AppState.directionsRenderer.setPath([]);
            AppState.lastRoute = null;
        }
        if (AppState.routeLabelWindow) {
            AppState.routeLabelWindow.close();
        }
        btn.classList.add("active");
        AppState.map.setOptions({ draggableCursor: 'crosshair' });
        showToast("Click anywhere on the map to set your starting point.", "success");
    } else {
        btn.classList.remove("active");
        AppState.map.setOptions({ draggableCursor: null });
    }
}

/**
 * initializeGoogleServices loads Google Maps libraries and setups map object
 */
export async function initializeGoogleServices() {
    const { Map } = await google.maps.importLibrary("maps");
    const markerLib = await google.maps.importLibrary("marker");
    const { ColorScheme } = await google.maps.importLibrary("core");
    await google.maps.importLibrary("geometry");

    AppState.AdvancedMarkerElement = markerLib.AdvancedMarkerElement;

    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetScheme = currentTheme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT;

    const mapElement = document.getElementById("map");
    AppState.map = new Map(mapElement, {
        center: CONFIG.CAMPUS_CENTER,
        zoom: CONFIG.ZOOM.CAMPUS,
        mapId: CONFIG.MAP_ID,
        colorScheme: targetScheme,
        restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false },
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    AppState.directionsRenderer = new google.maps.Polyline({
        map: AppState.map,
        strokeColor: "#4285F4",
        strokeWeight: 6,
        strokeOpacity: 0.8,
        icons: [{
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 3, fillOpacity: 1 },
            offset: '100%'
        }]
    });

    if (!AppState.activeInfoWindow) {
        AppState.activeInfoWindow = new google.maps.InfoWindow();

        AppState.activeInfoWindow.addListener('domready', function() {
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

            const iwMeetingCards = document.querySelectorAll('.iw-meeting-card');
            iwMeetingCards.forEach(function(el) {
                el.onmouseenter = function(e) {
                    e.stopPropagation();
                    highlightSidebarCard(this.dataset.class, true, parseInt(this.dataset.index));
                };
                el.onmouseleave = function(e) {
                    e.stopPropagation();
                    highlightSidebarCard(this.dataset.class, false, parseInt(this.dataset.index));
                };
                el.onclick = function(e) {
                    e.stopPropagation();
                    focusClass(this.dataset.class, parseInt(this.dataset.index));
                };
            });
        });
    }

    AppState.map.addListener("click", function(e) {
        if (AppState.isChoosingLocation) {
            updateStartMarker(e.latLng, "Custom Starting Point");
            toggleChooseLocationMode();
        } else if (AppState.activeInfoWindow) {
            AppState.activeInfoWindow.close();
        }
    });
}

/**
 * initMap entry point for Google Maps API
 */
export async function initMap() {
    await populateTerms();
    setupSearchUI();
    setupMapControls();
    await initializeGoogleServices();
    setupSidebarDelegation();
    refreshMapAndUI();
}
