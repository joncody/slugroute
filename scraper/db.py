"""
UCSC PISA Scraper Database Operations
Handles database initialization, schema creation, and transaction operations.
"""

import logging
import sqlite3
from datetime import datetime as dt

import config


def init_db(db_name=None):
    """Creates the SQLite schema."""
    if db_name is None:
        db_name = config.DB_NAME

    with sqlite3.connect(db_name) as conn:
        cursor = conn.cursor()

        # The primary schedule registry indexed by class number and term
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS courses (
                class_number TEXT,
                term TEXT,
                course_code TEXT,
                lecture_section TEXT,
                title TEXT,
                last_updated TEXT,
                PRIMARY KEY (class_number, term)
            )""")

        # Storage for primary lecture events
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS lectures (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                class_number TEXT,
                term TEXT,
                instructor TEXT,
                days TEXT,
                times TEXT,
                building TEXT,
                room_number TEXT,
                FOREIGN KEY (class_number, term) REFERENCES courses (class_number, term)
            )""")

        # Storage for linked sections (Labs and Discussions) referencing parent lectures
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS sections (
                class_number TEXT,
                term TEXT,
                parent_class_number TEXT,
                section_type TEXT,
                section_id TEXT,
                instructor TEXT,
                days TEXT,
                times TEXT,
                building TEXT,
                room_number TEXT,
                PRIMARY KEY (class_number, term)
            )""")

        conn.commit()


def save_course_data(cursor, data, term):
    """Inserts scraped course dictionary into the database."""
    timestamp = dt.now().isoformat()

    # Save central course metadata
    cursor.execute("""
        INSERT OR REPLACE INTO courses VALUES (?, ?, ?, ?, ?, ?)
    """, (
        data['class_number'],
        term,
        data['course_code'],
        data['lecture_section'],
        data['title'],
        timestamp
    ))

    # Erase obsolete lecture entries for this course to avoid stale schedule remnants
    cursor.execute(
        "DELETE FROM lectures WHERE class_number = ? AND term = ?",
        (data['class_number'], term)
    )

    # Insert individual lecture schedule items
    for lec in data['lectures']:
        cursor.execute("""
            INSERT INTO lectures (
                class_number, term, instructor, days, times, building, room_number
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            data['class_number'],
            term,
            lec['instructor'],
            lec['days'],
            lec['times'],
            lec['building'],
            lec['room_number']
        ))

    # Save associated secondary sections
    for sec in data['sections']:
        cursor.execute("""
            INSERT OR REPLACE INTO sections VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            sec['class_number'],
            term,
            data['class_number'],
            sec['section_type'],
            sec['section_id'],
            sec['instructor'],
            sec['days'],
            sec['times'],
            sec['building'],
            sec['room_number']
        ))
