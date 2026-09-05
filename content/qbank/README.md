# College Board Question Bank import

`npm run db:import-qbank` pulls the official SAT Question Bank (the content
behind satsuitequestionbank.collegeboard.org) into BlueMind's standalone
practice bank — every question lands in `questions` with `mock_id = NULL`,
`source = 'College Board Question Bank'` and its official 8-character ID in
`external_id`. Students browse it at **Question Bank → Browse**
(`/practice/browse`) and solve sets in the same exam screen the mocks use.

```bash
npm run db:import-qbank                     # download (cached) + import both sections
npm run db:import-qbank -- --section math   # one section: math | rw
npm run db:import-qbank -- --fetch-only     # fill the cache, don't touch the DB
npm run db:import-qbank -- --dry-run        # convert only → content/qbank/converted.json
npm run db:import-qbank -- --offline        # cache only, no network
npm run db:import-qbank -- --limit 40       # first N per section (testing)
npm run db:import-qbank -- --ids f1bfbed3,ac472881
```

Re-running is safe: questions are matched by `external_id` and updated in
place, so student history attached to a question survives a re-import.

## What the importer does

1. Downloads the SAT question lists (Reading and Writing, Math) and then each
   question's JSON, four at a time, into `content/qbank/raw/` (gitignored).
   Items in the older College Board format (an `ibn` code instead of an
   `external_id`, ~460 Math items) come from a second endpoint.
2. Converts the HTML to BlueMind's markup (`src/lib/qbank-convert.ts`):
   MathML → KaTeX LaTeX in `$…$` / `$$…$$`, inline SVG figures → the
   question's `image_data`, HTML tables → KaTeX arrays, `<em>` → `*italic*`,
   underlines → `__text__`, student notes → `• ` bullet lines. Older items
   store formulas as PNGs with spoken alt text, which is parsed back into
   LaTeX ("StartFraction 3 Over 4 EndFraction" → `\frac{3}{4}`).
3. Maps College Board's fine-grained Math skills onto BlueMind's taxonomy
   (`src/lib/sat-constants.ts`), e.g. "Linear equations in one variable" and
   "…in two variables" both become **Linear Equations**; the two statistics
   skills fold into **Data Interpretation**. Reading and Writing skill names
   already match.
4. Validates every question (choices, answer key, rationale) and writes them
   in batches. Anything skipped, and every conversion warning, is listed in
   `content/qbank/import-report.json`.

The cache means a full run only downloads once; delete `content/qbank/raw/`
to start fresh, or pass `--refresh-lists` to pick up newly released
questions while keeping the questions already downloaded.
