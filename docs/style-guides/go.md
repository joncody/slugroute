# SlugRoute Go Style Guide

## 1. Formatting and Tooling
*   **Gofmt:** All code must be formatted with `gofmt`. We use **tabs** for indentation (as per standard Go) but 8-character width for alignment.
*   **Imports:** Group imports into two blocks: standard library and third-party packages, separated by a blank line.
*   **Line Length:** Avoid lines longer than 80–100 characters. Break long SQL queries into multi-line strings using backticks (`` ` ``).

## 2. Naming Conventions
*   **CamelCase:** Use `MixedCaps` or `mixedCaps` rather than underscores. 
*   **Initialisms:** Words like "URL", "ID", "API", and "JSON" should be all-caps.
    *   *Good:* `imageURL`, `classID`.
    *   *Bad:* `imageUrl`, `classId`.
*   **Exporting:** Names you want to use in other packages (or for JSON encoding) must start with an **UpperCase** letter. Internal logic should start with a **lowerCase** letter.

## 3. Error Handling
*   **Explicit Checks:** Always check errors immediately. Don't use "if-else" for errors; use the "fail fast" pattern (return early).
*   **Error Messages:** Error strings should not be capitalized and should not end with punctuation (e.g., `fmt.Errorf("failed to connect")`).
*   **Defer:** Call `rows.Close()` immediately after checking the error from a DB query to ensure resources are released.

## 4. Structs and JSON
*   **Struct Tags:** Use consistent struct tags for JSON mapping. Use `snake_case` for JSON keys to match the frontend expectations.
*   **Comments:** Every exported type and function should have a comment starting with the name of the item.

## 5. Control Structures
*   **Braces:** Braces must be used for all blocks. No one-line `if` statements.
*   **Fail Fast:** If a function fails, return the error immediately to keep the successful logic at the lowest indentation level.
