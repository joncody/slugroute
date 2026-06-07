# SlugRoute | Technical API Reference

This document provides an exhaustive map of the functions and endpoints powering SlugRoute, organized by system layer.

---

## 1. Backend Reference (Go)

### `backend/main.go`
| Function | Description |
| :--- | :--- |
| `main` | Application Entry Point: Configures the SQLite connection, initializes the Gin router, sets up static asset paths, maps endpoint handlers, and starts the server on port `8080`. |

### `backend/handlers.go`
| Function | Description |
| :--- | :--- |
| `getCourseHandler` | **API `GET /api/course/:term/:code`**. Fetches primary lecture and section data from the database. |
| `getTermsHandler` | **API `GET /api/terms`**. Returns a sorted list of unique academic terms from the DB. |
| `getSuggestionsHandler` | **API `GET /api/suggest`**. Provides autocomplete results for course code searches. |
| `getRoutesProxyHandler` | **API `POST /api/routes-proxy`**. Securely proxies walking route requests to Google. |

### `backend/db.go`
| Function | Description |
| :--- | :--- |
| `fetchOfferings` | Internal: Queries SQLite for primary lecture data and joins building coordinates. |
| `attachSections` | Internal: Queries and appends associated DIS/LAB section data to parent lecture objects. |
| `scanMeeting` | Utility: Scans a single database row into a `Meeting` struct. |

### `backend/calendar.go`
| Function | Description |
| :--- | :--- |
| `exportCalendarHandler` | **API `POST /api/schedule/export`**. Processes a list of classes and returns a standard RFC 5545 `.ics` file stream for local download. |
| `calculateFirstOccurrence` | Logic: Determines the precise starting date for a recurring class schedule based on the term start date. |
| `getTermDates` | Configuration: Returns the hardcoded academic quarter start and end boundaries for a UCSC term code. |
| `parseICalDays` | Utility: Converts UCSC day abbreviation formats (e.g., `M`, `Tu`, `W`, `Th`, `F`) into RFC 5545 ICal code chains (e.g., `MO,TU,WE,TH,FR`). |
| `parseICalTimes` | Utility: Parses a raw time range string (e.g., `10:40AM-11:45AM`) into standard start/end time segments. |
| `formatTime` | Utility: Converts a 12-hour AM/PM string into a 24-hour sequential ICal string format (`HHMMSS`). |
| `splitTime` | Utility: Splits raw schedule string inputs into separate Day and Time strings. |
| `addEvent` | Helper: Builds and formats a single `VEVENT` calendar block with recurrence rules, appending it to the ICS string builder. |

---

## 2. Frontend Reference (Modular JavaScript)

### `js/utils.js`
| Function | Description |
| :--- | :--- |
| `ColorManager.getColor` | Assigns or retrieves a unique, persistent color from the configuration pool for a given class number. |
| `ColorManager.releaseColor` | Removes a color assignment from the active tracker to free it up for subsequent courses. |
| `showToast` | Appends a temporary success, warning, or error alert notification box to the UI. |
| `getEarliestDayWeight` | Helper: Determines the numeric weekday index offset for chronological sorting. |
| `parseTimeDigits` | Helper: Shifts digits to a standard 24-hour minute value format. |
| `utils.formatCourseCode` | Normalizes user search input to conform with standard UCSC search formats (e.g., `"cse115a"` -> `"CSE 115A"`). |
| `utils.getTermName` | Converts a 4-digit academic term code (e.g., `2262`) to a readable season and year format (e.g., `"Spring 2026"`). |
| `utils.calculateIdealTerm` | Resolves an appropriate active term code default based on the current calendar month. |
| `utils.getFilterCategory` | Maps raw sectional designations (e.g., `LBS`, `LAB`, `DIS`) into standardized categories (`LEC`, `LAB`, `DIS`). |
| `utils.getClassStatus` | Evaluates if a meeting block is online, cancelled, scheduled to be announced (TBD), or held in-person (PHYSICAL). |
| `utils.getIconPath` | Returns raw SVG path coordinates corresponding to Star (LEC), Square (LAB), and Triangle (DIS) symbols. |
| `utils.coordsMatch` | Compares two lat/lng coordinates with a tight floating-point tolerance (epsilon). |
| `utils.parseMeetingTime` | Parses schedule details and returns a numerical representation of the weekly start minute for sorting. |
| `utils.getEarliestMeetingSortVal` | Iterates over all meetings of a course to resolve its earliest weekly minute value. |
| `utils.sortMeetings` | Sorts a copy of meeting arrays chronologically based on weekly meeting start values. |
| `utils.getActiveFilters` | Retrieves currently checked category filter values (e.g., `LEC`, `LAB`, `DIS`) from the DOM. |
| `utils.getIcon` | Returns pre-built inline SVG icon definitions for general UI symbols (clock, pins, walking figures, starting location). |
| `utils.getHeartSvg` | Renders a styled bookmark toggle heart SVG depending on saved state. |
| `utils.getEyeSvg` | Renders a styled visibility toggle eye icon depending on map presence. |

