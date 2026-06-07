//map.js
import { CONFIG } from "./config.js";
import { store } from "./state.js";
import { utils } from "./utils.js";
import { updateStartMarker } from "./navigation.js";
import { highlightSidebarCard } from "./ui.js";

/**
 * buildInfoWindowMeetingCardHtml creates the HTML for a single meeting card in the InfoWindow
 */
function buildInfoWindowMeetingCardHtml(m, classNum, originalIndex) {
    const type = m.type.toUpperCase();
    const cat = utils.getFilterCategory(type);
    const iconPath = utils.getIconPath(cat);
    const roomStr = m.room_number ? `${m.room_number}` : "TBA";
    const timeStr = m.time || "TBA";

    return `<div class="meeting-card iw-meeting-card" data-class="${classNum}" data-index="${originalIndex}">
        <div class="meeting-row-top">
            <div class="meeting-identity">
                <span class="type-badge">
                    <svg width="10" height="10" viewBox="0 0 24 24" class="iw-badge-icon">
                        <path d="${iconPath}" fill="white"/>
                    </svg>${type}
                </span>
                <span class="instructor-name" title="${m.instructor || 'Staff'}">${m.instructor || "Staff"}</span>
            </div>
            <div class="room-number-badge">Rm ${roomStr}</div>
        </div>
        <div class="meeting-row-bottom">
            <span class="meeting-time-text">${utils.getIcon('clock', 12)} ${timeStr}</span>
        </div>
    </div>`;
}

/**
 * buildInfoWindowOfferingHtml creates the HTML for a single course offering inside the InfoWindow
 */
function buildInfoWindowOfferingHtml(classNum, off, visibleMeetings) {
    const meetingsHtml = visibleMeetings.map(function(m) {
        return buildInfoWindowMeetingCardHtml(m, classNum, m.originalIndex);
    }).join("");

    return `<div class="iw-offering" style="--accent-color: ${off.color}" data-class="${classNum}">
        <div class="course-code iw-course-code" title="${off.courseCode}">
            ${off.courseCode} <i class="iw-term-label">(${utils.getTermName(off.term)})</i>
        </div>
        <div class="meetings-list">
            ${meetingsHtml}
        </div>
    </div>`;
}

/**
 * buildInfoWindowHtml creates the content for Google Maps info windows
 */
export function buildInfoWindowHtml(locationGroup, activeFilters) {
    let offeringsHtml = "";
    let visibleCount = 0;

    Object.entries(locationGroup.offerings).forEach(function([classNum, off]) {
        const visibleMeetings = off.meetings.filter(function(m) {
            return activeFilters.includes(utils.getFilterCategory(m.type));
        });

        if (visibleMeetings.length > 0) {
            visibleCount++;
            offeringsHtml += buildInfoWindowOfferingHtml(classNum, off, visibleMeetings);
        }
    });

    if (visibleCount === 0) {
        return "";
    }

    return `<div class="iw-container">
        <div class="iw-header">
            <div class="iw-title-row">
                <h3 title="${locationGroup.building}">${utils.getIcon('pin', 16, 'var(--ucsc-blue)')} ${locationGroup.building}</h3>
                <button class="iw-directions-btn" onclick="getDirections(${locationGroup.lat}, ${locationGroup.lng})" title="Get Directions">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                        <path d="M4.5,20 v-11 c0-1.1,0.9-2,2-2 h9 v-3 l6,5 l-6,5 v-3 h-7.5 v6.5 H4.5 z"/>
                    </svg>
                </button>
            </div>
        </div>
        ${locationGroup.imageUrl ? `<img src="${locationGroup.imageUrl}" class="iw-image" onerror="this.style.display='none'">` : ''}
        ${offeringsHtml}
    </div>`;
}

/**
 * setupInfoWindowHighlighting binds bidirectional highlights to popups
 */
function setupInfoWindowHighlighting() {
    store.activeInfoWindow.addListener('domready', function() {
        const iwOfferings = document.querySelectorAll('.iw-offering');
        iwOfferings.forEach(function(el) {
            el.onmouseenter = function() { highlightSidebarCard(this.dataset.class, true); };
            el.onmouseleave = function() { highlightSidebarCard(this.dataset.class, false); };
            el.onclick = function() { focusClass(this.dataset.class); };
        });

        const iwMeetingCards = document.querySelectorAll('.iw-meeting-card');
        iwMeetingCards.forEach(function(el) {
            el.onmouseenter = function(e) {
                e.stopPropagation();
                highlightSidebarCard(this.dataset.class, true, parseInt(this.dataset.index));
            };
            el.onmouseleave = function(e) {
                e.stopPropagation();
                highlightSidebarCard(this.dataset.class, false, parseInt(this.dataset.index));
            };
            el.onclick = function(e) {
                e.stopPropagation();
                focusClass(this.dataset.class, parseInt(this.dataset.index));
            };
        });
    });
}

/**
 * initializeGoogleServices loads Google Maps libraries and setups map object
 */
export async function initializeGoogleServices() {
    const { Map } = await google.maps.importLibrary("maps");
    const markerLib = await google.maps.importLibrary("marker");
    const { ColorScheme } = await google.maps.importLibrary("core");
    await google.maps.importLibrary("geometry");

    store.AdvancedMarkerElement = markerLib.AdvancedMarkerElement;

    const currentTheme = document.documentElement.getAttribute('data-theme');
    const targetScheme = currentTheme === 'dark' ? ColorScheme.DARK : ColorScheme.LIGHT;

    const mapElement = document.getElementById("map");
    store.map = new Map(mapElement, {
        center: CONFIG.CAMPUS_CENTER,
        zoom: CONFIG.ZOOM.CAMPUS,
        mapId: CONFIG.MAP_ID,
        colorScheme: targetScheme,
        restriction: { latLngBounds: CONFIG.UCSC_BOUNDS, strictBounds: false },
        disableDefaultUI: true,
        zoomControl: true,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false
    });

    store.directionsRenderer = new google.maps.Polyline({
        map: store.map,
        strokeColor: "#4285F4",
        strokeWeight: 6,
        strokeOpacity: 0.8,
        icons: [{
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 3, fillOpacity: 1 },
            offset: '100%'
        }]
    });

    if (!store.activeInfoWindow) {
        store.activeInfoWindow = new google.maps.InfoWindow({ zIndex: 200 });
        setupInfoWindowHighlighting();
    }

    store.map.addListener("click", function(e) {
        if (store.isChoosingLocation) {
            updateStartMarker(e.latLng, "Custom Starting Point");
            window.toggleChooseLocationMode();
        } else if (store.activeInfoWindow) {
            store.activeInfoWindow.close();
        }
    });
}
