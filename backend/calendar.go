package main

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// VTimezone defines the America/Los_Angeles timezone rules.
// Note: We use \n here and replace it with \r\n at runtime for RFC 5545 compliance.
const VTimezone = `BEGIN:VTIMEZONE
TZID:America/Los_Angeles
X-LIC-LOCATION:America/Los_Angeles
BEGIN:DAYLIGHT
TZOFFSETFROM:-0800
TZOFFSETTO:-0700
TZNAME:PDT
DTSTART:19700308T020000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:-0700
TZOFFSETTO:-0800
TZNAME:PST
DTSTART:19701101T020000
RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU
END:STANDARD
END:VTIMEZONE
`

// splitTime separates a time string into days and times parts.
func splitTime(tStr string) (string, string) {
	// Split the meeting pattern string by a single space separating days from times.
	parts := strings.Split(tStr, " ")
	if len(parts) < 2 {
		return "", ""
	}
	return parts[0], parts[1]
}

// formatTime converts a 12-hour time string to a 24-hour ICal format.
func formatTime(t string) string {
	// Parse the string representation using 12-hour AM/PM format
	parsed, err := time.Parse("3:04PM", t)
	if err != nil {
		return "000000"
	}
	// Format to 24-hour HHMMSS as per RFC 5545 specification
	return parsed.Format("150405")
}

// parseICalTimes extracts start and end times from a range string.
func parseICalTimes(times string) (string, string) {
	// Parse the time interval separated by a hyphen (e.g., "10:40AM-11:45AM")
	rangeParts := strings.Split(times, "-")
	if len(rangeParts) < 2 {
		return "000000", "000000"
	}
	return formatTime(rangeParts[0]), formatTime(rangeParts[1])
}

// parseICalDays converts UCSC day abbreviations to ICal day codes.
func parseICalDays(days string) string {
	var res []string
	// Map shorthand days to RFC 5545 standard day strings (MO, TU, WE, TH, FR)
	if strings.Contains(days, "M") {
		res = append(res, "MO")
	}
	if strings.Contains(days, "Tu") {
		res = append(res, "TU")
	}
	if strings.Contains(days, "W") {
		res = append(res, "WE")
	}
	if strings.Contains(days, "Th") {
		res = append(res, "TH")
	}
	if strings.Contains(days, "F") {
		res = append(res, "FR")
	}
	return strings.Join(res, ",")
}

// getTermDates returns the hardcoded start and end dates for a UCSC term.
func getTermDates(term string) (string, string) {
	// Extract the academic year from the term string (e.g., "2262" maps to year 2026)
	year := "20" + term[1:3]
	suffix := term[3]
	var start, end string

	// Determine calendar limits based on the term quarter suffix
	switch suffix {
	case '0': // Winter Quarter starts in early January and ends in mid-March
		start, end = year+"0105", year+"0320"
	case '2': // Spring Quarter starts in late March and ends in mid-June
		start, end = year+"0330", year+"0612"
	case '4': // Summer Quarter starts in late June and ends in late August
		start, end = year+"0622", year+"0830"
	case '8': // Fall Quarter starts in late September and ends in mid-December
		start, end = year+"0923", year+"1215"
	default:  // Fallback default spanning the full calendar year
		start, end = year+"0101", year+"1231"
	}
	return start, end + "T235959Z"
}

// calculateFirstOccurrence finds the first date a class meets based on the term start.
func calculateFirstOccurrence(termStart, days, timeStr string) string {
	// Parse the starting baseline date of the quarter
	t, _ := time.Parse("20060102", termStart)
	dayMap := map[string]time.Weekday{
		"M":  time.Monday,
		"Tu": time.Tuesday,
		"W":  time.Wednesday,
		"Th": time.Thursday,
		"F":  time.Friday,
	}

	earliest := 7
	// Find the minimum day offset matching the scheduled weekdays
	for code, wd := range dayMap {
		if strings.Contains(days, code) {
			diff := (int(wd) - int(t.Weekday()) + 7) % 7
			if diff < earliest {
				earliest = diff
			}
		}
	}
	// Add the calculated offset to find the exact initial date
	return t.AddDate(0, 0, earliest).Format("20060102") + "T" + timeStr
}

