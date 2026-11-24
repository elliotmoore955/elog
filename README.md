# Engineering Shift Log

A simple browser app for logging admin, faults and maintenance during a shift.

## Sections

**Admin**: shift handovers (outgoing → incoming engineer and notes), keys out and keys in, and general info and events. Logging a key in automatically marks the matching key-out entry as returned.

**Faults & maintenance**: faults (with severity and open/cleared status), maintenance tasks (with a preset or custom duration and an "out of service" flag), and info and events. Each entry is tagged with the system it relates to.

On every entry you can use **Now** or **Set time** to enter when it happened.

The status strip at the top shows keys currently out, open faults, and maintenance in progress or due in the next 24 hours.

## Using it

Open `index.html` in a browser. Nothing needs installing and it works offline.

To host it on **GitHub Pages**, go to *Settings → Pages* in the repo, choose *Deploy from a branch*, pick `main` and `/ (root)`, then save. The app will be live at `https://<username>.github.io/<repo>/`.

## Data

- Entries are saved in the browser's local storage, on that computer and in that browser only.
- Under **Settings & data** you can export to CSV (for Excel), download a JSON backup, and import a backup (it merges with what's already there).
- The systems list can be edited in Settings. Put one system per line and start a line with `#` to make a group heading.

## Files

- `index.html`: page layout and forms
- `styles.css`: styling (supports light and dark mode)
- `app.js`: all logic and storage
