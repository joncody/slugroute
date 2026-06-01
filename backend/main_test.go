package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

// errReader is a mock io.Reader that always returns an error on Read,
// allowing us to test handler behavior when request bodies are unreadable.
type errReader struct{}

func (errReader) Read(p []byte) (n int, err error) {
	return 0, errors.New("mock read error")
}

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

// TestGetTermsHandler verifies that getTermsHandler queries the database and
// returns a sorted, unique list of active quarter terms.
func TestGetTermsHandler(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Seed multiple distinct academic term records
	db.Exec("INSERT INTO courses (term) VALUES (?)", "2262")
	db.Exec("INSERT INTO courses (term) VALUES (?)", "2264")

	// Set test mode on Gin router instance
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/terms", getTermsHandler(db))

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/terms", nil)
	r.ServeHTTP(w, req)

	// Validate HTTP OK status code response
	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	var terms []string
	if err := json.Unmarshal(w.Body.Bytes(), &terms); err != nil {
		t.Fatalf("failed to unmarshal response: %v", err)
	}

	// Validate result length limits
	if len(terms) != 2 {
		t.Errorf("expected 2 terms, got %d", len(terms))
	}
}

// TestGetSuggestionsHandler validates that course code autocomplete searches
// return matched results and enforce a minimum character limit.
func TestGetSuggestionsHandler(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Seed course suggestion payload row
	db.Exec("INSERT INTO courses (course_code, term) VALUES (?, ?)", "CSE 101", "2262")

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/api/suggest", getSuggestionsHandler(db))

	// Test case: valid query search parameter
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/suggest?q=CSE&term=2262", nil)
	r.ServeHTTP(w, req)

	var suggestions []string
	json.Unmarshal(w.Body.Bytes(), &suggestions)

	// Validate that matched course matches original seeded suggestion
	if len(suggestions) != 1 || suggestions[0] != "CSE 101" {
		t.Errorf("expected ['CSE 101'], got %v", suggestions)
	}

	// Test case: search query too short (character limit check)
	w = httptest.NewRecorder()
	req, _ = http.NewRequest("GET", "/api/suggest?q=C&term=2262", nil)
	r.ServeHTTP(w, req)

	json.Unmarshal(w.Body.Bytes(), &suggestions)
	// Confirm that searches below length 2 produce zero records
	if len(suggestions) != 0 {
		t.Errorf("expected empty results for short query, got %v", suggestions)
	}
}

// TestGetCourseHandler verifies that course lookup queries join lecture times,
// locations, instructor details, and related discussion sections correctly.
func TestGetCourseHandler(t *testing.T) {
	db := setupTestDB(t)
	defer db.Close()

	// Seed mock lecture and building parameters
	db.Exec("INSERT INTO courses (class_number, course_code, term, title) VALUES (?, ?, ?, ?)", "10001", "CSE 120", "2262", "Computer Architecture")
	db.Exec("INSERT INTO lectures (class_number, term, instructor, days, times, building, room_number) VALUES (?, ?, ?, ?, ?, ?, ?)", "10001", "2262", "Miller", "MWF", "10:40AM-11:45AM", "Baskin Engr", "101")
	db.Exec("INSERT INTO buildings (name, lat, lng, image_url) VALUES (?, ?, ?, ?)", "BASKIN ENGR", 37.0002, -122.0630, "img.jpg")

	// Seed associated discussion section
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

	// Validate mapping length checks
	if len(result) != 1 {
		t.Fatalf("expected 1 offering, got %d", len(result))
	}

	// Check that the list includes both the primary lecture and secondary discussion section
	if len(result[0].Meetings) != 2 {
		t.Errorf("expected 2 meetings (LEC + DIS), got %d", len(result[0].Meetings))
	}

	// Confirm relational coordinate mapping checks
	if result[0].Meetings[0].Lat == 0 {
		t.Error("expected non-zero latitude from building join")
	}
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

// TestGetRoutesProxyHandler_MissingKey asserts that the proxy endpoint rejects
// routing navigation requests with a 500 status code if the Google API key environment is missing.
func TestGetRoutesProxyHandler_MissingKey(t *testing.T) {
	// Temporarily backup and clear the environment API key
	origKey := os.Getenv("GOOGLE_MAPS_API_KEY")
	os.Setenv("GOOGLE_MAPS_API_KEY", "")
	defer os.Setenv("GOOGLE_MAPS_API_KEY", origKey)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/routes-proxy", getRoutesProxyHandler())

	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/routes-proxy", strings.NewReader(`{}`))
	r.ServeHTTP(w, req)

	// Validate status matches 500 on missing authorization environment parameters
	if w.Code != http.StatusInternalServerError {
		t.Errorf("expected 500 Internal Server Error when API key is missing, got %d", w.Code)
	}
}

// TestGetRoutesProxyHandler_InvalidBody verifies that the proxy endpoint handles
// unreadable or corrupt request bodies gracefully by returning a 400 Bad Request.
func TestGetRoutesProxyHandler_InvalidBody(t *testing.T) {
	// Set dummy key to satisfy the initialization checks
	origKey := os.Getenv("GOOGLE_MAPS_API_KEY")
	os.Setenv("GOOGLE_MAPS_API_KEY", "dummy_key")
	defer os.Setenv("GOOGLE_MAPS_API_KEY", origKey)

	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/routes-proxy", getRoutesProxyHandler())

	w := httptest.NewRecorder()
	// Pass our custom errReader to trigger an io.ReadAll read error
	req, _ := http.NewRequest("POST", "/api/routes-proxy", errReader{})
	r.ServeHTTP(w, req)

	// Ensure that unreadable payloads map directly to a 400 Bad Request error
	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 Bad Request for unreadable body, got %d", w.Code)
	}
}
