# RocketTask 🚀

RocketTask is a fast, mobile-first agile task tool focused on one thing: turning daily work into visible momentum.

Built with React + TypeScript + Vite, it runs entirely in the browser with no backend database.

## Why RocketTask

- Capture tasks quickly
- Track real time spent
- Filter and sort work instantly
- Generate practical reports
- Keep your data local to your device/browser

## Core Features

- **Task management**
  - Create, edit, delete tasks
  - Labels, stakeholders, deadlines, checkpoints, next actions
  - Status flow (`todo`, `in_progress`, `done`)

- **Timer + corrections**
  - Start/pause per-task timers
  - Live active timer display
  - Manual tracked-time correction during edit

- **Powerful filtering/sorting**
  - Search across title, notes, labels, stakeholders, dates, and more
  - Multi-status and label filters
  - Sort by updated date, created date, title, status, deadline, checkpoint, next action
  - Filter/sort state persists in browser storage

- **Reports**
  - Period-based reports: week, month, quarter, year
  - Time breakdown by task
  - Opened vs closed trend insights
  - Email report draft generation via `mailto:`

- **Settings + data portability**
  - Full local backup export to JSON
  - Full validated import from JSON (schema/shape checks before import)

- **AI rewrite (optional)**
  - Rewrite task notes from the browser
  - Supports OpenRouter API key/model settings
  - Can use free OpenRouter models (for example: `nvidia /nemotron-3-nano-30b-a3b:free`)

- **PWA-friendly UX**
  - Installable web app metadata + service worker
  - Footer navigation for quick mobile actions

## Architecture (Simple & Local)

RocketTask intentionally avoids server-side persistence.

- **Frontend only:** React + TypeScript
- **Build/dev:** Vite
- **Local data:** IndexedDB via Dexie
- **Crypto:** WebCrypto (when secure context is available)
- **No remote database:** all task data remains in the user's browser storage

> Privacy by design: RocketTask does not send your task data to a backend database.

## OpenRouter Integration (Optional)

RocketTask can call AI directly from the browser for rewrite assistance.

- Add your OpenRouter API key in **Settings**
- Choose a model (including free-tier models)
- Calls are made from the browser runtime

If you want a no-cost setup, use a free OpenRouter model and token.

## Run Locally

### Requirements

- Node.js 20+
- npm

### Start

```bash
git clone git@github.com:pburglin/RocketTask.git
cd RocketTask
npm install
npm run dev
```

Then open the local URL printed by Vite (typically `http://localhost:5173`).

To expose on LAN for mobile testing:

```bash
npm run dev -- --host 0.0.0.0 --port 5174 --strictPort
```

## Build & Quality

```bash
npm run lint
npm run test
npm run build
```

## PWA Install Notes

- **iPhone Safari:** Share → **Add to Home Screen**
- **Chrome/Edge (supported contexts):** can show install prompt automatically
- Install prompt behavior varies by browser + HTTPS/security context

## Project Status

RocketTask is actively evolving with a practical, execution-first philosophy:

> Keep it simple. Keep it fast. Make progress visible.
