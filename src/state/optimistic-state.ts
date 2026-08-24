import type { CommandState } from "./async-state";

export interface OptimisticState<Data, Result, Error> {
  readonly data: Data;
  readonly confirmedData: Data;
  readonly revision: string;
  readonly command: CommandState<Result, Error>;
}

export type OptimisticAction<Data, Result, Error> =
  | {
      readonly type: "begin";
      readonly operationId: string;
      readonly baseRevision: string;
      readonly optimisticData: Data;
    }
  | {
      readonly type: "commit";
      readonly operationId: string;
      readonly baseRevision: string;
      readonly nextRevision: string;
      readonly data: Data;
      readonly result: Result;
    }
  | {
      readonly type: "rollback";
      readonly operationId: string;
      readonly baseRevision: string;
      readonly error: Error;
    };

export function createOptimisticState<Data, Result = never, Error = never>(
  data: Data,
  revision: string,
): OptimisticState<Data, Result, Error> {
  return {
    data,
    confirmedData: data,
    revision,
    command: { status: "idle" },
  };
}

function matchesPendingOperation<Data, Result, Error>(
  state: OptimisticState<Data, Result, Error>,
  action: { readonly operationId: string; readonly baseRevision: string },
): boolean {
  return (
    state.command.status === "submitting" &&
    state.command.operationId === action.operationId &&
    state.command.baseRevision === action.baseRevision &&
    state.revision === action.baseRevision
  );
}

export function reduceOptimisticState<Data, Result, Error>(
  state: OptimisticState<Data, Result, Error>,
  action: OptimisticAction<Data, Result, Error>,
): OptimisticState<Data, Result, Error> {
  if (action.type === "begin") {
    if (action.baseRevision !== state.revision) {
      return state;
    }

    return {
      ...state,
      data: action.optimisticData,
      command: {
        status: "submitting",
        operationId: action.operationId,
        baseRevision: action.baseRevision,
      },
    };
  }

  if (!matchesPendingOperation(state, action)) {
    return state;
  }

  if (action.type === "rollback") {
    return {
      ...state,
      data: state.confirmedData,
      command: {
        status: "failed",
        operationId: action.operationId,
        revision: state.revision,
        error: action.error,
      },
    };
  }

  return {
    data: action.data,
    confirmedData: action.data,
    revision: action.nextRevision,
    command: {
      status: "succeeded",
      operationId: action.operationId,
      revision: action.nextRevision,
      result: action.result,
    },
  };
}
