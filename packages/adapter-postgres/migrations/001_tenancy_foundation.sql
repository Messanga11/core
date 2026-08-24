CREATE TABLE tenants (
  id text PRIMARY KEY CHECK (length(id) BETWEEN 1 AND 128),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  version bigint NOT NULL CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE memberships (
  id text NOT NULL,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identity_id text NOT NULL,
  identity_kind text NOT NULL CHECK (identity_kind IN ('human', 'service')),
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  status text NOT NULL CHECK (status IN ('active', 'suspended')),
  version bigint NOT NULL CHECK (version > 0),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, identity_id)
);
CREATE INDEX memberships_identity_idx ON memberships (tenant_id, identity_id);
CREATE TABLE invitations (
  id text NOT NULL,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  role text NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
  token_hash text NOT NULL CHECK (length(token_hash) BETWEEN 32 AND 256),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  accepted_at timestamptz,
  version bigint NOT NULL CHECK (version > 0),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, token_hash)
);
CREATE INDEX invitations_hash_idx ON invitations (tenant_id, token_hash);

CREATE TABLE sessions (
  id text PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  identity_id text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX sessions_tenant_identity_idx ON sessions (tenant_id, identity_id);

CREATE TABLE audit_events (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  event_id text NOT NULL UNIQUE,
  occurred_at timestamptz NOT NULL,
  body jsonb NOT NULL CHECK (jsonb_typeof(body) = 'object')
);
CREATE INDEX audit_events_tenant_sequence_idx ON audit_events (tenant_id, sequence);

CREATE TABLE outbox (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id text NOT NULL REFERENCES tenants(id),
  event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL,
  available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  claimed_by text,
  claimed_at timestamptz,
  published_at timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0)
);
CREATE INDEX outbox_pending_idx ON outbox (available_at, sequence) WHERE published_at IS NULL;

CREATE TABLE idempotency_keys (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  key text NOT NULL CHECK (length(key) BETWEEN 16 AND 128),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, key)
);

ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants FORCE ROW LEVEL SECURITY;
ALTER TABLE memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox FORCE ROW LEVEL SECURITY;
ALTER TABLE idempotency_keys FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_tenant_isolation ON memberships USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY tenants_tenant_isolation ON tenants USING (id = current_setting('app.tenant_id', true)) WITH CHECK (id = current_setting('app.tenant_id', true));
CREATE POLICY invitations_tenant_isolation ON invitations USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY sessions_tenant_isolation ON sessions USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY audit_tenant_isolation ON audit_events USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY outbox_tenant_isolation ON outbox USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
CREATE POLICY idempotency_tenant_isolation ON idempotency_keys USING (tenant_id = current_setting('app.tenant_id', true)) WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE FUNCTION reject_audit_event_mutation() RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = '55000';
END;
$$;
CREATE TRIGGER audit_events_append_only
BEFORE UPDATE OR DELETE ON audit_events
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
