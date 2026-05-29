package main

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
)

// TestSplitTime validates that raw schedule strings are accurately split
// into separate day blocks and time ranges.
func TestSplitTime(t *testing.T) {
	days, times := splitTime("MWF 10:40AM-11:45AM")
	if days != "MWF" || times != "10:40AM-11:45AM" {
		t.Errorf("expected MWF and 10:40AM-11:45AM, got %s and %s", days, times)
	}

	// Verify that placeholder statuses like TBA yield clean, empty strings.
	days, times = splitTime("TBA")
	if days != "" || times != "" {
		t.Errorf("expected empty strings, got %s and %s", days, times)
	}
}

// TestFormatTime verifies that 12-hour AM/PM schedules are formatted 
// correctly into the 24-hour HHMMSS string layout required by the iCalendar RFC 5545 specification.
func TestFormatTime(t *testing.T) {
	res := formatTime("10:40AM")
	if res != "104000" {
		t.Errorf("expected 104000, got %s", res)
	}

	res = formatTime("1:00PM")
	if res != "130000" {
		t.Errorf("expected 130000, got %s", res)
	}

	// Gracefully fall back on invalid date parser inputs.
	res = formatTime("invalid")
	if res != "000000" {
		t.Errorf("expected 000000 on parse error, got %s", res)
	}
}

// TestParseICalTimes validates that time ranges are split and parsed
// into respective 24-hour start and end segments.
func TestParseICalTimes(t *testing.T) {
	start, end := parseICalTimes("10:40AM-11:45AM")
	if start != "104000" || end != "114500" {
		t.Errorf("expected 104000 and 114500, got %s and %s", start, end)
	}

	// Fallback handling verification on bad input streams.
	start, end = parseICalTimes("invalid")
	if start != "000000" || end != "000000" {
		t.Errorf("expected zeroes on parse error, got %s and %s", start, end)
	}
}

// TestParseICalDays verifies conversion of short UCSC day codes into standard 
// RFC 5545 iCalendar weekday arrays.
func TestParseICalDays(t *testing.T) {
	days := parseICalDays("M")
	if days != "MO" {
		t.Errorf("expected MO, got %s", days)
	}

	days = parseICalDays("MWF")
	if days != "MO,WE,FR" {
		t.Errorf("expected MO,WE,FR, got %s", days)
	}

	days = parseICalDays("TuTh")
	if days != "TU,TH" {
		t.Errorf("expected TU,TH, got %s", days)
	}
}

// TestGetTermDates verifies that term boundaries yield accurate starting dates 
// and trailing Z timezone flags for Winter, Spring, Summer, and Fall quarters.
func TestGetTermDates(t *testing.T) {
	// Winter Quarter
	start, end := getTermDates("2260")
	if start != "20260105" || end != "20260320T235959Z" {
		t.Errorf("Winter error: got %s and %s", start, end)
	}

	// Spring Quarter
	start, end = getTermDates("2262")
	if start != "20260330" || end != "20260612T235959Z" {
		t.Errorf("Spring error: got %s and %s", start, end)
	}

	// Default Fallback
	start, end = getTermDates("2269")
	if start != "20260101" || end != "20261231T235959Z" {
		t.Errorf("Default error: got %s and %s", start, end)
	}
}

// TestCalculateFirstOccurrence asserts that the starting date of a course meets
// the correct chronological offset from the start of the quarter.
func TestCalculateFirstOccurrence(t *testing.T) {
	// Let 2026-03-30 act as the baseline (Monday)
	// If a class meets on Wednesdays, its first date should be 2026-04-01
	first := calculateFirstOccurrence("20260330", "W", "104000")
	if first != "20260401T104000" {
		t.Errorf("expected 20260401T104000, got %s", first)
	}

	// If a class meets on Tuesdays, its first date should be 2026-03-31
	first = calculateFirstOccurrence("20260330", "Tu", "104000")
	if first != "20260331T104000" {
		t.Errorf("expected 20260331T104000, got %s", first)
	}
}

// TestExportCalendarHandler simulates HTTP communication with the Gin server,
// ensuring schedule arrays convert cleanly into downloadable .ics files.
func TestExportCalendarHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/api/schedule/export", exportCalendarHandler())

	schedule := []Offering{
		{
			ClassNumber: "10001",
			CourseCode:  "CSE 120",
			Term:        "2262",
			Title:       "Computer Architecture",
			Instructor:  "Miller",
			Meetings: []Meeting{
				{
					Type:       "LEC",
					Building:   "Baskin Engr",
					RoomNumber: "101",
					Time:       "MWF 10:40AM-11:45AM",
					Instructor: "Miller",
				},
			},
		},
	}

	body, _ := json.Marshal(schedule)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("POST", "/api/schedule/export", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected status 200, got %d", w.Code)
	}

	contentType := w.Header().Get("Content-Type")
	if contentType != "text/calendar" {
		t.Errorf("expected Content-Type text/calendar, got %s", contentType)
	}

	bodyStr := w.Body.String()
	if !strings.Contains(bodyStr, "BEGIN:VCALENDAR") || !strings.Contains(bodyStr, "END:VCALENDAR") {
		t.Errorf("invalid calendar response structure")
	}

	if !strings.Contains(bodyStr, "SUMMARY:CSE 120 (LEC)") {
		t.Errorf("missing SUMMARY in calendar response")
	}
}
