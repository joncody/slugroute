//routing.js
import { CONFIG } from "./config.js";
import { store } from "./state.js";
import { utils, showToast } from "./utils.js";
import { smartFitBounds } from "./navigation.js";

/**
 * buildRouteBubbleHtml constructs the HTML content for a leg's walk stat bubble
 */
export function buildRouteBubbleHtml(minutes, miles) {
    return `
        <div class="route-bubble-container">
            <div class="route-bubble-time">
                ${utils.getIcon('walk', 14, 'currentColor')}
                <span>${minutes} min</span>
            </div>
            <div class="route-bubble-dist">${miles} miles</div>
        </div>
    `;
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
            zIndex: 100,
            content: buildRouteBubbleHtml(minutes, miles)
        });
        iw.open(store.map);
        store.routeLabelWindows.push(iw);
    });
}

/**
 * fetchRouteData posts structured JSON objects to the proxy routes endpoint
 */
async function fetchRouteData(startPos, finalTarget, intermediates) {
    const requestBody = {
        origin: { location: { latLng: { latitude: startPos.lat, longitude: startPos.lng } } },
        destination: { location: { latLng: { latitude: finalTarget.lat, longitude: finalTarget.lng } } },
        travelMode: "WALK",
        computeAlternativeRoutes: false,
        routeModifiers: { avoidTolls: false, avoidHighways: false, avoidFerries: false }
    };

    if (intermediates.length > 0) {
        requestBody.intermediates = intermediates;
    }

    const response = await fetch('/api/routes-proxy', {
        method: 'POST',
        body: JSON.stringify(requestBody)
    });
    return response.json();
}

/**
 * renderRoutePath draws polyline geometries and places duration labels
 */
function renderRoutePath(route, startPos) {
    let fullPath = [startPos];

    route.legs.forEach(function(leg, index) {
        const snappedLegPath = google.maps.geometry.encoding.decodePath(leg.polyline.encodedPolyline);
        fullPath.push(...snappedLegPath);

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
}

/**
 * clearRouteState clears polylines and overlay maps indicators
 */
function clearRouteState() {
    if (store.directionsRenderer) {
        store.directionsRenderer.setPath([]);
    }
    store.routeLabelWindows.forEach(function(w) {
        w.close();
    });
    store.routeLabelWindows = [];
}

/**
 * runRouteComputation triggers async proxy operations
 */
async function runRouteComputation(startPos, finalTarget, intermediates) {
    try {
        const data = await fetchRouteData(startPos, finalTarget, intermediates);

        if (data.routes && data.routes.length > 0) {
            store.lastRoute = data.routes[0];
            renderRoutePath(data.routes[0], startPos);

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
 * executeRouting calculates the actual walking route via proxy using intermediates
 */
export async function executeRouting(overrideOrigin = null) {
    clearRouteState();

    if (store.destinations.length === 0) {
        return;
    }

    store.isLastRouteP2P = !!overrideOrigin;

    const finalTarget = store.destinations[store.destinations.length - 1];
    store.currentDestination = finalTarget;

    const startPos = overrideOrigin || store.startMarker.position;
    store.lastRouteOrigin = startPos;

    const intermediates = store.destinations.slice(0, -1).map(function(d) {
        return { location: { latLng: { latitude: d.lat, longitude: d.lng } } };
    });

    await runRouteComputation(startPos, finalTarget, intermediates);
}
