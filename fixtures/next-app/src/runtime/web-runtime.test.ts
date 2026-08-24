// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createWebRuntimeAdapter, isAllowedExternalUrl } from "./web-runtime";

describe("web runtime adapter", () => {
  it("allows HTTPS and rejects executable or malformed URLs", () => {
    expect(isAllowedExternalUrl("https://example.com/path")).toBe(true);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("not-a-url")).toBe(false);
  });

  it("announces semantic messages and restores focus", () => {
    document.body.innerHTML =
      '<p data-live-region></p><button id="name">Name</button>';
    const button = document.getElementById("name");
    const focus = vi.spyOn(button as HTMLElement, "focus");
    const adapter = createWebRuntimeAdapter();

    adapter.announce({
      messageKey: "project.rename.success",
      politeness: "polite",
    });
    adapter.focus("name");

    expect(document.querySelector("[data-live-region]")?.textContent).toBe(
      "project.rename.success",
    );
    expect(focus).toHaveBeenCalledOnce();
    expect(adapter.resolvePrimitive("unknown")).toBeNull();
    expect(adapter.feedback({ kind: "success" })).toBeUndefined();
  });

  it("opens only allowed external URLs without an opener", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const adapter = createWebRuntimeAdapter();

    await adapter.openExternalUrl("https://example.com/help");
    await expect(
      adapter.openExternalUrl("javascript:alert(1)"),
    ).rejects.toThrow("External URL is not allowed.");

    expect(open).toHaveBeenCalledWith(
      "https://example.com/help",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("tolerates missing announcement and focus targets", () => {
    document.body.innerHTML = "";
    const adapter = createWebRuntimeAdapter();

    expect(() =>
      adapter.announce({ messageKey: "none", politeness: "assertive" }),
    ).not.toThrow();
    expect(() => adapter.focus("missing")).not.toThrow();
  });
});
