/**
 * SlugRoute | UCSC Map Configuration
 * Finalized Production Script
 */

const CONFIG = {
    DEFAULT_TERM: "2262",
    CAMPUS_CENTER: {
        lat: 36.9914,
        lng: -122.0608
    },
    // Expanded to include Coastal Science Campus and Silicon Valley Center
    UCSC_BOUNDS: {
        north: 37.45,
        south: 36.90,
        west: -122.20,
        east: -121.80
    },
    TYPE_COLORS: {
        "LEC": "#3b82f6",
        "LAB": "#eab308",
        "DIS": "#22c55e",
        "DEFAULT": "#64748b"
    },
    PROF_COLORS: [
        "#003c6c",
        "#c2410c",
        "#15803d",
        "#7e22ce",
        "#be185d"
    ],
    ZOOM: {
        CAMPUS: 15,
        BUILDING: 17
    }
};

let map;
let markers = [];
let activeInfoWindow = null;
let currentOfferings = [];
let savedCourses = JSON.parse(localStorage.getItem("slugroute_saved")) || [];

let AdvancedMarkerElement;
let PinElement;

const utils = {
    formatCourseCode: (input) => {
        return input.trim().toUpperCase().replace(/([A-Z]+)(\d+)/, "$1 $2");
    },
    getFilterCategory: (type) => {
        const t = type.toUpperCase();
        if (t === "LBS" || t === "LAB") {
            return "LAB";
        }
        return t;
    }
};

/**
 * UI Rendering for Sidebar
 */
