# <img src="frontend/logo.png" alt="UCSC" height="32" valign="middle"> SlugRoute

**SlugRoute** is a comprehensive campus mapping tool for UC Santa Cruz. It helps students visualize their class schedules by scraping PISA (Schedule of Classes) data and projecting lecture, lab, and discussion locations onto an interactive Google Map.

![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Go](https://img.shields.io/badge/Backend-Go-blue)
![Python](https://img.shields.io/badge/Scraper-Python-green)

---

## ✨ Features

- **Automated Sync:** GitHub Actions trigger `scraper.py` every 24 hours to keep course data fresh.
- **Secure Integration:** Google Maps API keys are managed via environment variables and injected at runtime.
- **Smart Mapping:** Distinguishes between Lectures (★), Labs (■), and Discussions (▲).
- **Interactive Sidebar:** Filter by course type, save classes for later, and toggle visibility.
- **Route Finding:** Calculate walking directions via a secure Go proxy to the Google Routes API.
- **Dark Mode:** Native support for both light and dark campus map themes.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JS (ES6+), CSS3, Google Maps JavaScript SDK.
- **Backend:** Go (Gin Gonic), SQLite3, HTML Template Injection.
- **Data:** Python (BeautifulSoup4) for scraping; Custom Geodata for campus buildings.

---

## 🚀 Quick Start

### 1. Prerequisites
- [Go](https://go.dev/) (1.20+)
- [Python](https://www.python.org/) (3.8+)
- A **Google Maps API Key** with **Maps JavaScript API** and **Routes API** enabled.

### 2. Environment Configuration
Set your API key as an environment variable to allow the backend to inject it into the frontend and proxy routing requests:
```bash
# macOS/Linux
export GOOGLE_MAPS_API_KEY="YOUR_KEY_HERE"

# Windows (PowerShell)
$env:GOOGLE_MAPS_API_KEY="YOUR_KEY_HERE"
```

### 3. Data Initialization
```bash
# Install scraper dependencies
pip install requests bs4

# Scrape current/upcoming terms
cd scraper && python scraper.py && cd ..

# Import building coordinates
cd database && python import_coords.py && cd ..
```

### 4. Run the Server
```bash
cd backend
export CGO_ENABLED=1 # Required for SQLite
go run main.go
```
The app will be live at **`http://localhost:8080`**.

---

## 🧪 Testing

We maintain a suite of unit tests across the stack to ensure data integrity and API reliability.

### The Quick Way (Unified)
```bash
chmod +x test_all.sh
./test_all.sh
```

### The Manual Way
- **Backend (Go):** `cd backend && go test ./...`
- **Scraper (Python):** `python3 scraper/test_scraper.py`
- **Database Logic (Python):** `python3 database/test_import_coords.py`
- **Frontend (JS):** Open `localhost:8080/tests` in your browser with the server running.

---

## 📁 Project Structure

- `.github/workflows/` - Automated daily PISA data synchronization.
- `backend/` - Go Gin server, API proxy logic, and template injection.
- `database/` - SQLite storage and building coordinate mapping.
- `frontend/` - UI, Map logic, and asset storage.
- `scraper/` - Python engine for UCSC PISA data extraction.

---

## 🤝 Contributing
Please refer to the [Style Guides](./docs/) in the `docs` folder before submitting a Pull Request.
