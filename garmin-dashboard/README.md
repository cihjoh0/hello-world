# Garmin Running Dashboard

A personal running analytics dashboard powered by [garth](https://github.com/matin/garth) and Garmin Connect. Fully static — no server needed, works on any device including iPad.

## Stack

| Layer | Tech |
|---|---|
| Data fetch | Python + garth |
| Storage | SQLite (committed to repo) |
| Export | Python → JSON files |
| Frontend | React + Vite + Recharts |
| Hosting | Vercel (or any static host) |
| Automation | GitHub Actions (nightly cron) |

## How it works

```
GitHub Actions (nightly)
  ├── fetch.py   pulls activities from Garmin Connect → garmin.db
  ├── export.py  reads garmin.db → frontend/public/data/*.json
  └── commits both garmin.db and the JSON files

Vercel
  └── deploys frontend/ on every push
      └── serves the static JSON files alongside the React app
```

The React app fetches pre-built JSON files — no backend process needed at runtime.

## Setup

### 1. First-time auth (run locally once)

```bash
cd backend
pip install -r requirements.txt

python fetch.py --auth       # saves session to ~/.garth
python fetch.py --limit 500  # initial sync
python export.py             # generates frontend/public/data/*.json
```

### 2. Run locally

```bash
cd frontend
npm install
npm run dev   # → http://localhost:5174
```

### 3. Deploy to Vercel

1. Push this repo to GitHub
2. Import it in [vercel.com](https://vercel.com) — the `vercel.json` at the root sets `frontend/` as the project directory automatically
3. No environment variables needed

### 4. Automated nightly sync (GitHub Actions)

1. Run `python fetch.py --auth` locally once to generate `~/.garth/oauth2_token`
2. Base64-encode the token:
   ```bash
   base64 ~/.garth/oauth2_token
   ```
3. Add it as a GitHub Actions secret named **`GARTH_SESSION`**

The workflow runs nightly, commits updated `garmin.db` + fresh JSON files, and Vercel redeploys automatically.

## Panels

| Panel | What it shows |
|---|---|
| Overview | Totals — runs, distance, time, best pace, VO₂ max |
| Weekly Mileage | Bar chart + 4-week rolling average (12 / 26 / 52 week view) |
| Pace Trend | Pace over time, optionally overlaid with avg HR |
| HR Zone Distribution | Time in each zone (last 30 / 90 / 180 days) |
| Aerobic Efficiency | Pace vs HR scatter — improving fitness drifts left/down |
| Recent Activities | Last 15 runs in table form |
