import type { JsonValue } from "./json-value";

export interface CorePublicError<Code extends string = string> {
  readonly code: Code;
  readonly messageKey: string;
  readonly retryable: boolean;
  readonly details?: Readonly<Record<string, JsonValue>>;
}
