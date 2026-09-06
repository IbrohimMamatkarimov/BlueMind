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
