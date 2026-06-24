# Garmin Running Dashboard

A personal running analytics dashboard powered by [garth](https://github.com/matin/garth) and Garmin Connect.

## Stack

| Layer | Tech |
|---|---|
| Data fetch | Python + garth |
| Storage | SQLite |
| API | FastAPI |
| Frontend | React + Vite + Recharts |
| Automation | GitHub Actions (nightly cron) |

## Setup

### 1. Backend — first-time auth

```bash
cd backend
pip install -r requirements.txt

# Authenticate once — saves session to ~/.garth
python fetch.py --auth

# Pull your last 500 running activities
python fetch.py --limit 500
```

The session token is saved to `~/.garth`. Subsequent runs use it without re-entering credentials.

### 2. Backend — run the API

```bash
uvicorn api:app --reload --port 8001
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev      # → http://localhost:5174
```

## Automated sync (GitHub Actions)

The workflow in `.github/workflows/sync.yml` runs nightly at 03:00 UTC.

**Setup steps:**

1. Run `python fetch.py --auth` locally once.
2. Base64-encode your garth token:
   ```bash
   base64 ~/.garth/oauth2_token
   ```
3. Add the result as a GitHub Actions secret named `GARTH_SESSION`.

The workflow restores the token, syncs new activities, and commits the updated `garmin.db` back to the repo.

## Panels

| Panel | What it shows |
|---|---|
| Overview | Totals — runs, distance, time, best pace, VO₂ max |
| Weekly Mileage | Bar chart + 4-week rolling average |
| Pace Trend | Pace over time, optionally overlaid with avg HR |
| HR Zone Distribution | Time in each heart rate zone (last 30/90/180 days) |
| Aerobic Efficiency | Pace vs HR scatter — improving fitness drifts left/down |
| Recent Activities | Last 15 runs in table form |
