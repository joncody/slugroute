"""
UCSC PISA Scraper Testing Suite
Validates text formatting routines, parsing engines, dynamic term configurations,
and SQLite storage migrations using temporary sandbox environments.
"""

import os
import sqlite3
import sys
import tempfile
import unittest
from datetime import datetime
from unittest.mock import MagicMock, patch

from bs4 import BeautifulSoup

# Ensure correct path alignment for directory-specific imports
# This dynamically registers the script's directory to allow resolution of the local scraper module.
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import scraper


class TestScraper(unittest.TestCase):
    """Verifies baseline text sanitization and BeautifulSoup parse helpers."""

    def test_clean_text(self):
        """Checks string whitespace stripping and cancellation duplication fixes."""
        # Ensure double spaces and leading/trailing whitespace are normalized.
        self.assertEqual(scraper.clean_text("  trimmed  text  "), "trimmed text")
        # Validate that duplicated "Cancelled" strings are normalized into a single instance.
        self.assertEqual(scraper.clean_text("Cancelled Cancelled"), "Cancelled")
        # Gracefully convert None inputs to empty strings to avoid parsing failures.
        self.assertEqual(scraper.clean_text(None), "")

    def test_split_days_times(self):
        """Verifies splitting schedule blocks into day and time segments."""
        # Confirm day codes and time frames split properly on the whitespace separator.
        days, times = scraper.split_days_times("MWF 10:40AM-11:45AM")
        self.assertEqual(days, "MWF")
        self.assertEqual(times, "10:40AM-11:45AM")

        # Confirm that TBA inputs generate no times.
        # This prevents formatting crashes when times are unannounced.
        days, times = scraper.split_days_times("TBA")
        self.assertEqual(days, "TBA")
        self.assertEqual(times, "")

    def test_split_location(self):
        """Ensures building names and room numbers segment correctly."""
        # Confirm that standard building-room strings separate cleanly.
        bld, rm = scraper.split_location("ClassroomUnit 101")
        self.assertEqual(bld, "ClassroomUnit")
        self.assertEqual(rm, "101")

        # Confirm that multi-word building names parse correctly, extracting only the final room number segment.
        bld, rm = scraper.split_location("J Baskin Engr 101")
        self.assertEqual(bld, "J Baskin Engr")
        self.assertEqual(rm, "101")

        # Virtual configurations should yield empty room paths.
        # This handles online lectures that do not occupy physical campus structures.
        bld, rm = scraper.split_location("ONLINE")
        self.assertEqual(bld, "ONLINE")
        self.assertEqual(rm, "")

    @patch('scraper.dt')
    def test_calculate_current_strms(self, mock_dt):
        """Asserts correct dynamic determination of target term codes (STRMs)."""
        # Inject a fixed datetime payload representing May 2026.
        mock_dt.now.return_value = datetime(2026, 5, 18)
        # Execute term list determination query logic.
        strms = scraper.calculate_current_strms()
        # Verify terms map correctly to Spring 2026, Summer 2026, and Fall 2026 codes.
        self.assertEqual(strms, ["2262", "2264", "2268"])

    def test_parse_header_logic(self):
        """Verifies course titles and IDs parse cleanly from PISA H2 tags."""
        # Establish mock HTML matching standard PISA course header rows.
        html = "<h2>CSE 101 - 01 Introduction to Data Structures</h2>"
        soup = BeautifulSoup(html, "html.parser")
        data = {}
        # Parse elements via the sub-header extraction logic.
        scraper._parse_header(soup, data)
        # Ensure code, section, and clean title have mapped correctly to target variables.
        self.assertEqual(data["course_code"], "CSE 101")
        self.assertEqual(data["lecture_section"], "01")
        self.assertEqual(data["title"], "Introduction to Data Structures")

    def test_parse_meetings_logic(self):
        """Asserts structured meeting dictionaries generate correctly from HTML."""
        # Emulate standard raw schedule table layout parsed from a course page.
        html = """
        <h2>Meeting Information</h2>
        <table>
            <tr><th>Days</th><th>Times</th><th>Instructor</th></tr>
            <tr>
                <td>MWF</td>
                <td>10:40AM-11:45AM</td>
                <td>Miller, J.</td>
            </tr>
        </table>
        """
        soup = BeautifulSoup(html, "html.parser")
        data = {"lectures": []}
        # Run parsing engine to extract days, times, and instructor metrics.
        scraper._parse_meetings(soup, data)
        # Ensure meeting parameters are gathered inside target dictionaries correctly.
        self.assertEqual(len(data["lectures"]), 1)
        self.assertEqual(data["lectures"][0]["days"], "MWF")
        self.assertEqual(data["lectures"][0]["instructor"], "Miller, J.")

    def test_parse_sections_logic(self):
        """Confirms secondary discussion and lab sub-rows parse correctly."""
        # Set up a striped panel containing typical lab/discussion section criteria.
        html = """
        <h2>Associated Discussion Sections</h2>
        <div class="panel-body">
            <div class="row-striped">
                <div>#12345 DIS 01A</div>
                <div>Tu 10:00AM-11:00AM</div>
                <div>Staff</div>
                <div>Loc: ClassroomUnit 101</div>
            </div>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")
        data = {"sections": []}
        # Execute parsing logic for secondary discussion section listings.
        scraper._parse_sections(soup, data)
        # Ensure sections list details match expected attributes.
        self.assertEqual(len(data["sections"]), 1)
        self.assertEqual(data["sections"][0]["class_number"], "12345")
        self.assertEqual(data["sections"][0]["section_type"], "DIS")
        self.assertEqual(data["sections"][0]["building"], "ClassroomUnit")


class TestScraperDatabase(unittest.TestCase):
    """Validates physical database interactions using sandboxed database links."""

    def setUp(self):
        """Establishes an isolated mock DB path for SQLite integration testing."""
        # Open a secure temp file to act as the target database container.
        self.db_fd, self.db_path = tempfile.mkstemp()
        # Patch the target DB filename in the scraper module to redirect to our sandbox path.
        self.patcher = patch('scraper.DB_NAME', self.db_path)
        self.patcher.start()

    def tearDown(self):
        """Tears down sandbox resources and files after run."""
        # Terminate active mock patch hooks.
        self.patcher.stop()
        # Safely release the associated file descriptor.
        os.close(self.db_fd)
        # Delete the physical temporary database file from disk.
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_init_db(self):
        """Confirms that database initialization executes and creates the correct schema."""
        # Invoke schema creation routines.
        scraper.init_db()
        # Query generated sqlite metadata to confirm schema creation.
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Fetch names of all structural tables created in the schema.
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            # Ensure the tables are correctly initialized.
            self.assertIn("courses", tables)
            self.assertIn("lectures", tables)
            self.assertIn("sections", tables)

    def test_save_course_data(self):
        """Verifies transactional persistence of courses, lectures, and sub-sections."""
        # Set up a clean structure layout inside our database.
        scraper.init_db()
        # Establish structural course dictionary containing mock sections and parameters.
        test_data = {
            "class_number": "12345",
            "course_code": "CSE 101",
            "lecture_section": "01",
            "title": "Data Structures",
            "lectures": [
                {
                    "days": "MWF",
                    "times": "10:40AM-11:45AM",
                    "building": "Baskin Engr",
                    "room_number": "101",
                    "instructor": "Miller, J."
                }
            ],
            "sections": [
                {
                    "class_number": "12346",
                    "section_type": "DIS",
                    "section_id": "01A",
                    "days": "Tu",
                    "times": "12:00PM-01:00PM",
                    "instructor": "Staff",
                    "building": "ClassroomUnit",
                    "room_number": "101"
                }
            ]
        }

        # Initialize explicit connection block to commit transactions.
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            # Write structural data to DB tables.
            scraper.save_course_data(cursor, test_data, "2262")
            conn.commit()

            # Verify base course attributes are populated.
            cursor.execute("SELECT course_code, title FROM courses WHERE class_number = '12345'")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "CSE 101")
            self.assertEqual(row[1], "Data Structures")

            # Verify associated lectures attributes are populated.
            cursor.execute("SELECT days, times, building FROM lectures WHERE class_number = '12345'")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "MWF")
            self.assertEqual(row[2], "Baskin Engr")

            # Verify associated sections attributes are populated.
            cursor.execute("SELECT section_type, days FROM sections WHERE class_number = '12346'")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "DIS")
            self.assertEqual(row[1], "Tu")


if __name__ == "__main__":
    unittest.main()
