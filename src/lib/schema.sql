-- BlueMind database schema — Postgres (Supabase).
--
-- SQLite's datetime('now') has no Postgres equivalent, so every default is
-- replaced with an explicit to_char(...) expression that reproduces the
-- exact same string shape the app already expects everywhere
-- (YYYY-MM-DDTHH:MI:SS.mmmZ, i.e. real ISO 8601 with a literal T and Z) —
-- this is deliberate: keeping these columns as TEXT with an ISO-string
-- default means every existing `new Date(row.created_at)` call, every
-- string comparison, and every sort-by-created_at in the app keeps working
-- completely unchanged, rather than switching to a native TIMESTAMPTZ
-- column (which node-postgres would hand back as a JS Date object instead
-- of a string, silently changing behavior everywhere that column is used).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  is_guest INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS mocks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,                     -- e.g. 'Form V1', 'ElitePractice X2'
  group_label TEXT NOT NULL DEFAULT '2026', -- sidebar grouping: '2026' | '2025' | '2024' | 'BlueMind Tests'
  month TEXT NOT NULL,
  year INTEGER NOT NULL,
  order_in_month INTEGER NOT NULL DEFAULT 1,
  total_questions INTEGER NOT NULL DEFAULT 98,
  duration_minutes INTEGER NOT NULL DEFAULT 134,
  is_official INTEGER NOT NULL DEFAULT 0,
  official_source TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  mock_id TEXT REFERENCES mocks(id),
  section TEXT NOT NULL,             -- 'Reading and Writing' | 'Math'
  domain TEXT NOT NULL,
  skill TEXT NOT NULL,
  difficulty TEXT NOT NULL,          -- 'Easy' | 'Medium' | 'Hard'
  module INTEGER NOT NULL,           -- 1 or 2
  module_pool TEXT,                  -- 'higher' | 'lower' | NULL
  passage_text TEXT,                 -- Reading & Writing only: the left-pane passage/stimulus, shown
                                      -- split-screen next to question_text (the right-pane stem).
                                      -- NULL/empty for Math, where question_text is the whole question.
  question_text TEXT NOT NULL,
  choices TEXT NOT NULL,             -- JSON [{id,text}]
  correct_answer TEXT NOT NULL,
  question_type TEXT NOT NULL,       -- 'multiple_choice' | 'spr'
  rationale TEXT NOT NULL,
  explanation TEXT NOT NULL,
  estimated_time INTEGER NOT NULL DEFAULT 75,
  source TEXT NOT NULL DEFAULT 'BlueMind',
  version INTEGER NOT NULL DEFAULT 1,
  review_status TEXT NOT NULL DEFAULT 'validated',
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  mock_id TEXT NOT NULL REFERENCES mocks(id),
  status TEXT NOT NULL DEFAULT 'in_progress',   -- in_progress | completed | abandoned
  current_section TEXT NOT NULL DEFAULT 'Reading and Writing',
  current_module INTEGER NOT NULL DEFAULT 1,
  current_module_started_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  started_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  completed_at TEXT,
  rw_routing_pool TEXT,
  rw_routing_reason TEXT,
  math_routing_pool TEXT,
  math_routing_reason TEXT,
  adaptive_rule_version TEXT NOT NULL DEFAULT 'v1'
);

CREATE TABLE IF NOT EXISTS answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  question_id TEXT NOT NULL REFERENCES questions(id),
  section TEXT NOT NULL,
  module INTEGER NOT NULL,
  skill TEXT NOT NULL,
  difficulty TEXT NOT NULL,
  selected_answer TEXT,
  correct_answer TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  marked_for_review INTEGER NOT NULL DEFAULT 0,
  mistake_type TEXT,
  coach_analysis TEXT,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE(attempt_id, question_id)
);

CREATE TABLE IF NOT EXISTS module_results (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  mock_id TEXT NOT NULL REFERENCES mocks(id),
  section TEXT NOT NULL,             -- 'Reading and Writing' | 'Math'
  module INTEGER NOT NULL,           -- 1 or 2
  correct_count INTEGER NOT NULL,
  total INTEGER NOT NULL,
  results_json TEXT NOT NULL,        -- the full graded-question array, so Review can render without re-fetching
  completed_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE(user_id, mock_id, section, module)
);
CREATE INDEX IF NOT EXISTS idx_module_results_user ON module_results(user_id);

CREATE TABLE IF NOT EXISTS module_releases (
  mock_id TEXT NOT NULL REFERENCES mocks(id),
  section TEXT NOT NULL,             -- 'Reading and Writing' | 'Math'
  module INTEGER NOT NULL,           -- 1 or 2
  released INTEGER NOT NULL DEFAULT 0,
  released_at TEXT,
  PRIMARY KEY (mock_id, section, module)
);

CREATE TABLE IF NOT EXISTS score_conversions (
  id TEXT PRIMARY KEY,
  mock_id TEXT NOT NULL REFERENCES mocks(id),
  section TEXT NOT NULL,
  conversion_version TEXT NOT NULL DEFAULT 'v1',
  table_json TEXT NOT NULL,
  source TEXT NOT NULL,
  is_official INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS score_records (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES attempts(id),
  section TEXT NOT NULL,             -- 'Reading and Writing' | 'Math' | 'Total'
  raw_score INTEGER NOT NULL,
  conversion_method TEXT NOT NULL,   -- 'official_table' | 'bluemind_estimate'
  lower_score INTEGER NOT NULL,
  upper_score INTEGER NOT NULL,
  estimated_score INTEGER NOT NULL,
  is_official_conversion INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  conversion_version TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS coach_conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  attempt_id TEXT,
  question_id TEXT,
  mode TEXT NOT NULL DEFAULT 'coach',
  messages TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  updated_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  question_ids TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  completed_at TEXT,
  correct_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS skill_stats (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  section TEXT NOT NULL,
  domain TEXT NOT NULL,
  skill TEXT NOT NULL,
  correct INTEGER NOT NULL DEFAULT 0,
  attempted INTEGER NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  UNIQUE(user_id, skill)
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS question_reports (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  user_id TEXT,                      -- NULL for guest reports
  reason TEXT NOT NULL,              -- 'wrong_answer' | 'typo' | 'unclear' | 'broken' | 'other'
  details TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'resolved' | 'dismissed'
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')),
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON question_reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_question ON question_reports(question_id);

CREATE TABLE IF NOT EXISTS practice_attempts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  section TEXT NOT NULL,
  skill TEXT NOT NULL,
  is_correct INTEGER NOT NULL,
  attempt_number INTEGER NOT NULL DEFAULT 1, -- 1st, 2nd... time this user has answered this exact question
  created_at TEXT NOT NULL DEFAULT (to_char(now() AT TIME ZONE 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_user_skill ON practice_attempts(user_id, skill);
CREATE INDEX IF NOT EXISTS idx_practice_attempts_user_question ON practice_attempts(user_id, question_id);

CREATE INDEX IF NOT EXISTS idx_questions_mock ON questions(mock_id);
CREATE INDEX IF NOT EXISTS idx_questions_skill ON questions(skill);
CREATE INDEX IF NOT EXISTS idx_answers_attempt ON answers(attempt_id);
CREATE INDEX IF NOT EXISTS idx_attempts_user ON attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_skillstats_user ON skill_stats(user_id);
