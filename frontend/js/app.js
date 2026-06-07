//app.js
import { CONFIG } from "./config.js";
import { store } from "./state.js";
import { utils, showToast } from "./utils.js";
import { initializeGoogleServices } from "./map.js";
import { refreshMapAndUI, updateMarkers, clearResults } from "./markers.js";
import { updateStartMarker, clearRoute, smartFitBounds } from "./navigation.js";
import { displayLegBubbles, executeRouting } from "./routing.js";
import { setupSidebarDelegation, addAllSavedToResults } from "./ui.js";
import { fetchSuggestions, searchCourse } from "./search.js";
import { setupCalendarExport } from "./calendar.js";

/**
 * toggleChooseLocationMode switches the crosshair cursor for pinning location
 */
export function toggleChooseLocationMode() {
    store.isChoosingLocation = !store.isChoosingLocation;
    const btn = document.getElementById("choose-location-btn");

    if (store.isChoosingLocation) {
        btn.classList.add("active");
        store.map.setOptions({ draggableCursor: 'crosshair' });
        showToast("Click anywhere on the map to set your starting point.", "success");
    } else {
        btn.classList.remove("active");
        store.map.setOptions({ draggableCursor: null });
    }
}

// Attach to window to support initializeGoogleServices map click logic
window.toggleChooseLocationMode = toggleChooseLocationMode;

/**
 * renderTermOptions builds option elements for terms selection
 */
function renderTermOptions(termSelect, terms, idealTerm) {
    terms.forEach(function(t) {
        const opt = document.createElement("option");
        opt.value = t;
        opt.textContent = utils.getTermName(t);
        if (t === idealTerm) {
            opt.selected = true;
        }
        termSelect.appendChild(opt);
    });
}

/**
 * populateTerms fetches available academic terms and selects the ideal one
 */
export async function populateTerms() {
    const termSelect = document.getElementById("term-select");
    try {
        const response = await fetch('/api/terms');
        const terms = await response.json();

        if (!terms || terms.length === 0) {
            termSelect.innerHTML = "<option value=\"\">No Data Found</option>";
            return;
        }

        termSelect.innerHTML = "";
        const idealTerm = utils.calculateIdealTerm();
        renderTermOptions(termSelect, terms, idealTerm);

    } catch (err) {
        console.error("Failed to load terms:", err);
        termSelect.innerHTML = "<option value=\"\">API Error</option>";
    }
}

/**
 * setupSearchUI initializes the search input and form listeners
 */
export function setupSearchUI() {
    const courseInput = document.getElementById("course-input");

    courseInput.oninput = function(e) {
        clearTimeout(store.suggestionTimeout);
        store.suggestionTimeout = setTimeout(function() {
            fetchSuggestions(e.target.value);
        }, 200);
    };

    document.getElementById("search-form").onsubmit = function(e) {
        e.preventDefault();
        searchCourse();
    };

    window.onclick = function(e) {
        if (!e.target.closest('.search-container')) {
            const preview = document.getElementById("search-preview");
            if (preview) {
                preview.style.display = "none";
            }
        }
    };
}

/**
 * setupSidebarToggle configures sidebar drawer visibility transition triggers
 */
function setupSidebarToggle() {
    document.getElementById("sidebar-toggle").onclick = function() {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.toggle("closed");

        setTimeout(function() {
            if (store.map) {
                google.maps.event.trigger(store.map, 'resize');
            }
        }, 350);
    };
}

/**
 * restoreThemeState restores map pins and routes after a theme switch re-init
 */
function restoreThemeState(currentStartPos, routeToRestore) {
    if (currentStartPos) {
        const youAreHereDiv = document.createElement('div');
        youAreHereDiv.style.transform = 'translateY(50%)';
        youAreHereDiv.innerHTML = utils.getIcon('location', 28, '#4285F4');
        store.startMarker = new store.AdvancedMarkerElement({
            map: store.map,
            position: currentStartPos,
            content: youAreHereDiv,
            title: "Starting Point"
        });
    }

    if (routeToRestore && store.lastRouteOrigin && store.destinations.length > 0) {
        store.lastRoute = routeToRestore;
        let fullPath = [store.lastRouteOrigin];
        routeToRestore.legs.forEach(function(leg, index) {
            const snappedLegPath = google.maps.geometry.encoding.decodePath(leg.polyline.encodedPolyline);
            fullPath.push(...snappedLegPath);
            if (index < store.destinations.length) {
                fullPath.push(store.destinations[index]);
            }
        });
        store.directionsRenderer.setPath(fullPath);
        displayLegBubbles(routeToRestore.legs);
    }
}

