package main

import (
	"bytes"
	"database/sql"
	"io"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
)

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
