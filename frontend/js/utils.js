//utils.js
import { CONFIG } from "./config.js";

/**
 * ColorManager assigns unique colors to each class number
 */
export const ColorManager = {
    assignments: {},

    getColor: function(classNumber) {
        if (ColorManager.assignments[classNumber]) {
            return ColorManager.assignments[classNumber];
        }

        const usedColors = Object.values(ColorManager.assignments);
        const nextColor = CONFIG.COLOR_POOL.find(function(c) {
            return !usedColors.includes(c);
        }) || CONFIG.COLOR_POOL[0];

        ColorManager.assignments[classNumber] = nextColor;
        return nextColor;
    },

    releaseColor: function(classNumber) {
        delete ColorManager.assignments[classNumber];
    }
};

/**
 * showToast displays a temporary alert message to the user
 */
export function showToast(message, type = "error") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.textContent = message;

    container.appendChild(toast);

    setTimeout(function() {
        toast.classList.add("fade-out");
        setTimeout(function() {
            toast.remove();
        }, 500);
    }, 3000);
}

/**
 * getEarliestDayWeight determines the numeric weekday index offset for chronological sorting
 */
function getEarliestDayWeight(daysPart) {
    const dayWeights = { "M": 0, "Tu": 1, "W": 2, "Th": 3, "F": 4 };
    let earliestDayWeight = 10;

    Object.keys(dayWeights).forEach(function(day) {
        if (daysPart.includes(day)) {
            earliestDayWeight = Math.min(earliestDayWeight, dayWeights[day]);
        }
    });
    return earliestDayWeight;
}

/**
 * parseTimeDigits shifts digits to a standard 24-hour minute value format
 */
function parseTimeDigits(timeStr, earliestDayWeight) {
    const timeMatch = timeStr.match(/(\d+):(\d+)(AM|PM)/);
    if (!timeMatch || earliestDayWeight === 10) {
        return null;
    }

    let hour = parseInt(timeMatch[1]);
    const min = parseInt(timeMatch[2]);
    const ampm = timeMatch[3];

    if (ampm === "PM" && hour !== 12) {
        hour += 12;
    }
    if (ampm === "AM" && hour === 12) {
        hour = 0;
    }

    return (earliestDayWeight * 1440) + (hour * 60 + min);
}

/**
 * utils provides formatting and logic helpers
 */