/**
 * handleThemeToggleAction manages dark/light mode toggle with state persistence
 */
async function handleThemeToggleAction() {
    const currentCenter = store.map.getCenter();
    const currentZoom = store.map.getZoom();
    const currentStartPos = store.startMarker ? store.startMarker.position : null;
    const routeToRestore = store.lastRoute;

    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('slugroute_theme', newTheme);

    if (store.map) {
        if (store.activeInfoWindow) {
            store.activeInfoWindow.close();
            store.activeInfoWindow = null;
        }
        store.routeLabelWindows.forEach(function(w) { w.close(); });
        store.routeLabelWindows = [];

        await initializeGoogleServices();
        store.map.setZoom(currentZoom);
        store.map.setCenter(currentCenter);

        restoreThemeState(currentStartPos, routeToRestore);
        refreshMapAndUI(false);
    }
}

/**
 * setupThemeToggle configures color scheme transitions
 */
function setupThemeToggle() {
    document.getElementById("theme-toggle").onclick = handleThemeToggleAction;
}

/**
 * setupGlobalActionControls configures result clearing, filters, and batch actions
 */
function setupGlobalActionControls() {
    document.getElementById("clear-results-btn").onclick = function() {
        clearResults();
    };

    document.getElementById("add-all-saved-btn").onclick = function() {
        addAllSavedToResults();
    };

    document.querySelectorAll(".filter-type").forEach(function(cb) {
        cb.onchange = function() { updateMarkers(); };
    });
}

/**
 * setupRecenterUiAndMarkers configures recenter UI triggers
 */
function setupRecenterUiAndMarkers() {
    document.getElementById("recenter-ui-btn").onclick = function() {
        if (store.activeInfoWindow) {
            store.activeInfoWindow.close();
        }
        store.map.setZoom(CONFIG.ZOOM.CAMPUS);
        store.map.panTo(CONFIG.CAMPUS_CENTER);
    };

    document.getElementById("recenter-markers-btn").onclick = function() {
        if (store.activeInfoWindow) {
            store.activeInfoWindow.close();
        }
        const bounds = new google.maps.LatLngBounds();
        store.markers.forEach(function(m) {
            if (m.map) { bounds.extend(m.position); }
        });
        if (!bounds.isEmpty()) {
            smartFitBounds(bounds);
        } else {
            showToast("No active classes to center on.", "error");
        }
    };
}

/**
 * setupRecenterStartAndRoute configures route navigation focus buttons
 */
function setupRecenterStartAndRoute() {
    document.getElementById("recenter-start-btn").onclick = function() {
        if (store.activeInfoWindow) {
            store.activeInfoWindow.close();
        }
        if (store.startMarker && store.startMarker.position) {
            store.map.panTo(store.startMarker.position);
            store.map.setZoom(CONFIG.ZOOM.BUILDING);
        } else {
            showToast("No start point set yet. Drop a pin or use GPS.", "error");
        }
    };

    document.getElementById("recenter-route-btn").onclick = function() {
        if (store.activeInfoWindow) { store.activeInfoWindow.close(); }
        if (store.lastRoute && store.lastRoute.viewport) {
            const viewport = store.lastRoute.viewport;
            const bounds = new google.maps.LatLngBounds(
                { lat: viewport.low.latitude, lng: viewport.low.longitude },
                { lat: viewport.high.latitude, lng: viewport.high.longitude }
            );
            smartFitBounds(bounds);
        } else {
            showToast("No active route to center on.", "error");
        }
    };
}

/**
 * setupLocationTriggerControls configures geo buttons triggers
 */