### `js/map.js`
| Function | Description |
| :--- | :--- |
| `buildInfoWindowMeetingCardHtml` | Generates a styled HTML meeting card for discussions and labs inside the map popup. |
| `buildInfoWindowOfferingHtml` | Generates a styled HTML section wrapper holding individual section rows inside the popup. |
| `buildInfoWindowHtml` | Generates a complete styled HTML component wrapper containing descriptions, building previews, and course tables for InfoWindows. |
| `setupInfoWindowHighlighting` | Binds bidirectional highlighting listeners between maps popups and sidebar elements. |
| `initializeGoogleServices` | Imports required Google Maps SDK libraries, sets up the visual map container, coordinates light/dark schemes, and configures event bounds and standard overlays. |

### `js/markers.js`
| Function | Description |
| :--- | :--- |
| `createLocationGroup` | Establishes a base coordinate clustering target metadata tracking group. |
| `addMeetingToLocation` | Assigns section entries and categories directly to location groups. |
| `groupDataByLocation` | Scans active offerings to organize individual classes and sections into coordinate-keyed groups. |
| `createMarkerElement` | Programmatically builds custom Sammy-themed gold pins representing section loads or category types. |
| `updateMarkers` | Evaluates checked/unchecked sidebar filters and toggles map marker visibility accordingly. |
| `instantiateMarker` | Programmatically places an Advanced Marker Element pin onto the map canvas and binds popup clicks. |
| `refreshMapAndUI` | Completely synchronizes map pins and sidebars with the central memory state. |
| `clearResults` | Resets active workspace states, clears mapped lines, closes info panels, and empties sidebar structures. |

### `js/navigation.js`
| Function | Description |
| :--- | :--- |
| `panToSinglePoint` | Centers map view and zooms directly on a single building coordinate limit. |
| `fitToMultiplePoints` | Adjusts bounds to fit multiple coordinates along walk paths. |
| `smartFitBounds` | Smoothly transitions map views, adjusting zoom constraints based on whether the view shows one building or multiple locations. |
| `updateStartMarker` | Repositions the custom blue user location pin and triggers recalculation of active navigation steps. |
| `handleP2PDirections` | Sets Point-to-Point origin parameters and handles destination bindings. |
| `handleStandardDirections` | Decides standard directions and replaces routes or prompts modals. |
| `getDirections` | Main decision entry for mapping walking directions. Manages point-to-point routes, multi-stop paths, and routing conflicts. |
| `scrollToSidebarCard` | Scroll views sidebars dynamically to highlight active selected results cards. |
| `focusClassOnMarkers` | Calculates geographic boundary extensions for focusing selected courses on markers. |
| `focusClass` | Scrolls the sidebar results card into view, applies highlight styles, and centers the map on the designated course locations. |
| `clearRoute` | Wipes computed route polylines and resets routing-related state variables in the global store. |

