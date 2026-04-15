# 🐌 SlugRoute Setup Guide

SlugRoute is a full-stack application that scrapes UCSC's Schedule of Classes (PISA), stores the data in a SQLite database, and visualizes class locations using the Google Maps API.

---

## 1. Prerequisites

Before starting, ensure you have the following installed:
*   **Go** (1.20 or later)
*   **Python** (3.8 or later)
*   **Google Maps API Key**: You will need a key with the "Maps JavaScript API" enabled.

---

## 2. Project Structure
```text
.
├── backend/            # Go Gin Server & API
├── database/           # SQLite DB, Building Coordinates, & Import Script
├── frontend/           # HTML/JS/CSS (Google Maps Interface)
└── scraper/            # Python BeautifulSoup Scraper
```

---

## 3. Installation & Setup

### Step 1: Scrape Course Data
The application requires a populated database to function. The scraper fetches data for Spring 2026 (`2262`) and Winter 2026 (`2260`) by default.

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
    *This will create or update `../database/slugroute.db`.*

### Step 2: Import Building Geodata
The scraper identifies room numbers, but the map requires Latitude and Longitude to place pins.

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
2.  Find the script tag for Google Maps (near the bottom):
    ```html
    <script src="https://maps.googleapis.com/maps/api/js?key=YOUR_API_KEY_HERE&map_ids=..."></script>
    ```
3.  Replace `YOUR_API_KEY_HERE` with your actual Google Maps API Key.

### Step 4: Launch the Backend
The Go server provides the API and serves the static frontend files.

1.  Navigate to the backend directory:
    ```bash
    cd ../backend
    ```
2.  Initialize the Go module and fetch dependencies:
    ```bash
    go mod init slugroute
    go get github.com/gin-gonic/gin
    go get github.com/mattn/go-sqlite3
    ```
3.  Start the server:
    ```bash
    go run main.go
    ```
    *The app will be live at `http://localhost:8080`.*

---

## 4. Usage

1.  Open your browser to `http://localhost:8080`.
2.  Search for a course code (e.g., `CSE 115A`, `MATH 19B`, `ART 10G`).
3.  **Visual Indicators:**
    *   🔵 **Blue Pins**: Primary Lectures (LEC).
    *   🟡 **Yellow Pins**: Labs (LAB/LBS).
    *   🟢 **Green Pins**: Discussions (DIS).
4.  Click any pin to see detailed meeting times, room numbers, and specific instructors.

---

## 5. Troubleshooting

| Issue | Solution |
| :--- | :--- |
| **Map is "For Development Purposes Only"** | Ensure your Google Maps API Key is valid and billing is enabled on the Google Cloud Console. |
| **No search results found** | Ensure the `scraper.py` script finished without errors and the `courses` table in `slugroute.db` is not empty. |
| **Buildings at (0,0) / Middle of Ocean** | Ensure you ran `python import_coords.py` inside the `database` folder to link names to coordinates. |
| **Go "Binary not found" error** | Ensure CGO is enabled (`export CGO_ENABLED=1`) as it is required for the `go-sqlite3` driver. |

---

## 6. Technical Notes
*   **Database:** Uses SQLite for zero-config deployment.
*   **Frontend:** Uses vanilla CSS for styling and the Google Maps JS SDK for visualization.
*   **Backend:** Uses the Gin Gonic framework in Go for high-performance JSON routing.
