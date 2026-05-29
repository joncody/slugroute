"""
UCSC Database Migration Testing Suite
Verifies building configuration files parse accurately and migrate
into sqlite3 databases without loss of precision.
"""

import os
import sqlite3
import sys
import tempfile
import unittest
from unittest.mock import mock_open, patch

# Adjust path context to access module-level files cleanly
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import import_coords


class TestImportCoords(unittest.TestCase):
    """Verifies text extraction and coordinate translation checks."""

    def test_read_coordinates_file(self):
        """Confirms that coordinate list entries parse cleanly into data matrices."""
        # Mock file data conforming to layout standard: Name = Lat, Lng, ImagePath
        mock_content = (
            "Steven Acad = 36.997, -122.051, images/steven-acad.jpg\n"
            "Invalid Line Without Equals\n"
            "Partial Data = 36.9, -122.0\n"
        )

        with patch("builtins.open", mock_open(read_data=mock_content)):
            data = list(import_coords.read_coordinates_file("dummy.txt"))

            self.assertEqual(len(data), 2)

            # Assert complete record parsing
            self.assertEqual(data[0][0], "STEVEN ACAD")
            self.assertEqual(data[0][1], 36.997)
            self.assertEqual(data[0][2], -122.051)
            self.assertEqual(data[0][3], "images/steven-acad.jpg")

            # Assert partial record parsing (empty string image URL fallback)
            self.assertEqual(data[1][0], "PARTIAL DATA")
            self.assertEqual(data[1][3], "")


class TestImportCoordsDatabase(unittest.TestCase):
    """Validates migration schema updates inside sandboxed databases."""

    def setUp(self):
        """Establishes an isolated database link."""
        self.db_fd, self.db_path = tempfile.mkstemp()
        self.patcher = patch('import_coords.DB_PATH', self.db_path)
        self.patcher.start()

    def tearDown(self):
        """Teardown database and unlink file handles."""
        self.patcher.stop()
        os.close(self.db_fd)
        if os.path.exists(self.db_path):
            os.remove(self.db_path)

    def test_update_building_table(self):
        """Verifies schema tables rebuild and write building details correctly."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.cursor()
            building_data = [
                ("STEVEN ACAD", 36.997, -122.051, "images/steven-acad.jpg"),
                ("CLASSROOM UNIT", 36.998, -122.056, "images/classroomunit.jpg")
            ]
            import_coords.update_building_table(cursor, building_data)
            conn.commit()

            cursor.execute("SELECT name, lat, lng, image_url FROM buildings ORDER BY name")
            rows = cursor.fetchall()
            self.assertEqual(len(rows), 2)
            self.assertEqual(rows[0][0], "CLASSROOM UNIT")
            self.assertEqual(rows[0][1], 36.998)
            self.assertEqual(rows[1][0], "STEVEN ACAD")
            self.assertEqual(rows[1][3], "images/steven-acad.jpg")


if __name__ == "__main__":
    unittest.main()