### `js/routing.js`
| Function | Description |
| :--- | :--- |
| `buildRouteBubbleHtml` | Constructs the inline HTML string used for route label walk stat overlays. |
| `displayLegBubbles` | Renders duration and distance overlay info-tags alongside mapped path segments. |
| `fetchRouteData` | Performs network POST calls to retrieving walking route polylines from the backend server. |
| `renderRoutePath` | Builds sequential path polylines and triggers leg bubble creations. |
| `clearRouteState` | Discharges previous routes data and hides indicators. |
| `runRouteComputation` | Coordinates async proxy route fetches and updates drawn paths. |
| `executeRouting` | Requests polyline routing steps from the local proxy endpoint, decodes resulting geometries, and draws walking path lines on the map. |

### `js/ui.js`
| Function | Description |
| :--- | :--- |
| `saveState` | Serializes and saves current active courses and bookmarks back to client-side `localStorage`. |
| `updateSyncBtnState` | Evaluates current course loads and updates the calendar button state. |
| `toggleCourseHighlight` | Applies highlighted styling states to course cards in sidebars. |
| `toggleMeetingHighlight` | Highlights subsection details tags on hover. |
| `highlightSidebarCard` | Synchronizes mouse hovers between specific map components and sidebar result blocks. |
| `renderMeetingTag` | Formats HTML rows for meetings inside result cards, presenting symbols, location badges, and schedule lists. |
| `renderSearchCourseCardHtml` | Builds structural search result course card containers. |
| `renderSearchCourseRow` | Processes courses to prepare chronological listings. |
| `renderSearchList` | Emits interactive cards inside the "Current Results" listing pane, sorted by term and time. |
| `renderSavedCourseCardHtml` | Renders HTML previews for saved classes list rows. |
| `renderSavedCourseRow` | Generates layout elements for saved list rows. |
| `renderSavedList` | Generates compact preview cards within the "Saved for Later" bookmarks shelf. |
| `toggleVisibility` | Minimizes or displays a specific course's locations on the map canvas. |
| `toggleSaveCourse` | Adds/removes a course from bookmarks and updates persistent memory. |
| `removeResult` | Releases course color slots and clears the selection from the active workspace. |
| `removeMeeting` | Deletes a single section/meeting row from a result card. |
| `addSavedToResults` | Moves a bookmarked course back into the active workspace and zooms to it. |
| `handleSearchResultsClick` | Action event mapping to focus maps on clicked cards in the results panel. |
| `handleSavedClassesClick` | Action event mapping to activate clicked bookmark cards. |
| `handleSidebarClick` | Delegates click events targeting cards to their respective controller functions. |
| `setupSidebarDelegation` | Binds click handlers and hover tracking events dynamically onto sidebar container lists. |
| `addAllSavedToResults` | Imports all bookmarked classes to the active workspace at once. |

### `js/search.js`
| Function | Description |
| :--- | :--- |
| `renderPreviewSectionRow` | Generates interactive section rows in the search preview panel, incorporating checklist inputs. |
| `togglePendingSection` | Manages selections in the preview panel checklist. |
| `toggleAllSections` | Marks all sections of a course in the search preview as selected. |
| `validatePendingMeetings` | Validates selected meetings before importing them. |
| `applySelection` | Coordinates current offerings additions. |
| `commitSelection` | Verifies and validates selected meetings, then imports the course to the map workspace. |
| `attachPreviewListeners` | Attaches check, toggle, and mapping handlers inside the autocomplete preview dropdown. |
| `renderSearchPreviewCardHtml` | Generates preview layouts for course headers and checklists. |
| `renderSearchPreview` | Redraws the dynamic autocomplete dropdown with options sorted by term and schedule. |
| `fetchCourseData` | Queries the Go endpoint to receive database coordinates. |
| `handleSearchResults` | Decodes searched offerings arrays and populates checklist states. |
| `searchCourse` | Requests meeting coordinates from the database for a searched code. |
| `renderSuggestionsList` | Spawns autocomplete suggestions entries on input triggers. |
| `fetchSuggestions` | Requests course code suggestions using debounced keyboard events. |

