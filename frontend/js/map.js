import { CONFIG } from "./config.js";
import { store } from "./state.js";
import { utils, showToast, ColorManager } from "./utils.js";
import { renderSearchList, renderSavedList, highlightSidebarCard } from "./ui.js";

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
            // Track original index for bidirectional highlight sync
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
 * smartFitBounds: Centers the map, handling the offset for the sidebar
 * and providing special logic for single-location courses.
 */
export function smartFitBounds(bounds) {
    if (bounds.isEmpty()) {
        return;
    }

    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }

    const isSidebarOpen = !document.getElementById("sidebar").classList.contains("closed");
    const isMobile = window.innerWidth < 768;

    // Check if bounds represent a single point (NE equals SW)
    const isSinglePoint = bounds.getNorthEast().equals(bounds.getSouthWest());

    if (isSinglePoint) {
        // Special logic for single meeting (e.g. CSE 101)
        const center = bounds.getCenter();
        store.map.setOptions({ restriction: null });
        store.map.setZoom(CONFIG.ZOOM.BUILDING); // Use your constant (18)
        store.map.panTo(center);

        // If sidebar is open, shift the map center so the pin appears in the visible area
        if (isSidebarOpen && !isMobile) {
            // Shift the map left by half the sidebar width to push the pin right
            // 350px sidebar / 2 = 175px shift
            store.map.panBy(-175, 0);
        }

        // Re-apply restriction after pan
        setTimeout(() => {
            store.map.setOptions({
                restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false }
            });
        }, 400);

    } else {
        // Standard logic for multiple meetings (e.g. CSE 30)
        const padding = {
            top: 100,
            right: 100,
            bottom: 50,
            left: (isSidebarOpen && !isMobile) ? 550 : 50
        };

        store.map.setOptions({ restriction: null });
        store.map.fitBounds(bounds, padding);

        const listener = google.maps.event.addListener(store.map, 'idle', function() {
            if (store.map.getZoom() > 18) {
                store.map.setZoom(18);
            }
            store.map.setOptions({
                restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false }
            });
            google.maps.event.removeListener(listener);
        });
    }
}

/**
 * focusClass centers the map on a specific course or meeting
 */
