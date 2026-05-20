package utils

import (
	"fmt"
	"io"
	"strings"
	"time"
)

// Event maps individual class meetings to an RFC 5545 structural blueprint
type Event struct {
	UID         string
	Summary     string
	Location    string
	Description string
	DTStart     time.Time
	DTEnd       time.Time
	RRule       string
	ExDates     []time.Time
}

// TermConfig holds the quarterly operational calendar parameters for UCSC
type TermConfig struct {
	InstructionStart time.Time
	InstructionEnd   time.Time
	Holidays         []time.Time
}

// MapDaysToICal parses shorthand days (e.g., "MWF") into iCalendar rules
func MapDaysToICal(dayStr string) (string, []time.Weekday) {
	var days []string
	var weekdays []time.Weekday

	if strings.Contains(dayStr, "M") {
		days = append(days, "MO")
		weekdays = append(weekdays, time.Monday)
	}
	if strings.Contains(dayStr, "Tu") || (!strings.Contains(dayStr, "Th") && strings.Contains(dayStr, "T")) {
		days = append(days, "TU")
		weekdays = append(weekdays, time.Tuesday)
	}
	if strings.Contains(dayStr, "W") {
		days = append(days, "WE")
		weekdays = append(weekdays, time.Wednesday)
	}
	if strings.Contains(dayStr, "Th") {
		days = append(days, "TH")
		weekdays = append(weekdays, time.Thursday)
	}
	if strings.Contains(dayStr, "F") {
		days = append(days, "FR")
		weekdays = append(weekdays, time.Friday)
	}

	return strings.Join(days, ","), weekdays
}

// ParseTimeRange splits single time range strings safely
func ParseTimeRange(timeStr string) (string, string, error) {
	parts := strings.Split(timeStr, "-")
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid time range layout")
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]), nil
}

// MarshalICS streams the parsed data blocks using strict line ending rules (\r\n)
func MarshalICS(w io.Writer, events []Event) error {
	var sb strings.Builder
	sb.WriteString("BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SlugRoute//UCSC//EN\r\nCALSCALE:GREGORIAN\r\n")

	nowStr := time.Now().UTC().Format("20060102T150405Z")

	for _, ev := range events {
		sb.WriteString("BEGIN:VEVENT\r\n")
		sb.WriteString(fmt.Sprintf("UID:%s\r\n", ev.UID))
		sb.WriteString(fmt.Sprintf("DTSTAMP:%s\r\n", nowStr))
		sb.WriteString(fmt.Sprintf("DTSTART:%s\r\n", ev.DTStart.UTC().Format("20060102T150405Z")))
		sb.WriteString(fmt.Sprintf("DTEND:%s\r\n", ev.DTEnd.UTC().Format("20060102T150405Z")))
		sb.WriteString(fmt.Sprintf("SUMMARY:%s\r\n", ev.Summary))
		sb.WriteString(fmt.Sprintf("LOCATION:%s\r\n", ev.Location))
		sb.WriteString(fmt.Sprintf("DESCRIPTION:%s\r\n", ev.Description))

		if ev.RRule != "" {
			sb.WriteString(fmt.Sprintf("RRULE:%s\r\n", ev.RRule))
		}
		if len(ev.ExDates) > 0 {
			var exStrs []string
			for _, ex := range ev.ExDates {
				exStrs = append(exStrs, ex.Format("20060102"))
			}
			sb.WriteString(fmt.Sprintf("EXDATE;VALUE=DATE:%s\r\n", strings.Join(exStrs, ",")))
		}
		sb.WriteString("END:VEVENT\r\n")
	}
	sb.WriteString("END:VCALENDAR\r\n")
	_, err := w.Write([]byte(sb.String()))
	return err
}
