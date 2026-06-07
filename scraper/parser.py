"""
UCSC PISA Scraper Parser Utilities
Handles HTML parsing and raw text parsing logic.
"""

import re


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
