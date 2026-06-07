package main

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
