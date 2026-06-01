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

# Global Configuration
DB_NAME = "../database/slugroute.db"
BASE_URL = "https://pisa.ucsc.edu/class_search/index.php"
TIMEOUT = 30
REQUEST_DELAY = 0.2

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler()
    ]
)


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


def clean_text(text):
    """Removes excess whitespace."""
    if not text:
        return ""

    # Split converts all whitespace runs (tabs, newlines, multiple spaces) into single spaces
    text = " ".join(text.split()).strip()

    # Clean up double cancellations sometimes outputted by PISA's status logic
    return text.replace("Cancelled Cancelled", "Cancelled")


def split_days_times(raw_text):
    """Splits 'MWF 10:40AM-11:45AM' into ('MWF', '10:40AM-11:45AM')."""
    cleaned = clean_text(raw_text)

    if not cleaned:
        return cleaned, ""

    # Early return for placeholder values where splitting is unnecessary
    exceptions = ["TBA", "Cancelled", "TBD"]
    if any(x in cleaned for x in exceptions):
        return cleaned, ""

    # Locate the first numeric digit, which marks the start of the time range
    match = re.search(r"\d", cleaned)
    if match:
        idx = match.start()
        # Split into alphabetical day prefix and numerical time ranges
        return cleaned[:idx].strip(), cleaned[idx:].strip()

    return cleaned, ""


def split_location(raw_location):
    """Separates Building name from Room number."""
    text = clean_text(raw_location)

    if not text:
        return text, ""

    # Skip parsing for non-physical class venues
    non_physical = ["ONLINE", "REMOTE", "TBA", "N/A", "TBD", "HARBOR"]
    if any(x in text.upper() for x in non_physical):
        return text, ""

    # Regular expression structure:
    # ^(.*) matches the building name up to the final spaces
    # \s+ matching intermediate spaces separating building and room
    # ([A-Z]?\d{2,}.*)$ matches a standard room code starting with 2+ digits,
    # optionally prefixed by a level letter (e.g., 'D250' or 'B206')
    match = re.search(r"^(.*)\s+([A-Z]?\d{2,}.*)$", text)
    if match:
        building, room = match.groups()
        return building.strip(), room.strip()

    # Fallback default: Return the entire cleaned text as the building
    return text, ""


def init_db():
    """Creates the SQLite schema."""
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

        # The primary schedule registry indexed by class number and term
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS courses (
                class_number TEXT,
                term TEXT,
                course_code TEXT,
                lecture_section TEXT,
                title TEXT,
                last_updated TEXT,
                PRIMARY KEY (class_number, term)
            )""")

        # Storage for primary lecture events
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lectures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_number TEXT,
                term TEXT,
                instructor TEXT,
                days TEXT,
                times TEXT,
                building TEXT,
                room_number TEXT,
                FOREIGN KEY (class_number, term) REFERENCES courses (class_number, term)
            )""")

        # Storage for linked sections (Labs and Discussions) referencing parent lectures
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sections (
                class_number TEXT,
                term TEXT,
                parent_class_number TEXT,
                section_type TEXT,
                section_id TEXT,
                instructor TEXT,
                days TEXT,
                times TEXT,
                building TEXT,
                room_number TEXT,
                PRIMARY KEY (class_number, term)
            )""")

        conn.commit()


def save_course_data(cursor, data, term):
    """Inserts scraped course dictionary into the database."""
    timestamp = dt.now().isoformat()

    # Save central course metadata
    cursor.execute("""
        INSERT OR REPLACE INTO courses VALUES (?, ?, ?, ?, ?, ?)
    """, (
        data['class_number'],
        term,
        data['course_code'],
        data['lecture_section'],
        data['title'],
        timestamp
    ))

    # Erase obsolete lecture entries for this course to avoid stale schedule remnants
    cursor.execute(
        "DELETE FROM lectures WHERE class_number = ? AND term = ?",
        (data['class_number'], term)
    )

    # Insert individual lecture schedule items
    for lec in data['lectures']:
        cursor.execute("""
            INSERT INTO lectures (
                class_number, term, instructor, days, times, building, room_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data['class_number'],
            term,
            lec['instructor'],
            lec['days'],
            lec['times'],
            lec['building'],
            lec['room_number']
        ))

    # Save associated secondary sections
    for sec in data['sections']:
        cursor.execute("""
            INSERT OR REPLACE INTO sections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            sec['class_number'],
            term,
            data['class_number'],
            sec['section_type'],
            sec['section_id'],
            sec['instructor'],
            sec['days'],
            sec['times'],
            sec['building'],
            sec['room_number']
        ))


def _parse_header(soup, data):
    """Extracts course code, section, and title from the H2 header."""
    header = soup.find("h2")
    if not header:
        return

    h_txt = clean_text(header.get_text())

    # Matches PISA's header structures (e.g., "CSE 101 - 01 Computer Science")
    # Group 1: Course code ("CSE 101")
    # Group 2: Section code ("01")
    # Group 3: Title details ("Computer Science")
    h_match = re.search(r"^([A-Z]+\s+\d+[A-Z]*)\s+-\s+(\d+)\s*(.*)$", h_txt)
    if h_match:
        data["course_code"] = h_match.group(1)
        data["lecture_section"] = h_match.group(2)
        data["title"] = h_match.group(3)


def _parse_meetings(soup, data):
    """Extracts main lecture meeting information."""
    # Find the "Meeting Information" H2 header section
    meet_h2 = soup.find("h2", string=re.compile(r"Meeting Information"))
    if not meet_h2:
        return

    # Find the next tabular structure holding schedule rows
    table = meet_h2.find_next("table")
    if not table:
        return

    # Iterate over row elements, bypassing the header label row at index 0
    for row in table.find_all("tr")[1:]:
        cols = row.find_all("td")
        if len(cols) >= 3:
            days, times = split_days_times(cols[0].get_text())
            building, room = split_location(cols[1].get_text())
            data["lectures"].append({
                "days": days,
                "times": times,
                "building": building,
                "room_number": room,
                "instructor": clean_text(cols[2].get_text(separator="; "))
            })


def _parse_sections(soup, data):
    """Extracts associated discussion/lab sections."""
    # Find the "Associated Discussion" sections containing discussion/lab schedules
    sec_h2 = soup.find("h2", string=re.compile(r"Associated Discussion"))
    if not sec_h2:
        return

    panel_body = sec_h2.find_next("div", class_="panel-body")
    if not panel_body:
        return

    # Iterate through each structured layout row containing section details
    for row in panel_body.find_all("div", class_="row-striped"):
        divs = row.find_all("div")
        if len(divs) >= 4:
            raw_id = clean_text(divs[0].get_text())

            # Matches strings like "#12345 DIS 01A"
            # Group 1: Class Number ("12345")
            # Group 2: Section Type ("DIS")
            # Group 3: Sub-section Index ("01A")
            id_match = re.search(r"#(\d+)\s+([A-Z]+)\s+([0-9A-Z]+)", raw_id)
            days, times = split_days_times(divs[1].get_text())

            # Remove localized prefix markers to isolate coordinate-lookup names
            raw_loc = divs[3].get_text().replace("Loc:", "")
            building, room = split_location(raw_loc)

            data["sections"].append({
                "class_number": id_match.group(1) if id_match else "",
                "section_type": id_match.group(2) if id_match else "",
                "section_id": id_match.group(3) if id_match else "",
                "days": days,
                "times": times,
                "instructor": clean_text(divs[2].get_text(separator="; ")),
                "building": building,
                "room_number": room
            })


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
