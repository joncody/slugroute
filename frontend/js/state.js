//state.js
/**
 * SlugRoute | Global State Store
 */

// Attempt to load and parse saved courses cached in LocalStorage
let savedCoursesParsed = [];
try {
    const saved = localStorage.getItem("slugroute_saved");
    savedCoursesParsed = saved ? JSON.parse(saved) : [];
} catch (e) {
    console.error("Failed to parse saved courses from LocalStorage", e);
    savedCoursesParsed = [];
}

// Attempt to load and parse actively mapped offerings cached in LocalStorage
let currentOfferingsParsed = [];
try {
    const current = localStorage.getItem("slugroute_current");
    currentOfferingsParsed = current ? JSON.parse(current) : [];
} catch (e) {
    console.error("Failed to parse current offerings from LocalStorage", e);
    currentOfferingsParsed = [];
}

// Global state model managing map references, routes, destinations, and selections
export const store = {
    map: null,                             // Google Map instance object
    markers: [],                           // Active AdvancedMarkerElement instances rendered on map
    activeInfoWindow: null,                // Singleton info window popup instance
    routeLabelWindows: [],                 // Info windows holding duration/distance statistics above route polylines
    currentOfferings: currentOfferingsParsed, // Active course list added to the map and sidebar results
    lastSearchResults: [],                 // Latest raw results retrieved from course lookup API
    pendingSelections: {},                 // Temporary checkboxes record in the search dropdown
    savedCourses: savedCoursesParsed,       // Bookmarked items preserved in the secondary sidebar
    AdvancedMarkerElement: null,           // Constructor reference for custom Google Map markers
    suggestionTimeout: null,               // Debounce handle for suggestion search key inputs
    startMarker: null,                     // Pin marking starting walk location
    currentDestination: null,              // Target terminal destination of the active walk
    destinations: [],                      // Sequence of coordinates representing planned itinerary stops
    lastRoute: null,                       // Cached last-computed Google Routes API response
    isChoosingLocation: false,             // Active coordinate picking state toggle
    directionsRenderer: null,              // google.maps.Polyline container for the rendered route geometry
    pendingRoutingTarget: null,            // Temporary destination reference while handling routing modals
    isP2PMode: false,                      // Point-to-Point selection mode active toggle
    p2pOrigin: null,                       // Custom selected start coordinates for P2P mode
    isLastRouteP2P: false,                 // Indicates if the currently drawn route is a P2P walk path
    lastRouteOrigin: null                  // Backup reference of original starting coordinates
};
