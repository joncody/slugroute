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
    month = now.month

    if 1 <= month <= 3:
        current_idx = 0
    elif 4 <= month <= 6:
        current_idx = 1
    elif 7 <= month <= 8:
        current_idx = 2
    else:
        current_idx = 3

    term_suffixes = ["0", "2", "4", "8"]
    strms = []

    for i in range(3):
        idx = (current_idx + i) % 4
        year_offset = (current_idx + i) // 4
        target_year = now.year + year_offset
        year_suffix = str(target_year)[2:]
        strms.append(f"2{year_suffix}{term_suffixes[idx]}")

    return strms


def get_session():
    """Configures a requests session with retries and headers."""
    session = requests.Session()
    retry_strategy = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "UCSC Student Research Scraper",
        "Referer": BASE_URL
    })

    try:
        session.get(BASE_URL, timeout=TIMEOUT)
    except requests.exceptions.RequestException as exc:
        logging.error(f"Failed to initialize session: {exc}")

    return session


def clean_text(text):
    """Removes excess whitespace."""
    if not text:
        return ""

    text = " ".join(text.split()).strip()
    return text.replace("Cancelled Cancelled", "Cancelled")


def split_days_times(raw_text):
    """Splits 'MWF 10:40AM-11:45AM' into ('MWF', '10:40AM-11:45AM')."""
    cleaned = clean_text(raw_text)

    if not cleaned:
        return cleaned, ""

    exceptions = ["TBA", "Cancelled", "TBD"]
    if any(x in cleaned for x in exceptions):
        return cleaned, ""

    match = re.search(r"\d", cleaned)
    if match:
        idx = match.start()
        return cleaned[:idx].strip(), cleaned[idx:].strip()

    return cleaned, ""


def split_location(raw_location):
    """Separates Building name from Room number."""
    text = clean_text(raw_location)

    if not text:
        return text, ""

    non_physical = ["ONLINE", "REMOTE", "TBA", "N/A", "TBD", "HARBOR"]
    if any(x in text.upper() for x in non_physical):
        return text, ""

    match = re.search(r"^(.*)\s+([A-Z]?\d{2,}.*)$", text)
    if match:
        building, room = match.groups()
        return building.strip(), room.strip()

    return text, ""


def init_db():
    """Creates the SQLite schema."""
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

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

    cursor.execute(
        "DELETE FROM lectures WHERE class_number = ? AND term = ?",
        (data['class_number'], term)
    )

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


def fetch_class_detail(session, class_num, term):
    """Parses the detail page for a specific class."""
    payload = {
        "action": "detail",
        "class_data[:STRM]": term,
        "class_data[:CLASS_NBR]": class_num
    }

    try:
        resp = session.post(BASE_URL, data=payload, timeout=TIMEOUT)
        resp.raise_for_status()
    except requests.exceptions.RequestException as err:
        logging.error(f"Error fetching class {class_num}: {err}")
        return None

    soup = BeautifulSoup(resp.text, "html.parser")

    data = {
        "class_number": class_num,
        "course_code": "UNK",
        "lecture_section": "00",
        "title": "Unknown Title",
        "lectures": [],
        "sections": []
    }

    header = soup.find("h2")
    if header:
        h_txt = clean_text(header.get_text())
        h_match = re.search(r"^([A-Z]+\s+\d+[A-Z]*)\s+-\s+(\d+)\s*(.*)$", h_txt)
        if h_match:
            data["course_code"], data["lecture_section"], data["title"] = h_match.groups()

    meet_h2 = soup.find("h2", string=re.compile(r"Meeting Information"))
    if meet_h2:
        table = meet_h2.find_next("table")
        if table:
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

    sec_h2 = soup.find("h2", string=re.compile(r"Associated Discussion"))
    if sec_h2:
        panel_body = sec_h2.find_next("div", class_="panel-body")
        if panel_body:
            for row in panel_body.find_all("div", class_="row-striped"):
                divs = row.find_all("div")
                if len(divs) >= 4:
                    raw_id = clean_text(divs[0].get_text())
                    id_match = re.search(r"#(\d+)\s+([A-Z]+)\s+([0-9A-Z]+)", raw_id)
                    days, times = split_days_times(divs[1].get_text())
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
    return data


def scrape_term(session, conn, term):
    """Scrapes all classes for a specific term."""
    logging.info(f"--- Starting scrape for term {term} ---")
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
    class_links = soup.find_all("a", id=re.compile(r"class_nbr_"))
    class_nums = [a.get_text().strip() for a in class_links]

    logging.info(f"Found {len(class_nums)} classes for term {term}")

    cursor = conn.cursor()
    new_count = 0
    for i, class_num in enumerate(class_nums):
        cursor.execute(
            "SELECT 1 FROM courses WHERE class_number = ? AND term = ?",
            (class_num, term)
        )
        if cursor.fetchone():
            continue

        data = fetch_class_detail(session, class_num, term)
        if not data:
            continue

        try:
            save_course_data(cursor, data, term)
            conn.commit()
            new_count += 1

            if i % 50 == 0 and i > 0:
                logging.info(f"[{term}] Processed {i}/{len(class_nums)}...")

            time.sleep(REQUEST_DELAY)
        except sqlite3.Error as err:
            logging.error(f"DB Error for class {class_num}: {err}")

    logging.info(f"Term {term} finished. Scraped {new_count} new entries.")


def main():
    """Entry point for the scraper engine."""
    logging.info("SlugRoute Scraper Engine Starting")
    init_db()
    session = get_session()

    target_terms = calculate_current_strms()
    logging.info(f"Calculated automated target terms: {target_terms}")

    try:
        with sqlite3.connect(DB_NAME) as conn:
            for term_code in target_terms:
                scrape_term(session, conn, term_code)
    except sqlite3.Error as err:
        logging.error(f"Failed to connect to database: {err}")

    logging.info("All terms processed successfully.")


if __name__ == "__main__":
    main()