function setupLocationTriggerControls() {
    document.getElementById("clear-route-btn").onclick = function() {
        clearRoute();
    };

    document.getElementById("grab-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'block';
    };

    document.getElementById("choose-location-btn").onclick = function() {
        toggleChooseLocationMode();
    };
}

/**
 * setupP2PandBrowserLocation configures geolocation permissions triggers
 */
function setupP2PandBrowserLocation() {
    document.getElementById("p2p-route-btn").onclick = function() {
        store.isP2PMode = !store.isP2PMode;
        if (store.isP2PMode) {
            if (store.activeInfoWindow) { store.activeInfoWindow.close(); }
            this.classList.add("active");
            store.p2pOrigin = null;
            showToast("Point-to-Point active. Click your origin class marker.", "success");
        } else {
            this.classList.remove("active");
            store.p2pOrigin = null;
        }
    };

    document.getElementById("allow-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'none';
        const grabBtn = document.getElementById("grab-location-btn");
        if (grabBtn) { grabBtn.classList.add("active"); }

        navigator.geolocation.getCurrentPosition(
            function(position) {
                const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
                updateStartMarker(userPos, "Current Location");
                if (grabBtn) { grabBtn.classList.remove("active"); }
            },
            function(error) {
                if (grabBtn) { grabBtn.classList.remove("active"); }
                showToast("Could not retrieve your location.", "error");
            },
            { enableHighAccuracy: true }
        );
    };

    document.getElementById("deny-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'none';
    };
}

/**
 * setupRoutingModalAddAndReplace configures routing pop-up waypoint additions
 */
function setupRoutingModalAddAndReplace() {
    document.getElementById("add-route-btn").onclick = function() {
        if (store.pendingRoutingTarget) {
            const isDuplicate = store.destinations.some(function(d) {
                return utils.coordsMatch(d, store.pendingRoutingTarget);
            });
            if (!isDuplicate) {
                store.destinations.push(store.pendingRoutingTarget);
                executeRouting();
            }
        }
        document.getElementById('routing-modal').style.display = 'none';
    };

    document.getElementById("replace-route-btn").onclick = function() {
        if (store.pendingRoutingTarget) {
            if (store.destinations.length > 0) {
                store.destinations[store.destinations.length - 1] = store.pendingRoutingTarget;
            } else {
                store.destinations = [store.pendingRoutingTarget];
            }
            executeRouting();
        }
        document.getElementById('routing-modal').style.display = 'none';
    };
}

/**
 * setupRoutingModalNewAndCancel configures routing path modifications
 */
function setupRoutingModalNewAndCancel() {
    document.getElementById("new-route-btn").onclick = function() {
        if (store.pendingRoutingTarget) {
            store.destinations = [store.pendingRoutingTarget];
            executeRouting();
        }
        document.getElementById('routing-modal').style.display = 'none';
    };

    document.getElementById("cancel-route-btn").onclick = function() {
        document.getElementById('routing-modal').style.display = 'none';
        store.pendingRoutingTarget = null;
    };
}

/**
 * setupMapControls initializes custom UI buttons on the map
 */
export function setupMapControls() {
    setupSidebarToggle();
    setupThemeToggle();
    setupGlobalActionControls();
    setupRecenterUiAndMarkers();
    setupRecenterStartAndRoute();
    setupLocationTriggerControls();
    setupP2PandBrowserLocation();
    setupRoutingModalAddAndReplace();
    setupRoutingModalNewAndCancel();
}

/**
 * initMap entry point for Google Maps API
 */
export async function initMap() {
    const modalTitle = document.getElementById("modal-title");
    if (modalTitle) {
        modalTitle.insertAdjacentHTML('afterbegin', utils.getIcon('pin', 20, 'var(--ucsc-blue)') + ' ');
    }

    // Set up database selections, text search listeners, controls, map engines, and bookmarks
    await populateTerms();
    setupSearchUI();
    setupMapControls();
    await initializeGoogleServices();
    setupSidebarDelegation();
    setupCalendarExport();
    refreshMapAndUI();
}

// Attach to window as the global callback for Google Maps API script
window.initMap = initMap;
