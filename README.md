# F1 Analytics Dashboard

Live F1 data dashboard built with React + Vite, powered by the OpenF1 API.

## Live App

- https://hello-world-theta-lyart-97.vercel.app/
- https://hello-world-crille.vercel.app

_(One of the above is the active deployment — check both on your device)_

## Features

- Lap time comparison across drivers
- Tire strategy Gantt chart
- Pace analysis and degradation curves
- Pit window predictor (FastF1-backed)
- Race / Sprint session toggle
- Instagram Stories export (4 shareable PNG cards)
- Home Assistant REST sensor integration

## Project Structure

```
f1-dashboard/   React + Vite frontend
f1-analysis/    FastAPI + FastF1 Python backend
```

## Running Locally

```bash
# Frontend
cd f1-dashboard && npm install && npm run dev

# Backend
cd f1-analysis && pip install -r requirements.txt && uvicorn main:app --reload
```
