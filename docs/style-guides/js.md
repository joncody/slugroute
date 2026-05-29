# SlugRoute JavaScript Style Guide

## 1. Naming Conventions
*   **Variables and Functions:** Use **camelCase**. Names should be descriptive (e.g., `currentOfferings`).
*   **Constants:** Use **SCREAMING_SNAKE_CASE** for global configuration values.
*   **Managers/Utilities:** Use **PascalCase** for objects that manage state or logic groups (e.g., `ColorManager`, `MapUtils`).

## 2. Formatting & Syntax
*   **Indentation:** Use **4 spaces** per level.
*   **Braces (Egyptian Style):** Place the opening brace on the same line as the statement; the closing brace goes on a new line.
*   **Control Structures (No One-Liners):** Always use curly braces `{}` for `if`, `else`, `for`, and `while` statements, even if the block contains only one line. This prevents logic errors during future edits.
    *   *Good:* 
        ```javascript
        if (!courseCode) {
            return;
        }
        ```
    *   *Bad:* `if (!courseCode) return;`
*   **Semicolons:** Always end statements with a semicolon.

## 3. Variables and State
*   **Declaration:** Use `const` by default. Use `let` only for variables that require reassignment (e.g., counters or toggles). **Never use `var`**.
*   **Global State:** Group global variables (like `map` or `markers`) at the top of the file to make the application's "brain" easy to find.

## 4. DOM Interaction
*   **Selection:** Use `document.getElementById()` for single elements and `document.querySelectorAll()` for groups.
*   **ID Alignment:** Ensure strings match the **kebab-case** IDs in the HTML (e.g., `document.getElementById("search-form")`).
*   **Class Manipulation:** Use `element.classList` methods (`add`, `remove`, `toggle`) rather than overwriting `className`.

## 5. Asynchronous Operations & APIs
*   **Async/Await:** Use `async/await` for all API calls and Google Maps library loads.
*   **Error Handling:** Always wrap `fetch` calls in `try...catch` blocks to handle network failures gracefully.
*   **Feedback:** Provide visual feedback (like your loading skeletons) during asynchronous wait times.

## 6. Documentation
*   **Function Headers:** Every function should have a brief JSDoc comment explaining what it does.
    ```javascript
    /**
     * renderSearchList updates the "Current Results" sidebar section.
     */
    ```

## 7. File Organization
1.  **CONFIG:** Hardcoded settings and constants.
2.  **Global State:** Let/Const definitions for map and markers.
3.  **Managers/Utils:** Logic helpers (e.g., `ColorManager`).
4.  **Core Logic:** Functions that process data.
5.  **UI Rendering:** Functions that update the DOM.
6.  **Initialization:** The `initMap` and event listener setup.
