ALTER TABLE sessions
  ADD COLUMN identity_kind text NOT NULL DEFAULT 'human'
    CHECK (identity_kind IN ('human', 'service')),
  ADD COLUMN identity_issuer text NOT NULL DEFAULT 'https://invalid.local/'
    CHECK (length(identity_issuer) BETWEEN 9 AND 2048),
  ADD COLUMN created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  ADD COLUMN idle_expires_at timestamptz NOT NULL DEFAULT clock_timestamp();

ALTER TABLE sessions ALTER COLUMN identity_kind DROP DEFAULT;
ALTER TABLE sessions ALTER COLUMN identity_issuer DROP DEFAULT;

CREATE INDEX sessions_expiry_idx
  ON sessions (tenant_id, idle_expires_at, expires_at)
  WHERE revoked_at IS NULL;
