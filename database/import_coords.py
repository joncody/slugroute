"""
SlugRoute Building Migration Utility
Processes building coordinate text files and populates the database.
"""

import logging
import sqlite3

# Global Configuration
DB_PATH = "./slugroute.db"
COORDS_FILE = "./bulding-coordinates.txt"


def migrate():
    """
    Reads building coordinates from a text file and imports them into SQLite.
    Forces building names to uppercase to ensure robust JOIN operations.
    Includes image_url paths for the frontend display.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Drop and recreate to ensure clean uppercase names and correct schema
        cursor.execute("DROP TABLE IF EXISTS buildings")

        # Schema matching Go struct and dataset requirements
        cursor.execute(
            """
            CREATE TABLE buildings (
                name TEXT PRIMARY KEY,
                lat REAL,
                lng REAL,
                image_url TEXT
            )
            """
        )

        with open(COORDS_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                # No one-liner if blocks per style guide
                if '=' not in line:
                    continue

                # Expected format: Name = Lat, Lng, ImagePath
                name, data = line.split('=')
                parts = data.split(',')

                if len(parts) < 2:
                    continue

                lat = parts[0].strip()
                lng = parts[1].strip()

                # Handle optional image_url if present in text file
                img_url = ""
                if len(parts) > 2:
                    img_url = parts[2].strip()

                # Force uppercase for normalization
                clean_name = name.strip().upper()

                cursor.execute(
                    "INSERT OR REPLACE INTO buildings VALUES (?, ?, ?, ?)",
                    (
                        clean_name,
                        float(lat),
                        float(lng),
                        img_url
                    )
                )

        conn.commit()
        conn.close()
        logging.info("Coordinates and image paths imported successfully.")

    except FileNotFoundError:
        logging.error(f"Migration failed: {COORDS_FILE} not found.")
    except sqlite3.Error as err:
        logging.error(f"Database error during migration: {err}")
    except Exception as exc:
        logging.error(f"An unexpected error occurred: {exc}")


if __name__ == "__main__":
    # Configure logging for the utility script
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    migrate()
