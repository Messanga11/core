import { describe, expect, it } from "vitest";

import {
  createOptimisticLanesState,
  reduceOptimisticLanesState,
} from "./optimistic-lanes";

interface ProjectData {
  readonly name: string;
}

type Result = { readonly accepted: true };
type Failure = { readonly code: "REJECTED" };

describe("optimistic lanes reducer", () => {
  it("isolates optimistic operations by resource lane", () => {
    const initial = createState();
    const state = reduceOptimisticLanesState(initial, {
      baseRevision: "project-1:1",
      lane: "project-1",
      operationId: "operation-1",
      optimisticData: { name: "Alpha renamed" },
      type: "begin",
    });

    expect(state.lanes["project-1"].data).toEqual({ name: "Alpha renamed" });
    expect(state.lanes["project-2"]).toBe(initial.lanes["project-2"]);
  });

  it("exposes a conflict when begin uses a stale base revision", () => {
    const initial = createState();
    const state = reduceOptimisticLanesState(initial, {
      baseRevision: "project-1:0",
      lane: "project-1",
      operationId: "operation-1",
      optimisticData: { name: "Stale name" },
      type: "begin",
    });

    expect(state.lanes["project-1"].data).toEqual({ name: "Alpha" });
    expect(state.lanes["project-1"].conflict).toEqual({
      baseRevision: "project-1:0",
      currentRevision: "project-1:1",
      operationId: "operation-1",
    });
  });

  it("rolls back only the targeted resource lane", () => {
    const pending = beginProjectOne(createState());
    const state = reduceOptimisticLanesState(pending, {
      baseRevision: "project-1:1",
      error: { code: "REJECTED" },
      lane: "project-1",
      operationId: "operation-1",
      type: "rollback",
    });

    expect(state.lanes["project-1"].data).toEqual({ name: "Alpha" });
    expect(state.lanes["project-1"].command.status).toBe("failed");
    expect(state.lanes["project-2"]).toBe(pending.lanes["project-2"]);
  });

  it("ignores a stale response without changing any lane", () => {
    const pending = beginProjectOne(createState());
    const state = reduceOptimisticLanesState(pending, {
      baseRevision: "project-1:0",
      data: { name: "Stale server name" },
      lane: "project-1",
      nextRevision: "project-1:2",
      operationId: "operation-1",
      result: { accepted: true },
      type: "commit",
    });

    expect(state).toBe(pending);
  });

  it("reconciles a correlated server conflict with authoritative data", () => {
    const pending = beginProjectOne(createState());
    const state = reduceOptimisticLanesState(pending, {
      baseRevision: "project-1:1",
      currentData: { name: "Server name" },
      currentRevision: "project-1:2",
      lane: "project-1",
      operationId: "operation-1",
      type: "conflict",
    });

    expect(state.lanes["project-1"]).toMatchObject({
      command: { status: "idle" },
      conflict: {
        baseRevision: "project-1:1",
        currentRevision: "project-1:2",
      },
      data: { name: "Server name" },
      revision: "project-1:2",
    });
  });
});

function createState() {
  return createOptimisticLanesState<
    "project-1" | "project-2",
    ProjectData,
    Result,
    Failure
  >({
    "project-1": { data: { name: "Alpha" }, revision: "project-1:1" },
    "project-2": { data: { name: "Beta" }, revision: "project-2:1" },
  });
}

function beginProjectOne(state: ReturnType<typeof createState>) {
  return reduceOptimisticLanesState(state, {
    baseRevision: "project-1:1",
    lane: "project-1",
    operationId: "operation-1",
    optimisticData: { name: "Alpha renamed" },
    type: "begin",
  });
}
