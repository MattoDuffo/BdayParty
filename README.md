# 🎈 BdayParty

A small birthday tracker that runs as a web app on GitHub Pages. Your data stays on your phone, and you can add the app to your iPhone Home Screen.

## Features
- **Infinite list** of upcoming birthdays, grouped by month. It keeps rolling into future years as you scroll.
- **Each card shows:** the age they're turning, Western zodiac sign, Chinese zodiac animal and element (worked out from the real Lunar New Year date), and the weekday they were born on.
- **4 tiers:**

  | Tier | In the app | Calendar alerts (default times, editable in ⚙️) |
  |---|---|---|
  | 1 – Must remember | Huge banner all day, plus a heads-up 7 days ahead | 20:00 the evening before, then 08:00, 12:00, 17:00, 20:00 |
  | 2 – Important | Banner on the day | 09:00 and 19:00 |
  | 3 – Normal | Highlighted card | 09:00 |
  | 4 – In-app only | Smaller card | none |

- **Editing:** tap a card to edit name, day, month, year, tier and notes. Saving asks you to confirm and shows exactly what changed.
- **Import** from JSON or CSV with a preview and duplicate detection. **Export** a JSON backup.
- **Export to Calendar (.ics):** puts every Tier 1–3 birthday into the iPhone Calendar as a yearly event with alerts.

## Put it online (GitHub Pages)
1. Merge this branch into `main`.
2. In the repo, go to **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, then branch `main`, folder `/ (root)`, and save.
3. After a minute the app is live at `https://<your-username>.github.io/BdayParty/`.

> GitHub Pages on a free account needs the repo to be **public**. That's fine here: the repo only holds the app's code, never your birthday data.

## Set it up on your iPhone
1. Open the site in **Safari**, tap **Share → Add to Home Screen**.
2. Import your birthdays: tap **⚙️ → Import file…**.
3. To get reminders, open the site **in Safari**, not the Home Screen icon, because Safari handles calendar files more reliably. Tap **⚙️ → Export to Calendar (.ics)**, then **Add All**.
   - Tip: choose a separate calendar such as "Birthdays", so it's easy to replace later.
   - If the download does nothing, use **Share .ics…** and pick Calendar, or save it to Files and open it from there.
4. **When you change birthdays or tiers, export again.** Calendar doesn't sync with the app, so delete the old "Birthdays" calendar first to avoid duplicates. (In Calendar → Calendars, tap ⓘ → Delete Calendar, then create it again.)
5. For Tier 1 to really stand out, go to iPhone **Settings → Notifications → Calendar** and set the alert style to **Persistent**. Calendar alerts then stay on screen until you dismiss them.

> iPhone Calendar keeps at most 2 alerts per event. So for Tier 1, any extra alert times become small "🔔 Reminder" events on the same day.

## Import file format
CSV (comma, semicolon or tab separated) or JSON. Templates: [`templates/birthdays-template.csv`](templates/birthdays-template.csv), [`templates/birthdays-template.json`](templates/birthdays-template.json).

| Column | Required | Notes |
|---|---|---|
| `name` | yes | or `first name` + `last name` |
| `day`, `month` | yes* | month can be `5`, `May` or `may` |
| `year` | no | leave empty if unknown (then no age, Chinese zodiac or birth weekday) |
| `birthday` | *alt. | a single date column instead of day/month/year: `1990-05-21`, `May 21, 1990`, `21 May 1990`, `--05-21`, `05/21/1990` (US order unless the first number is above 12) |
| `tier` | no | 1–4, default 3 |
| `notes` | no | free text |

JSON can be an array of objects with those keys, or `{ "people": [...] }`.

## Notes
- Data lives in the browser's local storage on each device. Use **Export backup** now and then.
- Feb 29 birthdays are shown and alerted on Feb 28 in years that aren't leap years.
- Plain HTML, CSS and JavaScript with no build step. `sw.js` makes it work offline.
