//ui.js
import { store } from "./state.js";
import { utils, ColorManager } from "./utils.js";
import { focusClass } from "./navigation.js";
import { refreshMapAndUI } from "./markers.js";

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

    const totalCourses = (store.currentOfferings || []).length + (store.savedCourses || []).length;
    syncBtn.disabled = (totalCourses === 0);
}

/**
 * toggleCourseHighlight visually toggles cards outline styles
 */
function toggleCourseHighlight(el, active) {
    if (active) {
        el.classList.add('highlight');
    } else {
        el.classList.remove('highlight');
        el.querySelectorAll('.highlight').forEach(function(node) {
            node.classList.remove('highlight');
        });
    }
}

/**
 * toggleMeetingHighlight toggles subsection badge layouts outline styles
 */
function toggleMeetingHighlight(el, active, meetingIndex) {
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
            toggleCourseHighlight(el, active);
        } else {
            toggleMeetingHighlight(el, active, meetingIndex);
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
 * renderSearchCourseCardHtml builds HTML for a single search result course card
 */
export function renderSearchCourseCardHtml(course, isSaved, color, isVisible, meetingTagsHtml) {
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
}

/**
 * renderSearchCourseRow builds HTML layout parameters inside mapped arrays
 */
function renderSearchCourseRow(course) {
    const isSaved = store.savedCourses.some(function(s) {
        return s.class_number === course.class_number;
    });
    const color = ColorManager.getColor(course.class_number);
    const isVisible = course.visible !== false;

    const meetingsWithIdx = course.meetings.map(function(m, idx) {
        return { ...m, originalIndex: idx };
    });
    const meetingTagsHtml = utils.sortMeetings(meetingsWithIdx)
        .map(function(m) {
            return renderMeetingTag(course, m, m.originalIndex, color);
        })
        .join("");

    return renderSearchCourseCardHtml(course, isSaved, color, isVisible, meetingTagsHtml);
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

    const sortedOfferings = [...store.currentOfferings].sort(function(a, b) {
        if (a.term !== b.term) {
            return parseInt(a.term) - parseInt(b.term);
        }
        return utils.getEarliestMeetingSortVal(a.meetings) - utils.getEarliestMeetingSortVal(b.meetings);
    });

    container.innerHTML = sortedOfferings.map(renderSearchCourseRow).join("");
    updateSyncBtnState();
}

/**
 * renderSavedCourseCardHtml builds HTML for a single saved course card
 */
export function renderSavedCourseCardHtml(course, color, timeStr) {
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
}

/**
 * renderSavedCourseRow processes standard arrays to render HTML layouts
 */
function renderSavedCourseRow(course) {
    const color = ColorManager.getColor(course.class_number);

    const sortedMeets = utils.sortMeetings(course.meetings);
    const earliestMeet = sortedMeets[0];
    const timeStr = earliestMeet && earliestMeet.time && earliestMeet.time.trim() !== "" ? earliestMeet.time : "Time TBD";

    return renderSavedCourseCardHtml(course, color, timeStr);
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

    const sortedCourses = [...store.savedCourses].sort(function(a, b) {
        if (a.term !== b.term) {
            return parseInt(a.term) - parseInt(b.term);
        }
        return utils.getEarliestMeetingSortVal(a.meetings) - utils.getEarliestMeetingSortVal(b.meetings);
    });

    container.innerHTML = sortedCourses.map(renderSavedCourseRow).join("");
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
        refreshMapAndUI(false);
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
    refreshMapAndUI(false);
}

/**
 * removeMeeting deletes a specific section from a course result
 */
export function removeMeeting(classNum, meetingIndex) {
    const offering = store.currentOfferings.find(function(o) {
        return o.class_number === classNum;
    });

    if (offering && offering.meetings.length > 1) {
        offering.meetings.splice(meetingIndex, 1);

        const savedIdx = store.savedCourses.findIndex(function(s) {
            return s.class_number === classNum;
        });

        if (savedIdx > -1) {
            store.savedCourses[savedIdx] = offering;
        }

        saveState();
        refreshMapAndUI(false);
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
 * handleSidebarClick routes target buttons to their registered UI actions
 */
function handleSidebarClick(e, handler) {
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
        handler(card.dataset.class);
    }
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
            handleSidebarClick(e, config.handler);
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
