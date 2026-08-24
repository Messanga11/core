import { describe, expect, it } from "vitest";

import type { OperationEnvelope } from "./operation-envelope";
import type { CorePublicError } from "./public-error";
import { ActionNotAllowedError } from "./ui-meta";

describe("public contract serialization", () => {
  it("round-trips an operation envelope through JSON", () => {
    const envelope: OperationEnvelope<
      { readonly orderId: string; readonly total: number },
      "purchase",
      "PAYMENT_REQUIRED"
    > = {
      data: { orderId: "order-1", total: 42 },
      uiMeta: {
        revision: "orders:1",
        allowedActions: {
          purchase: {
            status: "denied",
            presentation: "disabled",
            reason: {
              code: "PAYMENT_REQUIRED",
              messageKey: "orders.purchase.paymentRequired",
              params: { amount: 42, currency: "EUR" },
            },
            accessibility: {
              labelKey: "orders.purchase.label",
              hintKey: "orders.purchase.paymentHint",
            },
          },
        },
      },
    };

    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
  });

  it("round-trips a public error through JSON", () => {
    const publicError: CorePublicError<"VALIDATION_FAILED"> = {
      code: "VALIDATION_FAILED",
      messageKey: "core.validation.failed",
      retryable: false,
      details: {
        field: "email",
        issues: ["invalid_format"],
      },
    };

    expect(JSON.parse(JSON.stringify(publicError))).toEqual(publicError);
  });

  it("serializes an action error without stack or internal message", () => {
    const error = new ActionNotAllowedError("refund", {
      code: "REFUND_WINDOW_CLOSED",
      messageKey: "orders.refund.windowClosed",
    });
    const serialized: unknown = JSON.parse(JSON.stringify(error));

    expect(serialized).toEqual({
      code: "ACTION_NOT_ALLOWED",
      messageKey: "orders.refund.windowClosed",
      retryable: false,
      details: {
        action: "refund",
        reasonCode: "REFUND_WINDOW_CLOSED",
      },
    });
    expect(serialized).not.toHaveProperty("stack");
    expect(serialized).not.toHaveProperty("message");
  });
});
