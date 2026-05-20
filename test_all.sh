#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "--- Running Go Tests ---"
cd backend && go test ./... && cd ..

echo -e "\n--- Running Python Scraper Tests ---"
python3 scraper/test_scraper.py

echo -e "\n--- Running Python Database Tests ---"
python3 database/test_import_coords.py

echo -e "\n--- Note: Open frontend/tests.html in your browser to verify JS ---"
