import { describe, expect, it } from "vitest";

import type { UiMeta } from "./ui-meta";
import {
  ActionNotAllowedError,
  assertAllowed,
  canPerform,
  getDenial,
} from "./ui-meta";

type Action = "purchase" | "refund" | "viewCost";
type Reason = "PAYMENT_REQUIRED" | "REFUND_WINDOW_CLOSED" | "SENSITIVE";

const UI_META: UiMeta<Action, Reason> = {
  revision: "orders:7",
  allowedActions: {
    purchase: {
      status: "allowed",
      intent: "primary",
      accessibility: {
        labelKey: "orders.purchase.label",
        hintKey: "orders.purchase.hint",
      },
    },
    refund: {
      status: "denied",
      presentation: "disabled",
      reason: {
        code: "REFUND_WINDOW_CLOSED",
        messageKey: "orders.refund.windowClosed",
        params: { days: 30 },
      },
      accessibility: {
        labelKey: "orders.refund.label",
        hintKey: "orders.refund.unavailableHint",
      },
    },
    viewCost: {
      status: "denied",
      presentation: "hidden",
      reason: {
        code: "SENSITIVE",
        messageKey: "orders.cost.sensitive",
      },
      accessibility: { labelKey: "orders.cost.label" },
    },
  },
};

describe("ui action decisions", () => {
  it("recognizes an allowed action", () => {
    expect(canPerform(UI_META, "purchase")).toBe(true);
    expect(getDenial(UI_META, "purchase")).toBeUndefined();
  });

  it("returns the structured denial reason", () => {
    expect(canPerform(UI_META, "refund")).toBe(false);
    expect(getDenial(UI_META, "refund")).toEqual({
      code: "REFUND_WINDOW_CLOSED",
      messageKey: "orders.refund.windowClosed",
      params: { days: 30 },
    });
  });

  it("keeps disabled and hidden decisions explicit", () => {
    const refundDecision = UI_META.allowedActions.refund;
    const costDecision = UI_META.allowedActions.viewCost;

    expect(refundDecision.status).toBe("denied");
    expect(costDecision.status).toBe("denied");

    if (
      refundDecision.status === "denied" &&
      costDecision.status === "denied"
    ) {
      expect(refundDecision.presentation).toBe("disabled");
      expect(costDecision.presentation).toBe("hidden");
    }
  });

  it("carries semantic accessibility metadata on every action", () => {
    for (const decision of Object.values(UI_META.allowedActions)) {
      expect(decision.accessibility.labelKey).not.toHaveLength(0);
    }
  });

  it("returns the allowed decision when asserting access", () => {
    expect(assertAllowed(UI_META, "purchase")).toEqual(
      UI_META.allowedActions.purchase,
    );
  });

  it("throws a safe contractual error for a denied action", () => {
    expect.assertions(5);

    try {
      assertAllowed(UI_META, "refund");
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(ActionNotAllowedError);

      if (!(error instanceof ActionNotAllowedError)) {
        return;
      }

      expect(error.message).toBe("The requested action is not allowed.");
      expect(error.action).toBe("refund");
      expect(error.reason.code).toBe("REFUND_WINDOW_CLOSED");
      expect(error.toJSON()).toEqual({
        code: "ACTION_NOT_ALLOWED",
        messageKey: "orders.refund.windowClosed",
        retryable: false,
        details: {
          action: "refund",
          reasonCode: "REFUND_WINDOW_CLOSED",
        },
      });
    }
  });
});
