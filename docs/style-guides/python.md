# SlugRoute Python Style Guide (PEP 8)

## 1. Naming Conventions
*   **Variables and Functions:** Use `snake_case`. Names should be descriptive.
    *   *Good:* `fetch_class_detail`, `class_nums`.
*   **Constants:** Use `SCREAMING_SNAKE_CASE` for all global constants.
    *   *Good:* `DB_NAME`, `BASE_URL`.
*   **Classes:** Use `PascalCase` (e.g., `ScraperEngine`).

## 2. Indentation and Spacing
*   **Indentation:** Use **4 spaces** per level. Never use tabs.
*   **Blank Lines:** 
    *   Use **two blank lines** between top-level functions and class definitions.
    *   Use **one blank line** between methods inside a class.
*   **Line Length:** Limit lines to **79 characters** where possible (88 is acceptable for complex logic/regex).
*   **Operators:** Put one space around assignment (`=`) and comparison (`==`, `<`, etc.) operators.

## 3. Control Structures
*   **No One-Liners:** Just like our JavaScript standards, do not put the body of an `if` or `for` statement on the same line as the header.
    *   *Good:*
        ```python
        if not text:
            return ""
        ```
    *   *Bad:* `if not text: return ""`

## 4. Imports
*   **Grouping:** Group imports in the following order, with a blank line between each group:
    1. Standard library imports.
    2. Third-party library imports (e.g., `requests`, `bs4`).
    3. Local application imports.
*   **Ordering:** Alphabetize imports within each group.

## 5. Comments and Docstrings
*   **Docstrings:** Every module and function should have a triple-quoted docstring (`"""Docstring"""`) explaining its purpose.
*   **In-line Comments:** Use sparingly. Use `#` followed by a single space.

## 6. Error Handling
*   **Be Specific:** Catch specific exceptions instead of a bare `except:`.
*   **Logging:** Use the `logging` module rather than `print` statements for production-ready backend code.
