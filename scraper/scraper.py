"""
UCSC PISA Scraper - Production Edition (Single-Threaded)
This script scrapes the UCSC Schedule of Classes and stores it in SQLite.
It separates Building Names from Room Numbers.
"""
import logging
import re
import sqlite3
import time
from datetime import datetime
import requests
from bs4 import BeautifulSoup
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# --- Configuration & Constants ---
DB_NAME = "../database/slugroute.db"
BASE_URL = "https://pisa.ucsc.edu/class_search/index.php"
# Includes Winter, Spring, Summer, and Fall for each year from 2015 to 2025,
# plus the 2026 terms you were targeting.
TARGET_TERMS = ["2260", "2262"]
TIMEOUT = 30
REQUEST_DELAY = 0.2

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler("scraper.log"),
        logging.StreamHandler()
    ]
)

def get_session():
    session = requests.Session()
    retry_strategy = Retry(
        total=5,
        backoff_factor=1,
        status_forcelist=[429, 500, 502, 503, 504],
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    session.headers.update({
        "User-Agent": "UCSC Student Research Scraper (Contact: academic-bot@ucsc.edu)",
        "Referer": BASE_URL
    })
    try:
        session.get(BASE_URL, timeout=TIMEOUT)
    except Exception as exc:
        logging.error(f"Failed to initialize session: {exc}")
    return session

def clean_text(text):
    if not text:
        return ""
    text = " ".join(text.split()).strip()
    return text.replace("Cancelled Cancelled", "Cancelled")

def split_days_times(raw_text):
    cleaned = clean_text(raw_text)
    if not cleaned or any(x in cleaned for x in ["TBA", "Cancelled", "TBD"]):
        return cleaned, ""
    match = re.search(r"\d", cleaned)
    if match:
        idx = match.start()
        return cleaned[:idx].strip(), cleaned[idx:].strip()
    return cleaned, ""

def split_location(raw_location):
    """
    Generalized splitter using the '1-digit building vs 2+-digit room' rule.
    Example: 'Soc Sci 1 135 PC Lab' -> ('Soc Sci 1', '135 PC Lab')
    Example: 'ClassroomUnit 001' -> ('ClassroomUnit', '001')
    """
    text = clean_text(raw_location)
    # Handle known non-physical locations
    if not text or any(x in text.upper() for x in ["ONLINE", "REMOTE", "TBA", "N/A", "TBD", "HARBOR"]):
        return text, ""
    # REGEX EXPLANATION:
    # ^(.*)         -> Group 1 (Building): Capture as much as possible (greedy)
    # \s+           -> The separator: A space
    # (             -> Group 2 (Room):
    #   [A-Z]?      -> Optional leading letter (e.g., 'M' in M110 or 'B' in B206)
    #   \d{2,}      -> AT LEAST TWO digits (This prevents 'Soc Sci 1' from splitting)
    #   .*          -> Anything following the digits (e.g., 'PC Lab', 'Studio')
    # )
    # $             -> End of string
    match = re.search(r"^(.*)\s+([A-Z]?\d{2,}.*)$", text)
    if match:
        building, room = match.groups()
        return building.strip(), room.strip()
    # If the regex doesn't match (e.g., 'Soc Sci 1' with no room),
    # return the whole thing as the building.
    return text, ""

def init_db():
    """Create tables with updated schema for Building and Room Number."""
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
    timestamp = datetime.now().isoformat()
    cursor.execute("""
        INSERT OR REPLACE INTO courses VALUES (?, ?, ?, ?, ?, ?)
    """, (data['class_number'], term, data['course_code'],
          data['lecture_section'], data['title'], timestamp))
    cursor.execute(
        "DELETE FROM lectures WHERE class_number = ? AND term = ?",
        (data['class_number'], term)
    )
    for lec in data['lectures']:
        cursor.execute("""
            INSERT INTO lectures (class_number, term, instructor, days, times, building, room_number)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (data['class_number'], term, lec['instructor'],
              lec['days'], lec['times'], lec['building'], lec['room_number']))
    for sec in data['sections']:
        cursor.execute("""
            INSERT OR REPLACE INTO sections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (sec['class_number'], term, data['class_number'],
              sec['section_type'], sec['section_id'], sec['instructor'],
              sec['days'], sec['times'], sec['building'], sec['room_number']))

def fetch_class_detail(session, class_num, term):
    payload = {"action": "detail", "class_data[:STRM]": term, "class_data[:CLASS_NBR]": class_num}
    resp = session.post(BASE_URL, data=payload, timeout=TIMEOUT)
    resp.raise_for_status()
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
    # Meeting Information (Main Lectures)
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
    # Associated Sections (Labs/Discussions)
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
                    building, room = split_location(divs[3].get_text().replace("Loc:", ""))
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
    logging.info(f"Retrieving class list for Term {term}...")
    payload = {"action": "results", "binds[:term]": term, "binds[:reg_status]": "all", "rec_dur": "5000"}
    resp = session.post(BASE_URL, data=payload, timeout=TIMEOUT)
    soup = BeautifulSoup(resp.text, "html.parser")
    class_links = soup.find_all("a", id=re.compile(r"class_nbr_"))
    class_nums = [a.get_text().strip() for a in class_links]
    total_count = len(class_nums)
    logging.info(f"Found {total_count} classes in term {term}.")
    cursor = conn.cursor()
    for index, class_num in enumerate(class_nums, 1):
        cursor.execute("SELECT 1 FROM courses WHERE class_number = ? AND term = ?", (class_num, term))
        if cursor.fetchone():
            continue
        try:
            data = fetch_class_detail(session, class_num, term)
            save_course_data(cursor, data, term)
            conn.commit()
            if index % 10 == 0:
                logging.info(f" Progress: [{index}/{total_count}] processed.")
            time.sleep(REQUEST_DELAY)
        except Exception as err:
            logging.error(f"Failed to process class {class_num}: {err}")

def main():
    init_db()
    session = get_session()
    with sqlite3.connect(DB_NAME) as conn:
        for term_code in TARGET_TERMS:
            logging.info(f"--- STARTING TERM: {term_code} ---")
            scrape_term(session, conn, term_code)
    logging.info("Scrape complete.")

if __name__ == "__main__":
    main()
