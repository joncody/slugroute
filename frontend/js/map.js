//map.js
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
 * smartFitBounds: Centers the map. Now that the map container width adjusts,
 * centering is handled automatically by the map engine.
 */
export function smartFitBounds(bounds) {
    if (bounds.isEmpty()) {
        return;
    }

    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }

    // Check if bounds represent a single point (NE equals SW)
    const isSinglePoint = bounds.getNorthEast().equals(bounds.getSouthWest());

    if (isSinglePoint) {
        // Special logic for single meeting (e.g. CSE 101)
        const center = bounds.getCenter();
        store.map.setOptions({ restriction: null });
        store.map.setZoom(CONFIG.ZOOM.BUILDING); // Use your constant (18)
        store.map.panTo(center);

        // Re-apply restriction after pan
        setTimeout(function() {
            store.map.setOptions({
                restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false }
            });
        }, 400);

    } else {
        // Standard logic for multiple meetings (e.g. CSE 30)
        // With the map DOM element shifted/resized, we only need normal padding.
        const padding = {
            top: 100,
            right: 100,
            bottom: 50,
            left: 100
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
 * displayLegBubbles places a stat bubble at 95% of the length of each leg
 */
export function displayLegBubbles(legs) {
    store.routeLabelWindows.forEach(function(w) {
        w.close();
    });
    store.routeLabelWindows = [];

    legs.forEach(function(leg) {
        const snappedPath = google.maps.geometry.encoding.decodePath(leg.polyline.encodedPolyline);
        if (snappedPath.length === 0) {
            return;
        }

        // Place bubble 95% down the leg for better clarity near destination
        const posIdx = Math.max(0, Math.floor(snappedPath.length * 0.95) - 1);
        const bubblePoint = snappedPath[posIdx];

        const durationStr = leg.duration || "0s";
        const durationSec = parseInt(durationStr.replace('s', ''));
        const distanceMeters = leg.distanceMeters || 0;

        const minutes = Math.round(durationSec / 60);
        const miles = (distanceMeters / 1609.34).toFixed(1);

        const iw = new google.maps.InfoWindow({
            disableAutoPan: true,
            headerDisabled: true,
            position: bubblePoint,
            zIndex: 100, // Stacking order: bubbles sit below main building details
            content: `
                <div class="route-bubble-container">
                    <div class="route-bubble-time">
                        ${utils.getIcon('walk', 14, 'currentColor')}
                        <span>${minutes} min</span>
                    </div>
                    <div class="route-bubble-dist">${miles} miles</div>
                </div>
            `
        });
        iw.open(store.map);
        store.routeLabelWindows.push(iw);
    });
}

/**
 * executeRouting calculates the actual walking route via proxy using intermediates
 */
export async function executeRouting(overrideOrigin = null) {
    if (store.directionsRenderer) {
        store.directionsRenderer.setPath([]);
    }
    store.routeLabelWindows.forEach(function(w) {
        w.close();
    });
    store.routeLabelWindows = [];

    if (store.destinations.length === 0) {
        return;
    }

    // Track if this is a Point-to-Point route to prevent future standard prompts
    store.isLastRouteP2P = !!overrideOrigin;

    const finalTarget = store.destinations[store.destinations.length - 1];
    store.currentDestination = finalTarget;

    const startPos = overrideOrigin || store.startMarker.position;
    store.lastRouteOrigin = startPos;

    const intermediates = store.destinations.slice(0, -1).map(function(d) {
        return {
            location: {
                latLng: {
                    latitude: d.lat,
                    longitude: d.lng
                }
            }
        };
    });

    const requestBody = {
        origin: {
            location: {
                latLng: {
                    latitude: startPos.lat,
                    longitude: startPos.lng
                }
            }
        },
        destination: {
            location: {
                latLng: {
                    latitude: finalTarget.lat,
                    longitude: finalTarget.lng
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

    if (intermediates.length > 0) {
        requestBody.intermediates = intermediates;
    }

    try {
        const response = await fetch('/api/routes-proxy', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            store.lastRoute = route;

            // Build fullPath leg-by-leg to ensure no gaps between snapped roads and markers
            let fullPath = [startPos];

            route.legs.forEach(function(leg, index) {
                const snappedLegPath = google.maps.geometry.encoding.decodePath(leg.polyline.encodedPolyline);
                fullPath.push(...snappedLegPath);

                // Anchors the end of this leg to the exact waypoint coordinate
                if (index < store.destinations.length) {
                    fullPath.push(store.destinations[index]);
                }
            });

            store.directionsRenderer.setPath(fullPath);

            displayLegBubbles(route.legs);

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
            showToast("Could not find a walking route to these locations.", "error");
        }
    } catch (err) {
        console.error("Routes API Error:", err);
        showToast("Error connecting to the routing service.", "error");
    }
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

    // Feature implementation: If a standard route exists, automatically recalculate from new position
    if (store.lastRoute && !store.isLastRouteP2P && store.destinations.length > 0) {
        executeRouting();
    }

    store.map.panTo(position);
    store.map.setZoom(18);
}

/**
 * getDirections determines whether to calculate a new route or show extension options
 */
export async function getDirections(lat, lng) {
    const targetPos = { lat: parseFloat(lat), lng: parseFloat(lng) };

    // Mode Intercept: Point-to-Point routing
    if (store.isP2PMode) {
        if (!store.p2pOrigin) {
            store.p2pOrigin = targetPos;
            showToast("Origin set. Now select your destination class marker.", "success");
        } else {
            if (utils.coordsMatch(store.p2pOrigin, targetPos)) {
                showToast("Origin and destination cannot be the same building.", "error");
                return;
            }
            const destination = targetPos;
            store.destinations = [destination];
            executeRouting(store.p2pOrigin);

            // Exit P2P mode after successful setup
            store.isP2PMode = false;
            store.p2pOrigin = null;
            document.getElementById("p2p-route-btn").classList.remove("active");
        }
        return;
    }

    if (!store.startMarker) {
        showToast("Please set your starting location first using the GPS or Pin buttons.", "error");
        return;
    }

    // Bypass check: If the existing route is a Point-to-Point lookup,
    // we clear it first to avoid coordinate duplicate conflicts.
    if (store.isLastRouteP2P && store.lastRoute) {
        store.destinations = [targetPos];
        executeRouting();
        return;
    }

    // Strict duplicate check: ensure building isn't already part of the path
    const isDuplicate = store.destinations.some(function(d) {
        return utils.coordsMatch(d, targetPos);
    });
    if (isDuplicate) {
        showToast("This building is already part of your route.", "success");
        return;
    }

    // Standard Modal check: Only show if a standard route already exists and the click is on a different marker
    const isNewTarget = !store.currentDestination || (store.currentDestination.lat !== targetPos.lat || store.currentDestination.lng !== targetPos.lng);

    if (store.lastRoute && isNewTarget) {
        store.pendingRoutingTarget = targetPos;
        document.getElementById('routing-modal').style.display = 'block';
    } else {
        store.destinations = [targetPos];
        executeRouting();
    }
}

// Attach getDirections to window for inline onclick handlers in info windows
window.getDirections = getDirections;

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
            store.routeLabelWindows.forEach(function(w) {
                w.close();
            });
            store.routeLabelWindows = [];
            store.lastRoute = null;
            store.currentDestination = null;
            store.destinations = [];
            store.lastRouteOrigin = null;
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
            store.routeLabelWindows.forEach(function(w) {
                w.close();
            });
            store.routeLabelWindows = [];
            store.lastRoute = null;
            store.currentDestination = null;
            store.destinations = [];
            store.lastRouteOrigin = null;
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

        // Fix console warnings and implement intuitive P2P selection
        marker.addListener("gmp-click", function() {
            if (store.isP2PMode) {
                // Clicking the marker selects it directly for routing without an info window
                getDirections(group.lat, group.lng);
            } else {
                const activeFilters = Array.from(document.querySelectorAll(".filter-type:checked")).map(function(cb) {
                    return cb.value;
                });
                const content = buildInfoWindowHtml(group, activeFilters);
                if (!content) {
                    return;
                }

                store.activeInfoWindow.setContent(content);
                store.activeInfoWindow.open({ map: store.map, anchor: marker });
            }
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
 * clearResults empties current results and map
 */
export function clearResults() {
    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }
    store.routeLabelWindows.forEach(function(w) {
        w.close();
    });
    store.routeLabelWindows = [];
    if (store.directionsRenderer) {
        store.directionsRenderer.setPath([]);
    }
    store.lastRoute = null;
    store.currentDestination = null;
    store.destinations = [];
    store.lastRouteOrigin = null;
    store.currentOfferings.forEach(function(c) {
        ColorManager.releaseColor(c.class_number);
    });
    store.currentOfferings = [];
    refreshMapAndUI();
}

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
        store.activeInfoWindow = new google.maps.InfoWindow({
            zIndex: 200 // Higher zIndex ensures InfoWindow is always on top of time bubbles
        });

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
