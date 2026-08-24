import { TRPCError } from "@trpc/server";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { CoreError, toPublicCoreError } from "../security";
import { createProtectedOperation } from "../server";
import { createTestContext, createTestPorts } from "../testing";
import { createCoreTRPC, toTRPCError } from "./trpc-adapter";

const GreetingSchema = z.object({ name: z.string().min(1).max(80) }).strict();

function createGreetingRouter(options: {
  readonly context: unknown;
  readonly isAllowed?: boolean;
}) {
  const handler = vi.fn(async (input: z.infer<typeof GreetingSchema>) => ({
    greeting: `Hello ${input.name}`,
  }));
  const { ports } = createTestPorts({
    authorization: {
      authorize: () => Promise.resolve({ allowed: options.isAllowed ?? true }),
    },
  });
  const operation = createProtectedOperation({
    handler,
    kind: "query",
    name: "greeting.read",
    permission: "greeting.read",
    ports,
    schema: GreetingSchema,
  });
  const core = createCoreTRPC();
  const router = core.router({ greeting: core.guardedQuery(operation) });
  const caller = router.createCaller({ requestContext: options.context });

  return { caller, handler };
}

describe("tRPC adapter", () => {
  it("executes a guarded query through a real caller", async () => {
    const { caller, handler } = createGreetingRouter({
      context: createTestContext(),
    });

    await expect(caller.greeting({ name: "Paul" })).resolves.toEqual({
      greeting: "Hello Paul",
    });
    expect(handler).toHaveBeenCalledOnce();
  });

  it("authenticates before exposing input validation", async () => {
    const { caller, handler } = createGreetingRouter({ context: {} });

    await expect(caller.greeting({ name: "" })).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("maps authorization denials and never invokes the handler", async () => {
    const { caller, handler } = createGreetingRouter({
      context: createTestContext(),
      isAllowed: false,
    });

    await expect(caller.greeting({ name: "Paul" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Access denied.",
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("executes guarded mutations with quota and audit enforcement", async () => {
    const { ports, state } = createTestPorts();
    const operation = createProtectedOperation({
      handler: async ({ value }: { readonly value: string }) => ({ value }),
      kind: "mutation",
      name: "profile.update",
      permission: "profile.update",
      ports,
      schema: z.object({ value: z.string().min(1) }).strict(),
    });
    const core = createCoreTRPC();
    const router = core.router({ update: core.guardedMutation(operation) });
    const caller = router.createCaller({ requestContext: createTestContext() });

    await expect(caller.update({ value: "updated" })).resolves.toEqual({
      value: "updated",
    });
    expect(state.committedReservations).toBe(1);
    expect(state.auditEvents).toHaveLength(2);
  });

  it("maps safe public errors to stable tRPC codes", () => {
    const error = toTRPCError(toPublicCoreError(new CoreError("RATE_LIMITED")));

    expect(error).toBeInstanceOf(TRPCError);
    expect(error).toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: "Too many requests.",
    });
  });
});
