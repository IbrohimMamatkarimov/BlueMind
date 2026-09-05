# Mock test content

Each sub-folder is one complete, hand-transcribed mock test ready to load into
the database:

```
content/mocks/<slug>/
  mock.json      # metadata + all four modules (see ../mock.schema.json)
  figures/*.png  # charts, tables and diagrams referenced from mock.json
```

Import one with:

```bash
npm run db:import-mock -- content/mocks/2026-march-int-a
```

The importer validates the whole file first (question counts, choice ids,
answer keys, figure files) and only then writes the mock, its questions and
its `module_releases` rows in a single transaction. Re-running it for a mock
that already exists (same title + subtitle) is refused unless you pass
`--replace`; pass `--no-release` to leave the modules hidden behind
"Coming soon" until an admin releases them.

Text fields use the same markup as the admin editor: `$...$` inline LaTeX,
`$$...$$` block LaTeX, `*italic*`, `__underline__`, and `______` (six
underscores) for a fill-in-the-blank. For Reading & Writing, `passageText` is
the left pane and `questionText` is the question stem; paired passages use
`Text 1` / `Text 2` headings and student notes are bullet lines.

## Available sets

| Folder | Test | Questions |
| --- | --- | --- |
| `2026-march-int-a` | March 2026 International, Form A | 98 (R&W 27 + 27, Math 22 + 22) |
