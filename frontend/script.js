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
        north: 37.60,
        south: 36.50,
        west: -122.40,
        east: -121.70
    },
    ZOOM: {
        CAMPUS: 15,
        BUILDING: 17
    },
    COLOR_POOL: [
        "#FFB300", "#803E75", "#FF6800", "#A6BDD7", "#C10020",
        "#CEA262", "#817066", "#007D34", "#F6768E", "#00538A",
        "#FF7A5C", "#53377A", "#FF8E00", "#B32851", "#F4C800",
        "#7F180D", "#93AA00", "#593315", "#F13A13", "#232323"
    ]
};

// Global State
let map;
let markers = [];
let activeInfoWindow = null;
let currentOfferings = [];
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

    getFilterCategory: function (type) {
        const t = type.toUpperCase();
        if (t === "LBS" || t === "LAB") {
            return "LAB";
        }
        if (t === "DIS") {
            return "DIS";
        }
        return "LEC";
    }
};

/**
 * createMarkerElement builds the SVG icon for map pins
 */
function createMarkerElement(type, color) {
    const category = utils.getFilterCategory(type);
    const div = document.createElement('div');
    let path = "";

    // Choose SVG path based on meeting type
    if (category === "LEC") {
        path = "M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z";
    } else if (category === "LAB") {
        path = "M3 3h18v18H3z";
    } else {
        path = "M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2z";
    }

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
    const container = document.getElementById("searchResults");

    if (currentOfferings.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">Search for a course to see sections here.</p>";
        return;
    }

    container.innerHTML = currentOfferings.map(function (course) {
        const isSaved = savedCourses.some(function (s) {
            return s.class_number === course.class_number;
        });
        const color = ColorManager.getColor(course.class_number);
        const hasLec = course.meetings.some(function (m) {
            return utils.getFilterCategory(m.type) === "LEC";
        });
        const shapeSymbol = hasLec ? "★" : "●";

        return `
            <div class="course-card" id="card-${course.class_number}" onclick="focusClass('${course.class_number}')" style="border-left: 10px solid ${color}">
                <div class="card-header">
                    <div>
                        <div class="course-header-row">
                            <span style="color: ${color}; font-weight: bold; font-size: 14px;">${shapeSymbol}</span>
                            <h4>${course.course_code}</h4>
                            <span class="course-id-tag">#${course.class_number}</span>
                        </div>
                        <div class="course-instructor">${course.instructor}</div>
                    </div>
                    <div class="card-actions">
                        <button class="save-btn" onclick="event.stopPropagation(); toggleSaveCourse('${course.class_number}')">
                            ${isSaved ? "❤️" : "🤍"}
                        </button>
                        <button class="remove-btn" onclick="event.stopPropagation(); removeResult('${course.class_number}')">✕</button>
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

/**
 * renderSavedList updates the "Saved for Later" sidebar section
 */
function renderSavedList() {
    const container = document.getElementById("savedClasses");

    if (savedCourses.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">No saved classes.</p>";
        return;
    }

    container.innerHTML = savedCourses.map(function (course) {
        return `
            <div class="course-card" onclick="addSavedToResults('${course.class_number}')">
                <div class="card-header">
                    <div>
                        <h4>${course.course_code}</h4>
                        <div class="course-instructor">${course.instructor}</div>
                    </div>
                    <button class="save-btn" onclick="event.stopPropagation(); toggleSaveCourse('${course.class_number}')">❤️</button>
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
                    offerings: {},
                    highestPriorityType: "DIS",
                    filterCategories: []
                };
            }

            const cat = utils.getFilterCategory(meet.type);

            if (!locationMap[locKey].filterCategories.includes(cat)) {
                locationMap[locKey].filterCategories.push(cat);
            }

            // Determine if the pin should be a Star, Square, or Circle based on importance
            if (cat === "LEC") {
                locationMap[locKey].highestPriorityType = "LEC";
            } else if (cat === "LAB" && locationMap[locKey].highestPriorityType !== "LEC") {
                locationMap[locKey].highestPriorityType = "LAB";
            }

            if (!locationMap[locKey].offerings[offering.class_number]) {
                locationMap[locKey].offerings[offering.class_number] = {
                    courseCode: offering.course_code,
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
            offeringsHtml += `<div class="offering-group" style="border-left: 5px solid ${off.color}; padding-left: 8px;"
                        onmouseenter="highlightSidebarCard('${classNum}', true)"
                        onmouseleave="highlightSidebarCard('${classNum}', false)">
                <div class="course-code" style="font-weight:800; color:#003c6c; margin-bottom:4px;">${off.courseCode}</div>
                <div class="meetings-list">`;

            visibleMeetings.forEach(function (m) {
                const type = m.type.toUpperCase();
                const badgeClass = type === "LEC" ? "lec" : (type === "DIS" ? "dis" : "lab");
                offeringsHtml += `<div class="meeting-card">
                    <div class="meeting-header">
                        <span class="type-badge ${badgeClass}">${type}</span>
                        <span class="instructor-name">${m.instructor || "Staff"}</span>
                    </div>
                    <div class="meeting-meta">🕒 ${m.room_number ? m.room_number + " | " : ""}${m.time}</div>
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
        ${offeringsHtml}
    </div>`;
}

/**
 * searchCourse fetches results from the Go API
 */
async function searchCourse() {
    const input = document.getElementById("courseInput");
    const courseCode = utils.formatCourseCode(input.value);

    if (!courseCode) {
        return;
    }

    try {
        const response = await fetch(`/api/course/${CONFIG.DEFAULT_TERM}/${encodeURIComponent(courseCode)}`);
        const newResults = await response.json();

        if (!newResults || newResults.length === 0) {
            alert("No results found.");
            return;
        }

        let firstNewClassNum = null;
        newResults.forEach(function (item) {
            const exists = currentOfferings.find(function (c) {
                return c.class_number === item.class_number;
            });

            if (!exists) {
                currentOfferings.push(item);
                if (!firstNewClassNum) {
                    firstNewClassNum = item.class_number;
                }
            }
        });

        refreshMapAndUI();

        if (firstNewClassNum) {
            focusClass(firstNewClassNum);
        }
    } catch (err) {
        console.error("Search failed:", err);
    }
}

/**
 * focusClass pans the map to a specific class location
 */
function focusClass(classNumber) {
    const offering = currentOfferings.find(function (o) {
        return o.class_number === classNumber;
    });

    if (!offering) {
        return;
    }

    const meeting = offering.meetings.find(function (m) {
        return m.lat && m.lat !== 0;
    });

    if (!meeting) {
        return;
    }

    setTimeout(function () {
        map.setZoom(CONFIG.ZOOM.BUILDING);
        map.panTo({
            lat: meeting.lat,
            lng: meeting.lng
        });

        // Find associated marker and trigger popup
        const marker = markers.find(function (m) {
            const mPos = m.position;
            const mLat = typeof mPos.lat === "function" ? mPos.lat() : mPos.lat;
            const mLng = typeof mPos.lng === "function" ? mPos.lng() : mPos.lng;
            return Math.abs(mLat - meeting.lat) < 0.0001 && Math.abs(mLng - meeting.lng) < 0.0001;
        });

        if (marker && marker.map) {
            google.maps.event.trigger(marker, 'click');
        }
    }, 50);
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
        }
    });
}

/**
 * refreshMapAndUI fully clears and redraws all map elements
 */
function refreshMapAndUI() {
    markers.forEach(function (m) {
        m.map = null;
    });
    markers = [];

    if (activeInfoWindow) {
        activeInfoWindow.close();
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
        const color = group.offerings[Object.keys(group.offerings)[0]].color;

        const marker = new AdvancedMarkerElement({
            map: map,
            position: {
                lat: group.lat,
                lng: group.lng
            },
            content: createMarkerElement(group.highestPriorityType, color)
        });

        marker.categories = group.filterCategories;
        marker._locationKey = key;

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
            }

            activeInfoWindow = new google.maps.InfoWindow({
                content: content
            });
            activeInfoWindow.open({
                map: map,
                anchor: marker
            });
        });

        markers.push(marker);
        bounds.extend(marker.position);
    }

    if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
            padding: 80
        });
    }
    updateMarkers();
}

/**
 * clearResults empties the current view
 */
function clearResults() {
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
            currentOfferings.push(course);
            refreshMapAndUI();
        }
    }
    focusClass(classNum);
}

/**
 * initMap starts the Google Maps engine
 */
async function initMap() {
    const input = document.getElementById("courseInput");
    input.addEventListener("keypress", function (e) {
        if (e.key === "Enter") {
            searchCourse();
        }
    });

    document.getElementById("sidebarToggle").onclick = function () {
        document.getElementById("sidebar").classList.toggle("closed");
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
        restriction: {
            latLngBounds: CONFIG.UCSC_BOUNDS,
            strictBounds: false
        },
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    refreshMapAndUI();
}