// addEvent appends a VEVENT block to the ics builder.
func addEvent(ics *strings.Builder, course Offering, m Meeting) {
	// Split days and times (e.g., "MWF" and "10:40AM-11:45AM")
	daysPart, timesPart := splitTime(m.Time)
	if timesPart == "" {
		return
	}

	// Format times and map day codes
	startT, endT := parseICalTimes(timesPart)
	byDay := parseICalDays(daysPart)
	termStart, termEnd := getTermDates(course.Term)

	// Shift DTSTART to the first occurrence of the class in the term
	dtStart := calculateFirstOccurrence(termStart, daysPart, startT)
	dtEnd := dtStart[:9] + endT

	ics.WriteString("BEGIN:VEVENT\r\n")
	// UID includes start time and day pattern to ensure absolute uniqueness
	uid := fmt.Sprintf("%s-%s-%s-%s@slugroute.ucsc.edu", course.ClassNumber, m.Type, daysPart, startT)
	ics.WriteString(fmt.Sprintf("UID:%s\r\n", uid))
	ics.WriteString(fmt.Sprintf("DTSTAMP:%s\r\n", time.Now().Format("20060102T150405Z")))
	ics.WriteString(fmt.Sprintf("DTSTART;TZID=America/Los_Angeles:%s\r\n", dtStart))
	ics.WriteString(fmt.Sprintf("DTEND;TZID=America/Los_Angeles:%s\r\n", dtEnd))
	ics.WriteString(fmt.Sprintf("RRULE:FREQ=WEEKLY;BYDAY=%s;UNTIL=%s\r\n", byDay, termEnd))
	ics.WriteString(fmt.Sprintf("SUMMARY:%s (%s)\r\n", course.CourseCode, m.Type))
	ics.WriteString(fmt.Sprintf("LOCATION:%s %s\r\n", m.Building, m.RoomNumber))
	ics.WriteString(fmt.Sprintf("DESCRIPTION:Instructor: %s\\nClass Number: %s\r\n", course.Instructor, course.ClassNumber))
	ics.WriteString("END:VEVENT\r\n")
}

// exportCalendarHandler processes the schedule into an iCalendar (.ics) format.
func exportCalendarHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var schedule []Offering
		// Unmarshal the incoming request payload representing the schedule
		if err := c.ShouldBindJSON(&schedule); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid schedule data"})
			return
		}

		var ics strings.Builder
		ics.WriteString("BEGIN:VCALENDAR\r\n")
		ics.WriteString("VERSION:2.0\r\n")
		ics.WriteString("PRODID:-//SlugRoute//Campus Map//EN\r\n")
		ics.WriteString("CALSCALE:GREGORIAN\r\n")
		ics.WriteString("METHOD:PUBLISH\r\n")

		// Inject the VTIMEZONE component, ensuring CRLF line endings
		ics.WriteString(strings.ReplaceAll(VTimezone, "\n", "\r\n"))

		// Generate calendar event representations for meetings
		for _, course := range schedule {
			for _, m := range course.Meetings {
				// Filter out classes that have placeholder times
				if m.Time == "" || strings.Contains(strings.ToUpper(m.Time), "TBA") || strings.Contains(strings.ToUpper(m.Time), "CANCELLED") {
					continue
				}

				addEvent(&ics, course, m)
			}
		}

		ics.WriteString("END:VCALENDAR\r\n")

		// Serve the formatted .ics payload back to the client
		c.Header("Content-Type", "text/calendar")
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=slugroute-schedule-%d.ics", time.Now().Year()))
		c.String(http.StatusOK, ics.String())
	}
}
