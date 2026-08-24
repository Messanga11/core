import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const client = {
    close: vi.fn(),
    connect: vi.fn(),
    fCall: vi.fn(),
    functionLoad: vi.fn(),
    isOpen: false,
    isReady: false,
  };
  return { client, createClient: vi.fn(() => client) };
});

vi.mock("redis", () => ({ createClient: mocks.createClient }));

import { createNodeRedisFunctionTransport } from "./node-redis";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.isOpen = false;
  mocks.client.isReady = false;
  mocks.client.connect.mockImplementation(async () => {
    mocks.client.isOpen = true;
    mocks.client.isReady = true;
  });
  mocks.client.close.mockImplementation(async () => {
    mocks.client.isOpen = false;
    mocks.client.isReady = false;
  });
  mocks.client.fCall.mockResolvedValue([1]);
  mocks.client.functionLoad.mockResolvedValue("messanga11_core_v1");
});

describe("createNodeRedisFunctionTransport", () => {
  it("requires TLS before creating the vendor client", () => {
    expect(() =>
      createNodeRedisFunctionTransport({ url: "redis://cache.example.com" }),
    ).toThrowError("INVALID_CONFIGURATION");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("connects lazily, loads with replacement and calls a function", async () => {
    const transport = createNodeRedisFunctionTransport({
      url: "rediss://cache.example.com",
    });

    await transport.load("function source");
    await expect(
      transport.call("function_name", ["private-key"], ["argument"]),
    ).resolves.toEqual([1]);

    expect(mocks.client.connect).toHaveBeenCalledTimes(1);
    expect(mocks.client.functionLoad).toHaveBeenCalledWith("function source", {
      REPLACE: true,
    });
    expect(mocks.client.fCall).toHaveBeenCalledWith("function_name", {
      arguments: ["argument"],
      keys: ["private-key"],
    });
  });

  it("closes only an open connection", async () => {
    const transport = createNodeRedisFunctionTransport({
      url: "rediss://cache.example.com",
    });

    await transport.close();
    expect(mocks.client.close).not.toHaveBeenCalled();
    mocks.client.isOpen = true;
    await transport.close();
    expect(mocks.client.close).toHaveBeenCalledTimes(1);
  });

  it.each(["connect", "functionLoad", "fCall", "close"] as const)(
    "wraps a %s failure as service unavailable",
    async (method) => {
      const transport = createNodeRedisFunctionTransport({
        url: "rediss://cache.example.com",
      });
      if (method === "close") {
        mocks.client.isOpen = true;
      } else if (method !== "connect") {
        mocks.client.isReady = true;
      }
      mocks.client[method].mockRejectedValueOnce(new Error("private detail"));

      const result =
        method === "close"
          ? transport.close()
          : method === "fCall"
            ? transport.call("function", [], [])
            : transport.load("source");

      await expect(result).rejects.toMatchObject({
        code: "SERVICE_UNAVAILABLE",
        message: "SERVICE_UNAVAILABLE",
      });
    },
  );
});
