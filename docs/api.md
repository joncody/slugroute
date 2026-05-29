# SlugRoute | Technical API Reference

This document provides an exhaustive map of the functions and endpoints powering SlugRoute, organized by system layer.

---

## 1. Backend Reference (Go)

### `backend/main.go`
| Function | Description |
| :--- | :--- |
| `getCourseHandler` | **API `GET /api/course/:term/:code`**. Fetches primary lecture and section data. |
| `getTermsHandler` | **API `GET /api/terms`**. Returns a sorted list of unique academic terms from the DB. |
| `getSuggestionsHandler` | **API `GET /api/suggest`**. Provides autocomplete results for course code searches. |
| `getRoutesProxyHandler` | **API `POST /api/routes-proxy`**. Securely proxies walking route requests to Google. |
| `fetchOfferings` | Internal: Executes SQL queries to retrieve course data and building coordinates. |
| `attachSections` | Internal: Appends DIS/LAB section data to parent lecture objects. |
| `scanMeeting` | Utility: Scans database rows into the `Meeting` struct. |

### `backend/calendar.go`
| Function | Description |
| :--- | :--- |
| `exportCalendarHandler` | **API `POST /api/schedule/export`**. Streams an RFC 5545 .ics file to the client. |
| `calculateFirstOccurrence` | Logic: Finds the specific calendar date of the first class meeting in a term. |
| `getTermDates` | Configuration: Returns UCSC quarter start/end boundaries. |
| `parseICalDays` | Utility: Converts UCSC day codes (MWF) to ICal codes (MO,WE,FR). |
| `parseICalTimes` | Utility: Parses a time range string into start/end 24-hour pairs. |
| `formatTime` | Utility: Converts 12-hour AM/PM time to 24-hour ICal format. |
| `splitTime` | Utility: Splits raw strings into separate Days and Times segments. |
| `addEvent` | Helper: Appends a `VEVENT` block with recurrence rules to the builder. |

---

## 2. Frontend Reference (Modular JavaScript)

### `js/utils.js`
| Function | Description |
| :--- | :--- |
| `ColorManager.getColor` | Assigns/retrieves a persistent hex color for a specific class number. |
| `ColorManager.releaseColor` | Removes a color assignment from the active pool. |
| `showToast` | Renders a success or error notification toast. |
| `utils.formatCourseCode` | Standardizes user search input (e.g., "cse101" -> "CSE 101"). |
| `utils.getTermName` | Converts a 4-digit code (2262) to readable format (Spring 2026). |
| `utils.calculateIdealTerm` | Auto-detects the current term based on the system date. |
| `utils.getFilterCategory` | Maps raw meeting types to sidebar legend categories (LEC, LAB, DIS). |
| `utils.getClassStatus` | Identifies if a class is Online, Cancelled, TBA, or Physical. |
| `utils.getIconPath` | Returns the SVG path data for Stars, Squares, and Triangles. |
| `utils.coordsMatch` | Compares two LatLngs with an epsilon for float precision. |
| `utils.parseMeetingTime` | Converts schedule strings to a weekly minute integer for sorting. |
| `utils.getEarliestMeetingSortVal` | Finds the earliest weekly minute for an entire course. |
| `utils.getIcon` | Returns inline SVG strings for common UI elements. |
| `utils.getHeartSvg` | Returns the bookmark/save icon SVG. |
| `utils.getEyeSvg` | Returns the visibility toggle icon SVG. |

### `js/map.js`
| Function | Description |
| :--- | :--- |
| `initializeGoogleServices` | Bootstraps the Map instance, libraries, and global event listeners. |
| `executeRouting` | Orchestrates multi-stop walking paths and renders polylines. |
| `displayLegBubbles` | Places duration/distance labels along the route path. |
| `updateStartMarker` | Sets the user's location pin and triggers route recalculation. |
| `getDirections` | Main decision engine for starting or extending walking routes. |
| `groupDataByLocation` | Clusters multiple class sections into a single map marker. |
| `smartFitBounds` | Centers and zooms the map to fit active pins. |
| `buildInfoWindowHtml` | Generates HTML content for the interactive map popups. |
| `updateMarkers` | Toggles marker visibility based on sidebar filter checkboxes. |
| `refreshMapAndUI` | Syncs the current application state with the Google Map and sidebars. |
| `focusClass` | PANS the map to a class and highlights its sidebar card. |
| `clearResults` | Resets all active offerings and navigation routes. |

### `js/ui.js`
| Function | Description |
| :--- | :--- |
| `saveState` | Persists current/saved courses to `localStorage`. |
| `updateSyncBtnState` | Enables/disables the calendar button based on data presence. |
| `highlightSidebarCard` | Bidirectional UI highlighting between markers and cards. |
| `renderSearchList` | Populates the "Current Results" sidebar with sorted cards. |
| `renderSavedList` | Populates the "Saved for Later" sidebar. |
| `toggleVisibility` | Toggles the `visible` flag for an offering on the map. |
| `toggleSaveCourse` | Adds/removes a course from the saved list. |
| `removeResult` | Clears a specific course from active results. |
| `removeMeeting` | Deletes a single section from an active course. |
| `searchCourse` | Fetches data from the API and opens the search dropdown. |
| `renderSearchPreview` | Redraws the "Schedule Builder" selection dropdown. |
| `commitSelection` | Finalizes chosen sections and maps them. |
| `setupCalendarExport` | Binds the sync button to the backend .ics generator. |
| `fetchSuggestions` | Debounced API call for search autocomplete. |

### `js/app.js`
| Function | Description |
| :--- | :--- |
| `initMap` | Global entry point callback for the Google Maps SDK. |
| `toggleChooseLocationMode` | Toggles the crosshair cursor for manual pin placement. |
| `populateTerms` | Fetches terms from the API and populates the dropdown. |
| `setupSearchUI` | Initializes input listeners and search form logic. |
| `setupMapControls` | Binds logic to Theme, Recenter, and GPS buttons. |

---

## 3. Data Reference (Python)

### `scraper/scraper.py`
| Function | Description |
| :--- | :--- |
| `main` | Entry point for the daily scraping engine. |
| `calculate_current_strms` | Logic: Automates target term selection based on current date. |
| `fetch_class_detail` | Scrapes detailed section/meeting info from PISA detail pages. |
| `scrape_term` | Scrapes all courses for a specific academic quarter. |
| `save_course_data` | Transactional storage of scraped data into SQLite. |
| `split_days_times` | Regex: Parses raw schedule strings. |
| `split_location` | Regex: Parses raw location strings into Building/Room. |
| `init_db` | Schema: Creates and maintains database tables. |

### `database/import_coords.py`
| Function | Description |
| :--- | :--- |
| `migrate` | Orchestrates the reading and migration of building geodata. |
| `read_coordinates_file` | Parses the flat text file into coordinate tuples. |
| `update_building_table` | Performs bulk DB updates for campus buildings. |
