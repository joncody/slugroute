let map, geocoder, markers = [];

// UCSC Map Configuration
const CAMPUS_CENTER = { lat: 36.9914, lng: -122.0608 };
const UCSC_BOUNDS = {
    north: 37.007,
    south: 36.975,
    west: -122.075,
    east: -122.045,
};

function initMap() {
    geocoder = new google.maps.Geocoder();
    map = new google.maps.Map(document.getElementById("map"), {
        center: CAMPUS_CENTER,
        zoom: 15,
        minZoom: 14,
        mapId: "75ccfb1714f1ad1ed6ac3269",
        restriction: {
            latLngBounds: UCSC_BOUNDS,
            strictBounds: true,
        },
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });
}

function clearMarkers() {
    markers.forEach(m => m.setMap(null));
    markers = [];
}

async function searchCourse() {
    const code = document.getElementById('courseInput').value.trim().toUpperCase();
    if (!code) return;

    clearMarkers();

    try {
        const response = await fetch(`/api/course/${code}`);
        const offerings = await response.json();

        if (offerings.length === 0) {
            alert("No courses found for " + code);
            return;
        }

        // --- NEW LOGIC: Group by Location ---
        // This map will store: "Location Name" -> [Array of Meetings]
        const locationGroups = {};

        offerings.forEach(offering => {
            offering.meetings.forEach(meet => {
                if (meet.location === "TBA") return;

                if (!locationGroups[meet.location]) {
                    locationGroups[meet.location] = [];
                }
                locationGroups[meet.location].push({
                    ...meet,
                    courseCode: offering.course_code // Keep track of code for the popup
                });
            });
        });

        // Now, create one marker per unique location
        for (const loc in locationGroups) {
            const meetingsAtLoc = locationGroups[loc];
            const address = `${loc}, UC Santa Cruz, CA`;

            geocoder.geocode({ address: address, bounds: UCSC_BOUNDS }, (results, status) => {
                if (status === "OK") {
                    createMarkerAtLocation(results[0].geometry.location, loc, meetingsAtLoc);
                }
            });
        }
    } catch (err) {
        console.error("Search error:", err);
    }
}

function createMarkerAtLocation(position, locationName, meetings) {
    // Determine the icon: If there is a Lecture here, use Gold. Otherwise, Blue.
    const hasLecture = meetings.some(m => m.type === 'LEC');
    const iconUrl = hasLecture
        ? 'http://maps.google.com/mapfiles/ms/icons/yellow-dot.png'
        : 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png';

    const marker = new google.maps.Marker({
        position: position,
        map: map,
        animation: google.maps.Animation.DROP,
        icon: iconUrl
    });

    // Generate HTML for ALL meetings in this room
    let meetingsHtml = "";
    meetings.forEach(m => {
        meetingsHtml += `
            <div class="mb-2 border-b border-gray-100 pb-1 last:border-0">
                <span class="text-xs font-bold px-1 uppercase rounded ${m.type === 'LEC' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}">
                    ${m.type}
                </span>
                <div class="text-sm text-gray-700 mt-1">⏰ ${m.time}</div>
                <div class="text-[10px] text-gray-400 italic">${m.instructor}</div>
            </div>
        `;
    });

    const infoWindow = new google.maps.InfoWindow({
        content: `
            <div class="info-box max-w-[200px]">
                <h3 class="font-bold text-lg mb-1">${meetings[0].courseCode}</h3>
                <p class="text-xs text-gray-500 mb-3 flex items-center gap-1">
                    📍 ${locationName}
                </p>
                <div class="max-h-[200px] overflow-y-auto pr-2">
                    ${meetingsHtml}
                </div>
            </div>
        `
    });

    marker.addListener("click", () => {
        infoWindow.open(map, marker);
    });

    markers.push(marker);
}
