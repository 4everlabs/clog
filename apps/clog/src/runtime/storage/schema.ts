export const RUNTIME_STORAGE_PRAGMAS = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
`;

export const RUNTIME_STORAGE_SCHEMA = `
CREATE TABLE IF NOT EXISTS runtime_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_findings (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  first_seen_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_threads (
  id TEXT PRIMARY KEY,
  channel TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_action_results (
  action_id TEXT PRIMARY KEY,
  payload TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runtime_memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  importance INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  metadata TEXT DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_memories_type ON runtime_memories(type);
CREATE INDEX IF NOT EXISTS idx_memories_importance ON runtime_memories(importance DESC);
CREATE INDEX IF NOT EXISTS idx_memories_created ON runtime_memories(created_at DESC);
`;