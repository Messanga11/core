import type { AuthenticatedRequestContext } from "./context";
import type { Permission, ResourceReference } from "./identifiers";

const accessGrantBrand: unique symbol = Symbol("AccessGrant");

export interface AccessGrant {
  readonly actorId: AuthenticatedRequestContext["actor"]["id"];
  readonly permission: Permission;
  readonly resource?: ResourceReference;
  readonly tenantId: AuthenticatedRequestContext["tenantId"];
  readonly [accessGrantBrand]: true;
}

interface IssueAccessGrantOptions {
  readonly context: AuthenticatedRequestContext;
  readonly permission: Permission;
  readonly resource?: ResourceReference;
}

export function issueAccessGrant(
  options: IssueAccessGrantOptions,
): AccessGrant {
  const grant = {
    actorId: options.context.actor.id,
    permission: options.permission,
    ...(options.resource ? { resource: options.resource } : {}),
    tenantId: options.context.tenantId,
  };

  Object.defineProperty(grant, accessGrantBrand, {
    configurable: false,
    enumerable: false,
    value: true,
    writable: false,
  });

  return Object.freeze(grant) as AccessGrant;
}

export function isAccessGrant(value: unknown): value is AccessGrant {
  try {
    return (
      typeof value === "object" &&
      value !== null &&
      Reflect.get(value, accessGrantBrand) === true
    );
  } catch {
    return false;
  }
}
