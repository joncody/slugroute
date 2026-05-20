package main

import (
	"bytes"
	"crypto/md5"
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"

	"slugroute/utils"
)

const (
	queryFetchOfferings = `
		SELECT 
			c.class_number, c.course_code, c.term, c.title, 
			IFNULL(l.instructor, ''), IFNULL(l.days, ''), IFNULL(l.times, ''), IFNULL(l.building, ''), IFNULL(l.room_number, ''), 
			IFNULL(b.lat, 0), IFNULL(b.lng, 0), IFNULL(b.image_url, '')
		FROM courses c
		JOIN lectures l ON c.class_number = l.class_number AND c.term = l.term
		LEFT JOIN buildings b ON UPPER(TRIM(l.building)) = UPPER(TRIM(b.name))
		WHERE (UPPER(c.course_code) = UPPER(?) OR UPPER(REPLACE(c.course_code, ' ', '')) = UPPER(REPLACE(?, ' ', ''))) 
		AND c.term = ?`

	queryAttachSections = `
		SELECT 
			IFNULL(s.section_type, ''), IFNULL(s.instructor, ''), IFNULL(s.days, ''), IFNULL(s.times, ''), IFNULL(s.building, ''), IFNULL(s.room_number, ''),
			IFNULL(b.lat, 0), IFNULL(b.lng, 0), IFNULL(b.image_url, '')
		FROM sections s
		LEFT JOIN buildings b ON UPPER(TRIM(s.building)) = UPPER(TRIM(b.name))
		WHERE s.parent_class_number = ? AND s.term = ?`
)

// Meeting represents a single time/location instance for a class.
type Meeting struct {
	Type       string  `json:"type"`
	Building   string  `json:"building"`
	RoomNumber string  `json:"room_number"`
	Time       string  `json:"time"`
	Instructor string  `json:"instructor"`
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
	ImageURL   string  `json:"image_url"`
}

// Offering represents a unique class (lecture) and its associated sections.
type Offering struct {
	ClassNumber string    `json:"class_number"`
	CourseCode  string    `json:"course_code"`
	Term        string    `json:"term"`
	Title       string    `json:"title"`
	Instructor  string    `json:"instructor"`
	Meetings    []Meeting `json:"meetings"`
}

// scanMeeting is a helper to populate a Meeting struct from a row scan.
func scanMeeting(rows *sql.Rows, mType string) (Meeting, error) {
	var inst, days, times, bld, rm, imageURL string
	var lat, lng float64

	err := rows.Scan(&inst, &days, &times, &bld, &rm, &lat, &lng, &imageURL)
	if err != nil {
		return Meeting{}, err
	}

	return Meeting{
		Type:       mType,
		Building:   bld,
		RoomNumber: rm,
		Time:       fmt.Sprintf("%s %s", days, times),
		Instructor: inst,
		Lat:        lat,
		Lng:        lng,
		ImageURL:   imageURL,
	}, nil
}

// fetchOfferings queries the DB for main lecture data and joins building coordinates.
func fetchOfferings(db *sql.DB, term, code string) (map[string]*Offering, error) {
	rows, err := db.Query(queryFetchOfferings, code, code, term)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	offeringsMap := make(map[string]*Offering)

	for rows.Next() {
		var cn, cc, cterm, title, inst, days, times, bld, rm, imageURL string
		var lat, lng float64

		err := rows.Scan(
			&cn, &cc, &cterm, &title, &inst, &days, &times, &bld, &rm, &lat, &lng, &imageURL,
		)
		if err != nil {
			return nil, err
		}

		if _, ok := offeringsMap[cn]; !ok {
			offeringsMap[cn] = &Offering{
				ClassNumber: cn,
				CourseCode:  cc,
				Term:        cterm,
				Title:       title,
				Instructor:  inst,
				Meetings:    []Meeting{},
			}
		}

		offeringsMap[cn].Meetings = append(offeringsMap[cn].Meetings, Meeting{
			Type:       "LEC",
			Building:   bld,
			RoomNumber: rm,
			Time:       fmt.Sprintf("%s %s", days, times),
			Instructor: inst,
			Lat:        lat,
			Lng:        lng,
			ImageURL:   imageURL,
		})
	}
	return offeringsMap, nil
}

