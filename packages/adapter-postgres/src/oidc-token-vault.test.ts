import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createPostgresOidcTokenVault } from "./oidc-token-vault.js";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

describe("PostgreSQL OIDC token vault", () => {
  it("encrypts tokens at rest and decrypts them only for the tenant session", async () => {
    let stored: readonly unknown[] | undefined;
    const client: SqlClientPort = {
      async query<Row extends Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
      ) {
        if (text.startsWith("INSERT INTO oidc_token_vault")) stored = values;
        const rows =
          text.startsWith("SELECT ciphertext") && stored
            ? [{ auth_tag: stored[4], ciphertext: stored[2], nonce: stored[3] }]
            : [];
        return { rowCount: rows.length, rows: rows as unknown as Row[] };
      },
    };
    const pool: SqlPoolPort = {
      connect: async () => client,
      end: async () => undefined,
    };
    const vault = createPostgresOidcTokenVault({
      encryptionKey: randomBytes(32).toString("base64"),
      pool,
    });
    const tokens = {
      accessToken: "access-secret",
      expiresInSeconds: 300,
      idToken: "id-secret",
      refreshToken: "refresh-secret",
    } as const;

    await vault.save({
      ...tokens,
      sessionId: "session-1",
      tenantId: "tenant-1",
    });

    expect(stored?.join(" ")).not.toContain("access-secret");
    await expect(
      vault.resolve({ sessionId: "session-1", tenantId: "tenant-1" }),
    ).resolves.toEqual(tokens);
  });

  it("rejects invalid encryption keys before opening a connection", () => {
    const pool = { connect: async () => undefined, end: async () => undefined };
    expect(() =>
      createPostgresOidcTokenVault({
        encryptionKey: "",
        pool: pool as unknown as SqlPoolPort,
      }),
    ).toThrow("32-byte");
  });
});
