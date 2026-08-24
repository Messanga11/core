import { describe, expect, it, vi } from "vitest";

import { REDIS_FUNCTION_LIBRARY } from "./functions";
import { createAtomicFunctionInvoker } from "./transport";

describe("createAtomicFunctionInvoker", () => {
  it("retries loading after a failed library load", async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce(undefined);
    const call = vi.fn().mockResolvedValue([1]);
    const invoker = createAtomicFunctionInvoker({ call, load });

    await expect(invoker.call("function", [], [])).rejects.toThrow("temporary");
    await expect(invoker.call("function", [], [])).resolves.toEqual([1]);

    expect(load).toHaveBeenCalledTimes(2);
    expect(load).toHaveBeenLastCalledWith(REDIS_FUNCTION_LIBRARY);
  });
});