// attachSections fetches DIS/LAB sections linked to the parent lecture.
func attachSections(db *sql.DB, term string, offerings map[string]*Offering) error {
	for cn, offering := range offerings {
		secRows, err := db.Query(queryAttachSections, cn, term)
		if err != nil {
			return err
		}

		for secRows.Next() {
			var st, si, sd, stm, bld, rm, imageURL string
			var lat, lng float64

			err := secRows.Scan(&st, &si, &sd, &stm, &bld, &rm, &lat, &lng, &imageURL)
			if err != nil {
				secRows.Close()
				return err
			}

			offering.Meetings = append(offering.Meetings, Meeting{
				Type:       st,
				Building:   bld,
				RoomNumber: rm,
				Time:       fmt.Sprintf("%s %s", sd, stm),
				Instructor: si,
				Lat:        lat,
				Lng:        lng,
				ImageURL:   imageURL,
			})
		}
		secRows.Close()
	}
	return nil
}

// getCourseHandler handles the /api/course/:term/:code route.
func getCourseHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		term := c.Param("term")
		code := c.Param("code")

		offeringsMap, err := fetchOfferings(db, term, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch lectures",
			})
			return
		}

		if err := attachSections(db, term, offeringsMap); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch sections",
			})
			return
		}

		result := make([]Offering, 0, len(offeringsMap))
		for _, v := range offeringsMap {
			result = append(result, *v)
		}
		c.JSON(http.StatusOK, result)
	}
}

// getTermsHandler returns a sorted list of unique terms.
func getTermsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		query := `SELECT DISTINCT term FROM courses ORDER BY term DESC`
		rows, err := db.Query(query)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to query terms",
			})
			return
		}
		defer rows.Close()

		var terms []string
		for rows.Next() {
			var t string
			if err := rows.Scan(&t); err != nil {
				continue
			}
			terms = append(terms, t)
		}
		c.JSON(http.StatusOK, terms)
	}
}

// getSuggestionsHandler provides autocomplete suggestions for course codes.
func getSuggestionsHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		q := c.Query("q")
		term := c.Query("term")

		if len(q) < 2 {
			c.JSON(http.StatusOK, []string{})
			return
		}

		query := `
			SELECT DISTINCT course_code 
			FROM courses 
			WHERE (UPPER(course_code) LIKE UPPER(?) OR UPPER(REPLACE(course_code, ' ', '')) LIKE UPPER(?))
			AND term = ?
			LIMIT 8`

		likeQuery := q + "%"
		rows, err := db.Query(query, likeQuery, likeQuery, term)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Suggestion query failed",
			})
			return
		}
		defer rows.Close()

		var suggestions []string
		for rows.Next() {
			var s string
			if err := rows.Scan(&s); err != nil {
				continue
			}
			suggestions = append(suggestions, s)
		}
		c.JSON(http.StatusOK, suggestions)
	}
}

func exportCalendarHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		var selectedSchedule []Offering
		if err := c.ShouldBindJSON(&selectedSchedule); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid schedule payload"})
			return
		}

		loc, _ := time.LoadLocation("America/Los_Angeles")

		// Map term configurations using the utils struct namespace
		config := utils.TermConfig{
			InstructionStart: time.Date(2026, 9, 24, 0, 0, 0, 0, loc),
			InstructionEnd:   time.Date(2026, 12, 4, 0, 0, 0, 0, loc),
			Holidays: []time.Time{
				time.Date(2026, 11, 11, 0, 0, 0, 0, loc),
				time.Date(2026, 11, 26, 0, 0, 0, 0, loc),
				time.Date(2026, 11, 27, 0, 0, 0, 0, loc),
			},
		}

		var icalEvents []utils.Event // <-- Notice the utils namespace prefix

		for _, off := range selectedSchedule {
			for _, meet := range off.Meetings {
				timeTokens := strings.SplitN(meet.Time, " ", 2)
				if len(timeTokens) < 2 {
					continue
				}

				dayPart := timeTokens[0]
				rangePart := timeTokens[1]

				// Use utils prefix to execute parsing operations
				rruleDays, validWeekdays := utils.MapDaysToICal(dayPart)
				if rruleDays == "" {
					continue
				}

				startStr, endStr, err := utils.ParseTimeRange(rangePart)
				if err != nil {
					continue
				}

				pStart, _ := time.Parse("3:04 PM", startStr)
				pEnd, _ := time.Parse("3:04 PM", endStr)

				var firstClassStart time.Time
				foundFirst := false
				for d := config.InstructionStart; d.Before(config.InstructionEnd.AddDate(0, 0, 1)); d = d.AddDate(0, 0, 1) {
					for _, wd := range validWeekdays {
						if d.Weekday() == wd {
							firstClassStart = time.Date(d.Year(), d.Month(), d.Day(), pStart.Hour(), pStart.Minute(), 0, 0, loc)
							foundFirst = true
							break
						}
					}
					if foundFirst {
						break
					}
				}

				firstClassEnd := time.Date(firstClassStart.Year(), firstClassStart.Month(), firstClassStart.Day(), pEnd.Hour(), pEnd.Minute(), 0, 0, loc)
				untilStr := config.InstructionEnd.UTC().Format("20060102T235959Z")

				uidData := fmt.Sprintf("%s-%s-%s", off.ClassNumber, meet.Type, meet.Time)
				uid := fmt.Sprintf("%x@slugroute.ucsc.edu", md5.Sum([]byte(uidData)))

				icalEvents = append(icalEvents, utils.Event{
					UID:         uid,
					Summary:     fmt.Sprintf("%s (%s)", off.CourseCode, meet.Type),
					Location:    fmt.Sprintf("%s, Room %s", meet.Building, meet.RoomNumber),
					Description: fmt.Sprintf("Instructor: %s\nClass Number: %s", meet.Instructor, off.ClassNumber),
					DTStart:     firstClassStart,
					DTEnd:       firstClassEnd,
					RRule:       fmt.Sprintf("FREQ=WEEKLY;BYDAY=%s;UNTIL=%s", rruleDays, untilStr),
					ExDates:     config.Holidays,
				})
			}
		}

		c.Header("Content-Type", "text/calendar; charset=utf-8")
		c.Header("Content-Disposition", "attachment; filename=slugroute-schedule.ics")
		c.Status(http.StatusOK)

		// Direct streaming call output using the utils framework reference
		if err := utils.MarshalICS(c.Writer, icalEvents); err != nil {
			log.Println("Error generating calendar stream output:", err)
		}
	}
}

// getRoutesProxyHandler proxies navigation requests to Google Routes API v2.
func getRoutesProxyHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
		if apiKey == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Map API key not configured on server"})
			return
		}

		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
			return
		}

		req, err := http.NewRequest("POST", "https://routes.googleapis.com/directions/v2:computeRoutes", bytes.NewBuffer(body))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create proxy request"})
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Goog-Api-Key", apiKey)
		req.Header.Set("X-Goog-FieldMask", "routes.duration,routes.distanceMeters,routes.polyline,routes.legs,routes.viewport")

		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "Google API unreachable"})
			return
		}
		defer resp.Body.Close()

		respBody, _ := io.ReadAll(resp.Body)
		c.Data(resp.StatusCode, "application/json", respBody)
	}
}

func main() {
	db, err := sql.Open("sqlite3", "../database/slugroute.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	r := gin.Default()

	// Load HTML templates from the frontend folder
	r.LoadHTMLGlob("../frontend/*.html")

	// API Routes
	r.GET("/api/course/:term/:code", getCourseHandler(db))
	r.GET("/api/terms", getTermsHandler(db))
	r.GET("/api/suggest", getSuggestionsHandler(db))
	r.POST("/api/schedule/export", exportCalendarHandler())
	r.POST("/api/routes-proxy", getRoutesProxyHandler())

	// Root Route: Render index.html with injected API key
	r.GET("/", func(c *gin.Context) {
		apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
		c.HTML(http.StatusOK, "index.html", gin.H{
			"MapsKey": apiKey,
		})
	})

	// Static assets (CSS, JS, Images)
	r.StaticFile("/script.js", "../frontend/script.js")
	r.StaticFile("/style.css", "../frontend/style.css")
	r.StaticFile("/logo.png", "../frontend/logo.png")
	r.Static("/images", "../frontend/images")

	log.Println("SlugRoute live at http://localhost:8080")
	r.Run(":8080")
}
