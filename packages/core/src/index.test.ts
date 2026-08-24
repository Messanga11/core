import { describe, expect, it } from "vitest";

import { CORE_PACKAGE_NAME } from "./index";

describe("core package", () => {
  it("exposes its canonical npm name", () => {
    expect(CORE_PACKAGE_NAME).toBe("@messanga11/core");
  });
});
