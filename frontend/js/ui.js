//ui.js
import { store } from "./state.js";
import { utils, ColorManager, showToast } from "./utils.js";
import { refreshMapAndUI, focusClass } from "./map.js";

/**
 * saveState persists currentOfferings and savedCourses to LocalStorage
 */
export function saveState() {
    try {
        localStorage.setItem("slugroute_current", JSON.stringify(store.currentOfferings));
        localStorage.setItem("slugroute_saved", JSON.stringify(store.savedCourses));
    } catch (e) {
        console.error("LocalStorage write failed during saveState", e);
    }
}

/**
 * updateSyncBtnState toggles the enabled/disabled status of the calendar export button
 */
export function updateSyncBtnState() {
    const syncBtn = document.getElementById('syncCalendarBtn');
    if (!syncBtn) {
        return;
    }

    // Determine total elements tracked in our state lists
    const totalCourses = (store.currentOfferings || []).length + (store.savedCourses || []).length;
    syncBtn.disabled = (totalCourses === 0);
}

/**
 * highlightSidebarCard visually highlights a card in the results sidebar and map InfoWindow
 */
export function highlightSidebarCard(classNumber, active, meetingIndex = null) {
    const sidebarEl = document.getElementById(`card-${classNumber}`);
    const iwEl = document.querySelector(`.iw-offering[data-class="${classNumber}"]`);

    const updateElement = function(el) {
        if (!el) {
            return;
        }

        if (meetingIndex === null) {
            // Course-level toggle
            if (active) {
                el.classList.add('highlight');
            } else {
                el.classList.remove('highlight');
                // Cleanup child meeting highlights if we are deactivating the whole card
                el.querySelectorAll('.highlight').forEach(function(node) {
                    node.classList.remove('highlight');
                });
            }
        } else {
            // Subsection-level toggle
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

            // If entering a section, ensure parent is highlighted.
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

    // Assign special layout parameters for abnormal statuses
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

    if (store.currentOfferings.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">Search for a course to see sections here.</p>";
        updateSyncBtnState();
        return;
    }

    // Sort active results by Quarter (Term), then Day and Time
    const sortedOfferings = [...store.currentOfferings].sort(function(a, b) {
        if (a.term !== b.term) {
            return parseInt(a.term) - parseInt(b.term);
        }
        return utils.getEarliestMeetingSortVal(a.meetings) - utils.getEarliestMeetingSortVal(b.meetings);
    });

    container.innerHTML = sortedOfferings.map(function(course) {
        const isSaved = store.savedCourses.some(function(s) {
            return s.class_number === course.class_number;
        });
        const color = ColorManager.getColor(course.class_number);
        const isVisible = course.visible !== false;

        // Sort meetings chronologically within the card while preserving original index for functionality
        const meetingTagsHtml = course.meetings
            .map(function(m, idx) {
                return { ...m, originalIndex: idx };
            })
            .sort(function(a, b) {
                const valA = utils.parseMeetingTime(a.time) ?? 999999;
                const valB = utils.parseMeetingTime(b.time) ?? 999999;
                return valA - valB;
            })
            .map(function(m) {
                return renderMeetingTag(course, m, m.originalIndex, color);
            })
            .join("");

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
    updateSyncBtnState();
}

/**
 * renderSavedList updates the "Saved for Later" section with standard cards sorted by Quarter, Day, and Time
 */
export function renderSavedList() {
    const container = document.getElementById("saved-classes");

    if (store.savedCourses.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">No saved classes.</p>";
        updateSyncBtnState();
        return;
    }

    // Sort saved courses by Quarter (Term), then Day and Time
    const sortedCourses = [...store.savedCourses].sort(function(a, b) {
        if (a.term !== b.term) {
            return parseInt(a.term) - parseInt(b.term);
        }
        return utils.getEarliestMeetingSortVal(a.meetings) - utils.getEarliestMeetingSortVal(b.meetings);
    });

    container.innerHTML = sortedCourses.map(function(course) {
        const color = ColorManager.getColor(course.class_number);

        // Find the earliest available meeting time to display on the card
        const sortedMeets = [...course.meetings].sort(function(a, b) {
            return (utils.parseMeetingTime(a.time) ?? 999999) - (utils.parseMeetingTime(b.time) ?? 999999);
        });
        const earliestMeet = sortedMeets[0];
        const timeStr = earliestMeet && earliestMeet.time && earliestMeet.time.trim() !== "" ? earliestMeet.time : "Time TBD";

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
    updateSyncBtnState();
}

/**
 * toggleVisibility switches the visible flag for a course on the map
 */
export function toggleVisibility(classNum) {
    const offering = store.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (offering) {
        offering.visible = (offering.visible === false);
        saveState();
        refreshMapAndUI();
    }
}

/**
 * removeResult removes a single course card from the results
 */
export function removeResult(classNum) {
    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }
    ColorManager.releaseColor(classNum);
    store.currentOfferings = store.currentOfferings.filter(function(c) {
        return c.class_number !== classNum;
    });
    saveState();
    refreshMapAndUI();
}

/**
 * removeMeeting deletes a specific section from a course result
 */
export function removeMeeting(classNum, meetingIndex) {
    const offering = store.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (offering && offering.meetings.length > 1) {
        const removedCategory = utils.getFilterCategory(offering.meetings[meetingIndex].type);

        offering.meetings.splice(meetingIndex, 1);

        const savedIdx = store.savedCourses.findIndex(function(s) {
            return s.class_number === classNum;
        });

        if (savedIdx > -1) {
            store.savedCourses[savedIdx] = offering;
        }

        saveState();
        const categoryStillExists = offering.meetings.some(function(m) {
            return utils.getFilterCategory(m.type) === removedCategory;
        });

        // Refocus the map only if the removed section was the last one of its category (LEC, LAB, or DIS)
        refreshMapAndUI(!categoryStillExists);
    } else {
        removeResult(classNum);
    }
}

/**
 * toggleSaveCourse handles persistence to localStorage
 */
export function toggleSaveCourse(classNum) {
    const offering = store.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    }) || store.savedCourses.find(function(o) {
        return o.class_number === classNum;
    });

    const index = store.savedCourses.findIndex(function(o) {
        return o.class_number === classNum;
    });

    if (index > -1) {
        store.savedCourses.splice(index, 1);
    } else if (offering) {
        store.savedCourses.push(offering);
    }

    saveState();
    renderSavedList();
    renderSearchList();
}

/**
 * addSavedToResults adds a single saved course to the map
 */
export async function addSavedToResults(classNum) {
    const course = store.savedCourses.find(function(c) {
        return c.class_number === classNum;
    });
    if (course) {
        const alreadyIn = store.currentOfferings.find(function(c) {
            return c.class_number === classNum;
        });
        if (!alreadyIn) {
            store.currentOfferings.push({ ...course, visible: true });
            saveState();
            refreshMapAndUI();
        }
    }
    focusClass(classNum);
}

/**
 * handleSearchResultsClick focuses on the selected course in search results
 */
function handleSearchResultsClick(classNum) {
    focusClass(classNum);
}

/**
 * handleSavedClassesClick adds a saved course to active results and maps it
 */
function handleSavedClassesClick(classNum) {
    addSavedToResults(classNum);
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

        // Bidirectional hover listeners for sidebar -> map InfoWindow
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

/**
 * renderPreviewSectionRow handles the checkboxes inside search results dropdown
 */
export function renderPreviewSectionRow(meet, index, cn) {
    const isLec = utils.getFilterCategory(meet.type) === 'LEC';
    const status = utils.getClassStatus(meet);

    if (isLec || !meet.time || meet.time.trim() === "") {
        return '';
    }

    const isSelected = store.pendingSelections[cn].includes(index);
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
 * togglePendingSection handles checklist behavior in the search preview
 */
export function togglePendingSection(classNum, index) {
    const list = store.pendingSelections[classNum];
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
    const offering = store.lastSearchResults.find(function(o) {
        return o.class_number === classNum;
    });
    if (!offering) {
        return;
    }
    store.pendingSelections[classNum] = offering.meetings.map(function(m, idx) {
        return idx;
    }).filter(function(idx) {
        return offering.meetings[idx].time && offering.meetings[idx].time.trim() !== "";
    });
    renderSearchPreview();
}

/**
 * commitSelection handles validation and mapping of selected sections
 */
export function commitSelection(classNum) {
    const original = store.lastSearchResults.find(function(o) {
        return o.class_number === classNum;
    });
    const indices = store.pendingSelections[classNum];
    const filteredMeetings = original.meetings.filter(function(m, idx) {
        return indices.includes(idx);
    });

    // Enforce schedule validations: reject cancelled classes or incomplete locations
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

    let active = store.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (active) {
        active.meetings = filteredMeetings;
    } else {
        store.currentOfferings.push({ ...original, meetings: filteredMeetings, visible: true });
    }

    const sIdx = store.savedCourses.findIndex(function(s) {
        return s.class_number === classNum;
    });

    if (sIdx > -1) {
        store.savedCourses[sIdx] = store.currentOfferings.find(function(o) {
            return o.class_number === classNum;
        });
    }

    saveState();
    document.getElementById("course-input").value = "";
    document.getElementById("search-preview").style.display = "none";
    refreshMapAndUI();
    focusClass(classNum);
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
 * renderSearchPreview populates the dropdown with a "Schedule Builder" layout
 */
export function renderSearchPreview() {
    const container = document.getElementById("search-preview");

    container.innerHTML = store.lastSearchResults.map(function(offering) {
        const cn = offering.class_number;

        // Map meetings with their original indices and sort them chronologically
        const sortedMeets = offering.meetings
            .map(function(m, idx) {
                return { ...m, originalIndex: idx };
            })
            .sort(function(a, b) {
                return (utils.parseMeetingTime(a.time) ?? 999999) - (utils.parseMeetingTime(b.time) ?? 999999);
            });

        const lecMeet = sortedMeets.find(function(m) {
            return utils.getFilterCategory(m.type) === 'LEC';
        });

        const displayableSections = sortedMeets.filter(function(meet) {
            const isLec = utils.getFilterCategory(meet.type) === 'LEC';
            return !isLec && meet.time && meet.time.trim() !== "";
        });

        const showAddAll = displayableSections.some(function(meet) {
            return utils.getClassStatus(meet) === 'PHYSICAL';
        });

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
                        ${sortedMeets.map(function(meet) {
                            return renderPreviewSectionRow(meet, meet.originalIndex, cn);
                        }).join('')}
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');

    attachPreviewListeners();
}

/**
 * searchCourse handles API call for course sections
 */
export async function searchCourse() {
    clearTimeout(store.suggestionTimeout);
    store.activeSuggestionId = null; // Invalidate any in-flight suggestion requests

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
        // Fetch matching course catalog lists based on selected academic term
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

        store.lastSearchResults = results;
        store.pendingSelections = {};

        // Auto-select the lecture (LEC) sections by default inside the pendingSelections lookup
        results.forEach(function(offering) {
            store.pendingSelections[offering.class_number] = [];
            offering.meetings.forEach(function(m, idx) {
                if (utils.getFilterCategory(m.type) === 'LEC') {
                    store.pendingSelections[offering.class_number].push(idx);
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
 * fetchSuggestions handles autocomplete logic for the search bar
 */
export async function fetchSuggestions(query) {
    const term = document.getElementById("term-select").value;
    const preview = document.getElementById("search-preview");

    if (query.length < 2) {
        preview.style.display = "none";
        return;
    }

    // Generate a unique ID for this specific suggestion request
    store.activeSuggestionId = (store.activeSuggestionId || 0) + 1;
    const currentId = store.activeSuggestionId;

    try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(query)}&term=${term}`);
        const data = await response.json();

        // GUARD: If a newer suggestion request or a full search has been initiated
        // in the meantime, ignore this stale response and exit early.
        if (currentId !== store.activeSuggestionId) {
            return;
        }

        // Dynamically build suggestions dropdown elements
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
 * addAllSavedToResults batches saved items into the results sidebar
 */
export function addAllSavedToResults() {
    store.savedCourses.forEach(function(course) {
        const alreadyIn = store.currentOfferings.find(function(o) {
            return o.class_number === course.class_number;
        });
        if (!alreadyIn) {
            store.currentOfferings.push({ ...course, visible: true });
        }
    });
    saveState();
    refreshMapAndUI();
}

/**
 * Binds the "Sync to Calendar" button directly to the backend .ics generator.
 * Merges both mapped classes and saved classes so nothing gets left out.
 */
export function setupCalendarExport() {
    const syncBtn = document.getElementById('syncCalendarBtn');
    if (!syncBtn) {
        return;
    }

    // Set initial state
    updateSyncBtnState();

    syncBtn.addEventListener('click', async function() {
        // 1. Gather sections from both the active map and the saved sidebar list using store
        const activeClasses = store.currentOfferings || [];
        const savedClasses = store.savedCourses || [];

        // 2. Merge them into a single list
        const combinedList = [...activeClasses, ...savedClasses];

        // 3. Remove exact duplicates based on the correct property name: class_number
        const finalSchedule = combinedList.filter(function(offering, index, self) {
            return index === self.findIndex(function(o) {
                return o.class_number === offering.class_number;
            });
        });

        // 4. Double check for safety
        if (finalSchedule.length === 0) {
            showToast('Please add or save at least one course first!', 'error');
            return;
        }

        const initialHtml = syncBtn.innerHTML;

        try {
            syncBtn.disabled = true;
            syncBtn.text = "Generating File...";

            // Post schedule list to export endpoint to produce an iCalendar .ics format
            const response = await fetch('/api/schedule/export', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/calendar'
                },
                body: JSON.stringify(finalSchedule)
            });

            if (!response.ok) {
                throw new Error(`Server returned status code: ${response.status}`);
            }

            // Generate downloadable blob from stream payload responses
            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);

            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = `slugroute-schedule-${new Date().getFullYear()}.ics`;
            document.body.appendChild(anchor);
            anchor.click();

            anchor.remove();
            window.URL.revokeObjectURL(downloadUrl);

            showToast('Calendar file exported successfully!', 'success');

        } catch (error) {
            console.error('Calendar generation process failed:', error);
            showToast('Failed to export calendar. Please try again.', 'error');
        } finally {
            syncBtn.disabled = false;
            syncBtn.innerHTML = initialHtml;
            updateSyncBtnState();
        }
    });
}
