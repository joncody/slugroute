package main

import (
	"database/sql"
	"testing"

	_ "github.com/mattn/go-sqlite3"
)

// setupTestDB creates an temporary in-memory SQLite database and initializes
// the mock schemas for courses, lectures, sections, and buildings.
func setupTestDB(t *testing.T) *sql.DB {
	// Establish temporary SQLite in-memory connection
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory database: %v", err)
	}

	// Schema definitions containing courses, lectures, sections, and buildings
	schema := `
	CREATE TABLE courses (
		class_number TEXT,
		course_code TEXT,
		term TEXT,
		title TEXT,
		lecture_section TEXT,
		last_updated TEXT,
		PRIMARY KEY (class_number, term)
	);
	CREATE TABLE lectures (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		class_number TEXT,
		term TEXT,
		instructor TEXT,
		days TEXT,
		times TEXT,
		building TEXT,
		room_number TEXT
	);
	CREATE TABLE sections (
		class_number TEXT,
		term TEXT,
		parent_class_number TEXT,
		section_type TEXT,
		section_id TEXT,
		instructor TEXT,
		days TEXT,
		times TEXT,
		building TEXT,
		room_number TEXT
	);
	CREATE TABLE buildings (
		name TEXT PRIMARY KEY,
		lat REAL,
		lng REAL,
		image_url TEXT
	);`

	// Execute execution loop for DDL layout queries
	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("failed to initialize schema: %v", err)
	}

	return db
}

// TestAttachSections_Isolation asserts that discussion and lab sections are
// joined exclusively with their assigned parent lecture records.
func TestAttachSections_Isolation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Seed sections table leaving optional columns empty to test NULL safety handlers
	db.Exec("INSERT INTO sections (class_number, term, parent_class_number, section_type) VALUES (?, ?, ?, ?)", "201", "2262", "101", "LAB")

	offerings := map[string]*Offering{
		"101": {ClassNumber: "101", Meetings: []Meeting{}},
		"102": {ClassNumber: "102", Meetings: []Meeting{}},
	}

	// Invoke the linking driver
	err := attachSections(db, "2262", offerings)
	if err != nil {
		t.Errorf("attachSections failed: %v", err)
	}

	// Ensure sections are linked only to parent class number 101, leaving 102 empty
	if len(offerings["101"].Meetings) != 1 {
		t.Errorf("expected 1 meeting for 101, got %d", len(offerings["101"].Meetings))
	}
	if len(offerings["102"].Meetings) != 0 {
		t.Errorf("expected 0 meetings for 102, got %d", len(offerings["102"].Meetings))
	}
}
