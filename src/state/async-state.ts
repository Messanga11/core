import type { CorePublicError } from "../contracts";

export type QueryState<Data, Error = CorePublicError> =
  | { readonly status: "idle" }
  | { readonly status: "loading"; readonly previous?: Data }
  | {
      readonly status: "success";
      readonly data: Data;
      readonly freshness: "fresh" | "stale";
    }
  | {
      readonly status: "error";
      readonly error: Error;
      readonly previous?: Data;
    };

export type CommandState<Result, Error = CorePublicError> =
  | { readonly status: "idle" }
  | {
      readonly status: "submitting";
      readonly operationId: string;
      readonly baseRevision: string;
    }
  | {
      readonly status: "succeeded";
      readonly operationId: string;
      readonly revision: string;
      readonly result: Result;
    }
  | {
      readonly status: "failed";
      readonly operationId: string;
      readonly revision: string;
      readonly error: Error;
    };
