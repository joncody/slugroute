# SlugRoute | Definition of Done (DoD)

This document establishes the official quality standards and engineering checkpoints that every task, user story, and feature branch must satisfy before it can be moved to "Done" on the Scrum board and merged into the main release branch.

---

### 1. Code Quality & Style Standards
* **Style Guide Compliance:** All modified code must strictly conform to the respective language style guides defined in `docs/`:
  * **Go:** Code formatted via `gofmt`. Imports grouped cleanly into standard-library and third-party blocks. Line lengths kept within 80–100 characters.
  * **Python:** Code fully compliant with PEP 8 standards, utilizing 4-space indentations and descriptive `snake_case` variable naming.
  * **Frontend (JS/CSS/HTML):** Standard `camelCase` for JS variables and functions, `kebab-case` for HTML classes and IDs, and 4-space indentations.
* **Traceable Commits:** Every commit message associated with the work must be prefixed with the corresponding Task ID from the Sprint Plan (e.g., `US3-T4: Implemented SVG paths`). Vague commit messages (e.g., "fix", "update") are prohibited.
* **No Hardcoded Logic:** Configuration variables, environment parameters, API keys, and calendar date boundaries must not be hardcoded. Secrets must reside exclusively in local environments or build injection variables.

---

### 2. User Interface & Mobile Accessibility
* **"Touch-Target First" Standard:** All newly added buttons, checkboxes, input fields, and interactive map targets must maintain a minimum clickable area of **44x44px** to ensure mobile touch usability.
* **Responsive Visuals:** The interface must render correctly on both mobile and desktop screen widths. Sidebars must collapse smoothly on smaller viewports without breaking core map controls.
* **Theme Parity:** New UI elements and maps must render seamlessly in both Light and Dark themes. Visual elements must use the hand-picked high-contrast color palette to ensure readable and accessible contrast ratios.

---

### 3. Testing & Verification
* **Parallel Unit Testing:** Backend, scraper, and database unit tests must be updated in parallel with code modifications. Testing must never be treated as an afterthought or deferred to the end of a sprint.
* **Automated Regression Testing:** The complete test suite must be verified using the unified script:
  * Running `./test_all.sh` must return a zero status code, indicating that all Go, Python, and database tests pass without regression.
* **Manual Frontend Verification:** All JS logic, UI managers, and state clustering updates must pass unit verification via `frontend/tests.html`.
* **Cross-Browser & Device Verification:** Multi-stop paths, info window popups, and file export streaming must be verified across multiple device profiles (such as mobile Safari on iOS and Chrome on Android) as part of manual testing.
* **Field-Ready GPS & Geolocation:** GPS and navigation logic must be tested and confirmed functional under active campus movement scenarios, avoiding reliance solely on DevTools location overrides.

---

### 4. Database & Backend Security
* **SQL Sanitization:** To safeguard data integrity, all SQLite database queries must use prepared statements or parameterized placeholder bindings to mitigate SQL injection vectors.
* **API Proxy Safeguards:** Map key lookups, walking routes, and external coordinate fetches must route through the Go proxy handler (`backend/main.go`) to prevent browser-side exposure of private Google Maps keys.
* **Graceful Exception Handling:** The frontend must actively intercept API failures (e.g., 404 and 500 error states) and display appropriate offline or poor-reception warnings to the user instead of failing silently.

---

### 5. Integration, Sync, & Agile Sign-Off
* **Definition of Done Verification:** The feature branch has been fully integrated into a clean workspace and tested alongside concurrent developer changes.
* **Sunday Integration Sync Checklist:** Handshake issues between the Go backend calendar parser, SQLite schema, and JS frontend are reconciled and signed off by collaborating developers.
* **Scrum Board Reconciliation:** The task is moved from "In Progress" to "Done" on the Scrum board, with all active sub-tasks and logged development hours documented in real-time.
