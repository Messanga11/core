import type {
  SessionId,
  SessionStorePort,
  SessionTokenDigest,
} from "@messanga11/auth-oidc";
import { describe, expect, it } from "vitest";
import { createPostgresSessionStore } from "./session-store.js";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

describe("PostgreSQL OIDC session store", () => {
  it("creates and resolves a session only inside its claimed tenant RLS context", async () => {
    const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
    const client: SqlClientPort = {
      async query<Row extends Record<string, unknown>>(
        text: string,
        values?: readonly unknown[],
      ) {
        calls.push(values ? { text, values } : { text });
        const rows = text.startsWith("SELECT id")
          ? [
              {
                created_at: "2026-09-03T12:00:00.000Z",
                expires_at: "2026-09-03T13:00:00.000Z",
                id: "session-1",
                identity_id: "actor_1",
                identity_issuer: "https://identity.example.com/",
                identity_kind: "human",
                idle_expires_at: "2026-09-03T12:30:00.000Z",
                tenant_id: "tenant-1",
              },
            ]
          : [];
        return { rowCount: rows.length, rows: rows as unknown as Row[] };
      },
    };
    const pool: SqlPoolPort = {
      connect: async () => client,
      end: async () => undefined,
    };
    const store: SessionStorePort = createPostgresSessionStore(pool);
    const record = {
      createdAt: "2026-09-03T12:00:00.000Z",
      expiresAt: "2026-09-03T13:00:00.000Z",
      idleExpiresAt: "2026-09-03T12:30:00.000Z",
      identity: {
        id: "actor_1" as never,
        issuer: "https://identity.example.com/",
        type: "human" as const,
      },
      sessionId: "session-1" as SessionId,
      tenantId: "tenant-1",
    };
    await store.create({
      record,
      tokenDigest: "a".repeat(64) as SessionTokenDigest,
    });
    await expect(
      store.resolve({
        tenantId: "tenant-1",
        tokenDigest: "a".repeat(64) as SessionTokenDigest,
      }),
    ).resolves.toEqual(record);
    expect(
      calls.filter((call) => call.text.includes("set_config")),
    ).toHaveLength(2);
    expect(
      calls.find((call) => call.text.startsWith("SELECT id"))?.text,
    ).toContain("revoked_at IS NULL");
  });

  it("rejects invalid tenant context before opening a connection", async () => {
    let connected = false;
    const pool: SqlPoolPort = {
      connect: async () => {
        connected = true;
        throw new Error("must not connect");
      },
      end: async () => undefined,
    };
    await expect(
      createPostgresSessionStore(pool).revoke({
        sessionId: "session-1" as SessionId,
        tenantId: "../other",
      }),
    ).rejects.toThrow("Invalid tenant");
    expect(connected).toBe(false);
  });
});
