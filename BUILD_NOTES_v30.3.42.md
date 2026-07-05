# BUILD_NOTES_v30.3.42.md

Build v30.3.42 - Duplicate Course Dropdown Rendering

## Summary
This release fixes duplicate course names appearing in course dropdowns when local storage contains repeated course records while preserving the local-first course library model.

## Changes
- Added defensive course dropdown de-duplication for Match Setup, tee editing, and the handicap calculator.
- Preferred stable cloud-backed course records when duplicate display names exist.
- Preserved local-only course records in storage instead of deleting or merging user-created data automatically.
- Kept tee population tied to the rendered visible course option after de-duplication.
- Added course-library diagnostics for cloud course count, local course count, and rendered option count.
- Updated app version and cache references to v30.3.42.

## Verification Focus
- Confirm Match Setup course dropdown shows one option per identical course name even when local storage contains duplicates.
- Confirm selecting a rendered course still populates the correct tees.
- Confirm the handicap calculator course and tee selectors still work.
- Confirm local-only courses remain in the Library and can still be edited/published.
- Confirm installed PWA refreshes to cache `the-dye-ledger-v30.3.42`.
