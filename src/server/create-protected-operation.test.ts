import { describe, expect, it, type Mock, vi } from "vitest";
import { z } from "zod";

import { isAccessGrant } from "../security/access-grant";
import type {
  ProtectedOperationPorts,
  ResourceScopePort,
} from "../security/ports";
import {
  createProtectedOperation,
  type ProtectedHandlerContext,
} from "./create-protected-operation";

const FIXED_DATE = new Date("2026-08-24T12:00:00.000Z");
const InputSchema = z.object({ name: z.string().min(1) }).strict();

interface TestInput {
  readonly name: string;
}

type TestHandler = (
  input: TestInput,
  context: ProtectedHandlerContext,
) => Promise<string>;

interface TestHarness {
  readonly audit: ReturnType<typeof vi.fn>;
  readonly authorization: ReturnType<typeof vi.fn>;
  readonly calls: string[];
  readonly commit: ReturnType<typeof vi.fn>;
  readonly handler: Mock<TestHandler>;
  readonly ports: ProtectedOperationPorts;
  readonly quota: ReturnType<typeof vi.fn>;
  readonly rateLimit: ReturnType<typeof vi.fn>;
  readonly release: ReturnType<typeof vi.fn>;
  readonly reporter: ReturnType<typeof vi.fn>;
}

function createHarness(): TestHarness {
  const calls: string[] = [];
  const commit = vi.fn(async () => {
    calls.push("quota:commit");
  });
  const release = vi.fn(async () => {
    calls.push("quota:release");
  });
  const authorization = vi.fn(async () => {
    calls.push("permission");
    return { allowed: true } as const;
  });
  const quota = vi.fn(async () => {
    calls.push("quota:reserve");
    return { allowed: true, reservation: { commit, release } } as const;
  });
  const rateLimit = vi.fn(async () => {
    calls.push("rate-limit");
    return { allowed: true } as const;
  });
  const audit = vi.fn(async (event: { phase: string; outcome: string }) => {
    calls.push(`audit:${event.phase}:${event.outcome}`);
  });
  const reporter = vi.fn(async () => undefined);
  const handler = vi.fn<TestHandler>(async (input) => {
    calls.push("handler");
    return `hello ${input.name}`;
  });

  return {
    audit,
    authorization,
    calls,
    commit,
    handler,
    ports: {
      audit: { record: audit },
      authorization: { authorize: authorization },
      clock: { now: () => FIXED_DATE },
      quota: { reserve: quota },
      rateLimit: { consume: rateLimit },
      reporter: { report: reporter },
    },
    quota,
    rateLimit,
    release,
    reporter,
  };
}

function validContext(withResource = false): unknown {
  return {
    actor: { id: "actor-1" },
    requestId: "request-1",
    ...(withResource
      ? { resource: { id: "resource-1", type: "document" } }
      : {}),
    tenantId: "tenant-1",
  };
}

function createOperation(
  harness: TestHarness,
  options: {
    readonly handler?: (
      input: TestInput,
      context: ProtectedHandlerContext,
    ) => Promise<string>;
    readonly resourceScope?: ResourceScopePort;
  } = {},
) {
  return createProtectedOperation({
    handler: options.handler ?? harness.handler,
    kind: "mutation",
    name: "document.create",
    permission: "document:create",
    ports: harness.ports,
    ...(options.resourceScope ? { resourceScope: options.resourceScope } : {}),
    schema: InputSchema,
  });
}

