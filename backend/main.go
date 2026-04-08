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

// Search result grouped by Class Number
type Offering struct {
	ClassNum   int       `json:"class_number"`
	CourseCode string    `json:"course_code"`
	Instructor string    `json:"instructor"`
	Meetings   []Meeting `json:"meetings"`
}

r.GET("/api/course/:code", func(c *gin.Context) {
    code := c.Param("code")
    rows, _ := db.Query("SELECT class_num, course_code, type, location, time, instructor FROM meetings WHERE course_code = ?", code)
    defer rows.Close()

    // Map class_num to an Offering pointer
    offeringsMap := make(map[int]*Offering)

    for rows.Next() {
        var cn int
        var cc, t, l, ti, inst string
        rows.Scan(&cn, &cc, &t, &l, &ti, &inst)

        if _, ok := offeringsMap[cn]; !ok {
            offeringsMap[cn] = &Offering{
                ClassNum:   cn,
                CourseCode: cc,
                Instructor: inst, // Initial instructor from first row
                Meetings:   []Meeting{},
            }
        }
        offeringsMap[cn].Meetings = append(offeringsMap[cn].Meetings, Meeting{t, l, ti, inst})
    }

    // Convert map to slice for clean JSON
    var result []Offering
    for _, v := range offeringsMap {
        result = append(result, *v)
    }
    c.JSON(200, result)
})
