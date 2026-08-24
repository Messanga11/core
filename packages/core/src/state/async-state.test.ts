import { describe, expect, it } from "vitest";

import type { CommandState, QueryState } from "./async-state";

describe("async state contracts", () => {
  it("represents stale data while a query reloads", () => {
    const state: QueryState<readonly string[]> = {
      status: "loading",
      previous: ["cached-order"],
    };

    expect(state.status).toBe("loading");
    expect(state.previous).toEqual(["cached-order"]);
  });

  it("represents fresh and stale successful queries explicitly", () => {
    const fresh: QueryState<string> = {
      status: "success",
      data: "order-1",
      freshness: "fresh",
    };
    const stale: QueryState<string> = { ...fresh, freshness: "stale" };

    expect(fresh.freshness).toBe("fresh");
    expect(stale.freshness).toBe("stale");
  });

  it("correlates a submitting command with its base revision", () => {
    const state: CommandState<number> = {
      status: "submitting",
      operationId: "operation-1",
      baseRevision: "orders:1",
    };

    expect(state).toEqual({
      status: "submitting",
      operationId: "operation-1",
      baseRevision: "orders:1",
    });
  });
});
