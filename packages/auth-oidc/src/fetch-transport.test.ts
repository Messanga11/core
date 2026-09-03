import { afterEach, describe, expect, it, vi } from "vitest";
import { createFetchOidcTokenTransport } from "./fetch-transport";

afterEach(() => vi.unstubAllGlobals());

describe("OIDC token fetch transport", () => {
  it("posts form data without forwarding ambient credentials", async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ token_type: "Bearer" }), {
        headers: { "content-length": "23", "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    await createFetchOidcTokenTransport().post(
      "https://identity.example.com/token",
      "grant_type=authorization_code",
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://identity.example.com/token",
      expect.objectContaining({
        body: "grant_type=authorization_code",
        credentials: "omit",
        method: "POST",
        redirect: "error",
      }),
    );
  });

  it("rejects non-JSON and oversized responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("text")));
    await expect(
      createFetchOidcTokenTransport().post(
        "https://identity.example.com/token",
        "a=b",
      ),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});
