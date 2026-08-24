import { describe, expect, it } from "vitest";

import type {
  UiAnnouncement,
  UiFeedback,
  UiRuntimeAdapter,
} from "./ui-runtime-adapter";

describe("UiRuntimeAdapter", () => {
  it("expresses platform behavior through semantic events", async () => {
    const announcements: UiAnnouncement[] = [];
    const feedbackEvents: UiFeedback[] = [];
    const focusedTargets: string[] = [];
    const openedUrls: string[] = [];
    const adapter: UiRuntimeAdapter<{ readonly name: string }> = {
      announce: (event) => {
        announcements.push(event);
      },
      feedback: (event) => {
        feedbackEvents.push(event);
      },
      focus: (targetId) => {
        focusedTargets.push(targetId);
      },
      openExternalUrl: (url) => {
        openedUrls.push(url);
        return Promise.resolve();
      },
      resolvePrimitive: (name) => ({ name }),
    };

    await adapter.announce({
      messageKey: "orders.purchase.succeeded",
      politeness: "polite",
    });
    await adapter.feedback({ kind: "success" });
    await adapter.focus("purchase-result");
    await adapter.openExternalUrl("https://example.com/receipt");

    expect(announcements).toEqual([
      {
        messageKey: "orders.purchase.succeeded",
        politeness: "polite",
      },
    ]);
    expect(feedbackEvents).toEqual([{ kind: "success" }]);
    expect(focusedTargets).toEqual(["purchase-result"]);
    expect(openedUrls).toEqual(["https://example.com/receipt"]);
    expect(adapter.resolvePrimitive("action")).toEqual({ name: "action" });
  });
});
