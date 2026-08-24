import type { RequestId } from "./identifiers";

export type CoreErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "QUOTA_EXCEEDED"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "INTERNAL";

interface CoreErrorOptions {
  readonly cause?: unknown;
  readonly reportable?: boolean;
}

export class CoreError extends Error {
  readonly code: CoreErrorCode;
  readonly reportable: boolean;

  constructor(code: CoreErrorCode, options: CoreErrorOptions = {}) {
    super(
      code,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = "CoreError";
    this.code = code;
    this.reportable = options.reportable ?? false;
  }
}

const PUBLIC_MESSAGES: Readonly<Record<CoreErrorCode, string>> = {
  FORBIDDEN: "Access denied.",
  INTERNAL: "The operation could not be completed.",
  INVALID_INPUT: "The request is invalid.",
  QUOTA_EXCEEDED: "The usage quota has been exceeded.",
  RATE_LIMITED: "Too many requests.",
  SERVICE_UNAVAILABLE: "The service is temporarily unavailable.",
  UNAUTHENTICATED: "Authentication is required.",
};

export interface PublicCoreError {
  readonly code: CoreErrorCode;
  readonly message: string;
  readonly requestId?: RequestId;
}

export function normalizeCoreError(error: unknown): CoreError {
  if (error instanceof CoreError) {
    return error;
  }

  return new CoreError("INTERNAL", { cause: error, reportable: true });
}

export function toPublicCoreError(
  error: unknown,
  requestId?: RequestId,
): PublicCoreError {
  const coreError = normalizeCoreError(error);

  return Object.freeze({
    code: coreError.code,
    message: PUBLIC_MESSAGES[coreError.code],
    ...(requestId ? { requestId } : {}),
  });
}
