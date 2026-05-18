package main

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

// setupTestDB creates an in-memory SQLite database and initializes the schema.
func setupTestDB(t *testing.T) *sql.DB {
	db, err := sql.Open("sqlite3", ":memory:")
	if err != nil {
		t.Fatalf("failed to open in-memory database: %v", err)
	}

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

	if _, err := db.Exec(schema); err != nil {
		t.Fatalf("failed to initialize schema: %v", err)
	}

	return db
}

func TestGetTermsHandler(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	db.Exec("INSERT INTO courses (term) VALUES (?)", "2262")
	db.Exec("INSERT INTO courses (term) VALUES (?)", "2264")

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/terms", getTermsHandler(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/terms", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var terms []string
	if err := json.Unmarshal(w.Body.Bytes(), &terms); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	if len(terms) != 2 {
		t.Errorf("expected 2 terms, got %d", len(terms))
	}
}

func TestGetSuggestionsHandler(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	db.Exec("INSERT INTO courses (course_code, term) VALUES (?, ?)", "CSE 101", "2262")

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/suggest", getSuggestionsHandler(db))

	// Test valid suggestion
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/suggest?q=CSE&term=2262", nil)
	r.ServeHTTP(w, req)

	var suggestions []string
	json.Unmarshal(w.Body.Bytes(), &suggestions)

	if len(suggestions) != 1 || suggestions[0] != "CSE 101" {
		t.Errorf("expected ['CSE 101'], got %v", suggestions)
	}

	// Test query too short
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/suggest?q=C&term=2262", nil)
	r.ServeHTTP(w, req)

	json.Unmarshal(w.Body.Bytes(), &suggestions)
	if len(suggestions) != 0 {
		t.Errorf("expected empty results for short query, got %v", suggestions)
	}
}

func TestGetCourseHandler(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Seed lecture and building data
	db.Exec("INSERT INTO courses (class_number, course_code, term, title) VALUES (?, ?, ?, ?)", "10001", "CSE 120", "2262", "Computer Architecture")
	db.Exec("INSERT INTO lectures (class_number, term, instructor, days, times, building, room_number) VALUES (?, ?, ?, ?, ?, ?, ?)", "10001", "2262", "Miller", "MWF", "10:40AM-11:45AM", "Baskin Engr", "101")
	db.Exec("INSERT INTO buildings (name, lat, lng, image_url) VALUES (?, ?, ?, ?)", "BASKIN ENGR", 37.0002, -122.0630, "img.jpg")

	// Seed DIS section
	db.Exec("INSERT INTO sections (class_number, term, parent_class_number, section_type, instructor, days, times, building, room_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", "10002", "2262", "10001", "DIS", "TAs", "Tu", "12:00PM-01:00PM", "Baskin Engr", "102")

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/course/:term/:code", getCourseHandler(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/course/2262/CSE 120", nil)
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var result []Offering
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("failed to unmarshal: %v", err)
	}

	if len(result) != 1 {
		t.Fatalf("expected 1 offering, got %d", len(result))
	}

	if len(result[0].Meetings) != 2 {
		t.Errorf("expected 2 meetings (LEC + DIS), got %d", len(result[0].Meetings))
	}

	// Verify coordinate join
	if result[0].Meetings[0].Lat == 0 {
		t.Error("expected non-zero latitude from building join")
	}
}

func TestAttachSections_Isolation(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Seed 2 lectures but only 1 has a section
	// Note: We leave optional columns NULL to verify IFNULL handling in queries
	db.Exec("INSERT INTO sections (class_number, term, parent_class_number, section_type) VALUES (?, ?, ?, ?)", "201", "2262", "101", "LAB")

	offerings := map[string]*Offering{
		"101": {ClassNumber: "101", Meetings: []Meeting{}},
		"102": {ClassNumber: "102", Meetings: []Meeting{}},
	}

	err := attachSections(db, "2262", offerings)
	if err != nil {
		t.Errorf("attachSections failed: %v", err)
	}

	if len(offerings["101"].Meetings) != 1 {
		t.Errorf("expected 1 meeting for 101, got %d", len(offerings["101"].Meetings))
	}
	if len(offerings["102"].Meetings) != 0 {
		t.Errorf("expected 0 meetings for 102, got %d", len(offerings["102"].Meetings))
	}
}
