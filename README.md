Golf Matchbook PWA v4

What changed in this version
- more resilient USGA tee import flow
- tries multiple live-import proxy routes instead of just one
- parser now handles either full HTML or plain copied page text
- better deduping of imported tees
- clearer fallback when live import is blocked by proxy or CORS issues
- service worker cache bumped so app updates are easier to pull down

How to deploy update
1. Replace the contents of your existing `golf-app/` folder in GitHub with these files.
2. Commit the changes.
3. Open the live site URL in Safari.
4. Refresh once in Safari before opening the home-screen app.
5. If the old icon or old import behavior persists, delete the home-screen app and add it again.

Import workflow
1. Open the USGA course rating site.
2. Find your course and open its tee page.
3. Paste that full URL into Import Tees.
4. If live import still fails, copy the visible content of the tee page and paste it into the fallback box.
5. Save the import preview.

Notes
- This is still a static GitHub Pages app, so live import depends on public cross-origin proxy availability.
- The pasted-text fallback is the most reliable path when those proxies are flaky.
- Once you move to Supabase or any lightweight backend, you can replace the proxy dependency with a server-side fetch and make this much more reliable.
