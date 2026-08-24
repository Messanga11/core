import { randomUUID } from "node:crypto";
import { createClient } from "redis";
import { describe, expect, it } from "vitest";
import { REDIS_FUNCTION_LIBRARY } from "./functions";

const redisUrl = process.env.REDIS_INTEGRATION_URL;
const describeRedis = redisUrl ? describe : describe.skip;

describeRedis("Redis 8 functions integration", () => {
  it("loads the versioned function library and applies rate limits atomically", async () => {
    if (!redisUrl) {
      throw new Error("REDIS_INTEGRATION_URL is required.");
    }
    const client = createClient({ url: redisUrl });
    await client.connect();
    try {
      await client.functionLoad(REDIS_FUNCTION_LIBRARY, { REPLACE: true });
      const key = `integration:rate:${randomUUID()}`;
      const first = await client.fCall("m11_rate_limit_v1", {
        arguments: ["1", "1", "10000"],
        keys: [key],
      });
      const second = await client.fCall("m11_rate_limit_v1", {
        arguments: ["1", "1", "10000"],
        keys: [key],
      });

      expect(first).toEqual([1, 0, 0]);
      expect(second).toEqual([0, 0, expect.any(Number)]);
    } finally {
      await client.close();
    }
  });
});
