# Rockie

AI-powered rock climbing analysis app. Record a climb, get your efficiency score, pose breakdown, and actionable feedback — all on your phone.

![iOS App](https://img.shields.io/badge/platform-iOS-black) ![Python](https://img.shields.io/badge/cv--worker-Python-blue) ![Expo](https://img.shields.io/badge/app-Expo%20SDK%2054-white)

---

## What it does

- **Upload a climb video** from your library or record directly
- **CV pipeline** extracts pose data frame-by-frame using MediaPipe
- **Efficiency score** (0–100) based on hip drops, barn doors, foot swaps, arm shake
- **Annotated clips** — full, crux, and best sequence highlights
- **AI feedback** — specific, actionable coaching based on your movement patterns
- **Progress dashboard** — track scores over time with trend chart

---

## Stack

| Layer | Tech |
|-------|------|
| iOS App | Expo (React Native) + Expo Router + Clerk + Supabase |
| CV Worker | FastAPI + MediaPipe Tasks + FFmpeg |
| Database | Supabase (PostgreSQL + Storage) |
| Deployment | Railway (CV worker) |
| Auth | Clerk |

---

## Repo structure

```
rockie/
├── rockie-app/          # Expo iOS app
│   ├── app/             # Expo Router screens
│   ├── lib/             # Supabase + API clients
│   └── components/      # Shared components
├── cv-worker/           # FastAPI CV pipeline
│   ├── main.py          # API entrypoint
│   ├── services/        # pose_extractor, scorer, clip_annotator, etc.
│   └── Dockerfile
└── supabase/
    └── migrations/      # DB schema
```

---

## Running locally

### CV Worker

```bash
cd cv-worker
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # add SUPABASE_URL + SUPABASE_SERVICE_KEY
python3 -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### iOS App

```bash
cd rockie-app
npm install
cp .env.example .env.local   # add Supabase + Clerk keys
npx expo start
```

---

## Environment variables

**cv-worker/.env**
```
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```

**rockie-app/.env.local**
```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=
EXPO_PUBLIC_CV_WORKER_URL=
```
