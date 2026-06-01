/*config.js*/
/**
 * SlugRoute | UCSC Map Configuration
 */

export const CONFIG = {
    // Fallback search term code when date calculation fails
    DEFAULT_TERM: "2262",

    // Core lat/lng midpoint utilized to center the UCSC campus view
    CAMPUS_CENTER: {
        lat: 36.9914,
        lng: -122.0608
    },

    // Geographical boundary limits for strict map coordinate restrictions
    UCSC_BOUNDS: {
        north: 38.00,
        south: 36.00,
        west: -123.00,
        east: -121.00
    },

    // Zoom configurations for general map view versus localized building selection
    ZOOM: {
        CAMPUS: 15,
        BUILDING: 18
    },

    // Unique color pool allocated dynamically to distinct course results
    COLOR_POOL: [
        "#e6194b", "#3cb44b", "#ffe119", "#4363d8", "#f58231",
        "#911eb4", "#42d4f4", "#f032e6", "#bfef45", "#fabed4",
        "#469990", "#dcbeff", "#9A6324", "#fffac8", "#800000",
        "#aaffc3", "#808000", "#ffd8b1", "#000075", "#a9a9a9"
    ],

    // Vector Google Maps design Map ID configured via Cloud Console
    MAP_ID: "75ccfb1714f1ad1ed6ac3269"
};
