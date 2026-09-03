import type { OidcTokenTransportPort } from "./authorization-code";
import { OidcError } from "./index";

export function createFetchOidcTokenTransport(
  options: { readonly timeoutMs?: number } = {},
): OidcTokenTransportPort {
  const timeoutMs = options.timeoutMs ?? 10_000;
  if (
    !Number.isSafeInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 30_000
  ) {
    throw new OidcError("AUTHENTICATION_FAILED");
  }
  return Object.freeze({
    async post(endpoint: string, formBody: string): Promise<unknown> {
      try {
        const response = await fetch(endpoint, {
          body: formBody,
          credentials: "omit",
          headers: {
            accept: "application/json",
            "content-type": "application/x-www-form-urlencoded",
          },
          method: "POST",
          redirect: "error",
          signal: AbortSignal.timeout(timeoutMs),
        });
        const length = Number(response.headers.get("content-length") ?? 0);
        if (
          !response.ok ||
          !response.headers
            .get("content-type")
            ?.startsWith("application/json") ||
          !Number.isSafeInteger(length) ||
          length > 1_000_000
        ) {
          throw new Error("Invalid OIDC token response");
        }
        return await response.json();
      } catch (error) {
        throw new OidcError("SERVICE_UNAVAILABLE", error);
      }
    },
  });
}
