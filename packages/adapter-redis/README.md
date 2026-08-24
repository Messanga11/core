# @messanga11/adapter-redis

Server-only Redis 8 adapter using versioned Redis Functions for fail-closed
rate limits, quotas and idempotency.

The default transport requires a TLS `rediss:` URL. Public contracts expose
only Messanga11 ports and a small injected function transport; no `redis`
library type leaks into application code. Keys derived from actor, tenant,
operation and idempotency data are SHA-256 hashed before storage.

```ts
import {
  createNodeRedisFunctionTransport,
  createRedisRateLimitPort,
} from "@messanga11/adapter-redis";

const transport = createNodeRedisFunctionTransport({
  url: process.env.REDIS_URL ?? "",
});
const rateLimit = createRedisRateLimitPort({
  limit: 60,
  namespace: "api",
  transport,
  windowMs: 60_000,
});
```
