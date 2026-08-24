import {
  createOptimisticState,
  type OptimisticAction,
  type OptimisticState,
  reduceOptimisticState,
} from "./optimistic-state";

export interface OptimisticConflict {
  readonly baseRevision: string;
  readonly currentRevision: string;
  readonly operationId: string;
}

export interface OptimisticLaneState<Data, Result, Error>
  extends OptimisticState<Data, Result, Error> {
  readonly conflict?: OptimisticConflict;
}

export interface OptimisticLanesState<
  Lane extends string,
  Data,
  Result,
  Error,
> {
  readonly lanes: Readonly<
    Record<Lane, OptimisticLaneState<Data, Result, Error>>
  >;
}

interface ConflictAction<Lane extends string, Data> {
  readonly baseRevision: string;
  readonly currentData: Data;
  readonly currentRevision: string;
  readonly lane: Lane;
  readonly operationId: string;
  readonly type: "conflict";
}

export type OptimisticLanesAction<Lane extends string, Data, Result, Error> =
  | (OptimisticAction<Data, Result, Error> & Readonly<{ lane: Lane }>)
  | ConflictAction<Lane, Data>;

export function createOptimisticLanesState<
  Lane extends string,
  Data,
  Result = never,
  Error = never,
>(
  initial: Readonly<Record<Lane, Readonly<{ data: Data; revision: string }>>>,
): OptimisticLanesState<Lane, Data, Result, Error> {
  const lanes: Partial<Record<Lane, OptimisticLaneState<Data, Result, Error>>> =
    {};
  for (const lane of Object.keys(initial) as Lane[]) {
    const value = initial[lane];
    lanes[lane] = createOptimisticState<Data, Result, Error>(
      value.data,
      value.revision,
    );
  }
  return {
    lanes: lanes as Record<Lane, OptimisticLaneState<Data, Result, Error>>,
  };
}

export function reduceOptimisticLanesState<
  Lane extends string,
  Data,
  Result,
  Error,
>(
  state: OptimisticLanesState<Lane, Data, Result, Error>,
  action: OptimisticLanesAction<NoInfer<Lane>, Data, Result, Error>,
): OptimisticLanesState<Lane, Data, Result, Error> {
  const lane = state.lanes[action.lane];
  const nextLane = reduceLane(lane, action);
  if (nextLane === lane) {
    return state;
  }
  return { lanes: { ...state.lanes, [action.lane]: nextLane } };
}

function reduceLane<Lane extends string, Data, Result, Error>(
  lane: OptimisticLaneState<Data, Result, Error>,
  action: OptimisticLanesAction<Lane, Data, Result, Error>,
): OptimisticLaneState<Data, Result, Error> {
  if (action.type === "conflict") {
    return applyServerConflict(lane, action);
  }
  if (action.type === "begin" && action.baseRevision !== lane.revision) {
    return {
      ...lane,
      conflict: {
        baseRevision: action.baseRevision,
        currentRevision: lane.revision,
        operationId: action.operationId,
      },
    };
  }

  const next = reduceOptimisticState(lane, action);
  return next === lane ? lane : clearConflict(next);
}

function applyServerConflict<Lane extends string, Data, Result, Error>(
  lane: OptimisticLaneState<Data, Result, Error>,
  action: ConflictAction<Lane, Data>,
): OptimisticLaneState<Data, Result, Error> {
  if (!matchesPending(lane, action)) {
    return lane;
  }
  return {
    command: { status: "idle" },
    confirmedData: action.currentData,
    conflict: {
      baseRevision: action.baseRevision,
      currentRevision: action.currentRevision,
      operationId: action.operationId,
    },
    data: action.currentData,
    revision: action.currentRevision,
  };
}

function matchesPending<Data, Result, Error>(
  lane: OptimisticLaneState<Data, Result, Error>,
  action: Readonly<{ baseRevision: string; operationId: string }>,
): boolean {
  return (
    lane.command.status === "submitting" &&
    lane.command.baseRevision === action.baseRevision &&
    lane.command.operationId === action.operationId
  );
}

function clearConflict<Data, Result, Error>(
  state: OptimisticState<Data, Result, Error>,
): OptimisticLaneState<Data, Result, Error> {
  return {
    command: state.command,
    confirmedData: state.confirmedData,
    data: state.data,
    revision: state.revision,
  };
}
