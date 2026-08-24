export type RedisAdapterErrorCode =
  | "INVALID_CONFIGURATION"
  | "SERVICE_UNAVAILABLE";

export class RedisAdapterError extends Error {
  readonly code: RedisAdapterErrorCode;

  constructor(code: RedisAdapterErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = "RedisAdapterError";
    this.code = code;
  }
}
