"""
UCSC PISA Scraper Testing Suite
Validates dynamic term configuration generation.
"""

import sys
import os
import unittest
from datetime import datetime
from unittest.mock import patch

# Ensure correct path alignment for directory-specific imports
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import scraper


class TestScraper(unittest.TestCase):
    """Verifies baseline scraper engine logic."""

    @patch('scraper.dt')
    def test_calculate_current_strms(self, mock_dt):
        """Asserts correct dynamic determination of target term codes (STRMs)."""
        mock_dt.now.return_value = datetime(2026, 5, 18)
        strms = scraper.calculate_current_strms()
        self.assertEqual(strms, ["2262", "2264", "2268"])


if __name__ == "__main__":
    unittest.main()
