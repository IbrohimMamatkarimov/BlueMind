# BlueMind — Free SAT Prep Platform

## ⚠️ Status: Checkpoint build (in progress)

This is a **working checkpoint**, not the finished product yet. Here's exactly
what works right now and what's still coming, so you know what to expect.

### ✅ Working right now
- Full data model (SQLite via `better-sqlite3` — zero external services needed)
- Sign up / log in / log out / guest sessions (bcrypt + signed session cookies)
- Dashboard with **real data**: latest score, points gained, Next 100,
  Today's Practice, Continue card, Your BlueMind weaknesses
- Mocks library page — grouped by month (August 2026 down to March 2026),
  18 mocks seeded, each with a full 98-question delivery set (plus higher/lower
  adaptive pools — 147 questions banked per mock)
- Scoring service (`src/lib/scoring.ts`) — configurable, distinguishes
  Official College Board conversions from BlueMind estimates
- Adaptive routing service (`src/lib/adaptive.ts`) — deterministic,
  difficulty-weighted, fully disclosed as "BlueMind Adaptive Practice"
  (not a reproduction of College Board's proprietary algorithm)
- Gemini Coach server wrapper (`src/lib/gemini.ts`) — structured JSON output,
  timeout + fallback, key is server-side only

### 🚧 Not built yet (next pass)
- The actual test-taking screen (timer, question navigation, answer selection)
- Results page / mistake review page
- Coach chat UI
- Practice session UI
- Progress page (charts)

Clicking "Start Mock" right now will create a real attempt record in the
database but the `/test/[attemptId]` page doesn't exist yet, so you'll hit a
404 there. Everything else listed above under "Working" is fully functional.

---

## Setup

```bash
npm install
npm run db:seed     # creates bluemind.db with demo user + 18 mocks + history
npm run dev          # http://localhost:3000
```

Demo login: **demo@bluemind.app** / **demo1234**

## Environment variables (`.env`)

Already included for local dev with your Gemini key wired in. **Rotate this
key** in [Google AI Studio](https://aistudio.google.com/apikey) once you're
done testing, since it was shared in plaintext chat — treat it as exposed.

```
DATABASE_URL="file:./dev.db"        # reserved for a future Postgres migration
GEMINI_API_KEY="..."                # server-side only, never sent to browser
SESSION_SECRET="..."                # change this before any real deployment
```

Note: the app currently reads/writes `bluemind.db` directly via
`better-sqlite3` (see `src/lib/db.ts`) rather than through the `DATABASE_URL`
env var — that variable is reserved for when you migrate to Postgres/Supabase
for production (see below).

## Moving to production

SQLite is great for local dev but won't survive most serverless hosts
(Vercel's filesystem is ephemeral). Before deploying:

1. Swap `src/lib/db.ts` for a Postgres client (e.g. `pg` or Supabase's client)
   — the schema in `src/lib/schema.sql` translates 1:1 to Postgres types.
2. Everything else (scoring, adaptive routing, Gemini) is already
   backend-agnostic.

## Architecture notes

- `src/lib/scoring.ts` — the ONLY place score math happens. Call
  `calculateBlueMindScore()`, never compute scores elsewhere.
- `src/lib/adaptive.ts` — the ONLY place module-routing decisions happen.
  Call `selectNextModule()`, never hardcode routing in a component.
- `src/lib/gemini.ts` — the ONLY place the Gemini API is called. Runs
  server-side only; the API key never reaches the browser.
