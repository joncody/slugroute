# SlugRoute | Technical API Reference

This document provides an exhaustive map of the functions and endpoints powering SlugRoute, organized by system layer.

---

## 1. Backend Reference (Go)

### `backend/main.go`
| Function | Description |
| :--- | :--- |
| `getCourseHandler` | **API `GET /api/course/:term/:code`**. Fetches primary lecture and section data from the database. |
| `getTermsHandler` | **API `GET /api/terms`**. Returns a sorted list of unique academic terms from the DB. |
| `getSuggestionsHandler` | **API `GET /api/suggest`**. Provides autocomplete results for course code searches. |
| `getRoutesProxyHandler` | **API `POST /api/routes-proxy`**. Securely proxies walking route requests to Google. |
| `fetchOfferings` | Internal: Queries SQLite for primary lecture data and joins building coordinates. |
| `attachSections` | Internal: Queries and appends associated DIS/LAB section data to parent lecture objects. |
| `scanMeeting` | Utility: Scans a single database row into a `Meeting` struct. |
| `main` | Application Entry Point: Configures the SQLite connection, initializes the Gin router, sets up static asset paths, maps endpoint handlers, and starts the server on port `8080`. |

### `backend/calendar.go`
| Function | Description |
| :--- | :--- |
| `exportCalendarHandler` | **API `POST /api/schedule/export`**. Processes a list of classes and returns a standard RFC 5545 `.ics` file stream for local download. |
| `calculateFirstOccurrence` | Logic: Determines the precise starting date for a recurring class schedule based on the term start date. |
| `getTermDates` | Configuration: Returns the hardcoded academic quarter start and end boundaries for a given UCSC term code. |
| `parseICalDays` | Utility: Converts UCSC day abbreviation formats (e.g., `M`, `Tu`, `W`, `Th`, `F`) into RFC 5545 ICal code chains (e.g., `MO,TU,WE,TH,FR`). |
| `parseICalTimes` | Utility: Parses a raw time range string (e.g., `10:40AM-11:45AM`) into standard start/end time segments. |
| `formatTime` | Utility: Converts a 12-hour AM/PM string into a 24-hour sequential ICal string format (`HHMMSS`). |
| `splitTime` | Utility: Splits raw schedule string inputs into separate Day and Time strings. |
| `addEvent` | Helper: Builds and formats a single `VEVENT` calendar block with recurrence rules and details, appending it to the ICS string builder. |

---

## 2. Frontend Reference (Modular JavaScript)

### `js/utils.js`
| Function | Description |
| :--- | :--- |
| `ColorManager.getColor` | Assigns or retrieves a unique, persistent color from the configuration pool for a given class number. |
| `ColorManager.releaseColor` | Removes a color assignment from the active tracker to free it up for subsequent courses. |
| `showToast` | Appends a temporary success, warning, or error alert notification box to the UI. |
| `utils.formatCourseCode` | Normalizes user search input to conform with standard UCSC search formats (e.g., `"cse115a"` -> `"CSE 115A"`). |
| `utils.getTermName` | Converts a 4-digit academic term code (e.g., `2262`) to a readable format (e.g., `"Spring 2026"`). |
| `utils.calculateIdealTerm` | Resolves an appropriate active term code default based on the current calendar month. |
| `utils.getFilterCategory` | Maps raw sectional designations (e.g., `LBS`, `LAB`, `DIS`) into standardized categories (`LEC`, `LAB`, `DIS`). |
| `utils.getClassStatus` | Evaluates if a meeting block is online, cancelled, scheduled to be announced (TBD), or held in-person (PHYSICAL). |
| `utils.getIconPath` | Returns raw SVG path coordinates corresponding to Star (LEC), Square (LAB), and Triangle (DIS) symbols. |
| `utils.coordsMatch` | Compares two lat/lng coordinates with a tight floating-point tolerance (epsilon) to avoid rendering conflicts. |
| `utils.parseMeetingTime` | Parses schedule details and returns a numerical representation of the weekly start minute for sorting. |
| `utils.getEarliestMeetingSortVal` | Iterates over all meetings of a course to resolve its earliest weekly minute value. |
| `utils.getIcon` | Returns pre-built inline SVG icon definitions for general UI symbols (clock, pins, walking figures). |
| `utils.getHeartSvg` | Renders a styled bookmark toggle heart SVG depending on saved state. |
| `utils.getEyeSvg` | Renders a styled visibility toggle eye icon depending on map presence. |

### `js/map.js`
| Function | Description |
| :--- | :--- |
| `initializeGoogleServices` | Imports required Google Maps SDK libraries, sets up the visual map container, coordinates light/dark color schemes, and configures event bounds and standard overlays. |
| `executeRouting` | Requests polyline routing steps from the local proxy endpoint, decodes the resulting geometries, and draws the walked path lines on the map. |
| `displayLegBubbles` | Renders duration and distance overlay info-tags alongside mapped path segments. |
| `updateStartMarker` | Repositions the custom blue user location pin and triggers recalculation of active navigation steps. |
| `getDirections` | Main decision entry for mapping walking directions. Manages point-to-point routes, multi-stop paths, and routing conflicts. |
| `groupDataByLocation` | Scans active offerings to organize individual classes and sections into coordinate-keyed groups. |
| `createMarkerElement` | Programmatically builds custom Sammy-themed gold pins representing section loads or category types. |
| `smartFitBounds` | Smoothly transitions map views, adjusting zoom constraints based on whether the view shows one building or multiple locations. |
| `buildInfoWindowHtml` | Generates a styled HTML component for popup windows containing location descriptions, building previews, and course tables. |
| `updateMarkers` | Evaluates checked/unchecked sidebar filters and toggles map marker visibility accordingly. |
| `refreshMapAndUI` | Completely synchronizes map pins and sidebars with the central memory state. |
| `focusClass` | Scrolls the sidebar results card into view, applies highlight styles, and centers the map on the designated course locations. |
| `clearResults` | Resets active workspace states, clears mapped lines, closes info panels, and empties sidebar structures. |

