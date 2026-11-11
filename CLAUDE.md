# CLAUDE.md

## Workflow rules (from the owner)
- I do not want to do any branching / merging / pull requests.
- Update the GitHub repo as well as my app directly: commit and push straight to `main`.
  GitHub Pages deploys from `main`, so pushing to `main` updates the live app at
  https://mattoduffo.github.io/BdayParty/.

## Project notes
- Plain static web app (HTML/CSS/JS, no build step) served by GitHub Pages from the repo root.
- Files: `index.html`, `styles.css`, `app.js` (UI), `astro.js` (zodiac/date helpers),
  `data.js` (storage + JSON/CSV import), `ics.js` (calendar export), `sw.js` (offline cache).
- When changing any cached file, bump `CACHE` in `sw.js` so installed iPhone apps pick up the update.
