# ADR 0002: Normalized identity and OIDC boundary

Status: accepted

Core accepts only a validated `human` or `service` identity. OIDC verification lives in `@messanga11/auth-oidc`; provider claims, tokens, cookies, PKCE, and secure-storage APIs never cross into the kernel.

Issuer, audience, signature algorithm, time claims, and subject are allowlisted. Missing or indeterminate identity fails closed.