### `js/ui.js`
| Function | Description |
| :--- | :--- |
| `saveState` | Serializes and saves current active courses and bookmarks back to client-side `localStorage`. |
| `updateSyncBtnState` | Evaluates current course loads and updates the calendar button state. |
| `highlightSidebarCard` | Synchronizes mouse hovers between specific map components and sidebar result blocks. |
| `renderMeetingTag` | Formats HTML rows for meetings inside result cards, presenting symbols, location badges, and schedule lists. |
| `renderSearchList` | Emits interactive cards inside the "Current Results" listing pane, sorted by term and time. |
| `renderSavedList` | Generates compact preview cards within the "Saved for Later" bookmarks shelf. |
| `toggleVisibility` | Minimizes or displays a specific course's locations on the map canvas. |
| `toggleSaveCourse` | Adds/removes a course from bookmarks and updates persistent memory. |
| `removeResult` | Releases course color slots and clears the selection from the active workspace. |
| `removeMeeting` | Deletes a single section/meeting row from a result card. |
| `addSavedToResults` | Moves a bookmarked course back into the active search workspace and zooms to it. |
| `handleSearchResultsClick` | Action event mapping to focus maps on clicked cards in the results panel. |
| `handleSavedClassesClick` | Action event mapping to activate clicked bookmark cards. |
| `setupSidebarDelegation` | Binds click handlers and hover tracking events dynamically onto sidebar container lists. |
| `renderPreviewSectionRow` | Generates interactive section rows in the search preview panel, incorporating checklist inputs. |
| `togglePendingSection` | Manages selections in the preview panel checklist. |
| `toggleAllSections` | Marks all sections of a course in the search preview as selected. |
| `commitSelection` | Verifies and validates selected meetings, then imports the course to the map workspace. |
| `attachPreviewListeners` | Attaches check, toggle, and mapping handlers inside the autocomplete preview dropdown. |
| `renderSearchPreview` | Redraws the dynamic autocomplete dropdown with options sorted by term and schedule. |
| `searchCourse` | Requests meeting coordinates from the database for a searched code. |
| `fetchSuggestions` | Requests course code suggestions using debounced keyboard events. |
| `addAllSavedToResults` | Imports all bookmarked classes to the map workspace at once. |
| `setupCalendarExport` | Sets up download behavior for the calendar button, packing active schedules into a POST request to the server-side `.ics` engine. |

### `js/app.js`
| Function | Description |
| :--- | :--- |
| `initMap` | Acts as the primary SDK lifecycle hook. Populates terms, registers search tools, configures layout toggles, and sets up the map components. |
| `toggleChooseLocationMode` | Activates or exits custom starting-point pinning modes. |
| `populateTerms` | Fetches available terms from Go and updates the sidebar dropdown to focus on logical default terms. |
| `setupSearchUI` | Configures key entry debounces, preview closes, and form submit hooks. |
| `setupMapControls` | Hooks events to custom panels, including sidebars, dark themes, recenters, GPS, manual pins, custom route erasers, and point-to-point modes. |

---

## 3. Data Reference (Python)

### `scraper/scraper.py`
| Function | Description |
| :--- | :--- |
| `main` | Orchestrates the scraping pipeline: initializes SQLite schemas, determines relevant terms, and schedules search passes. |
| `calculate_current_strms` | Computes active UCSC STRM term codes based on current system dates. |
| `get_session` | Builds a configured `requests.Session` with retry behaviors and standardized client headers. |
| `clean_text` | Normalizes whitespace and removes duplicated cancellation markers. |
| `split_days_times` | Extracts days (e.g., `TuTh`) and time periods into separate components using regular expressions. |
| `split_location` | Separates campus building names from distinct room numbers. |
| `init_db` | Creates base database layouts, indexes, and tables. |
| `save_course_data` | Transactionally manages the write-back of parsed courses, lectures, and sections to SQLite. |
| `_parse_header` | Extracts course codes, lecture sections, and titles from heading structures. |
| `_parse_meetings` | Gathers main lecture meeting dates, locations, and instructors from structured HTML elements. |
| `_parse_sections` | Iterates over section blocks to record individual lab and discussion properties. |
| `fetch_class_detail` | Coordinates specific POST queries to scrape details from individual class index pages. |
| `scrape_term` | Executes query searches for a specific term and manages item detail scraping passes. |

### `database/import_coords.py`
| Function | Description |
| :--- | :--- |
| `migrate` | Orchestrates the geodata migration pipeline by reading coordinate text files and executing bulk database updates. |
| `read_coordinates_file` | Parses geodata structures (`Name = Lat, Lng, ImagePath`) and formats values into sanitized tuples. |
| `update_building_table` | Drops existing records, creates building tables, and populates rows using bulk inserts. |
