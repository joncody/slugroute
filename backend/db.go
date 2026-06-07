package main

import (
	"database/sql"
	"fmt"
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