describe("createProtectedOperation", () => {
  it("executes the guarded mutation in the required order", async () => {
    const harness = createHarness();
    const operation = createOperation(harness);

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(result).toEqual({ data: "hello Ada", ok: true });
    expect(operation.schema).toBe(InputSchema);
    expect(harness.calls).toEqual([
      "permission",
      "quota:reserve",
      "rate-limit",
      "audit:intent:attempted",
      "handler",
      "quota:commit",
      "audit:result:succeeded",
    ]);
    expect(harness.release).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated context before every port and handler", async () => {
    const harness = createHarness();
    const operation = createOperation(harness);

    const result = await operation.execute({ context: null, input: {} });

    expect(result).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
      ok: false,
    });
    expect(harness.authorization).not.toHaveBeenCalled();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("denies a tenant or permission rejected by authorization", async () => {
    const harness = createHarness();
    harness.authorization.mockResolvedValueOnce({ allowed: false });
    const operation = createOperation(harness);

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(harness.quota).not.toHaveBeenCalled();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("enforces the configured resource scope", async () => {
    const harness = createHarness();
    const authorizeResource = vi.fn(async () => ({ allowed: false }) as const);
    const operation = createOperation(harness, {
      resourceScope: { authorize: authorizeResource },
    });

    const result = await operation.execute({
      context: validContext(true),
      input: { name: "Ada" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("FORBIDDEN");
    }
    expect(authorizeResource).toHaveBeenCalledOnce();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("includes an explicitly authorized resource in the access grant", async () => {
    const harness = createHarness();
    const authorizeResource = vi.fn(async () => ({ allowed: true }) as const);
    const handler = vi.fn(
      async (_input: TestInput, context: ProtectedHandlerContext) => {
        expect(context.access.resource).toEqual({
          id: "resource-1",
          type: "document",
        });
        return "ok";
      },
    );
    const operation = createOperation(harness, {
      handler,
      resourceScope: { authorize: authorizeResource },
    });

    const result = await operation.execute({
      context: validContext(true),
      input: { name: "Ada" },
    });

    expect(result).toEqual({ data: "ok", ok: true });
    expect(authorizeResource).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledOnce();
  });

  it("fails closed when resource scope is configured without a resource", async () => {
    const harness = createHarness();
    const authorizeResource = vi.fn(async () => ({ allowed: true }) as const);
    const operation = createOperation(harness, {
      resourceScope: { authorize: authorizeResource },
    });

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(result.ok).toBe(false);
    expect(authorizeResource).not.toHaveBeenCalled();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("rejects malformed input with a strict Zod schema", async () => {
    const harness = createHarness();
    const operation = createOperation(harness);

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada", privilege: "admin" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INVALID_INPUT");
      expect(result.error).not.toHaveProperty("issues");
    }
    expect(harness.quota).not.toHaveBeenCalled();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("fails closed and reports an authorization port exception", async () => {
    const harness = createHarness();
    harness.authorization.mockRejectedValueOnce(new Error("database password"));
    const operation = createOperation(harness);

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toEqual({
        code: "SERVICE_UNAVAILABLE",
        message: "The service is temporarily unavailable.",
        requestId: "request-1",
      });
      expect(JSON.stringify(result.error)).not.toContain("password");
    }
    expect(harness.reporter).toHaveBeenCalledOnce();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("releases a quota reservation after rate-limit denial", async () => {
    const harness = createHarness();
    harness.rateLimit.mockResolvedValueOnce({ allowed: false });
    const operation = createOperation(harness);

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("RATE_LIMITED");
    }
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.commit).not.toHaveBeenCalled();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("denies exhausted quota before rate limiting and handler", async () => {
    const harness = createHarness();
    harness.quota.mockResolvedValueOnce({ allowed: false });
    const operation = createOperation(harness);

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("QUOTA_EXCEEDED");
    }
    expect(harness.rateLimit).not.toHaveBeenCalled();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("requires mutation intent audit before invoking the handler", async () => {
    const harness = createHarness();
    harness.audit.mockRejectedValueOnce(new Error("audit offline"));
    const operation = createOperation(harness);

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(result.ok).toBe(false);
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.handler).not.toHaveBeenCalled();
  });

  it("returns an opaque internal error and releases quota on handler failure", async () => {
    const harness = createHarness();
    const handler = vi.fn(async () => {
      throw new Error("secret connection string");
    });
    const operation = createOperation(harness, { handler });

    const result = await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("INTERNAL");
      expect(JSON.stringify(result.error)).not.toContain("secret");
    }
    expect(harness.release).toHaveBeenCalledOnce();
    expect(harness.reporter).toHaveBeenCalledOnce();
  });

  it("issues a genuine grant that cannot be forged with public fields", async () => {
    const harness = createHarness();
    const forgedGrant = {
      actorId: "actor-1",
      permission: "document:create",
      tenantId: "tenant-1",
    };
    const handler = vi.fn(
      async (_input: TestInput, context: ProtectedHandlerContext) => {
        expect(isAccessGrant(context.access)).toBe(true);
        return "ok";
      },
    );
    const operation = createOperation(harness, { handler });

    await operation.execute({
      context: validContext(),
      input: { name: "Ada" },
    });

    expect(isAccessGrant(forgedGrant)).toBe(false);
    expect(
      isAccessGrant(
        new Proxy(
          {},
          {
            get() {
              throw new Error("hostile proxy");
            },
          },
        ),
      ),
    ).toBe(false);
    expect(handler).toHaveBeenCalledOnce();
  });
});
