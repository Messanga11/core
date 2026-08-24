import type { AccessDecision, QuotaDecision } from "../security/ports";

export function isAllowedDecision(
  value: unknown,
): value is Extract<AccessDecision, { allowed: true }> {
  return (
    typeof value === "object" &&
    value !== null &&
    Reflect.get(value, "allowed") === true
  );
}

export function isGrantedQuota(
  value: unknown,
): value is Extract<QuotaDecision, { allowed: true }> {
  if (!isAllowedDecision(value)) {
    return false;
  }

  const reservation = Reflect.get(value, "reservation");
  return (
    typeof reservation === "object" &&
    reservation !== null &&
    typeof Reflect.get(reservation, "commit") === "function" &&
    typeof Reflect.get(reservation, "release") === "function"
  );
}
