import { describe, expect, it } from "vitest";
import { selectSafeAttributes } from "./redaction";

describe("selectSafeAttributes", () => {
  it("keeps only allowlisted telemetry scalars", () => {
    expect(
      selectSafeAttributes(
        {
          "core.operation": "project.rename",
          password: "secret",
          count: 2,
          invalid: Number.NaN,
          payload: { private: true },
        },
        ["core.operation", "count", "invalid", "payload"],
      ),
    ).toEqual({ "core.operation": "project.rename", count: 2 });
  });

  it("accepts finite scalar arrays and rejects unsafe keys and array values", () => {
    expect(
      selectSafeAttributes(
        {
          "core.flags": [true, false],
          "core.values": [1, 2, Number.POSITIVE_INFINITY],
          "invalid key": "hidden",
        },
        ["core.flags", "core.values", "invalid key"],
      ),
    ).toEqual({ "core.flags": [true, false] });
  });
});
