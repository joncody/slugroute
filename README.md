# <img src="frontend/logo.png" alt="SlugRoute Logo" height="32" valign="middle"> SlugRoute Setup Guide

SlugRoute is a full-stack application that scrapes UCSC's Schedule of Classes (PISA), stores the data in a SQLite database, and visualizes class locations using the Google Maps API.

---

## 1. Prerequisites

Before starting, ensure you have the following installed:
*   **Go** (1.20 or later)
*   **Python** (3.8 or later)
*   **Google Maps API Key**: Requires a project with the "Maps JavaScript API" enabled and a valid billing account.

---

## 2. Project Structure
```text
.
├── backend/            # Go Gin Server & REST API
├── database/           # SQLite DB, Geodata, & Import Utilities
├── docs/               # Project Style Guides
├── frontend/           # HTML/JS/CSS (Google Maps Interface)
└── scraper/            # Python BeautifulSoup Scraper Engine
```

---

## 3. Installation & Setup

### Step 1: Scrape Course Data
The application requires a populated database. The scraper automatically calculates the current and upcoming terms (e.g., Spring 2026, Winter 2026) based on the system clock.

1.  Navigate to the scraper directory:
    ```bash
    cd scraper
    ```
2.  Install Python dependencies:
    ```bash
    pip install requests bs4
    ```
3.  Run the scraper:
    ```bash
    python scraper.py
    ```
    *This generates `../database/slugroute.db`. Initial runs may take several minutes.*

### Step 2: Import Building Geodata
Room numbers from PISA must be mapped to physical coordinates for the map interface.

1.  Navigate to the database directory:
    ```bash
    cd ../database
    ```
2.  Run the coordinate import script:
    ```bash
    python import_coords.py
    ```

### Step 3: Configure Google Maps
1.  Open `frontend/index.html`.
2.  Locate the script tag for Google Maps near the bottom of the file.
3.  Replace `YOUR_API_KEY_HERE` with your actual Google Maps API Key.

### Step 4: Launch the Backend
The Go server handles API requests and serves the frontend. **Note:** SQLite requires CGO for the `go-sqlite3` driver.

1.  Navigate to the backend directory:
    ```bash
    cd ../backend
    ```
2.  Initialize and fetch dependencies:
    ```bash
    go mod init slugroute
    go get github.com/gin-gonic/gin
    go get github.com/mattn/go-sqlite3
    ```
3.  Start the server:
    ```bash
    export CGO_ENABLED=1  # Required for SQLite
    go run main.go
    ```
    *The application will be accessible at `http://localhost:8080`.*

---

## 4. Usage

1.  Navigate to `http://localhost:8080` in your browser.
2.  Use the search bar to find a course code (e.g., `CSE 115A`, `MATH 19B`).
3.  **Map Markers:**
    *   ★ **Stars**: Primary Lectures (LEC)
    *   ■ **Squares**: Labs (LAB/LBS)
    *   ● **Circles**: Discussions (DIS)
4.  Click any marker to view the InfoWindow containing meeting times, room numbers, and instructor details.

---

## 5. Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **"For Development Purposes Only"** | Ensure the API Key is valid and Billing is enabled in Google Cloud Console. |
| **Empty search results** | Check `scraper.log` to ensure `scraper.py` successfully populated the `courses` table. |
| **Buildings in the Ocean (0,0)** | Ensure you ran `python import_coords.py` to link building names to coordinates. |
| **Go: SQLite driver error** | Ensure a C compiler (GCC) is installed and `CGO_ENABLED=1` is set during `go run`. |

---

## 6. Technical Architecture
*   **Storage:** SQLite (Zero-config, file-based persistence).
*   **API:** Go (Gin-Gonic) providing high-concurrency JSON endpoints.
*   **Scraper:** Python (BeautifulSoup) with automated UCSC STRM term calculation.
*   **UI:** Vanilla CSS and Google Maps JavaScript SDK.
