//search.js
import { store } from "./state.js";
import { utils, showToast } from "./utils.js";
import { focusClass } from "./navigation.js";
import { refreshMapAndUI } from "./markers.js";
import { saveState } from "./ui.js";

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
 * validatePendingMeetings validates whether scheduled times are cancelling or TBA
 */
function validatePendingMeetings(filteredMeetings) {
    for (let i = 0; i < filteredMeetings.length; i++) {
        const m = filteredMeetings[i];
        const status = utils.getClassStatus(m);

        if (status === "CANCELLED") {
            showToast(`The ${m.type} for this course is Cancelled and cannot be mapped.`);
            return false;
        }
        if (status === "TBD") {
            showToast(`The location for this ${m.type} is TBA. Please check back later.`);
            return false;
        }
    }
    return true;
}

/**
 * applySelection updates selections records in local states
 */
function applySelection(classNum, original, filteredMeetings) {
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

    if (!validatePendingMeetings(filteredMeetings)) {
        return;
    }

    applySelection(classNum, original, filteredMeetings);

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
        o.onclick = function(e) { e.stopPropagation(); };
    });
}

/**
 * renderSearchPreviewCardHtml builds HTML for a single search preview course offering
 */
export function renderSearchPreviewCardHtml(offering, cn, sortedMeets, lecMeet, displayableSections, showAddAll) {
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
}

/**
 * renderSearchPreview populates the dropdown with a "Schedule Builder" layout
 */
export function renderSearchPreview() {
    const container = document.getElementById("search-preview");

    container.innerHTML = store.lastSearchResults.map(function(offering) {
        const cn = offering.class_number;

        const meetingsWithIdx = offering.meetings.map(function(m, idx) {
            return { ...m, originalIndex: idx };
        });
        const sortedMeets = utils.sortMeetings(meetingsWithIdx);

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

        return renderSearchPreviewCardHtml(offering, cn, sortedMeets, lecMeet, displayableSections, showAddAll);
    }).join('');

    attachPreviewListeners();
}

/**
 * fetchCourseData retrieves the catalog offering list for a course
 */
async function fetchCourseData(term, courseCode) {
    const [response] = await Promise.all([
        fetch(`/api/course/${term}/${encodeURIComponent(courseCode)}`),
        new Promise(function(resolve) {
            setTimeout(resolve, 400);
        })
    ]);
    return response.json();
}

/**
 * handleSearchResults validates response arrays size and maps pending fields
 */
function handleSearchResults(results, preview, courseCode) {
    if (!results || !Array.isArray(results) || results.length === 0) {
        preview.innerHTML = `<p class="empty-msg no-border-padding">No results found for "${courseCode}"</p>`;
        return;
    }

    store.lastSearchResults = results;
    store.pendingSelections = {};

    results.forEach(function(offering) {
        store.pendingSelections[offering.class_number] = [];
        offering.meetings.forEach(function(m, idx) {
            if (utils.getFilterCategory(m.type) === 'LEC') {
                store.pendingSelections[offering.class_number].push(idx);
            }
        });
    });

    renderSearchPreview();
}

/**
 * searchCourse handles API call for course sections
 */
export async function searchCourse() {
    clearTimeout(store.suggestionTimeout);
    store.activeSuggestionId = null;

    const input = document.getElementById("course-input");
    const preview = document.getElementById("search-preview");
    const term = document.getElementById("term-select").value;
    const courseCode = utils.formatCourseCode(input.value);

    if (!courseCode) { return; }

    preview.innerHTML = `<div class="loading-skeleton skeleton-preview"></div>`;
    preview.style.display = "block";

    try {
        const results = await fetchCourseData(term, courseCode);
        handleSearchResults(results, preview, courseCode);
    } catch (err) {
        console.error("Search failed:", err);
        preview.innerHTML = "<p class=\"empty-msg no-border\">Error fetching results.</p>";
    }
}

/**
 * renderSuggestionsList populates autocomplete matches text dropdown entries
 */
function renderSuggestionsList(data, preview) {
    if (data && data.length > 0) {
        preview.innerHTML = `<div class="suggestion-header">Suggestions</div>` +
            data.map(function(s) {
                return `<div class="suggestion-item" data-val="${s}" title="${s}">${s}</div>`;
            }).join("");

        document.querySelectorAll(".suggestion-item").forEach(function(item) {
            item.onclick = function(e) {
                e.stopPropagation();
                document.getElementById("course-input").value = this.dataset.val;
                searchCourse();
            };
        });
        preview.style.display = "block";
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

    store.activeSuggestionId = (store.activeSuggestionId || 0) + 1;
    const currentId = store.activeSuggestionId;

    try {
        const response = await fetch(`/api/suggest?q=${encodeURIComponent(query)}&term=${term}`);
        const data = await response.json();

        if (currentId !== store.activeSuggestionId) {
            return;
        }

        renderSuggestionsList(data, preview);
    } catch (err) {
        console.error("Suggestion fetch failed");
    }
}
