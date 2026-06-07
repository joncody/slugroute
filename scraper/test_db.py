"""
UCSC PISA Scraper Database Testing Suite
Validates SQLite database initialization and storage migration routines.
"""

import sys
import os
import sqlite3
import tempfile
import unittest

# Ensure correct path alignment for directory-specific imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import db


class TestDatabase(unittest.TestCase):
    """Validates physical database interactions using sandboxed database links."""

    def setUp(self):
        """Establishes an isolated DB path for SQLite integration testing."""
        self.db_fd, self.db_path = tempfile.mkstemp()

    def tearDown(self):
        """Tears down sandbox resources and files after run."""
        os.close(self.db_fd)
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_init_db(self):
        """Confirms that database initialization executes and creates the correct schema."""
        db.init_db(self.db_path)
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
            tables = [row[0] for row in cursor.fetchall()]
            self.assertIn("courses", tables)
            self.assertIn("lectures", tables)
            self.assertIn("sections", tables)

    def test_save_course_data(self):
        """Verifies transactional persistence of courses, lectures, and sub-sections."""
        db.init_db(self.db_path)
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

        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            db.save_course_data(cursor, test_data, "2262")
            conn.commit()

            cursor.execute("SELECT course_code, title FROM courses WHERE class_number = '12345'")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "CSE 101")
            self.assertEqual(row[1], "Data Structures")

            cursor.execute("SELECT days, times, building FROM lectures WHERE class_number = '12345'")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "MWF")
            self.assertEqual(row[2], "Baskin Engr")

            cursor.execute("SELECT section_type, days FROM sections WHERE class_number = '12346'")
            row = cursor.fetchone()
            self.assertIsNotNone(row)
            self.assertEqual(row[0], "DIS")
            self.assertEqual(row[1], "Tu")


if __name__ == "__main__":
    unittest.main()
