package main

import (
	"database/sql"
	"fmt"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

// Meeting represents a single time/location instance for a course
type Meeting struct {
	Type       string  `json:"type"`
	Building   string  `json:"building"`
	RoomNumber string  `json:"room_number"`
	Time       string  `json:"time"`
	Instructor string  `json:"instructor"`
	Lat        float64 `json:"lat"`
	Lng        float64 `json:"lng"`
}

// Offering represents a unique class (lecture) and its associated sections
type Offering struct {
	ClassNum   string    `json:"class_number"`
	CourseCode string    `json:"course_code"`
	Title      string    `json:"title"`
	Instructor string    `json:"instructor"`
	Meetings   []Meeting `json:"meetings"`
}

// fetchOfferings queries the DB for main lecture data and joins building coordinates
func fetchOfferings(db *sql.DB, term, code string) (map[string]*Offering, error) {
	// SQL query joins courses with lectures and builds to get lat/lng
	// Sprint update: Added UPPER/TRIM normalization and fuzzy code matching for robust building/course lookups
	query := `
        SELECT c.class_number, c.course_code, c.title, l.instructor, l.days, l.times, l.building, l.room_number, 
               IFNULL(b.lat, 0), IFNULL(b.lng, 0)
        FROM courses c
        JOIN lectures l ON c.class_number = l.class_number AND c.term = l.term
        LEFT JOIN buildings b ON UPPER(TRIM(l.building)) = UPPER(TRIM(b.name))
        WHERE (UPPER(c.course_code) = UPPER(?) OR UPPER(REPLACE(c.course_code, ' ', '')) = UPPER(REPLACE(?, ' ', ''))) 
        AND c.term = ?`

	rows, err := db.Query(query, code, code, term)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	offeringsMap := make(map[string]*Offering)

	for rows.Next() {
		var cn, cc, title, inst, days, times, bld, rm string
		var lat, lng float64

		// Scan DB columns into temporary variables
		if err := rows.Scan(&cn, &cc, &title, &inst, &days, &times, &bld, &rm, &lat, &lng); err != nil {
			return nil, err
		}

		// If this is a new class number, initialize the offering object
		if _, ok := offeringsMap[cn]; !ok {
			offeringsMap[cn] = &Offering{
				ClassNum:   cn,
				CourseCode: cc,
				Title:      title,
				Instructor: inst,
				Meetings:   []Meeting{},
			}
		}

		// Append the lecture as the first meeting type
		offeringsMap[cn].Meetings = append(offeringsMap[cn].Meetings, Meeting{
			Type:       "LEC",
			Building:   bld,
			RoomNumber: rm,
			Time:       fmt.Sprintf("%s %s", days, times),
			Instructor: inst,
			Lat:        lat,
			Lng:        lng,
		})
	}
	return offeringsMap, nil
}

// attachSections fetches DIS/LAB sections linked to the parent lecture
func attachSections(db *sql.DB, term string, offerings map[string]*Offering) error {
	query := `
        SELECT s.section_type, s.instructor, s.days, s.times, s.building, s.room_number,
               IFNULL(b.lat, 0), IFNULL(b.lng, 0)
        FROM sections s
        LEFT JOIN buildings b ON UPPER(TRIM(s.building)) = UPPER(TRIM(b.name))
        WHERE s.parent_class_number = ? AND s.term = ?`

	for cn, offering := range offerings {
		secRows, err := db.Query(query, cn, term)
		if err != nil {
			return err
		}

		for secRows.Next() {
			var st, si, sd, stm, bld, rm string
			var lat, lng float64

			if err := secRows.Scan(&st, &si, &sd, &stm, &bld, &rm, &lat, &lng); err != nil {
				secRows.Close()
				return err
			}

			// Append section meeting to the same offering
			offering.Meetings = append(offering.Meetings, Meeting{
				Type:       st,
				Building:   bld,
				RoomNumber: rm,
				Time:       fmt.Sprintf("%s %s", sd, stm),
				Instructor: si,
				Lat:        lat,
				Lng:        lng,
			})
		}
		secRows.Close()
	}
	return nil
}

// getCourseHandler handles the /api/course/:term/:code route
func getCourseHandler(db *sql.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		term := c.Param("term")
		code := c.Param("code")

		// 1. Fetch main lectures
		offeringsMap, err := fetchOfferings(db, term, code)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch lectures",
			})
			return
		}

		// 2. Fetch and link sections
		if err := attachSections(db, term, offeringsMap); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"error": "Failed to fetch sections",
			})
			return
		}

		// 3. Convert map to list for frontend
		result := make([]Offering, 0, len(offeringsMap))
		for _, v := range offeringsMap {
			result = append(result, *v)
		}
		c.JSON(http.StatusOK, result)
	}
}

func main() {
	// Open SQLite connection
	db, err := sql.Open("sqlite3", "../database/slugroute.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// Initialize Gin Router
	r := gin.Default()

	// Setup Routes
	r.GET("/api/course/:term/:code", getCourseHandler(db))

	// Static file server (serves frontend folder)
	r.NoRoute(gin.WrapH(http.FileServer(http.Dir("../frontend"))))

	log.Println("SlugRoute live at http://localhost:8080")
	r.Run(":8080")
}