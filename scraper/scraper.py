import requests
from bs4 import BeautifulSoup
import re
import unicodedata
import sqlite3
import time

def normalize(text):
    if not text: return ""
    text = unicodedata.normalize("NFKD", text)
    return " ".join(text.split()).strip()

def scrape_slug_route(term='2262', subject='CSE'):
    url = "https://pisa.ucsc.edu/class_search/index.php"
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
    payload = {'action': 'results', 'binds[:term]': term, 'binds[:subject]': subject, 'rec_dur': '2500'}

    print(f"--- Starting Scrape for {subject} ---")
    try:
        res = requests.post(url, data=payload, headers=headers, timeout=20)
    except Exception as e:
        print(f"Error: {e}")
        return

    soup = BeautifulSoup(res.text, 'html.parser')
    panels = soup.find_all('div', class_='panel-default')

    conn = sqlite3.connect('../database/slugroute.db')
    curr = conn.cursor()
    curr.execute('DROP TABLE IF EXISTS meetings')
    # Table includes class_num so we can group Munishkina Sec 01 vs Munishkina Sec 02
    curr.execute('CREATE TABLE meetings (class_num INTEGER, course_code TEXT, type TEXT, location TEXT, time TEXT, instructor TEXT)')

    for i, panel in enumerate(panels):
        header = panel.find('h2')
        if not header: continue

        course_match = re.search(r'([A-Z]+\s+\d+[A-Z]?)', normalize(header.get_text()))
        course_code = course_match.group(1) if course_match else "Unknown"

        class_num_tag = panel.find('a', id=re.compile('class_nbr_'))
        if not class_num_tag: continue
        class_num = int(class_num_tag.get_text().strip())

        print(f"[{i+1}/{len(panels)}] Processing {course_code} Offering #{class_num}")

        detail_res = requests.post(url, data={'action': 'detail', 'class_data[:STRM]': term, 'class_data[:CLASS_NBR]': class_num}, headers=headers)
        d_soup = BeautifulSoup(detail_res.text, 'html.parser')

        # 1. PRIMARY MEETING (LECTURE)
        meet_h2 = d_soup.find('h2', string=re.compile('Meeting Information'))
        if meet_h2:
            table = meet_h2.find_next('table')
            if table:
                for row in table.find_all('tr')[1:]:
                    cols = row.find_all('td')
                    if len(cols) >= 3:
                        curr.execute('INSERT INTO meetings VALUES (?, ?, ?, ?, ?, ?)',
                                     (class_num, course_code, 'LEC', normalize(cols[1].get_text()), normalize(cols[0].get_text()), normalize(cols[2].get_text())))

        # 2. SECONDARY SECTIONS (LABS/DIS)
        sec_h2 = d_soup.find('h2', string=re.compile('Associated Discussion'))
        if sec_h2:
            sec_panel = sec_h2.find_next('div', class_='panel-body')
            # Split by # to isolate each lab section
            sec_blocks = sec_panel.get_text(separator="|").split("#")

            for block in sec_blocks:
                clean = normalize(block.replace("|", " "))
                if not clean or "Section" in clean: continue

                # Extract Section Info
                type_match = re.search(r'\b(DIS|LAB|LBS|SEM|STS)\b', clean)
                m_type = type_match.group(0) if type_match else "SEC"

                time_match = re.search(r'([MTWRFuha]+\s+\d{1,2}:\d{2}[AP]M-\d{1,2}:\d{2}[AP]M)', clean)
                m_time = time_match.group(0) if time_match else "TBA"

                m_loc = "TBA"
                if "Loc:" in clean:
                    m_loc = clean.split("Loc:")[1].split("Enrl:")[0].strip()

                # We record "Staff" (or whatever is in the block) because class_num handles the grouping
                m_inst = "Staff"
                if m_type != "SEC" or m_loc != "TBA":
                    curr.execute('INSERT INTO meetings VALUES (?, ?, ?, ?, ?, ?)',
                                 (class_num, course_code, m_type, m_loc, m_time, m_inst))

        time.sleep(0.1)

    conn.commit()
    conn.close()
    print("--- Scrape Complete ---")

if __name__ == "__main__":
    scrape_slug_route()
