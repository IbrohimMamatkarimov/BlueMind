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

## Checking the markup

The importer validates structure, not markup. Check the markup with:

```bash
npm run mocks:check
```

That renders every math span through the real `MathText` pipeline and fails on
three things the importer lets through but a student would see: an unbalanced
`$`, a span KaTeX rejects (the app quietly prints such a span as raw LaTeX
source in gray), and English prose caught inside a span. Pass a folder to check
just one set: `npm run mocks:check -- content/mocks/2026-march-us-b`.

**Write money in words.** `$` is *always* a math delimiter here — `splitMath`
has no escape handling, so `\$8.00` is exactly as broken as `$8.00`. A currency
sign either vanishes into a math span or pairs up with a later one and swallows
the sentence between them. Write `8 dollars`, as every existing set does.

## Available sets

| Folder | Test | Questions |
| --- | --- | --- |
| `2026-march-int-a` | March 2026 International, Form A | 98 (R&W 27 + 27, Math 22 + 22) |
| `2026-march-us-a` | March 2026 US, Form A | 98 (R&W 27 + 27, Math 22 + 22) |
| `2026-march-int-b` | March 2026 International, Form B | 98 (R&W 27 + 27, Math 22 + 22) |
| `2026-march-us-b` | March 2026 US, Form B | 98 (R&W 27 + 27, Math 22 + 22) |
| `2023-june-v1` | June 2023 International, Version 1 | 97 (R&W 26 + 27, Math 22 + 22) |
| `2023-june-v2` | June 2023 International, Version 2 | 98 (R&W 27 + 27, Math 22 + 22) |
| `2023-october-int-a` | October 2023 International, Form A | 72 (R&W 26 + 25, Math 21) |
| `2023-october-int-b` | October 2023 International, Form B | 27 (R&W Module 1 only) |
| `2023-march` | March 2023, Reading & Writing only | 52 (R&W 31 + 21) |
| `2023-may` | May 2023, Reading & Writing only | 37 (R&W 23 + 14) |

Not every real paper is the standard 27/22, and not every source reconstruction
is complete. Some of the 2023 sets are Reading & Writing only, some have modules
of other sizes, and several are missing individual questions the source never
captured — `2023-october-int-a` has no second Math module at all, and
`2023-october-int-b` is a single Reading & Writing module. A module that is
deliberately a different size declares its own `questionCount`; that opts out of
the standard 27/22 check but still pins the module to an exact number, so a
genuine transcription slip is still caught. Where questions are missing, the
remaining ones are renumbered 1..n. Each mock's `notes` records what is missing
and where the transcription departs from the source answer key.
