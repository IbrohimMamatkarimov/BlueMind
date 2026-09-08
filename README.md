# BlueMind — SAT Practice

BlueMind is a Next.js application for SAT mock tests, focused Question Bank practice, and progress tracking. The database is Postgres (Supabase).

## Student experience

- Mock Tests: full papers and individual modules, with timed, untimed, and exam modes.
- Question Bank: subject cards, skill and difficulty filters, question selection across pages, and focused practice sets.
- Progress: real session history, accuracy by subject, daily trends, and direct links to practice weaker skills.
- One responsive layout and light/dark preference across the catalog, student pages, and tests.
- Repeated “Bluemind.uz” attribution appears on test questions, diagrams, passages, and result reviews. General navigation and browsing pages have no watermark.

Coach is retired: its page redirects to Mock Tests and its API endpoints return HTTP 410. Existing conversations, inactive Coach source files, and shared admin AI helpers are retained. Admin extraction, classification, and explanation generation remain available.

## Saved results

New signed-in submissions are graded on the server and saved in the additive `study_results` table. Each attempt has a stable submission ID so retries do not duplicate history. Question Bank history and skill statistics are saved in one transaction. Module retakes update the catalog’s latest result while retaining earlier attempts for exact review.

The schema initializes through `src/lib/db.ts` on the next database connection after deployment. It creates the new history table without deleting existing records. No destructive migration is required. Guest sessions remain local to the browser. Progress includes available older result snapshots; overwritten historical retakes cannot be reconstructed. Percentages are question accuracy, not official SAT scaled scores.

## Verification

See `tests/README.md` for session, persistence, and fixture-based browser checks.

## Setup

Create a local `.env` using `.env.example` as the starting point. Configure:

```dotenv
DATABASE_URL="postgresql://USER:PASSWORD@HOST:6543/postgres"
SESSION_SECRET="a-long-random-secret"
GROQ_API_KEY="optional-admin-ai-key"
```

The Groq key powers admin question extraction, classification, and explanation tools. Gemini configuration is only needed for the separate mock-import helper.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Use `npm run build` and `npm start` for a production build. Database schema additions run through the app’s normal database initialization. The seed and reset scripts are for disposable development databases; they clear existing data.

## Deployment

bluemind.uz runs from `/var/www/bluemind/BlueMind` on the VPS, on `main`, under the
`bluemind` systemd service. Work is committed straight to `main` and pushed; the
server is a read-only mirror of it and never carries its own commits.

To ship whatever is on `main`:

```sh
ssh bluemind-vps bluemind-deploy
```

`bluemind-deploy` is a one-line wrapper in `/usr/local/bin` that runs this repo's
`deploy.sh`, so the deploy logic is version-controlled and updates with a pull.
Pass `--no-pull` to rebuild what is already checked out (after editing `.env`,
for example).

`deploy.sh` fast-forwards `main`, runs `npm ci` only when `package-lock.json`
moved, builds into `.next-staging` so the live site keeps serving the previous
build while compiling, swaps the new build in, restarts the service, and checks
the site answers. A failed build never touches the live site; a build that
compiles but fails to serve is rolled back to the previous one automatically.

Because Next.js compiles ahead of time, a plain `git pull` is not enough for code
changes — use `deploy.sh`. Mock content is the exception: `/api/public/mocks` is
dynamic, so importing a mock on the server shows up without a rebuild.

## Architecture

- `src/components/AppShell.tsx` and `Sidebar.tsx`: shared layout and navigation.
- `src/lib/theme.ts`: shared light/dark preference, including the legacy homepage preference.
- `src/components/TextWatermarkOverlay.tsx`: question attribution for tests and reviews.
- `src/lib/study-history.ts`: immutable submissions and latest module results.
- `src/lib/progress-summary.ts`: question-weighted accuracy and skill summaries.
- `src/lib/groq.ts`: admin AI helpers, with inactive Coach code retained.
- `src/lib/scoring.ts` and `adaptive.ts`: legacy score-estimation and adaptive-practice services. Full exams use fixed modules and report question accuracy.
