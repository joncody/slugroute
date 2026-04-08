import requests
from bs4 import BeautifulSoup
import re
import unicodedata
import sqlite3
import time
import os

# --- CONFIGURATION ---
TERM_ID = '2262'  # Spring 2026
DB_PATH = '../database/slugroute.db'
# ---------------------

def normalize(text):
    """Clean up whitespace and unicode artifacts."""
    if not text: return ""
    text = unicodedata.normalize("NFKD", text)
    return " ".join(text.split()).strip()

def setup_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    curr = conn.cursor()
    curr.execute('DROP TABLE IF EXISTS meetings')
    curr.execute('''CREATE TABLE meetings (
        class_num INTEGER,
        course_code TEXT,
        type TEXT,
        location TEXT,
        time TEXT,
        instructor TEXT
    )''')
    conn.commit()
    return conn

def get_subjects():
    print("Fetching subject list...")
    res = requests.get("https://pisa.ucsc.edu/class_search/index.php")
    soup = BeautifulSoup(res.text, 'html.parser')
    select = soup.find('select', {'name': 'binds[:subject]'})
    return [opt.get('value') for opt in select.find_all('option') if opt.get('value')]

def scrape_all():
    subjects = get_subjects()
    conn = setup_db()
    curr = conn.cursor()
    url = "https://pisa.ucsc.edu/class_search/index.php"
    headers = {'User-Agent': 'SlugRouteCrawler/1.0'}
    for i, sub in enumerate(subjects):
        print(f"[{i+1}/{len(subjects)}] Scraping {sub}...")
        payload = {'action': 'results', 'binds[:term]': TERM_ID, 'binds[:subject]': sub, 'rec_dur': '2500'}
        try:
            res = requests.post(url, data=payload, headers=headers)
            soup = BeautifulSoup(res.text, 'html.parser')
            panels = soup.find_all('div', class_='panel-default')
            for panel in panels:
                # 1. Basic Info
                header = normalize(panel.find('h2').get_text())
                course_match = re.search(r'([A-Z]+\s+\d+[A-Z]?)', header)
                course_code = course_match.group(1) if course_match else "Unknown"
                class_num_tag = panel.find('a', id=re.compile('class_nbr_'))
                if not class_num_tag: continue
                class_num = int(class_num_tag.get_text())
                # 2. Detail Page (For Sections/Labs)
                d_res = requests.post(url, data={'action': 'detail', 'class_data[:STRM]': TERM_ID, 'class_data[:CLASS_NBR]': class_num})
                d_soup = BeautifulSoup(d_res.text, 'html.parser')
                # Main Lecture
                meet_h2 = d_soup.find('h2', string=re.compile('Meeting Information'))
                if meet_h2:
                    rows = meet_h2.find_next('table').find_all('tr')[1:]
                    for row in rows:
                        cols = row.find_all('td')
                        if len(cols) >= 3:
                            curr.execute('INSERT INTO meetings VALUES (?,?,?,?,?,?)',
                                (class_num, course_code, 'LEC', normalize(cols[1].get_text()), normalize(cols[0].get_text()), normalize(cols[2].get_text())))
                # Associated Sections
                sec_h2 = d_soup.find('h2', string=re.compile('Associated Discussion'))
                if sec_h2:
                    sec_panel = sec_h2.find_next('div', class_='panel-body')
                    for block in sec_panel.get_text(separator="|").split("#"):
                        clean = normalize(block.replace("|", " "))
                        if not clean or "Section" in clean: continue
                        m_type = (re.search(r'\b(DIS|LAB|LBS|SEM|STS)\b', clean) or [None, "SEC"])[1]
                        m_time = (re.search(r'([MTWRFuha]+\s+\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M)', clean) or [None, "TBA"])[1]
                        m_loc = clean.split("Loc:")[1].split("Enrl:")[0].strip() if "Loc:" in clean else "TBA"
                        curr.execute('INSERT INTO meetings VALUES (?,?,?,?,?,?)',
                            (class_num, course_code, m_type, m_loc, m_time, "Staff"))
            conn.commit()
            time.sleep(0.5) # Prevent server block
        except Exception as e:
            print(f"Error on {sub}: {e}")
    conn.close()
    print("Scraping Complete!")

if __name__ == "__main__":
    scrape_all()
