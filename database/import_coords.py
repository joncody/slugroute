"""
SlugRoute Building Migration Utility
Processes building coordinate text files and populates the database.
"""

import logging
import sqlite3

# Global Configuration
DB_PATH = "./slugroute.db"
COORDS_FILE = "./coords.txt"


def read_coordinates_file(file_path):
    """
    Parses the raw text file and yields cleaned coordinate tuples.
    Expected format: Name = Lat, Lng, ImagePath
    """
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                if '=' not in line:
                    continue

                name, data = line.split('=')
                parts = data.split(',')

                if len(parts) < 2:
                    continue

                lat = float(parts[0].strip())
                lng = float(parts[1].strip())
                img_url = parts[2].strip() if len(parts) > 2 else ""

                # Force uppercase for normalization as per requirements
                clean_name = name.strip().upper()

                yield (clean_name, lat, lng, img_url)

    except FileNotFoundError:
        logging.error(f"Migration failed: {file_path} not found.")


def update_building_table(cursor, building_data):
    """Executes the table reset and bulk insertion of building data."""
    # Drop and recreate to ensure clean uppercase names and correct schema
    cursor.execute("DROP TABLE IF EXISTS buildings")
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

    cursor.executemany(
        "INSERT OR REPLACE INTO buildings VALUES (?, ?, ?, ?)",
        building_data
    )


def migrate():
    """
    Main orchestration for building data migration.
    Includes image_url paths for the frontend display.
    """
    try:
        with sqlite3.connect(DB_PATH) as conn:
            cursor = conn.cursor()

            building_data = list(read_coordinates_file(COORDS_FILE))
            if not building_data:
                logging.warning("No data found to migrate.")
                return

            update_building_table(cursor, building_data)
            conn.commit()
            logging.info("Coordinates and image paths imported successfully.")

    except sqlite3.Error as err:
        logging.error(f"Database error during migration: {err}")
    except Exception as exc:
        logging.error(f"An unexpected error occurred: {exc}")


if __name__ == "__main__":
    # Configure logging for the utility script
    logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
    migrate()
