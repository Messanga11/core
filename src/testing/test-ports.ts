import {
  type AuditEvent,
  AuthenticatedRequestContextSchema,
  type ProtectedOperationPorts,
} from "../security";

export interface TestPortState {
  readonly auditEvents: AuditEvent[];
  committedReservations: number;
  releasedReservations: number;
  readonly reportedErrors: unknown[];
}

export type TestPortOverrides = Partial<ProtectedOperationPorts>;

export interface TestPorts {
  readonly ports: ProtectedOperationPorts;
  readonly state: TestPortState;
}

export function createTestContext(
  overrides: Readonly<Record<string, unknown>> = {},
) {
  return AuthenticatedRequestContextSchema.parse({
    actor: { id: "actor:test" },
    requestId: "request:test",
    tenantId: "tenant:test",
    ...overrides,
  });
}

export function createTestPorts(overrides: TestPortOverrides = {}): TestPorts {
  const state: TestPortState = {
    auditEvents: [],
    committedReservations: 0,
    releasedReservations: 0,
    reportedErrors: [],
  };

  const defaults: ProtectedOperationPorts = {
    audit: {
      record(event) {
        state.auditEvents.push(event);
        return Promise.resolve();
      },
    },
    authorization: {
      authorize: () => Promise.resolve({ allowed: true }),
    },
    clock: {
      now: () => new Date("2026-01-01T00:00:00.000Z"),
    },
    quota: {
      reserve: () =>
        Promise.resolve({
          allowed: true,
          reservation: {
            commit() {
              state.committedReservations += 1;
              return Promise.resolve();
            },
            release() {
              state.releasedReservations += 1;
              return Promise.resolve();
            },
          },
        }),
    },
    rateLimit: {
      consume: () => Promise.resolve({ allowed: true }),
    },
    reporter: {
      report({ error }) {
        state.reportedErrors.push(error);
      },
    },
  };

  return {
    ports: { ...defaults, ...overrides },
    state,
  };
}
