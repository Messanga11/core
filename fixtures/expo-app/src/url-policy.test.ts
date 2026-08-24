import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl } from "./url-policy";

describe("native external URL policy", () => {
  it("allows HTTPS and denies executable schemes", () => {
    expect(isAllowedExternalUrl("https://example.com/help")).toBe(true);
    expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
    expect(isAllowedExternalUrl("not-a-url")).toBe(false);
  });
});
