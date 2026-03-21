# Golf Matchbook – Course Import Update

This update adds a course / tee import helper so you do not have to keep entering rating, slope, par, and length by hand.

## What it does
- stores players and handicap indexes locally
- stores courses and tee sets locally
- imports tee sets from a USGA course tee page by URL or CourseID
- falls back to manual paste parsing if the live import fails
- calculates Course Handicap and Playing Handicap
- exports and imports a JSON backup

## Important limitation
This is still a static PWA hosted on GitHub Pages.

That means the import helper uses a lightweight proxy request to fetch a public USGA tee page and parse it. If that proxy is blocked or rate-limited, use the manual paste parser in the app.

## Deploy
Upload the contents of this folder into your existing `golf-app/` folder in GitHub, replacing the current files.

Then refresh the app in Safari. If the home-screen icon shows an older cached version, open the site URL directly in Safari first, refresh once, and then reopen the home-screen app.

## Notes on the USGA data source
The USGA provides a public National Course Rating Database lookup and separately describes authorized data-affiliate access that includes retrieval of Course Rating and Slope Rating data. For a lightweight personal tool, this update uses import parsing rather than a formal affiliate integration.
