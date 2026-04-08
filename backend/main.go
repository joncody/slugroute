package main

import (
	"database/sql"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	_ "github.com/mattn/go-sqlite3"
)

type Meeting struct {
	Type       string `json:"type"`
	Location   string `json:"location"`
	Time       string `json:"time"`
	Instructor string `json:"instructor"`
}

type Offering struct {
	ClassNum   int       `json:"class_number"`
	CourseCode string    `json:"course_code"`
	Instructor string    `json:"instructor"`
	Meetings   []Meeting `json:"meetings"`
}

func main() {
	db, err := sql.Open("sqlite3", "../database/slugroute.db")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()
	r := gin.Default()
	// Define API Routes FIRST
	// These take priority over the static files
	r.GET("/api/course/:code", func(c *gin.Context) {
		code := c.Param("code")
		rows, err := db.Query("SELECT class_num, course_code, type, location, time, instructor FROM meetings WHERE course_code = ?", code)
		if err != nil {
			c.JSON(500, gin.H{"error": err.Error()})
			return
		}
		defer rows.Close()
		offeringsMap := make(map[int]*Offering)
		for rows.Next() {
			var cn int
			var cc, t, l, ti, inst string
			rows.Scan(&cn, &cc, &t, &l, &ti, &inst)
			if _, ok := offeringsMap[cn]; !ok {
				offeringsMap[cn] = &Offering{
					ClassNum:   cn,
					CourseCode: cc,
					Instructor: inst,
					Meetings:   []Meeting{},
				}
			}
			offeringsMap[cn].Meetings = append(offeringsMap[cn].Meetings, Meeting{t, l, ti, inst})
		}
		var result []Offering
		for _, v := range offeringsMap {
			result = append(result, *v)
		}
		c.JSON(200, result)
	})
	// This will only run if the request doesn't match an API route.
	// It serves index.html, style.css, and script.js from the frontend folder.
	r.NoRoute(gin.WrapH(http.FileServer(http.Dir("../frontend"))))
	log.Println("SlugRoute live at http://localhost:8080")
	r.Run(":8080")
}
