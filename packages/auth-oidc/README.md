# @messanga11/auth-oidc

Provider-neutral OIDC identity and session contracts with a server-only JOSE 6
adapter.

```ts
import { createJoseOidcTokenVerifier } from "@messanga11/auth-oidc/server";

const verifier = createJoseOidcTokenVerifier({
  algorithms: ["RS256"],
  audience: "my-application",
  issuer: "https://identity.example.com",
  jwksUri: "https://identity.example.com/.well-known/jwks.json",
});
```

The verifier accepts only asymmetric algorithms, requires expiration, validates
issuer, audience and not-before, and returns normalized `human` or `service`
identities. Cookie, PKCE and secure-storage policies belong to application
shells and are intentionally excluded.
