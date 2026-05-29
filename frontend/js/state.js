//state.js
/**
 * SlugRoute | Global State Store
 */

let savedCoursesParsed = [];
try {
    const saved = localStorage.getItem("slugroute_saved");
    savedCoursesParsed = saved ? JSON.parse(saved) : [];
} catch (e) {
    console.error("Failed to parse saved courses from LocalStorage", e);
    savedCoursesParsed = [];
}

let currentOfferingsParsed = [];
try {
    const current = localStorage.getItem("slugroute_current");
    currentOfferingsParsed = current ? JSON.parse(current) : [];
} catch (e) {
    console.error("Failed to parse current offerings from LocalStorage", e);
    currentOfferingsParsed = [];
}

export const store = {
    map: null,
    markers: [],
    activeInfoWindow: null,
    routeLabelWindows: [],
    currentOfferings: currentOfferingsParsed,
    lastSearchResults: [],
    pendingSelections: {},
    savedCourses: savedCoursesParsed,
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
