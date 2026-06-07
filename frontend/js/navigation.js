//navigation.js
import { CONFIG } from "./config.js";
import { store } from "./state.js";
import { utils, showToast } from "./utils.js";
import { executeRouting } from "./routing.js";
import { highlightSidebarCard } from "./ui.js";
import { refreshMapAndUI } from "./markers.js";

/**
 * panToSinglePoint focuses map coordinates on single building coordinate limits
 */
function panToSinglePoint(center) {
    store.map.setOptions({ restriction: null });
    store.map.setZoom(CONFIG.ZOOM.BUILDING);
    store.map.panTo(center);

    setTimeout(function() {
        store.map.setOptions({
            restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false }
        });
    }, 400);
}

/**
 * fitToMultiplePoints fits bounding boxes to multi-coordinates routes
 */
function fitToMultiplePoints(bounds) {
    const padding = { top: 100, right: 100, bottom: 50, left: 100 };
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

/**
 * smartFitBounds: Centers the map. Centering is handled automatically by the map engine.
 */
export function smartFitBounds(bounds) {
    if (bounds.isEmpty()) {
        return;
    }

    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }

    const isSinglePoint = bounds.getNorthEast().equals(bounds.getSouthWest());

    if (isSinglePoint) {
        panToSinglePoint(bounds.getCenter());
    } else {
        fitToMultiplePoints(bounds);
    }
}

// Attach smartFitBounds to window so dynamic templates can query references safely
window.smartFitBounds = smartFitBounds;

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
        youAreHereDiv.innerHTML = utils.getIcon('location', 28, '#4285F4');
        store.startMarker = new store.AdvancedMarkerElement({
            map: store.map,
            position: position,
            content: youAreHereDiv,
            title: title
        });
    }

    if (store.lastRoute && !store.isLastRouteP2P && store.destinations.length > 0) {
        executeRouting();
    }

    store.map.panTo(position);
    store.map.setZoom(18);
}

/**
 * handleP2PDirections sets Point-to-Point parameters
 */
function handleP2PDirections(targetPos) {
    if (!store.p2pOrigin) {
        clearRoute();
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

        store.isP2PMode = false;
        store.p2pOrigin = null;
        document.getElementById("p2p-route-btn").classList.remove("active");
    }
}

/**
 * handleStandardDirections sets standard map search directions
 */
function handleStandardDirections(targetPos) {
    const isDuplicate = store.destinations.some(function(d) {
        return utils.coordsMatch(d, targetPos);
    });
    if (isDuplicate) {
        showToast("This building is already part of your route.", "success");
        return;
    }

    const isNewTarget = !store.currentDestination || (store.currentDestination.lat !== targetPos.lat || store.currentDestination.lng !== targetPos.lng);

    if (store.lastRoute && isNewTarget) {
        store.pendingRoutingTarget = targetPos;
        const replaceBtn = document.getElementById("replace-route-btn");
        if (replaceBtn) {
            replaceBtn.style.display = store.destinations.length > 1 ? "" : "none";
        }
        document.getElementById('routing-modal').style.display = 'block';
    } else {
        store.destinations = [targetPos];
        executeRouting();
    }
}

/**
 * getDirections determines whether to calculate a new route or show extension options
 */
export async function getDirections(lat, lng) {
    const targetPos = { lat: parseFloat(lat), lng: parseFloat(lng) };

    if (store.isP2PMode) {
        handleP2PDirections(targetPos);
        return;
    }

    if (!store.startMarker) {
        showToast("Please set your starting location first using the GPS or Pin buttons.", "error");
        return;
    }

    if (store.isLastRouteP2P && store.lastRoute) {
        store.destinations = [targetPos];
        executeRouting();
        return;
    }

    handleStandardDirections(targetPos);
}

// Attach getDirections to window for inline onclick handlers in info windows
window.getDirections = getDirections;

/**
 * scrollToSidebarCard visually slides sidebars to card listings
 */
function scrollToSidebarCard(classNumber, meetingIndex) {
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
 * focusClassOnMarkers calculates center frames for selection focuses
 */
function focusClassOnMarkers(offering, bounds, meetingIndex) {
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
            validMeetings.forEach(function(meet) { bounds.extend({ lat: meet.lat, lng: meet.lng }); });
        }
    } else {
        validMeetings.forEach(function(meet) { bounds.extend({ lat: meet.lat, lng: meet.lng }); });
    }

    smartFitBounds(bounds);
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
    focusClassOnMarkers(offering, bounds, meetingIndex);
    scrollToSidebarCard(classNumber, meetingIndex);
}

/**
 * clearRoute wipes computed route polylines and state
 */
export function clearRoute() {
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
    store.isLastRouteP2P = false;
    store.lastRouteOrigin = null;
}
