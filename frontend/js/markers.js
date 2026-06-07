//markers.js
import { store } from "./state.js";
import { CONFIG } from "./config.js";
import { utils, ColorManager } from "./utils.js";
import { buildInfoWindowHtml } from "./map.js";
import { clearRoute, getDirections, smartFitBounds } from "./navigation.js";
import { renderSearchList, renderSavedList, saveState } from "./ui.js";

/**
 * createLocationGroup establishes a base coordinate clustering target
 */
function createLocationGroup(meet) {
    return {
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

/**
 * addMeetingToLocation assigns section entries directly to location groups
 */
function addMeetingToLocation(group, offering, meet, classColor, mIndex) {
    const cat = utils.getFilterCategory(meet.type);
    group.totalMeetings++;

    if (!group.filterCategories.includes(cat)) {
        group.filterCategories.push(cat);
    }

    if (cat === "LEC") {
        group.highestPriorityType = "LEC";
    } else if (cat === "LAB" && group.highestPriorityType !== "LEC") {
        group.highestPriorityType = "LAB";
    }

    if (!group.offerings[offering.class_number]) {
        group.offerings[offering.class_number] = {
            courseCode: offering.course_code,
            term: offering.term,
            color: classColor,
            meetings: []
        };
    }
    group.offerings[offering.class_number].meetings.push({ ...meet, originalIndex: mIndex });
}

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
                locationMap[locKey] = createLocationGroup(meet);
            }

            addMeetingToLocation(locationMap[locKey], offering, meet, classColor, mIndex);
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

    const slugGold = "#F1B82D";

    if (count > 1) {
        div.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="40" height="50" class="marker-svg">
                <path d="M14 14 C12 8, 9 8, 9 3" stroke="${slugGold}" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                <circle cx="9" cy="3" r="2" fill="${slugGold}"/>
                <path d="M22 14 C24 8, 27 8, 27 3" stroke="${slugGold}" stroke-width="2.5" stroke-linecap="round" fill="none"/>
                <circle cx="27" cy="3" r="2" fill="${slugGold}"/>
                <path d="M18 12c-6.6 0-12 5.4-12 12 0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="${slugGold}" stroke="#ffffff" stroke-width="2"/>
                <circle cx="18" cy="24" r="9" fill="#232323"/>
                <text x="18" y="24" font-family="Inter, sans-serif" font-weight="800" font-size="11" fill="white" text-anchor="middle" dominant-baseline="central" class="marker-text">${count}</text>
            </svg>
        `;
        return div;
    }

    const path = utils.getIconPath(category);
    div.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 36 46" width="40" height="50" class="marker-svg">
            <path d="M14 14 C12 8, 9 8, 9 3" stroke="${slugGold}" stroke-width="2.5" stroke-linecap="round" fill="none"/>
            <circle cx="9" cy="3" r="2" fill="${slugGold}"/>
            <path d="M22 14 C24 8, 27 8, 27 3" stroke="${slugGold}" stroke-width="2.5" stroke-linecap="round" fill="none"/>
            <circle cx="27" cy="3" r="2" fill="${slugGold}"/>
            <path d="M18 12c-6.6 0-12 5.4-12 12 0 9 12 20 12 20s12-11 12-20c0-6.6-5.4-12-12-12z" fill="${slugGold}" stroke="#ffffff" stroke-width="2"/>
            <circle cx="18" cy="24" r="9" fill="#ffffff" stroke="${color}" stroke-width="1"/>
            <g transform="translate(10.5, 16.5) scale(0.625)">
                <path d="${path}" fill="${color}"/>
            </g>
        </svg>
    `;
    return div;
}

/**
 * updateMarkers toggles marker visibility based on sidebar filters
 */
export function updateMarkers() {
    const activeFilters = utils.getActiveFilters();

    store.markers.forEach(function(m) {
        const isVisible = m.categories.some(function(cat) {
            return activeFilters.includes(cat);
        });
        m.map = isVisible ? store.map : null;
    });

    if (store.currentDestination) {
        const destMarker = store.markers.find(function(m) {
            return m.position.lat === store.currentDestination.lat && m.position.lng === store.currentDestination.lng;
        });
        if (destMarker && !destMarker.map) {
            clearRoute();
        }
    }

    if (store.activeInfoWindow && store.activeInfoWindow.getMap()) {
        const anchor = store.activeInfoWindow.getAnchor();
        if (anchor) {
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
 * instantiateMarker builds Google Advanced Markers references on layout
 */
function instantiateMarker(group, uniqueCourseIDs) {
    const markerColor = uniqueCourseIDs.length > 1 ? "#232323" : group.offerings[uniqueCourseIDs[0]].color;
    const marker = new store.AdvancedMarkerElement({
        map: store.map,
        position: { lat: group.lat, lng: group.lng },
        content: createMarkerElement(group.highestPriorityType, markerColor, group.totalMeetings)
    });

    marker.categories = group.filterCategories;
    marker.locationGroup = group;

    marker.addListener("gmp-click", function() {
        if (store.isP2PMode) {
            getDirections(group.lat, group.lng);
        } else {
            const activeFilters = utils.getActiveFilters();
            const content = buildInfoWindowHtml(group, activeFilters);
            if (!content) { return; }
            store.activeInfoWindow.setContent(content);
            store.activeInfoWindow.open({ map: store.map, anchor: marker });
        }
    });

    store.markers.push(marker);
}

/**
 * refreshMapAndUI triggers a complete redraw of map pins and sidebars
 */
export function refreshMapAndUI(shouldFitBounds = true) {
    store.markers.forEach(function(m) { m.map = null; });
    store.markers = [];

    if (store.activeInfoWindow) { store.activeInfoWindow.close(); }

    renderSearchList();
    renderSavedList();

    if (store.currentOfferings.length === 0) {
        clearRoute();
        return;
    }

    const locationGroups = groupDataByLocation(store.currentOfferings);
    if (store.currentDestination) {
        const destKey = `${store.currentDestination.lat},${store.currentDestination.lng}`;
        if (!locationGroups[destKey]) { clearRoute(); }
    }

    const bounds = new google.maps.LatLngBounds();
    for (const key in locationGroups) {
        const group = locationGroups[key];
        const uniqueCourseIDs = Object.keys(group.offerings);
        instantiateMarker(group, uniqueCourseIDs);
    }

    updateMarkers();
    store.markers.forEach(function(m) {
        if (m.map) { bounds.extend(m.position); }
    });

    if (shouldFitBounds && !bounds.isEmpty()) { smartFitBounds(bounds); }
}

/**
 * clearResults empties current results and map
 */
export function clearResults() {
    if (store.activeInfoWindow) {
        store.activeInfoWindow.close();
    }
    clearRoute();
    store.currentOfferings.forEach(function(c) {
        ColorManager.releaseColor(c.class_number);
    });
    store.currentOfferings = [];

    saveState();
    refreshMapAndUI();
}
