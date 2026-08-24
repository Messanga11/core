export type TenancyErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  | "INVITATION_INVALID"
  | "LAST_OWNER"
  | "NOT_FOUND"
  | "REPLAYED";

export class TenancyError extends Error {
  public constructor(public readonly code: TenancyErrorCode) {
    super("The tenancy operation could not be completed.");
    this.name = "TenancyError";
  }
  public toJSON(): Readonly<{
    code: TenancyErrorCode;
    messageKey: string;
    retryable: boolean;
  }> {
    return {
      code: this.code,
      messageKey: `tenancy.error.${this.code.toLowerCase()}`,
      retryable: this.code === "CONFLICT",
    };
  }
}
