import { expect, it } from "vitest";
import { TenancyError } from "./errors.js";

it("serializes an opaque public error without internal details", () => {
  const error = new TenancyError("CONFLICT");
  expect(error.toJSON()).toEqual({
    code: "CONFLICT",
    messageKey: "tenancy.error.conflict",
    retryable: true,
  });
  expect(JSON.stringify(error.toJSON())).not.toContain("stack");
});
