# Golf Matchbook PWA v6

This version pivots to **manual-only course and tee entry**.

## What's changed
- Removed the course import workflow.
- Kept **players editable**.
- Kept **courses editable**.
- Kept **tees editable**.
- Course and tee management now live together under a single **Courses & Tees** tab.
- Each tee stores 18 editable hole rows with:
  - hole number
  - yardage
  - par
  - stroke index
- Total yardage and total par can be entered manually or filled from the hole rows.

## Data behavior
- Existing local data from earlier versions should carry forward.
- New saves use local browser storage under a new v6 key.

## Deploy update
Replace the files in your existing `golf-app/` folder with the contents of this package, then commit.

If your phone still shows the old version:
1. open the site in Safari
2. refresh
3. reopen the home-screen app
4. if needed, delete the home-screen app and re-add it
