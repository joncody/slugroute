/*state.js*/
/**
 * SlugRoute | Global State Store
 */

export const store = {
    map: null,
    markers: [],
    activeInfoWindow: null,
    routeLabelWindow: null,
    currentOfferings: [],
    lastSearchResults: [],
    pendingSelections: {},
    savedCourses: JSON.parse(localStorage.getItem("slugroute_saved")) || [],
    AdvancedMarkerElement: null,
    suggestionTimeout: null,
    startMarker: null,
    currentDestination: null,
    lastRoute: null,
    isChoosingLocation: false,
    // directionsRenderer will now hold a google.maps.Polyline for compatibility with Routes API v2 results
    directionsRenderer: null,
    pendingRouteDestination: null,
    continueFromPath: null
};
