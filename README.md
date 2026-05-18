# <img src="frontend/logo.png" alt="UCSC" height="32" valign="middle"> SlugRoute

**SlugRoute** is a comprehensive campus mapping tool for UC Santa Cruz. It helps students visualize their class schedules by scraping PISA (Schedule of Classes) data and projecting lecture, lab, and discussion locations onto an interactive Google Map.

![License](https://img.shields.io/badge/License-MIT-yellow.svg)
![Go](https://img.shields.io/badge/Backend-Go-blue)
![Python](https://img.shields.io/badge/Scraper-Python-green)

---

## ✨ Features

- **Automated Scraper:** Automatically calculates UCSC term codes and pulls the latest course data.
- **Smart Mapping:** Distinguishes between Lectures (★), Labs (■), and Discussions (●).
- **Interactive Sidebar:** Filter by course type, save classes for later, and toggle visibility.
- **Route Finding:** Calculate walking directions from your GPS location or a manual pin to any classroom.
- **Dark Mode:** Native support for both light and dark campus map themes.

---

## 🛠️ Tech Stack

- **Frontend:** Vanilla JS (ES6+), CSS3, Google Maps JavaScript SDK, Google Routes API v2.
- **Backend:** Go (Gin Gonic), SQLite3.
- **Data:** Python (BeautifulSoup4) for scraping; Custom Geodata for campus buildings.

---

## 🚀 Quick Start

### 1. Prerequisites
- [Go](https://go.dev/) (1.20+)
- [Python](https://www.python.org/) (3.8+)
- A [Google Maps API Key](https://console.cloud.google.com/) with Maps JavaScript API and Routes API enabled.

### 2. Data Initialization
```bash
# Install scraper dependencies
pip install requests bs4

# Scrape current/upcoming terms
cd scraper && python scraper.py && cd ..

# Import building coordinates
cd database && python import_coords.py && cd ..
```

### 3. Frontend Configuration
Open `frontend/index.html` and replace `YOUR_API_KEY_HERE` (near the bottom) with your Google Maps API key.

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
Run the automated test runner from the root directory:
```bash
chmod +x test_all.sh
./test_all.sh
```

### The Manual Way
If you need to test specific components individually:

- **Backend (Go):** 
  ```bash
  cd backend && go test ./...
  ```
- **Scraper (Python):** 
  ```bash
  python3 scraper/test_scraper.py
  ```
- **Database Logic (Python):** 
  ```bash
  python3 database/test_import_coords.py
  ```
- **Frontend (JS):** 
  Open `frontend/tests.html` in your browser to run the Vitest-style client-side suite.

---

## 📁 Project Structure

- `backend/` - Go Gin server and REST API endpoints.
- `database/` - SQLite storage and building coordinate mapping.
- `frontend/` - UI, Map logic, and asset storage.
- `scraper/` - Python engine for UCSC PISA data extraction.
- `docs/` - Style guides for each language used in the project.

---

## 🤝 Contributing
Please refer to the [Style Guides](./docs/) in the `docs` folder before submitting a Pull Request.
