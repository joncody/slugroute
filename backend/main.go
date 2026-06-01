package main

import (
	"bytes"
	"database/sql"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

const (
	// queryFetchOfferings fetches primary course and lecture data.
	// It joins the courses and lectures tables on class number and term.
	// A LEFT JOIN with the buildings table allows retrieval of latitude, longitude, and image URL
	// by matching building name, handling trimming and case-insensitive conversions.
	// The WHERE condition filters results by term and a case-insensitive check on course code 
	// (matching with or without spaces, e.g., 'CSE120' or 'CSE 120').
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

	// queryAttachSections retrieves section (discussion/lab) data associated with a lecture.
	// It performs a LEFT JOIN with the buildings table to acquire room coordinate and image data.
	// The search filters sections by term and parent lecture class number.
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

	// Read column data from the row iteration pointer
	err := rows.Scan(&inst, &days, &times, &bld, &rm, &lat, &lng, &imageURL)
	if err != nil {
		return Meeting{}, err
	}

	// Build and return a populated Meeting struct, stitching days and times together
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
	// Execute database query using queryFetchOfferings to retrieve core lectures
	rows, err := db.Query(queryFetchOfferings, code, code, term)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	offeringsMap := make(map[string]*Offering)

	// Scan through result rows
	for rows.Next() {
		var cn, cc, cterm, title, inst, days, times, bld, rm, imageURL string
		var lat, lng float64

		err := rows.Scan(
			&cn, &cc, &cterm, &title, &inst, &days, &times, &bld, &rm, &lat, &lng, &imageURL,
		)
		if err != nil {
			return nil, err
		}

		// Initialize key entry for the specified class number if not already present
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

		// Hydrate and insert primary lecture meeting information
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
	// Query and attach associated discussion/lab sections for each offering
	for cn, offering := range offerings {
		secRows, err := db.Query(queryAttachSections, cn, term)
		if err != nil {
			return err
		}

		// Iterate through sections row-by-row
		for secRows.Next() {
			var st, si, sd, stm, bld, rm, imageURL string
			var lat, lng float64

			err := secRows.Scan(&st, &si, &sd, &stm, &bld, &rm, &lat, &lng, &imageURL)
			if err != nil {
				secRows.Close()
				return err
			}

			// Add the newly found section meeting to parent meetings list
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
		// Extract routing parameters from context
		term := c.Param("term")
		code := c.Param("code")

		// Query primary offerings from DB
		offeringsMap, err := fetchOfferings(db, term, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "failed to fetch lectures",
			})
			return
		}

		// Query and append secondary class sections (DIS/LAB)
		if err := attachSections(db, term, offeringsMap); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "failed to fetch sections",
			})
			return
		}

		// Convert the offerings map to a list format for JSON serialization
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
		// Retrieve sorted distinct term values to present on the client interface (newest first)
		query := `SELECT DISTINCT term FROM courses ORDER BY term DESC`
		rows, err := db.Query(query)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "failed to query terms",
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

		// Restrict query processing to prefixes longer than 1 character
		if len(q) < 2 {
			c.JSON(http.StatusOK, []string{})
			return
		}

		// Search database for prefix matches on course code (case-insensitive, handling spacing offsets)
		// and constrain response output size to 8 matches maximum.
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
				"error": "suggestion query failed",
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

// getRoutesProxyHandler proxies navigation requests to Google Routes API v2.
func getRoutesProxyHandler() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Ensure system environment variable is correctly configured
		apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
		if apiKey == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "map API key not configured on server"})
			return
		}

		// Read HTTP payload content from body streams
		body, err := io.ReadAll(c.Request.Body)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
			return
		}

		// Construct routing API call targeting computeRoutes
		req, err := http.NewRequest("POST", "https://routes.googleapis.com/directions/v2:computeRoutes", bytes.NewBuffer(body))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create proxy request"})
			return
		}

		// Define transmission context properties, headers, and parameter field filters
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Goog-Api-Key", apiKey)
		req.Header.Set("X-Goog-FieldMask", "routes.duration,routes.distanceMeters,routes.polyline,routes.legs,routes.viewport")

		// Execute outbound connection payload delivery
		client := &http.Client{}
		resp, err := client.Do(req)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"error": "google API unreachable"})
			return
		}
		defer resp.Body.Close()

		// Read and emit payload returned from remote destination endpoint directly back to front-end
		respBody, _ := io.ReadAll(resp.Body)
		c.Data(resp.StatusCode, "application/json", respBody)
	}
}

// main initializes the database connection and defines server routes.
func main() {
	// Establish open SQLite3 physical database file handle
	db, err := sql.Open("sqlite3", "../database/slugroute.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	r := gin.Default()

	// Load HTML templates from the frontend folder
	r.LoadHTMLGlob("../frontend/*.html")

	// API Routes mapping structure
	r.GET("/api/course/:term/:code", getCourseHandler(db))
	r.GET("/api/terms", getTermsHandler(db))
	r.GET("/api/suggest", getSuggestionsHandler(db))
	r.POST("/api/routes-proxy", getRoutesProxyHandler())
	r.POST("/api/schedule/export", exportCalendarHandler())

	// Root Route: Render index.html with injected API key
	r.GET("/", func(c *gin.Context) {
		apiKey := os.Getenv("GOOGLE_MAPS_API_KEY")
		c.HTML(http.StatusOK, "index.html", gin.H{
			"MapsKey": apiKey,
		})
	})

	// Test Route: Render tests.html
	r.GET("/tests", func(c *gin.Context) {
		c.HTML(http.StatusOK, "tests.html", nil)
	})

	// Static asset routing map definitions
	r.Static("/js", "../frontend/js")
	r.Static("/style", "../frontend/style")
	r.Static("/images", "../frontend/images")

	// Start Gin engine and listen on standard port
	log.Println("SlugRoute live at http://localhost:8080")
	r.Run(":8080")
}
