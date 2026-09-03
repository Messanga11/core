CREATE TABLE outbox_dead_letters (
  tenant_id text NOT NULL REFERENCES tenants(id),
  sequence bigint NOT NULL,
  event_id text NOT NULL,
  event_type text NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz NOT NULL,
  failed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL CHECK (attempts > 0),
  failure_code text NOT NULL CHECK (failure_code ~ '^[A-Z][A-Z0-9_]{0,63}$'),
  PRIMARY KEY (tenant_id, sequence),
  UNIQUE (tenant_id, event_id)
);

CREATE INDEX outbox_dead_letters_failed_idx
  ON outbox_dead_letters (tenant_id, failed_at DESC);

ALTER TABLE outbox_dead_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_dead_letters FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_dead_letters_tenant_isolation
  ON outbox_dead_letters
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE TRIGGER outbox_dead_letters_append_only
BEFORE UPDATE OR DELETE ON outbox_dead_letters
FOR EACH ROW EXECUTE FUNCTION reject_audit_event_mutation();
