-- InterviewArena secure authentication migration
-- Run once in Neon SQL Editor.

ALTER TABLE registrations
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS auth_session_user_idx ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS auth_session_exp_idx ON auth_sessions(expires_at);

-- Remove expired sessions periodically (safe to run manually).
DELETE FROM auth_sessions WHERE expires_at < NOW();
