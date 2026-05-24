//state.js
/**
 * SlugRoute | Global State Store
 */

export const store = {
    map: null,
    markers: [],
    activeInfoWindow: null,
    routeLabelWindows: [],
    currentOfferings: [],
    lastSearchResults: [],
    pendingSelections: {},
    savedCourses: JSON.parse(localStorage.getItem("slugroute_saved")) || [],
    AdvancedMarkerElement: null,
    suggestionTimeout: null,
    startMarker: null,
    currentDestination: null,
    destinations: [],
    lastRoute: null,
    isChoosingLocation: false,
    // directionsRenderer will now hold a google.maps.Polyline for compatibility with Routes API v2 results
    directionsRenderer: null,
    pendingRoutingTarget: null,
    isP2PMode: false,
    p2pOrigin: null,
    isLastRouteP2P: false,
    lastRouteOrigin: null
};
