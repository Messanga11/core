import type { JsonValue } from "../contracts";
import type { DomainEvent } from "./domain-event";

export interface OutboxPort<Transaction = undefined> {
  append(
    events: readonly DomainEvent[],
    transaction: Transaction,
  ): Promise<void>;
}

export interface IdempotencyRecord<Value extends JsonValue = JsonValue> {
  readonly expiresAt: string;
  readonly key: string;
  readonly value: Value;
}

export interface IdempotencyPort<Transaction = undefined> {
  find(
    key: string,
    transaction: Transaction,
  ): Promise<IdempotencyRecord | undefined>;
  store(
    record: IdempotencyRecord,
    transaction: Transaction,
  ): Promise<"conflict" | "stored">;
}

export interface TransactionPort<Transaction> {
  run<Result>(
    work: (transaction: Transaction) => Promise<Result>,
  ): Promise<Result>;
}