### `js/calendar.js`
| Function | Description |
| :--- | :--- |
| `exportCalendarSchedule` | Handles the HTTP POST query generation and download logic for standard `.ics` files. |
| `setupCalendarExport` | Sets up download behavior for the calendar button, packing active schedules into a POST request to the server-side `.ics` engine. |

### `js/app.js`
| Function | Description |
| :--- | :--- |
| `toggleChooseLocationMode` | Activates or exits custom starting-point pinning modes. |
| `renderTermOptions` | Utility mapping terms collections to dropdown selectors. |
| `populateTerms` | Fetches available terms from Go and updates the sidebar dropdown to focus on logical default terms. |
| `setupSearchUI` | Configures key entry debounces, preview closes, and form submit hooks. |
| `setupSidebarToggle` | Connects panel drawers toggle event handlers. |
| `restoreThemeState` | Restores drawn maps markers and path vectors upon re-initializing maps under alternative themes. |
| `handleThemeToggleAction` | Coordinates dark/light scheme shifts and updates local storage values. |
| `setupThemeToggle` | Connects color schema shifts triggers. |
| `setupGlobalActionControls` | Connects results clears and categories filters. |
| `setupRecenterUiAndMarkers` | Recenter maps focus coordinates handlers. |
| `setupRecenterStartAndRoute` | Recenter starting location markers triggers. |
| `setupLocationTriggerControls` | Location overlay erasers triggers. |
| `setupP2PandBrowserLocation` | Securely initiates GPS geo location queries. |
| `setupRoutingModalAddAndReplace` | Waypoint path additions handlers. |
| `setupRoutingModalNewAndCancel` | Course mapping erasers triggers. |
| `setupMapControls` | Orchestrates maps panels triggers setups. |
| `initMap` | Acts as the primary SDK lifecycle hook. Populates terms, registers search tools, configures layout toggles, and sets up the map components. |

---

## 3. Data Reference (Python)

### `scraper/config.py`
| Constant | Description |
| :--- | :--- |
| `DB_NAME` | The target path of the SQLite database. |
| `BASE_URL` | The endpoint URL for the UCSC PISA scheduler. |
| `TIMEOUT` | Request timeout limit in seconds. |
| `REQUEST_DELAY` | Sleep delay in seconds between detail fetches to regulate requests. |

### `scraper/db.py`
| Function | Description |
| :--- | :--- |
| `init_db` | Configures and creates primary SQLite database tables (`courses`, `lectures`, `sections`). |
| `save_course_data` | Persists parsed course structural parameters and secondary sub-sections to tables transactionally. |

### `scraper/parser.py`
| Function | Description |
| :--- | :--- |
| `clean_text` | Trims redundant whitespace buffers and replaces duplicated cancellations. |
| `split_days_times` | Segments schedule strings into dedicated day lists and time periods. |
| `split_location` | Separates campus facility structures from room indices. |
| `_parse_header` | Extracts courses identifiers, sequence indexes, and labels from H2 titles. |
| `_parse_meetings` | Evaluates principal lecture scheduling blocks, coordinates, and instructor listings. |
| `_parse_sections` | Collects linked labs or discussion sub-rows within striped details sections. |

### `scraper/scraper.py`
| Function | Description |
| :--- | :--- |
| `main` | Executes base schema setups, estimates academic terms, and triggers details retrieval. |
| `calculate_current_strms` | Computes dynamic sequential UCSC STRM term codes based on current system dates. |
| `get_session` | Establishes `requests.Session` structures featuring exponential backoff retries. |
| `fetch_class_detail` | Issues payload POSTs to fetch structural fields for distinct class entries. |
| `scrape_term` | Evaluates complete indices of catalog links for a quarter code and saves them sequentially. |

### `database/import_coords.py`
| Function | Description |
| :--- | :--- |
| `migrate` | Orchestrates the geodata migration pipeline by reading coordinate text files and executing bulk database updates. |
| `read_coordinates_file` | Parses geodata structures (`Name = Lat, Lng, ImagePath`) and formats values into sanitized tuples. |
| `update_building_table` | Drops existing records, creates building tables, and populates rows using bulk inserts. |
