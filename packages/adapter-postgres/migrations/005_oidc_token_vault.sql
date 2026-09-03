CREATE TABLE oidc_token_vault (
  tenant_id text NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  session_id text NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ciphertext bytea NOT NULL,
  nonce bytea NOT NULL CHECK (octet_length(nonce) = 12),
  auth_tag bytea NOT NULL CHECK (octet_length(auth_tag) = 16),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, session_id)
);

CREATE INDEX oidc_token_vault_expiry_idx ON oidc_token_vault (expires_at);

ALTER TABLE oidc_token_vault ENABLE ROW LEVEL SECURITY;
ALTER TABLE oidc_token_vault FORCE ROW LEVEL SECURITY;

CREATE POLICY oidc_token_vault_tenant_isolation
  ON oidc_token_vault
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
