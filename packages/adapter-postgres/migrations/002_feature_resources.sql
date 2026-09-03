CREATE TABLE messanga11_feature_records (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (length(resource) BETWEEN 1 AND 128),
  id text NOT NULL CHECK (length(id) BETWEEN 1 AND 128),
  data jsonb NOT NULL CHECK (jsonb_typeof(data) = 'object'),
  version bigint NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, resource, id)
);

CREATE INDEX messanga11_feature_records_resource_updated_idx
  ON messanga11_feature_records (tenant_id, resource, updated_at DESC, id);

CREATE TABLE messanga11_feature_idempotency (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  resource text NOT NULL CHECK (length(resource) BETWEEN 1 AND 128),
  operation text NOT NULL CHECK (operation IN ('create', 'update', 'delete')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 16 AND 128),
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, resource, operation, idempotency_key)
);

ALTER TABLE messanga11_feature_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE messanga11_feature_records FORCE ROW LEVEL SECURITY;
ALTER TABLE messanga11_feature_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE messanga11_feature_idempotency FORCE ROW LEVEL SECURITY;

CREATE POLICY messanga11_feature_records_tenant_isolation
  ON messanga11_feature_records
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

CREATE POLICY messanga11_feature_idempotency_tenant_isolation
  ON messanga11_feature_idempotency
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
