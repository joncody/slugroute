//app.js
import { CONFIG } from "./config.js";
import { store } from "./state.js";
import { utils, showToast } from "./utils.js";
import {
    initializeGoogleServices,
    refreshMapAndUI,
    updateMarkers,
    smartFitBounds,
    clearResults,
    updateStartMarker,
    displayLegBubbles,
    executeRouting,
    getDirections
} from "./map.js";
import {
    setupSidebarDelegation,
    fetchSuggestions,
    searchCourse,
    addAllSavedToResults,
    setupCalendarExport
} from "./ui.js";

/**
 * toggleChooseLocationMode switches the crosshair cursor for pinning location
 */
export function toggleChooseLocationMode() {
    // Invert the active location-choosing state
    store.isChoosingLocation = !store.isChoosingLocation;
    const btn = document.getElementById("choose-location-btn");

    if (store.isChoosingLocation) {
        // Activate UI visual indicators and set cursor styling
        btn.classList.add("active");
        store.map.setOptions({ draggableCursor: 'crosshair' });
        showToast("Click anywhere on the map to set your starting point.", "success");
    } else {
        // Revert cursor styling to standard pointer map options
        btn.classList.remove("active");
        store.map.setOptions({ draggableCursor: null });
    }
}

// Attach to window to support initializeGoogleServices map click logic
window.toggleChooseLocationMode = toggleChooseLocationMode;

/**
 * populateTerms fetches available academic terms and selects the ideal one
 */
