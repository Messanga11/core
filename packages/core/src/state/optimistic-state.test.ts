import { describe, expect, it } from "vitest";

import {
  createOptimisticState,
  reduceOptimisticState,
} from "./optimistic-state";

interface CounterData {
  readonly count: number;
}

type Result = { readonly accepted: true };
type Failure = { readonly code: "REJECTED" };

describe("optimistic state reducer", () => {
  it("applies optimistic data for a matching base revision", () => {
    const initial = createOptimisticState<CounterData, Result, Failure>(
      { count: 1 },
      "counter:1",
    );
    const state = reduceOptimisticState(initial, {
      type: "begin",
      operationId: "operation-1",
      baseRevision: "counter:1",
      optimisticData: { count: 2 },
    });

    expect(state.data).toEqual({ count: 2 });
    expect(state.confirmedData).toEqual({ count: 1 });
    expect(state.command).toEqual({
      status: "submitting",
      operationId: "operation-1",
      baseRevision: "counter:1",
    });
  });

  it("commits only the correlated operation and advances revision", () => {
    const pending = beginOperation("operation-1");
    const state = reduceOptimisticState(pending, {
      type: "commit",
      operationId: "operation-1",
      baseRevision: "counter:1",
      nextRevision: "counter:2",
      data: { count: 2 },
      result: { accepted: true },
    });

    expect(state.data).toEqual({ count: 2 });
    expect(state.confirmedData).toEqual({ count: 2 });
    expect(state.revision).toBe("counter:2");
    expect(state.command).toEqual({
      status: "succeeded",
      operationId: "operation-1",
      revision: "counter:2",
      result: { accepted: true },
    });
  });

  it("ignores a response from an operation superseded by a newer one", () => {
    const first = beginOperation("operation-1");
    const second = reduceOptimisticState(first, {
      type: "begin",
      operationId: "operation-2",
      baseRevision: "counter:1",
      optimisticData: { count: 3 },
    });
    const staleResponse = reduceOptimisticState(second, {
      type: "commit",
      operationId: "operation-1",
      baseRevision: "counter:1",
      nextRevision: "counter:2",
      data: { count: 2 },
      result: { accepted: true },
    });

    expect(staleResponse).toBe(second);
    expect(staleResponse.data).toEqual({ count: 3 });
  });

  it("ignores a response carrying a stale base revision", () => {
    const pending = beginOperation("operation-1");
    const staleResponse = reduceOptimisticState(pending, {
      type: "commit",
      operationId: "operation-1",
      baseRevision: "counter:0",
      nextRevision: "counter:2",
      data: { count: 2 },
      result: { accepted: true },
    });

    expect(staleResponse).toBe(pending);
  });

  it("rolls back only the targeted pending operation", () => {
    const pending = beginOperation("operation-1");
    const state = reduceOptimisticState(pending, {
      type: "rollback",
      operationId: "operation-1",
      baseRevision: "counter:1",
      error: { code: "REJECTED" },
    });

    expect(state.data).toEqual({ count: 1 });
    expect(state.confirmedData).toEqual({ count: 1 });
    expect(state.command).toEqual({
      status: "failed",
      operationId: "operation-1",
      revision: "counter:1",
      error: { code: "REJECTED" },
    });
  });

  it("ignores a rollback for a different operation", () => {
    const pending = beginOperation("operation-1");
    const staleRollback = reduceOptimisticState(pending, {
      type: "rollback",
      operationId: "operation-2",
      baseRevision: "counter:1",
      error: { code: "REJECTED" },
    });

    expect(staleRollback).toBe(pending);
    expect(staleRollback.data).toEqual({ count: 2 });
  });

  it("ignores an optimistic start based on an old revision", () => {
    const initial = createOptimisticState<CounterData, Result, Failure>(
      { count: 1 },
      "counter:2",
    );
    const staleStart = reduceOptimisticState(initial, {
      type: "begin",
      operationId: "operation-1",
      baseRevision: "counter:1",
      optimisticData: { count: 2 },
    });

    expect(staleStart).toBe(initial);
  });
});

function beginOperation(operationId: string) {
  const initial = createOptimisticState<CounterData, Result, Failure>(
    { count: 1 },
    "counter:1",
  );

  return reduceOptimisticState(initial, {
    type: "begin",
    operationId,
    baseRevision: "counter:1",
    optimisticData: { count: 2 },
  });
}
