import type { JsonValue } from "../contracts";

export type CrudRecord = Readonly<{ id: string } & Record<string, JsonValue>>;

export type CrudFilterOperator =
  | "contains"
  | "eq"
  | "gt"
  | "gte"
  | "in"
  | "lt"
  | "lte";

export interface CrudFilter {
  readonly field: string;
  readonly operator: CrudFilterOperator;
  readonly value: JsonValue;
}

export interface CrudSort {
  readonly direction: "asc" | "desc";
  readonly field: string;
}

export interface CrudListRequest {
  readonly filters?: readonly CrudFilter[];
  readonly limit: number;
  readonly offset: number;
  readonly resource: string;
  readonly sort?: readonly CrudSort[];
}

export interface CrudListResult<RecordType extends CrudRecord = CrudRecord> {
  readonly records: readonly RecordType[];
  readonly total: number;
}

export interface CrudWriteRequest<Values extends JsonValue = JsonValue> {
  readonly idempotencyKey: string;
  readonly resource: string;
  readonly values: Values;
}

export interface CrudUpdateRequest<Values extends JsonValue = JsonValue>
  extends CrudWriteRequest<Values> {
  readonly id: string;
}

export interface CrudPort<RecordType extends CrudRecord = CrudRecord> {
  create(request: CrudWriteRequest): Promise<RecordType>;
  delete(request: Readonly<{ id: string; resource: string }>): Promise<void>;
  get(
    request: Readonly<{ id: string; resource: string }>,
  ): Promise<RecordType | undefined>;
  list(request: CrudListRequest): Promise<CrudListResult<RecordType>>;
  update(request: CrudUpdateRequest): Promise<RecordType>;
}
