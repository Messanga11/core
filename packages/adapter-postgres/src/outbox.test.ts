import type { TenantId } from "@messanga11/tenancy";
import { expect, it } from "vitest";
import { createPostgresOutbox } from "./outbox.js";
import type { SqlClientPort, SqlPoolPort } from "./sql.js";

it("claims a bounded tenant-scoped batch using SKIP LOCKED", async () => {
  const calls: Array<{ text: string; values?: readonly unknown[] }> = [];
  const client: SqlClientPort = {
    async query<Row extends Record<string, unknown>>(
      text: string,
      values?: readonly unknown[],
    ) {
      calls.push(values ? { text, values } : { text });
      const rows = text.includes("SKIP LOCKED")
        ? [
            {
              sequence: "1",
              event_id: "event-1",
              event_type: "tenancy.tenant.created.v1",
              payload: {},
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
  const messages = await createPostgresOutbox(pool).claim({
    limit: 10,
    tenantId: "tenant-1" as TenantId,
    workerId: "worker-1",
  });
  const claim = calls.find((call) => call.text.includes("SKIP LOCKED"));
  expect(claim?.text).toContain("tenant_id = $1");
  expect(claim?.values).toEqual(["tenant-1", 10, "worker-1"]);
  expect(messages[0]?.eventId).toBe("event-1");
  await createPostgresOutbox(pool).markPublished({
    sequences: [1],
    tenantId: "tenant-1" as TenantId,
    workerId: "worker-1",
  });
  expect(
    calls.find((call) => call.text.includes("published_at = clock_timestamp"))
      ?.values,
  ).toEqual(["tenant-1", "worker-1", [1]]);
  await expect(
    createPostgresOutbox(pool).claim({
      limit: 101,
      tenantId: "tenant-1" as TenantId,
      workerId: "worker-1",
    }),
  ).rejects.toBeInstanceOf(RangeError);
});
