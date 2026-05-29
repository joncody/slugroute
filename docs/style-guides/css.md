# SlugRoute CSS Style Guide

## 1. File Structure & Organization
Organize the stylesheet logically using clear section headers. This makes large files navigable.
*   **Order of Sections:**
    1.  **Variables:** `:root` definitions for colors, spacing, and dimensions.
    2.  **Global Reset:** Base styles for `*`, `body`, and typography imports.
    3.  **Layout/Structural:** High-level containers (e.g., `.navbar`, `.app-container`, `.sidebar`).
    4.  **Components:** Specific UI elements (e.g., `.course-card`, `.filter-item`).
    5.  **Utilities/Animations:** Animations like `@keyframes` or helper classes.

*   **Section Headers:** Use a consistent comment format to separate sections:
    ```css
    /* --- Section Name --- */
    ```

## 2. Naming Conventions
*   **Kebab-case:** Use lowercase letters and hyphens for all class names and IDs. Avoid camelCase or underscores.
    *   **Good:** `.search-container`, `#sidebar-toggle`
    *   **Bad:** `.searchContainer`, `#sidebar_toggle`
*   **Descriptive Names:** Names should describe the *purpose* of the element, not its appearance.
    *   **Good:** `.text-btn-red` (describes a specific UI variation).
    *   **Bad:** `.big-red-button-left`.

## 3. Formatting & Syntax
To maintain the "clean and tidy" look of the current codebase:
*   **Indentation:** Use **4 spaces** per level. Do not use tabs.
*   **Braces:** Place the opening brace `{` on the same line as the selector, preceded by a single space. Place the closing brace `}` on a new line.
*   **Properties:**
    *   One property per line.
    *   Include a space after the colon (e.g., `display: flex;`).
    *   Always include a semicolon `;` at the end of every declaration.
*   **Example:**
    ```css
    .course-card {
        background-color: #ffffff;
        border: 1px solid var(--border-color);
        padding: 16px;
    }
    ```

## 4. Variables & Theming
*   **Use CSS Variables:** Never hardcode colors or repeated dimensions. Use the variables defined in `:root`.
    *   *Good:* `color: var(--ucsc-blue);`
    *   *Bad:* `color: #003C6C;`
*   **Centralized Values:** If a value (like `--nav-height`) is used in multiple layout calculations, it must be a variable.

## 5. Responsive Design
*   **Media Queries:** Place media queries at the bottom of the relevant component section or at the end of the file.
*   **Mobile First:** Generally, write styles for mobile devices first, then use `@media (min-width: 768px)` to override styles for desktop.
*   **Touch Targets:** Ensure buttons and inputs have a `min-height` of at least `44px` for mobile accessibility, as seen in the current project.

## 6. Best Practices
*   **Avoid `!important`:** Only use `!important` as a last resort (e.g., for utility overrides). Use higher selector specificity instead.
*   **Units:** Use `px` for borders and specific small icons. Use `rem` for font sizes and `%` or `vh/vw` for major layout widths/heights.
*   **Grouping Selectors:** If multiple elements share the same styles, group them:
    ```css
    .menu-btn, .save-btn, .remove-btn {
        min-height: 44px;
        display: flex;
    }
    ```
*   **Shorthand Properties:** Use shorthand where possible to keep the code concise.
    *   *Good:* `padding: 10px 20px;`
    *   *Bad:* `padding-top: 10px; padding-bottom: 10px; padding-left: 20px; padding-right: 20px;`
