import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime
import os
import sys
from bs4 import BeautifulSoup

# Ensure the current directory is in path for imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import scraper

class TestScraper(unittest.TestCase):

    def test_clean_text(self):
        self.assertEqual(scraper.clean_text("  trimmed  text  "), "trimmed text")
        self.assertEqual(scraper.clean_text("Cancelled Cancelled"), "Cancelled")
        self.assertEqual(scraper.clean_text(None), "")

    def test_split_days_times(self):
        days, times = scraper.split_days_times("MWF 10:40AM-11:45AM")
        self.assertEqual(days, "MWF")
        self.assertEqual(times, "10:40AM-11:45AM")

        days, times = scraper.split_days_times("TBA")
        self.assertEqual(days, "TBA")
        self.assertEqual(times, "")

    def test_split_location(self):
        bld, rm = scraper.split_location("ClassroomUnit 101")
        self.assertEqual(bld, "ClassroomUnit")
        self.assertEqual(rm, "101")

        bld, rm = scraper.split_location("J Baskin Engr 101")
        self.assertEqual(bld, "J Baskin Engr")
        self.assertEqual(rm, "101")

        bld, rm = scraper.split_location("ONLINE")
        self.assertEqual(bld, "ONLINE")
        self.assertEqual(rm, "")

    @patch('scraper.dt')
    def test_calculate_current_strms(self, mock_dt):
        mock_dt.now.return_value = datetime(2026, 5, 18)
        strms = scraper.calculate_current_strms()
        self.assertEqual(strms, ["2262", "2264", "2268"])

    def test_parse_header_logic(self):
        html = "<h2>CSE 101 - 01 Introduction to Data Structures</h2>"
        soup = BeautifulSoup(html, "html.parser")
        data = {}
        scraper._parse_header(soup, data)
        self.assertEqual(data["course_code"], "CSE 101")
        self.assertEqual(data["lecture_section"], "01")
        self.assertEqual(data["title"], "Introduction to Data Structures")

    def test_parse_meetings_logic(self):
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
        scraper._parse_meetings(soup, data)
        self.assertEqual(len(data["lectures"]), 1)
        self.assertEqual(data["lectures"][0]["days"], "MWF")
        self.assertEqual(data["lectures"][0]["instructor"], "Miller, J.")

    def test_parse_sections_logic(self):
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
        scraper._parse_sections(soup, data)
        self.assertEqual(len(data["sections"]), 1)
        self.assertEqual(data["sections"][0]["class_number"], "12345")
        self.assertEqual(data["sections"][0]["section_type"], "DIS")
        self.assertEqual(data["sections"][0]["building"], "ClassroomUnit")

if __name__ == "__main__":
    unittest.main()
