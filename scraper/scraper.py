"""
UCSC PISA Scraper
Fetches course data from the Schedule of Classes and stores it in SQLite.
"""

import logging
import re
import sqlite3
import time
from datetime import datetime as dt

import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

import config
import db
import parser

# Global Configuration (Exposed for compatibility and test patching)
DB_NAME = config.DB_NAME
BASE_URL = config.BASE_URL
TIMEOUT = config.TIMEOUT
REQUEST_DELAY = config.REQUEST_DELAY

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler()
    ]
)

# Exported helper functions for parsing (Exposed for test suite compatibility)
clean_text = parser.clean_text
split_days_times = parser.split_days_times
split_location = parser.split_location
_parse_header = parser._parse_header
_parse_meetings = parser._parse_meetings
_parse_sections = parser._parse_sections

# Exported database functions (Exposed for test suite compatibility)
save_course_data = db.save_course_data


def init_db():
    """Creates the SQLite schema."""
    db.init_db(DB_NAME)


def calculate_current_strms():
    """
    Calculates UCSC STRM codes based on the system clock.
    UCSC Logic: 2 + YY + (0: Winter, 2: Spring, 4: Summer, 8: Fall)
    """
    now = dt.now()

    # Map calendar months to chronological term array indices (0 to 3)
    # 1-3 (Jan-Mar): Index 0 (Winter)
    # 4-6 (Apr-Jun): Index 1 (Spring)
    # 7-8 (Jul-Aug): Index 2 (Summer)
    # 9-12 (Sep-Dec): Index 3 (Fall)
    month_to_idx = {
        1: 0, 2: 0, 3: 0,
        4: 1, 5: 1, 6: 1,
        7: 2, 8: 2,
        9: 3, 10: 3, 11: 3, 12: 3
    }

    current_idx = month_to_idx.get(now.month, 0)
    term_suffixes = ["0", "2", "4", "8"]
    strms = []

    # Calculate STRM codes for current quarter + next 2 quarters
    for i in range(3):
        # Modulo (% 4) ensures index wraps back to 0 (Winter) after 3 (Fall)
        idx = (current_idx + i) % 4

        # Integer division (// 4) yields a 1 only when current_idx + i >= 4.
        # This occurs precisely when wrapping from Fall (3) back to Winter (0),
        # automatically incrementing the target calendar year by 1.
        year_offset = (current_idx + i) // 4

        target_year = now.year + year_offset
        year_suffix = str(target_year)[2:]  # Extract YY (e.g. "26" from 2026)

        # Build standard 4-digit code (e.g., "2" + "26" + "8" = "2268")
        strms.append(f"2{year_suffix}{term_suffixes[idx]}")

    return strms


def get_session():
    """Configures a requests session with retries and headers."""
    # Instantiating a Session preserves cookies, headers, and TCP connection pooling
    session = requests.Session()

    # Configure safety retries with exponential backoffs and rate-limiting triggers
    retry_strategy = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )

    # Attach HTTPAdapter to apply the retry configuration over HTTPS protocols
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)

    # Set standard request metadata to avoid automated scraping filters
    session.headers.update({
        "User-Agent": "UCSC Student Research Scraper",
        "Referer": BASE_URL
    })

    try:
        # Run a pre-flight request to initialize session cookies and verify server availability
        session.get(BASE_URL, timeout=TIMEOUT)
    except requests.exceptions.RequestException as exc:
        logging.error(f"Failed to initialize session: {exc}")

    return session


def fetch_class_detail(session, class_num, term):
    """Parses the detail page for a specific class."""
    payload = {
        "action": "detail",
        "class_data[:STRM]": term,
        "class_data[:CLASS_NBR]": class_num
    }

    try:
        # Submit POST requests containing details payload to detail endpoint
        resp = session.post(BASE_URL, data=payload, timeout=TIMEOUT)
        resp.raise_for_status()
    except requests.exceptions.RequestException as err:
        logging.error(f"Error fetching class {class_num}: {err}")
        return None

    # Load HTML structure into BeautifulSoup for processing
    soup = BeautifulSoup(resp.text, "html.parser")
    data = {
        "class_number": class_num,
        "course_code": "UNK",
        "lecture_section": "00",
        "title": "Unknown Title",
        "lectures": [],
        "sections": []
    }

    # Execute parsing steps sequentially
    _parse_header(soup, data)
    _parse_meetings(soup, data)
    _parse_sections(soup, data)

    return data


def scrape_term(session, conn, term):
    """Scrapes all classes for a specific term."""
    logging.info(f"--- Starting scrape for term {term} ---")

    # Request matching listings for the term.
    # Setting "rec_dur": "5000" pulls up to 5,000 entries, bypasses pagination steps.
    payload = {
        "action": "results",
        "binds[:term]": term,
        "binds[:reg_status]": "all",
        "rec_dur": "5000"
    }

    try:
        resp = session.post(BASE_URL, data=payload, timeout=TIMEOUT)
        resp.raise_for_status()
    except requests.exceptions.RequestException as err:
        logging.error(f"Search results failed for term {term}: {err}")
        return

    soup = BeautifulSoup(resp.text, "html.parser")

    # Capture all catalog search links containing 'class_nbr_' attributes
    class_links = soup.find_all("a", id=re.compile(r"class_nbr_"))
    class_nums = [a.get_text().strip() for a in class_links]

    logging.info(f"Found {len(class_nums)} classes for term {term}")

    cursor = conn.cursor()
    new_count = 0
    for i, class_num in enumerate(class_nums):
        # Skip fetching if this course schedule record has already been scraped to preserve bandwidth
        cursor.execute(
            "SELECT 1 FROM courses WHERE class_number = ? AND term = ?",
            (class_num, term)
        )
        if cursor.fetchone():
            continue

        # Fetch detail page and run sub-parsers
        data = fetch_class_detail(session, class_num, term)
        if not data:
            continue

        try:
            # Transactionally commit course mappings to local DB schemas
            save_course_data(cursor, data, term)
            conn.commit()
            new_count += 1

            if i % 50 == 0 and i > 0:
                logging.info(f"[{term}] Processed {i}/{len(class_nums)}...")

            # Throttle requests to avoid triggering PISA host protections
            time.sleep(REQUEST_DELAY)
        except sqlite3.Error as err:
            logging.error(f"DB Error for class {class_num}: {err}")

    logging.info(f"Term {term} finished. Scraped {new_count} new entries.")


def main():
    """Entry point for the scraper engine."""
    logging.info("SlugRoute Scraper Engine Starting")

    # Ensure database schemas exist before initiating scrapers
    init_db()

    # Initialize the network connection pool
    session = get_session()

    # Determine current and upcoming STRM codes automatically based on server date
    target_terms = calculate_current_strms()
    logging.info(f"Calculated automated target terms: {target_terms}")

    try:
        # Establish a database context and initiate scrapers sequentially
        with sqlite3.connect(DB_NAME) as conn:
            for term_code in target_terms:
                scrape_term(session, conn, term_code)
    except sqlite3.Error as err:
        logging.error(f"Failed to connect to database: {err}")

    logging.info("All terms processed successfully.")


if __name__ == "__main__":
    main()