export async function populateTerms() {
    const termSelect = document.getElementById("term-select");
    try {
        // Retrieve available terms from database API
        const response = await fetch('/api/terms');
        const terms = await response.json();

        // Handle empty database states cleanly
        if (!terms || terms.length === 0) {
            termSelect.innerHTML = "<option value=\"\">No Data Found</option>";
            return;
        }

        termSelect.innerHTML = "";
        // Determine current or upcoming ideal quarter segment based on system date
        const idealTerm = utils.calculateIdealTerm();

        // Build and append term option elements to selector dropdown list
        terms.forEach(function(t) {
            const opt = document.createElement("option");
            opt.value = t;
            opt.textContent = utils.getTermName(t);
            if (t === idealTerm) {
                opt.selected = true;
            }
            termSelect.appendChild(opt);
        });

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

    // Implement debounced key input listening to fetch suggestion queries
    courseInput.oninput = function(e) {
        clearTimeout(store.suggestionTimeout);
        store.suggestionTimeout = setTimeout(function() {
            fetchSuggestions(e.target.value);
        }, 200);
    };

    // Override default submit actions to handle course lookups
    document.getElementById("search-form").onsubmit = function(e) {
        e.preventDefault();
        searchCourse();
    };

    // Dismiss search previews when clicking outside the target search wrapper
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
 * setupMapControls initializes custom UI buttons on the map
 */
export function setupMapControls() {
    // Handle opening/closing states of the sidebar drawer
    document.getElementById("sidebar-toggle").onclick = function() {
        const sidebar = document.getElementById("sidebar");
        sidebar.classList.toggle("closed");

        // Fit active map boundaries with appropriate padding adjustments after transition ends
        setTimeout(function() {
            if (store.currentOfferings.length > 0) {
                const bounds = new google.maps.LatLngBounds();
                store.markers.forEach(function(m) {
                    if (m.map) {
                        bounds.extend(m.position);
                    }
                });
                if (!bounds.isEmpty()) {
                    smartFitBounds(bounds);
                }
            }
            // Notify Maps instance of container dimension changes
            google.maps.event.trigger(store.map, 'resize');
        }, 350);
    };

    // Main dark/light mode toggle with state persistence across session updates
    document.getElementById("theme-toggle").onclick = async function() {
        const currentCenter = store.map.getCenter();
        const currentZoom = store.map.getZoom();
        const currentStartPos = store.startMarker ? store.startMarker.position : null;
        const routeToRestore = store.lastRoute;

        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

        // Apply attribute theme references to stylesheet DOM elements
        document.documentElement.setAttribute('data-theme', newTheme);
        localStorage.setItem('slugroute_theme', newTheme);

        if (store.map) {
            // Close existing window and tooltip markers to prevent ghost instances
            if (store.activeInfoWindow) {
                store.activeInfoWindow.close();
                store.activeInfoWindow = null;
            }
            store.routeLabelWindows.forEach(function(w) {
                w.close();
            });
            store.routeLabelWindows = [];

            // Re-initialize the entire map instance to pull new styles from Map ID
            await initializeGoogleServices();

            store.map.setZoom(currentZoom);
            store.map.setCenter(currentCenter);

            // Re-render user starting pins if they are registered in the store
            if (currentStartPos) {
                const youAreHereDiv = document.createElement('div');
                youAreHereDiv.style.transform = 'translateY(50%)';
                youAreHereDiv.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="28" height="28"><circle cx="12" cy="12" r="10" fill="#4285F4" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`;
                store.startMarker = new store.AdvancedMarkerElement({
                    map: store.map,
                    position: currentStartPos,
                    content: youAreHereDiv,
                    title: "Starting Point"
                });
            }

            // Restore active walk directions and metadata markers
            if (routeToRestore && store.lastRouteOrigin && store.destinations.length > 0) {
                store.lastRoute = routeToRestore;

                // Reconstruct multi-stop path using the specific saved origin to avoid straight-line bug
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

            // Refresh UI and markers without force-fitting bounds to keep the exact view
            refreshMapAndUI(false);
        }
    };

    // Wipe active search results, custom routes, and markers
    document.getElementById("clear-results-btn").onclick = function() {
        clearResults();
    };

    // Batch populate saved class list onto main map coordinates
    document.getElementById("add-all-saved-btn").onclick = function() {
        addAllSavedToResults();
    };

    // Toggle pin render conditions based on category filter updates (LEC, DIS, LAB)
    document.querySelectorAll(".filter-type").forEach(function(cb) {
        cb.onchange = function() {
            updateMarkers();
        };
    });

    // Reset coordinates focus to general campus boundaries
    document.getElementById("recenter-ui-btn").onclick = function() {
        if (store.activeInfoWindow) {
            store.activeInfoWindow.close();
        }
        store.map.setZoom(CONFIG.ZOOM.CAMPUS);
        store.map.panTo(CONFIG.CAMPUS_CENTER);
    };

    // Wipe computed polylines and destinations
    document.getElementById("clear-route-btn").onclick = function() {
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
    };

    // Show geolocation options modal
    document.getElementById("grab-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'block';
    };

    // Handle pin-drop click trigger
    document.getElementById("choose-location-btn").onclick = function() {
        toggleChooseLocationMode();
    };

    // Handle Point-To-Point routing mode switches
    document.getElementById("p2p-route-btn").onclick = function() {
        store.isP2PMode = !store.isP2PMode;
        if (store.isP2PMode) {
            // Close active windows and clear routes to ensure a clean lookup
            if (store.activeInfoWindow) {
                store.activeInfoWindow.close();
            }
            this.classList.add("active");
            store.p2pOrigin = null;
            showToast("Point-to-Point active. Click your origin class marker.", "success");
        } else {
            this.classList.remove("active");
            store.p2pOrigin = null;
        }
    };

    // Fetch browser location coordinates on permission approval
    document.getElementById("allow-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'none';

        const grabBtn = document.getElementById("grab-location-btn");
        if (grabBtn) {
            grabBtn.classList.add("active");
        }

        navigator.geolocation.getCurrentPosition(
            function(position) {
                const userPos = { lat: position.coords.latitude, lng: position.coords.longitude };
                updateStartMarker(userPos, "Current Location");

                // Remove active styling once successfully resolved
                if (grabBtn) {
                    grabBtn.classList.remove("active");
                }
            },
            function(error) {
                // Revert active styling and alert user if permission is denied or a timeout occurs
                if (grabBtn) {
                    grabBtn.classList.remove("active");
                }
                showToast("Could not retrieve your location.", "error");
            },
            { enableHighAccuracy: true }
        );
    };

    // Dismiss geolocation options modal
    document.getElementById("deny-location-btn").onclick = function() {
        document.getElementById('location-modal').style.display = 'none';
    };

    // Routing Modal Action: Add destination waypoint
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

    // Routing Modal Action: Replaces final route destination
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

    // Routing Modal Action: Establish new course route, wiping prior waypoints
    document.getElementById("new-route-btn").onclick = function() {
        if (store.pendingRoutingTarget) {
            store.destinations = [store.pendingRoutingTarget];
            executeRouting();
        }
        document.getElementById('routing-modal').style.display = 'none';
    };

    // Close options routing modal
    document.getElementById("cancel-route-btn").onclick = function() {
        document.getElementById('routing-modal').style.display = 'none';
        store.pendingRoutingTarget = null;
    };
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