export const utils = {
    formatCourseCode: function(input) {
        return input.trim().toUpperCase().replace(/([A-Z]+)(\d+)/, "$1 $2");
    },

    getTermName: function(term) {
        const year = "20" + term.substring(1, 3);
        const suffix = term.charAt(3);
        let season = "Unknown";

        if (suffix === "0") {
            season = "Winter";
        } else if (suffix === "2") {
            season = "Spring";
        } else if (suffix === "4") {
            season = "Summer";
        } else if (suffix === "8") {
            season = "Fall";
        }

        return `${season} ${year}`;
    },

    calculateIdealTerm: function() {
        const now = new Date();
        const m = now.getMonth() + 1;
        const y = now.getFullYear().toString().slice(-2);
        let season = "0";

        if (m >= 4 && m <= 6) {
            season = "2";
        } else if (m >= 7 && m <= 8) {
            season = "4";
        } else if (m >= 9) {
            season = "8";
        }

        return `2${y}${season}`;
    },

    getFilterCategory: function(type) {
        const t = type.toUpperCase();
        if (t === "LBS" || t === "LAB") {
            return "LAB";
        }
        if (t === "DIS") {
            return "DIS";
        }
        return "LEC";
    },

    getClassStatus: function(meeting) {
        const timeStr = (meeting.time || "").toUpperCase();
        const bldStr = (meeting.building || "").toUpperCase();

        if (timeStr.includes("CANCELLED") || bldStr.includes("CANCELLED")) {
            return "CANCELLED";
        }
        if (timeStr.includes("TBA") || bldStr.includes("TBA") || bldStr.trim() === "" || bldStr === "N/A") {
            return "TBD";
        }
        if (bldStr.includes("ONLINE") || bldStr.includes("REMOTE")) {
            return "ONLINE";
        }

        return "PHYSICAL";
    },

    getIconPath: function(category) {
        if (category === "LEC") {
            return "M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z";
        }
        if (category === "LAB") {
            return "M3 3h18v18H3z";
        }
        return "M12 2L2 21H22L12 2Z";
    },

    coordsMatch: function(a, b) {
        if (!a || !b) {
            return false;
        }
        const epsilon = 0.00001;
        return Math.abs(a.lat - b.lat) < epsilon && Math.abs(a.lng - b.lng) < epsilon;
    },

    parseMeetingTime: function(timeStr) {
        if (!timeStr || timeStr === "TBA" || timeStr.includes("CANCELLED")) {
            return null;
        }

        const daysPart = timeStr.split(' ')[0];
        const earliestDayWeight = getEarliestDayWeight(daysPart);

        return parseTimeDigits(timeStr, earliestDayWeight);
    },

    getEarliestMeetingSortVal: function(meetings) {
        const vals = meetings
            .map(function(m) {
                return utils.parseMeetingTime(m.time);
            })
            .filter(function(v) {
                return v !== null && v !== undefined;
            });
        return vals.length > 0 ? Math.min(...vals) : 999999;
    },

    sortMeetings: function(meetings) {
        return [...meetings].sort(function(a, b) {
            const valA = utils.parseMeetingTime(a.time) ?? 999999;
            const valB = utils.parseMeetingTime(b.time) ?? 999999;
            return valA - valB;
        });
    },

    getActiveFilters: function() {
        return Array.from(document.querySelectorAll(".filter-type:checked")).map(function(cb) {
            return cb.value;
        });
    },

    getIcon: function(name, size = 16, color = "currentColor") {
        const icons = {
            pin: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; display: inline-block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>`,
            clock: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="vertical-align: middle; display: inline-block;"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
            star: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279-7.416-3.967-7.417 3.967 1.481-8.279-6.064-5.828 8.332-1.151z"/></svg>`,
            square: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><rect x="3" y="3" width="18" height="18"/></svg>`,
            triangle: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}"><path d="M12 2L2 21H22L12 2Z"/></svg>`,
            walk: `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" fill="${color}" class="bi bi-person-walking" viewBox="0 0 16 16">
              <path d="M9.5 1.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0M6.44 3.752A.75.75 0 0 1 7 3.5h1.445c.742 0 1.32.643 1.243 1.38l-.43 4.083a1.8 1.8 0 0 1-.088.395l-.318.906.213.242a.8.8 0 0 1 .114.175l2 4.25a.75.75 0 1 1-1.357.638l-1.956-4.154-1.68-1.921A.75.75 0 0 1 6 8.96l.138-2.613-.435.489-.464 2.786a.75.75 0 1 1-1.48-.246l.5-3a.75.75 0 0 1 .18-.375l2-2.25Z"/>
              <path d="M6.25 11.745v-1.418l1.204 1.375.261.524a.8.8 0 0 1-.12.231l-2.5 3.25a.75.75 0 1 1-1.19-.914zm4.22-4.215-.494-.494.205-1.843.006-.067 1.124 1.124h1.44a.75.75 0 0 1 0 1.5H11a.75.75 0 0 1-.531-.22Z"/>
            </svg>`,
            location: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><circle cx="12" cy="12" r="10" fill="${color}" stroke="white" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="white"/></svg>`
        };
        return icons[name] || "";
    },

    getHeartSvg: function(isSaved) {
        const fill = isSaved ? "#ef4444" : "none";
        const stroke = isSaved ? "#ef4444" : "#64748b";
        return `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="${fill}" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="action-svg">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
            </svg>
        `;
    },

    getEyeSvg: function(isVisible) {
        const stroke = "#64748b";
        if (isVisible) {
            return `
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                </svg>
            `;
        }
        return `
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="action-svg dimmed">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                <line x1="1" y1="1" x2="23" y2="23"></line>
            </svg>
        `;
    }
};
