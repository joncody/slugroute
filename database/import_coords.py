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
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()

        # Drop and recreate to ensure clean uppercase names
        cursor.execute("DROP TABLE IF EXISTS buildings")
        cursor.execute(
            "CREATE TABLE buildings (name TEXT PRIMARY KEY, lat REAL, lng REAL)"
        )

        with open(COORDS_FILE, 'r', encoding='utf-8') as f:
            for line in f:
                # No one-liner if blocks
                if '=' not in line:
                    continue

                name, coords = line.split('=')
                lat, lng = coords.split(',')

                # Force uppercase for normalization
                clean_name = name.strip().upper()

                cursor.execute(
                    "INSERT OR REPLACE INTO buildings VALUES (?, ?, ?)",
                    (clean_name, float(lat.strip()), float(lng.strip()))
                )

        conn.commit()
        conn.close()
        logging.info("Coordinates imported successfully in UPPERCASE.")

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
