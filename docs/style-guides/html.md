# SlugRoute HTML Style Guide

## 1. HTML Standards
*   **Document Structure:** Always start with `<!DOCTYPE html>` and include the `<html lang="en">` attribute.
*   **Case Convention:** Use lowercase for all element names and attributes (e.g., `<nav class="navbar">` not `<NAV CLASS="navbar">`).
*   **Attribute Quoting:** Always wrap attribute values in double quotes: `id="sidebar"`.
*   **Indentation:** Use **4 spaces** per indentation level to maintain consistency with the current codebase.
*   **Naming (IDs and Classes):** Use **kebab-case** for class names and IDs to ensure readability.
    *   *Good:* `app-container`, `search-preview-dropdown`.
*   **Self-Closing Elements:** For elements like `<img>`, `<input>`, and `<link>`, do not use a trailing slash (e.g., `<img src="...">` is preferred over `<img src="..." />`).
*   **Alt Text:** All images and icons must have an `alt` or `title` attribute for accessibility (e.g., `title="Toggle Sidebar"`).

## 2. CSS Standards
*   **Selector Naming:** Match the HTML convention using **kebab-case**.
*   **Formatting:**
    *   Place the opening bracket on the same line as the selector.
    *   Use a single space before the opening bracket.
    *   Use one line per property.
    *   Include a semicolon after every property, including the last one.
*   **Example:**
    ```css
    .nav-container {
        display: flex;
        gap: 8px;
        padding: 10px;
    }
    ```
*   **Units:** Use `px` for borders and small fixed dimensions; use `rem` or `%` for layouts to ensure responsiveness.
*   **Organization:** Group styles by component (e.g., `/* Navbar Styles */`, `/* Sidebar Styles */`).

## 3. JavaScript Standards
*   **Naming (Variables and Functions):** Use **camelCase** for all function and variable names to distinguish them from HTML/CSS kebab-case.
    *   *Good:* `searchCourse()`, `sidebarToggle`, `initMap()`.
*   **DOM Selection:** Prefer `document.getElementById()` for unique elements and `document.querySelectorAll()` for groups of elements.
*   **Event Handlers:** While the current project uses inline handlers (e.g., `onclick="..."`), new logic should preferably move toward `addEventListener` in `script.js` to separate concerns.
*   **Variables:** Use `const` by default for variables that do not change and `let` for variables that will be reassigned. Avoid `var`.
*   **Semicolons:** Always end statements with a semicolon to prevent execution errors.

## 4. File and Directory Naming
*   **File Names:** Use lowercase and descriptive names.
    *   *Good:* `style.css`, `script.js`, `logo-slug.png`.
*   **Extensions:**
    *   HTML: `.html`
    *   CSS: `.css`
    *   JavaScript: `.js`
*   **Default Filename:** The entry point of the frontend must be named `index.html`.

## 5. Comments
*   **HTML:** Use comments to label major sections like `<!-- Sidebar -->` or `<!-- Map Container -->`.
*   **JS/CSS:** Use single-line comments `//` for brief logic explanations and block comments `/* ... */` for file headers or section breaks.
