import unittest
from unittest.mock import patch, mock_open
import sys
import os

# Adjust path to import from database directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import import_coords

class TestImportCoords(unittest.TestCase):

    def test_read_coordinates_file(self):
        # Mock content matching the format: Name = Lat, Lng, ImagePath
        mock_content = (
            "Steven Acad = 36.997, -122.051, images/steven-acad.jpg\n"
            "Invalid Line Without Equals\n"
            "Partial Data = 36.9, -122.0\n"
        )

        with patch("builtins.open", mock_open(read_data=mock_content)):
            data = list(import_coords.read_coordinates_file("dummy.txt"))

            self.assertEqual(len(data), 2)

            # Record 1: Full data
            self.assertEqual(data[0][0], "STEVEN ACAD")
            self.assertEqual(data[0][1], 36.997)
            self.assertEqual(data[0][2], -122.051)
            self.assertEqual(data[0][3], "images/steven-acad.jpg")

            # Record 2: Partial data (default image_url)
            self.assertEqual(data[1][0], "PARTIAL DATA")
            self.assertEqual(data[1][3], "")

if __name__ == "__main__":
    unittest.main()
