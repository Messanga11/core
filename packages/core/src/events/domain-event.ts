import type { JsonValue } from "../contracts";

export type EventActorType = "human" | "service";

export interface DomainEvent<
  Type extends string = string,
  Payload extends JsonValue = JsonValue,
> {
  readonly actor: Readonly<{ id: string; type: EventActorType }>;
  readonly aggregate: Readonly<{ id: string; type: string; version: number }>;
  readonly correlationId: string;
  readonly id: string;
  readonly occurredAt: string;
  readonly payload: Payload;
  readonly schemaVersion: number;
  readonly tenantId: string;
  readonly type: Type;
}

export type DomainEventInput<
  Type extends string,
  Payload extends JsonValue,
> = DomainEvent<Type, Payload>;

const MAX_JSON_DEPTH = 32;

export function createDomainEvent<
  Type extends string,
  Payload extends JsonValue,
>(input: DomainEventInput<Type, Payload>): DomainEvent<Type, Payload> {
  assertNonEmpty(input.id, "id");
  assertNonEmpty(input.type, "type");
  assertNonEmpty(input.tenantId, "tenantId");
  assertNonEmpty(input.correlationId, "correlationId");
  assertNonEmpty(input.actor.id, "actor.id");
  assertNonEmpty(input.aggregate.id, "aggregate.id");
  assertNonEmpty(input.aggregate.type, "aggregate.type");
  assertPositiveInteger(input.aggregate.version, "aggregate.version");
  assertPositiveInteger(input.schemaVersion, "schemaVersion");
  assertIsoTimestamp(input.occurredAt);
  assertJsonValue(input.payload);
  return Object.freeze(input);
}

function assertNonEmpty(value: string, field: string): void {
  if (value.length === 0) {
    throw new TypeError(`${field} must not be empty.`);
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new TypeError(`${field} must be a positive safe integer.`);
  }
}

function assertIsoTimestamp(value: string): void {
  const timestamp = Date.parse(value);
  if (
    !Number.isFinite(timestamp) ||
    new Date(timestamp).toISOString() !== value
  ) {
    throw new TypeError("occurredAt must be a canonical ISO-8601 timestamp.");
  }
}

function assertJsonValue(
  value: unknown,
  depth = 0,
): asserts value is JsonValue {
  if (depth > MAX_JSON_DEPTH) {
    throw new TypeError("Event payload exceeds the JSON nesting limit.");
  }
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      assertJsonValue(item, depth + 1);
    }
    return;
  }
  assertJsonObject(value, depth);
}

function assertJsonObject(
  value: unknown,
  depth: number,
): asserts value is JsonValue {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("Event payload must contain only JSON values.");
  }
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Event payload must contain only plain objects.");
  }
  for (const item of Object.values(value)) {
    assertJsonValue(item, depth + 1);
  }
}
