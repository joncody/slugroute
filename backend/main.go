package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

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
