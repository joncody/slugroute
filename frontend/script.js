/**
 * SlugRoute | UCSC Map Configuration
 */
const CONFIG = {
    DEFAULT_TERM: "2262",
    CAMPUS_CENTER: { lat: 36.9914, lng: -122.0608 },
    UCSC_BOUNDS: { north: 37.007, south: 36.975, west: -122.075, east: -122.045 },
    TYPE_COLORS: {
        'LEC': 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png',
        'LAB': 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
        'LBS': 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png',
        'DIS': 'http://maps.google.com/mapfiles/ms/icons/green-dot.png',
        'SEM': 'http://maps.google.com/mapfiles/ms/icons/purple-dot.png',
        'DEFAULT': 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
    },
    PROF_COLORS: ['#003c6c', '#c2410c', '#15803d', '#7e22ce', '#be185d'],
};

let map, markers = [], activeInfoWindow = null;

const utils = {
    formatCourseCode: (input) => {
        return input.trim().toUpperCase().replace(/([A-Z]+)(\d+)/, '$1 $2');
    }
};


function clearMarkers() {
    markers.forEach((m) => {
        m.setMap(null);
    });
    markers = [];
}

/**
 * Grouping: Location -> Offering -> Individual Meetings
 */

function groupDataByLocation(offerings, showDis) {
    const locationMap = {};
    offerings.forEach((offering, index) => {
        const profColor = CONFIG.PROF_COLORS[index % CONFIG.PROF_COLORS.length];
        offering.meetings.forEach((meet) => {
            if (!meet.lat || meet.lat === 0) {
                return;
            }
            //if meeting type is DIS and the box is not checked, dont add it
            if (meet.type.toUpperCase() === 'DIS' && !showDis) {
                return;
            }
            const locKey = `${meet.lat},${meet.lng}`;
            if (!locationMap[locKey]) {
                locationMap[locKey] = {
                    lat: meet.lat, lng: meet.lng,
                    building: meet.building,
                    offerings: {},
                    highestPriorityType: 'DEFAULT'
                };
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
            // Determine Marker Color Priority
            const type = meet.type.toUpperCase();
            if (type === 'LEC') {
                locationMap[locKey].highestPriorityType = 'LEC';
            } else if (['LAB', 'LBS'].includes(type) && locationMap[locKey].highestPriorityType !== 'LEC') {
                locationMap[locKey].highestPriorityType = 'LAB';
            } else if (type === 'DIS' && !['LEC', 'LAB', 'LBS'].includes(locationMap[locKey].highestPriorityType)) {
                locationMap[locKey].highestPriorityType = 'DIS';
            }
            locationMap[locKey].offerings[offKey].meetings.push(meet);
        });
    });
    return locationMap;
}

function buildInfoWindowHtml(locationGroup) {
    let html = `
        <div class="iw-container">
            <div class="iw-header">
                <h3><span>📍</span> ${locationGroup.building}</h3>
            </div>
            <div class="iw-content">
    `;
    Object.values(locationGroup.offerings).forEach((off) => {
        html += `
            <div class="offering-group" style="border-left: 4px solid ${off.color};">
                <div class="course-code">${off.courseCode}</div>
                <div class="prof-label">Main Prof: ${off.professor}</div>
                <div class="meetings-list">
        `;
        off.meetings.forEach((m) => {
            // Priority: Specific Instructor -> fallback to Main Professor
            const displayInstructor = (m.instructor && m.instructor !== "" && m.instructor !== "Staff")
                ? m.instructor
                : (m.instructor === "Staff" ? "Staff" : off.professor);
            html += `
                <div class="meeting-card">
                    <div class="meeting-header">
                        <span class="type-badge">${m.type}</span>
                        <span class="instructor-name">${displayInstructor}</span>
                    </div>
                    <div class="meeting-meta">
                        <span style="opacity: 0.6;">🕒</span>
                        ${m.room_number ? m.room_number + ' | ' : ''}${m.time}
                    </div>
                </div>
            `;
        });
        html += `</div></div>`;
    });
    html += `</div></div>`;
    return html;
}

async function searchCourse() {
    const input = document.getElementById('courseInput');
    const courseCode = utils.formatCourseCode(input.value);
    const showDis = document.getElementById('showDIS').checked;
    clearMarkers();
    if (!courseCode) {
        return;
    }
    try {
        const url = `/api/course/${CONFIG.DEFAULT_TERM}/${encodeURIComponent(courseCode)}`;
        const response = await fetch(url);
        const offerings = await response.json();
        if (!offerings || offerings.length === 0) {
            alert(`No results found for "${courseCode}" in Spring 2026`);
            return;
        }

        const locationGroups = groupDataByLocation(offerings, showDis);
        for (const key in locationGroups) {
            const group = locationGroups[key];
            const marker = new google.maps.Marker({
                position: { lat: group.lat, lng: group.lng },
                map,
                icon: CONFIG.TYPE_COLORS[group.highestPriorityType] || CONFIG.TYPE_COLORS['DEFAULT'],
                animation: google.maps.Animation.DROP
            });
            const infoWindow = new google.maps.InfoWindow({
                content: buildInfoWindowHtml(group)
            });
            marker.addListener("click", () => {
                if (activeInfoWindow) {
                    activeInfoWindow.close();
                }
                infoWindow.open(map, marker);
                activeInfoWindow = infoWindow;
            });
            markers.push(marker);
        }
        if (markers.length > 0) {
            const bounds = new google.maps.LatLngBounds();
            markers.forEach((m) => {
                bounds.extend(m.getPosition());
            });
            map.fitBounds(bounds);
            const listener = google.maps.event.addListener(map, "idle", () => {
                if (map.getZoom() > 17) {
                    map.setZoom(17);
                }
                google.maps.event.removeListener(listener);
            });
        }
    } catch (err) {
        console.error("Search failed:", err);
    }
}

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: CONFIG.CAMPUS_CENTER,
        zoom: 15,
        minZoom: 13,
        mapId: "75ccfb1714f1ad1ed6ac3269",
        restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });
    document.getElementById('courseInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchCourse();
        }
    });
}
