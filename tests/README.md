# Exam session checks

Run the focused structure, availability, and clock checks with:

```sh
npx tsx --test tests/test-session.test.ts
```

For the browser checks, start the app with `npm run dev`, make the `playwright`
package available (installed locally or supplied through `NODE_PATH`), and have
Google Chrome installed. Then run:

```sh
node tests/exam-flow.cjs
```

Set `EXAM_TEST_URL` to use a different local preview address. Optional
`EXAM_SCREENSHOT_DIR` saves screenshots. The browser uses an isolated guest
profile and intercepts all API requests with fixtures; it does not use the live
question database.

The browser suite covers the Full Exam catalog, incomplete papers, the four
modules in sequence, deferred results, saving and resuming modules and breaks,
fullscreen loss and focus warnings, paused timers, submission retry, the required
exam-mode break, untimed practice, storage failure, automatic submission, refused
fullscreen permission, and the mobile catalog.

Progress is local to the browser and device. Full-exam progress uses a separate
key from individual module practice. Full exams use the paper's fixed modules;
they do not implement College Board's adaptive routing or scaled scoring.

## Progress and design checks

Run the focused session, accuracy, retry, rollback, user-isolation, and math
rendering checks:

```sh
node --import tsx --test --test-isolation=none tests/test-session.test.ts tests/progress-summary.test.ts tests/study-history.test.ts tests/math-text.test.ts
```

`math-text.test.ts` renders its expectations through real KaTeX, so it catches
the preprocessing in `MathText.tsx` producing LaTeX that KaTeX rejects — which
shows up in the app as an equation printed as raw source instead of an error.

With a development preview running, Playwright on `NODE_PATH`, and Chrome available:

```sh
node tests/design-flow.cjs
```

`EXAM_TEST_URL` selects the preview (defaults to port 3100 for the design checks). The design suite temporarily creates `src/app/design-check/page.tsx` from `tests/fixtures/design-page.tsx` and removes it in `finally`. It refuses to overwrite an existing route. API responses use fixtures, except checks that retired Coach endpoints return 410. Never run a production build while the design suite is running.

Screenshots are written under `.next-design/screenshots`. The suite verifies light/dark layouts, mobile overflow, selection across pages, progress empty/error states, exact historical reviews, and attribution on both question panes.

For an isolated preview or build, set `BLUEMIND_DIST_DIR=.next-design`. Keep the normal `.next` folder when deploying.