function renderSearchList() {
    const container = document.getElementById("searchResults");
    if (currentOfferings.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">No results.</p>";
        return;
    }
    container.innerHTML = currentOfferings.map((course) => {
        const isSaved = savedCourses.some((s) => {
            return s.class_number === course.class_number;
        });
        return `
            <div class="course-card" onclick="focusClass('${course.class_number}')">
                <div class="card-header">
                    <div>
                        <div class="course-header-row">
                            <h4>${course.course_code}</h4>
                            <span class="course-id-tag">#${course.class_number}</span>
                        </div>
                        <div class="course-instructor">${course.instructor}</div>
                        <div class="course-title-sub">${course.title}</div>
                    </div>
                    <button class="save-btn" onclick="event.stopPropagation(); toggleSaveCourse('${course.class_number}')">
                        ${isSaved ? "❤️" : "🤍"}
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function renderSavedList() {
    const container = document.getElementById("savedClasses");
    if (savedCourses.length === 0) {
        container.innerHTML = "<p class=\"empty-msg\">No saved classes.</p>";
        return;
    }
    container.innerHTML = savedCourses.map((course) => {
        return `
            <div class="course-card">
                <div class="card-header">
                    <div>
                        <h4>${course.course_code}</h4>
                        <div class="course-instructor">${course.instructor}</div>
                        <div class="course-title-sub">${course.title}</div>
                    </div>
                    <button class="save-btn" onclick="toggleSaveCourse('${course.class_number}')">❤️</button>
                </div>
            </div>
        `;
    }).join("");
}

/**
 * Coordinate Helpers
 */
function getMarkerLat(marker) {
    const pos = marker.position;
    if (typeof pos.lat === "function") {
        return pos.lat();
    }
    return pos.lat;
}

function getMarkerLng(marker) {
    const pos = marker.position;
    if (typeof pos.lng === "function") {
        return pos.lng();
    }
    return pos.lng;
}

/**
 * Map Data Processing
 */
function groupDataByLocation(offerings) {
    const locationMap = {};
    offerings.forEach((offering, index) => {
        const profColor = CONFIG.PROF_COLORS[index % CONFIG.PROF_COLORS.length];
        offering.meetings.forEach((meet) => {
            if (!meet.lat || meet.lat === 0) {
                return;
            }
            const locKey = `${meet.lat},${meet.lng}`;
            if (!locationMap[locKey]) {
                locationMap[locKey] = {
                    lat: meet.lat,
                    lng: meet.lng,
                    building: meet.building,
                    offerings: {},
                    highestPriorityType: "DEFAULT",
                    filterCategories: []
                };
            }
            const cat = utils.getFilterCategory(meet.type);
            if (!locationMap[locKey].filterCategories.includes(cat)) {
                locationMap[locKey].filterCategories.push(cat);
            }
            const offKey = offering.class_number;
            if (!locationMap[locKey].offerings[offKey]) {
                locationMap[locKey].offerings[offKey] = {
                    professor: offering.instructor,
                    courseCode: offering.course_code,
                    title: offering.title,
                    color: profColor,
                    meetings: []
                };
            }
            const type = meet.type.toUpperCase();
            if (type === "LEC") {
                locationMap[locKey].highestPriorityType = "LEC";
            } else if ((type === "LAB" || type === "LBS") && locationMap[locKey].highestPriorityType !== "LEC") {
                locationMap[locKey].highestPriorityType = "LAB";
            } else if (type === "DIS" && !["LEC", "LAB", "LBS"].includes(locationMap[locKey].highestPriorityType)) {
                locationMap[locKey].highestPriorityType = "DIS";
            }
            locationMap[locKey].offerings[offKey].meetings.push(meet);
        });
    });
    return locationMap;
}

/**
 * InfoWindow Builder (Filtered)
 */
function buildInfoWindowHtml(locationGroup, activeFilters) {
    let html = `<div class="iw-container">
        <div class="iw-header"><h3>📍 ${locationGroup.building}</h3></div>
        <div class="iw-content">`;

    Object.values(locationGroup.offerings).forEach((off) => {
        const visibleMeetings = off.meetings.filter((m) => {
            return activeFilters.includes(utils.getFilterCategory(m.type));
        });

        if (visibleMeetings.length > 0) {
            html += `<div class="offering-group" style="border-left: 4px solid ${off.color};">
                <div class="course-code">${off.courseCode}</div>
                <div class="prof-label">Course Lead: ${off.professor}</div>
                <div class="meetings-list">`;

            visibleMeetings.forEach((m) => {
                const type = m.type.toUpperCase();
                const badgeClass = type === "LEC" ? "lec" : (type === "DIS" ? "dis" : "lab");
                const displayInstructor = (m.instructor && m.instructor.trim() !== "") ? m.instructor : "Staff";
                html += `<div class="meeting-card">
                    <div class="meeting-header">
                        <span class="type-badge ${badgeClass}">${type}</span>
                        <span class="instructor-name">${displayInstructor}</span>
                    </div>
                    <div class="meeting-meta">🕒 ${m.room_number ? m.room_number + " | " : ""}${m.time}</div>
                </div>`;
            });
            html += `</div></div>`;
        }
    });

    html += `</div></div>`;
    return html;
}

/**
 * Search and Fit Logic
 */
async function searchCourse() {
    const input = document.getElementById("courseInput");
    const courseCode = utils.formatCourseCode(input.value);
    if (!courseCode) {
        return;
    }

    try {
        const response = await fetch(`/api/course/${CONFIG.DEFAULT_TERM}/${encodeURIComponent(courseCode)}`);
        currentOfferings = await response.json();

        markers.forEach((m) => {
            m.map = null;
        });
        markers = [];
        renderSearchList();

        if (!currentOfferings || currentOfferings.length === 0) {
            alert(`No results for "${courseCode}"`);
            return;
        }

        const locationGroups = groupDataByLocation(currentOfferings);
        const bounds = new google.maps.LatLngBounds();

        for (const key in locationGroups) {
            const group = locationGroups[key];
            const pin = new PinElement({
                background: CONFIG.TYPE_COLORS[group.highestPriorityType] || CONFIG.TYPE_COLORS["DEFAULT"],
                borderColor: "#ffffff",
                glyphColor: "#ffffff"
            });

            const marker = new AdvancedMarkerElement({
                map: map,
                position: {
                    lat: group.lat,
                    lng: group.lng
                },
                content: pin.element
            });

            marker.categories = group.filterCategories;
            marker._locationKey = key;

            marker.addListener("click", () => {
                if (activeInfoWindow) {
                    activeInfoWindow.close();
                }
                const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map((cb) => {
                    return cb.value;
                });
                const infoWindow = new google.maps.InfoWindow({
                    content: buildInfoWindowHtml(group, activeFilters)
                });
                infoWindow.open({
                    map: map,
                    anchor: marker
                });
                activeInfoWindow = infoWindow;
            });

            markers.push(marker);
            bounds.extend(marker.position);
        }

        // Adjust view to show all results across campuses
        if (!bounds.isEmpty()) {
            map.fitBounds(bounds);
            const listener = google.maps.event.addListener(map, "idle", () => {
                if (map.getZoom() > CONFIG.ZOOM.BUILDING) {
                    map.setZoom(CONFIG.ZOOM.BUILDING);
                }
                google.maps.event.removeListener(listener);
            });
        }

        updateMarkers();
    } catch (err) {
        console.error("Search failed:", err);
    }
}

/**
 * Sidebar Navigation & Focus
 */
function focusClass(classNumber) {
    const offering = currentOfferings.find((o) => {
        return o.class_number === classNumber;
    });
    if (!offering || !offering.meetings) {
        return;
    }

    const meeting = offering.meetings.find((m) => {
        return m.lat && m.lat !== 0;
    });
    if (!meeting) {
        return;
    }

    const targetLat = meeting.lat;
    const targetLng = meeting.lng;

    // Pan with offset to prevent InfoWindow clipping under the navbar
    map.setZoom(CONFIG.ZOOM.BUILDING);
    map.panTo({
        lat: targetLat,
        lng: targetLng
    });

    // Provide headroom for the InfoWindow
    const isSidebarOpen = !document.getElementById("sidebar").classList.contains("closed");
    const xOffset = isSidebarOpen ? -175 : 0;
    const yOffset = -200; // Push map down to move marker lower on screen
    map.panBy(xOffset, yOffset);

    const marker = markers.find((m) => {
        const mLat = getMarkerLat(m);
        const mLng = getMarkerLng(m);
        return Math.abs(mLat - targetLat) < 0.0001 && Math.abs(mLng - targetLng) < 0.0001;
    });

    if (marker) {
        if (activeInfoWindow) {
            activeInfoWindow.close();
        }
        const locationGroups = groupDataByLocation(currentOfferings);
        const group = locationGroups[marker._locationKey];
        const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map((cb) => {
            return cb.value;
        });
        const infoWindow = new google.maps.InfoWindow({
            content: buildInfoWindowHtml(group, activeFilters)
        });
        infoWindow.open({
            map: map,
            anchor: marker
        });
        activeInfoWindow = infoWindow;
    }
}

function updateMarkers() {
    const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map((cb) => {
        return cb.value;
    });
    markers.forEach((m) => {
        const isVisible = m.categories.some((cat) => {
            return activeFilters.includes(cat);
        });
        m.map = isVisible ? map : null;
    });
}

function toggleSaveCourse(classNum) {
    const offering = currentOfferings.find((o) => {
        return o.class_number === classNum;
    }) || savedCourses.find((o) => {
        return o.class_number === classNum;
    });
    const index = savedCourses.findIndex((o) => {
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
 * Initialize Map
 */
async function initMap() {
    const { Map } = await google.maps.importLibrary("maps");
    const markerLib = await google.maps.importLibrary("marker");
    AdvancedMarkerElement = markerLib.AdvancedMarkerElement;
    PinElement = markerLib.PinElement;

    map = new Map(document.getElementById("map"), {
        center: CONFIG.CAMPUS_CENTER,
        zoom: CONFIG.ZOOM.CAMPUS,
        mapId: "75ccfb1714f1ad1ed6ac3269",
        restriction: {
            latLngBounds: CONFIG.UCSC_BOUNDS,
            strictBounds: false
        },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    document.getElementById("sidebarToggle").addEventListener("click", () => {
        document.getElementById("sidebar").classList.toggle("closed");
    });

    document.querySelectorAll(".filter-type").forEach((cb) => {
        cb.addEventListener("change", () => {
            updateMarkers();
        });
    });

    document.getElementById("courseInput").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            searchCourse();
        }
    });

    renderSavedList();
}
