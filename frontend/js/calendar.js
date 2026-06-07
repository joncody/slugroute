//calendar.js
import { store } from "./state.js";
import { showToast } from "./utils.js";
import { updateSyncBtnState } from "./ui.js";

/**
 * exportCalendarSchedule handles the API submission to generate and download the .ics file
 */
export async function exportCalendarSchedule(finalSchedule, syncBtn, initialHtml) {
    try {
        syncBtn.disabled = true;
        syncBtn.text = "Generating File...";

        const response = await fetch('/api/schedule/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/calendar'
            },
            body: JSON.stringify(finalSchedule)
        });

        if (!response.ok) {
            throw new Error(`Server returned status code: ${response.status}`);
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);

        const anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = `slugroute-schedule-${new Date().getFullYear()}.ics`;
        document.body.appendChild(anchor);
        anchor.click();

        anchor.remove();
        window.URL.revokeObjectURL(downloadUrl);

        showToast('Calendar file exported successfully!', 'success');

    } catch (error) {
        console.error('Calendar generation process failed:', error);
        showToast('Failed to export calendar. Please try again.', 'error');
    } finally {
        syncBtn.disabled = false;
        syncBtn.innerHTML = initialHtml;
        updateSyncBtnState();
    }
}

/**
 * setupCalendarExport binds the "Sync to Calendar" action triggers
 */
export function setupCalendarExport() {
    const syncBtn = document.getElementById('syncCalendarBtn');
    if (!syncBtn) {
        return;
    }

    updateSyncBtnState();

    syncBtn.addEventListener('click', async function() {
        const activeClasses = store.currentOfferings || [];
        const savedClasses = store.savedCourses || [];

        const combinedList = [...activeClasses, ...savedClasses];

        const finalSchedule = combinedList.filter(function(offering, index, self) {
            return index === self.findIndex(function(o) {
                return o.class_number === offering.class_number;
            });
        });

        if (finalSchedule.length === 0) {
            showToast('Please add or save at least one course first!', 'error');
            return;
        }

        const initialHtml = syncBtn.innerHTML;
        await exportCalendarSchedule(finalSchedule, syncBtn, initialHtml);
    });
}