export function focusClass(classNumber, meetingIndex = null) {
    const offering = store.currentOfferings.find(function(o) {
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

    // Zoom in on one particular section if specified
    if (meetingIndex !== null && offering.meetings[meetingIndex]) {
        const m = offering.meetings[meetingIndex];
        if (m.lat && m.lat !== 0) {
            bounds.extend({ lat: m.lat, lng: m.lng });
        } else {
            // Fallback to all sections if that specific one is online/TBA
            validMeetings.forEach(function(m) {
                bounds.extend({ lat: m.lat, lng: m.lng });
            });
        }
    } else {
        // Default: fit all sections for the card
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

    store.markers.forEach(function(m) {
        const isVisible = m.categories.some(function(cat) {
            return activeFilters.includes(cat);
        });
        m.map = isVisible ? store.map : null;
    });

    // If the current route destination is now hidden by filters, remove the route
    if (store.currentDestination) {
        const destMarker = store.markers.find(function(m) {
            return m.position.lat === store.currentDestination.lat && m.position.lng === store.currentDestination.lng;
        });

        if (destMarker && !destMarker.map) {
            if (store.directionsRenderer) {
                store.directionsRenderer.setPath([]);
            }
            if (store.routeLabelWindow) {
                store.routeLabelWindow.close();
            }
            store.lastRoute = null;
            store.currentDestination = null;
        }
    }

    // Refresh existing InfoWindow content if it's open
    if (store.activeInfoWindow && store.activeInfoWindow.getMap()) {
        const anchor = store.activeInfoWindow.getAnchor();
        if (anchor) {
            // If the anchor marker was hidden by filters, close the window
            if (!anchor.map) {
                store.activeInfoWindow.close();
            } else {
                const content = buildInfoWindowHtml(anchor.locationGroup, activeFilters);
                if (!content) {
                    store.activeInfoWindow.close();
                } else {
                    store.activeInfoWindow.setContent(content);
                }
            }
        }
    }
}

/**
 * refreshMapAndUI triggers a complete redraw of map pins and sidebars
 */
export function refreshMapAndUI(shouldFitBounds = true) {
    store.markers.forEach(function(m) {
        m.map = null;
    });
    store.markers = [];

    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }

    renderSearchList();
    renderSavedList();

    if (store.currentOfferings.length === 0) {
        return;
    }

    const locationGroups = groupDataByLocation(store.currentOfferings);

    // If a route is drawn to a destination that is removed, remove the route
    if (store.currentDestination) {
        const destKey = `${store.currentDestination.lat},${store.currentDestination.lng}`;
        if (!locationGroups[destKey]) {
            if (store.directionsRenderer) {
                store.directionsRenderer.setPath([]);
            }
            if (store.routeLabelWindow) {
                store.routeLabelWindow.close();
            }
            store.lastRoute = null;
            store.currentDestination = null;
        }
    }

    const bounds = new google.maps.LatLngBounds();

    for (const key in locationGroups) {
        const group = locationGroups[key];
        const uniqueCourseIDs = Object.keys(group.offerings);
        const markerColor = uniqueCourseIDs.length > 1 ? "#232323" : group.offerings[uniqueCourseIDs[0]].color;

        const marker = new store.AdvancedMarkerElement({
            map: store.map,
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

            store.activeInfoWindow.setContent(content);
            store.activeInfoWindow.open({ map: store.map, anchor: marker });
        });

        store.markers.push(marker);
    }

    updateMarkers();

    store.markers.forEach(function(m) {
        if (m.map) {
            bounds.extend(m.position);
        }
    });

    if (shouldFitBounds && !bounds.isEmpty()) {
        smartFitBounds(bounds);
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
 * clearResults empties current results and map
 */
export function clearResults() {
    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }
    if (store.routeLabelWindow) {
        store.routeLabelWindow.close();
    }
    if (store.directionsRenderer) {
        store.directionsRenderer.setPath([]);
    }
    store.lastRoute = null;
    store.currentDestination = null;
    store.currentOfferings.forEach(function(c) {
        ColorManager.releaseColor(c.class_number);
    });
    store.currentOfferings = [];
    refreshMapAndUI();
}

/**
 * updateStartMarker handles the blue user location pin
 */
export function updateStartMarker(position, title) {
    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }
    if (store.startMarker) {
        store.startMarker.position = position;
        store.startMarker.map = store.map;
    } else {
        const youAreHereDiv = document.createElement('div');
        youAreHereDiv.style.transform = 'translateY(50%)';
        youAreHereDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="10" fill="#4285F4" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`;
        store.startMarker = new store.AdvancedMarkerElement({
            map: store.map,
            position: position,
            content: youAreHereDiv,
            title: title
        });
    }
    store.map.panTo(position);
    store.map.setZoom(18);
}

/**
 * displayRouteBubble places a stat bubble at the midpoint of the route path
 */
export function displayRouteBubble(path, durationSec, distanceMeters) {
    if (!store.routeLabelWindow) {
        store.routeLabelWindow = new google.maps.InfoWindow({
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

    store.routeLabelWindow.setContent(content);
    store.routeLabelWindow.setPosition(midPoint);
    store.routeLabelWindow.open(store.map);
}

/**
 * getDirections calculates a walking route from startMarker to destination
 */
export async function getDirections(lat, lng) {
    if (store.directionsRenderer) {
        store.directionsRenderer.setPath([]);
    }
    if (store.routeLabelWindow) {
        store.routeLabelWindow.close();
    }

    store.currentDestination = { lat: parseFloat(lat), lng: parseFloat(lng) };

    if (!store.startMarker) {
        showToast("Please set your starting location first using the GPS or Pin buttons.", "error");
        return;
    }

    const requestBody = {
        origin: {
            location: {
                latLng: {
                    latitude: store.startMarker.position.lat,
                    longitude: store.startMarker.position.lng
                }
            }
        },
        destination: {
            location: {
                latLng: {
                    latitude: store.currentDestination.lat,
                    longitude: store.currentDestination.lng
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
            store.lastRoute = route;

            // 1. Decode the snapped path from Google
            const snappedPath = google.maps.geometry.encoding.decodePath(route.polyline.encodedPolyline);

            // 2. Prepend the marker and append the destination
            const fullPath = [
                store.startMarker.position,
                ...snappedPath,
                store.currentDestination
            ];

            // 3. Set the path
            store.directionsRenderer.setPath(fullPath);

            // 4. Handle stats
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
            showToast("Could not find a walking route to this building.", "error");
        }
    } catch (err) {
        console.error("Routes API Error:", err);
        showToast("Error connecting to the routing service.", "error");
    }
}

// Attach getDirections to window for inline onclick handlers in info windows
window.getDirections = getDirections;

/**
 * initializeGoogleServices loads Google Maps libraries and setups map object
 */
export async function initializeGoogleServices() {
    const { Map } = await google.maps.importLibrary("maps");
    const markerLib = await google.maps.importLibrary("marker");
    const { ColorScheme } = await google.maps.importLibrary("core");
    // Import geometry library for polyline decoding
    await google.maps.importLibrary("geometry");

    store.AdvancedMarkerElement = markerLib.AdvancedMarkerElement;

    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetScheme = currentTheme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT;

    const mapElement = document.getElementById("map");
    store.map = new Map(mapElement, {
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

    // directionsRenderer is now a Polyline instance to render Routes API v2 paths
    store.directionsRenderer = new google.maps.Polyline({
        map: store.map,
        strokeColor: "#4285F4",
        strokeWeight: 6,
        strokeOpacity: 0.8,
        icons: [{
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 3, fillOpacity: 1 },
            offset: '100%'
        }]
    });

    // Setup Singleton InfoWindow
    if (!store.activeInfoWindow) {
        store.activeInfoWindow = new google.maps.InfoWindow();

        // Re-attach highlighting listeners whenever content is injected
        store.activeInfoWindow.addListener('domready', function() {
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

    store.map.addListener("click", function(e) {
        if (store.isChoosingLocation) {
            updateStartMarker(e.latLng, "Custom Starting Point");
            window.toggleChooseLocationMode();
        } else if (store.activeInfoWindow) {
            store.activeInfoWindow.close();
        }
    });
}
