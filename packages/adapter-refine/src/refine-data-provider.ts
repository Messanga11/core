import type { JsonValue } from "@messanga11/core";
import type {
  CrudFilter,
  CrudListRequest,
  CrudPort,
  CrudRecord,
  CrudSort,
} from "@messanga11/core/crud";
import type {
  BaseRecord,
  CreateParams,
  CreateResponse,
  CrudFilters,
  CrudSorting,
  DataProvider,
  DeleteOneParams,
  DeleteOneResponse,
  GetListParams,
  GetListResponse,
  GetOneParams,
  GetOneResponse,
  UpdateParams,
  UpdateResponse,
} from "@refinedev/core";

const DEFAULT_LIMIT = 25;

export function createRefineDataProvider(port: CrudPort): DataProvider {
  return {
    create: (params) => create(port, params),
    deleteOne: (params) => deleteOne(port, params),
    getApiUrl: () => "messanga11://crud",
    getList: (params) => getList(port, params),
    getOne: (params) => getOne(port, params),
    update: (params) => update(port, params),
  };
}

async function create<
  TData extends BaseRecord = BaseRecord,
  TVariables = unknown,
>(
  port: CrudPort,
  params: CreateParams<TVariables>,
): Promise<CreateResponse<TData>> {
  const record = await port.create({
    idempotencyKey: crypto.randomUUID(),
    resource: params.resource,
    values: asJson(params.variables),
  });
  return { data: asRefineRecord<TData>(record) };
}

async function deleteOne<
  TData extends BaseRecord = BaseRecord,
  TVariables = unknown,
>(
  port: CrudPort,
  params: DeleteOneParams<TVariables>,
): Promise<DeleteOneResponse<TData>> {
  await port.delete({ id: String(params.id), resource: params.resource });
  return { data: { id: String(params.id) } as unknown as TData };
}

async function getList<TData extends BaseRecord = BaseRecord>(
  port: CrudPort,
  params: GetListParams,
): Promise<GetListResponse<TData>> {
  const limit = params.pagination?.pageSize ?? DEFAULT_LIMIT;
  const current = params.pagination?.currentPage ?? 1;
  const request: CrudListRequest = {
    limit,
    offset: Math.max(0, current - 1) * limit,
    resource: params.resource,
  };
  const filters = toFilters(params.filters);
  const sort = toSort(params.sorters);
  const result = await port.list({
    ...request,
    ...(filters ? { filters } : {}),
    ...(sort ? { sort } : {}),
  });
  return {
    data: result.records.map(asRefineRecord<TData>),
    total: result.total,
  };
}

async function getOne<TData extends BaseRecord = BaseRecord>(
  port: CrudPort,
  params: GetOneParams,
): Promise<GetOneResponse<TData>> {
  const record = await port.get({
    id: String(params.id),
    resource: params.resource,
  });
  if (!record) throw new Error("Resource not found");
  return { data: asRefineRecord<TData>(record) };
}

async function update<
  TData extends BaseRecord = BaseRecord,
  TVariables = unknown,
>(
  port: CrudPort,
  params: UpdateParams<TVariables>,
): Promise<UpdateResponse<TData>> {
  const record = await port.update({
    id: String(params.id),
    idempotencyKey: crypto.randomUUID(),
    resource: params.resource,
    values: asJson(params.variables),
  });
  return { data: asRefineRecord<TData>(record) };
}

function toFilters(
  filters: CrudFilters | undefined,
): readonly CrudFilter[] | undefined {
  if (!filters) return undefined;
  const result: CrudFilter[] = [];
  for (const filter of filters) {
    if (
      "field" in filter &&
      typeof filter.field === "string" &&
      isOperator(filter.operator)
    ) {
      result.push({
        field: filter.field,
        operator: filter.operator,
        value: asJson(filter.value),
      });
    }
  }
  return result;
}

function toSort(
  sorters: CrudSorting | undefined,
): readonly CrudSort[] | undefined {
  return sorters?.map((sorter) => ({
    direction: sorter.order,
    field: sorter.field,
  }));
}

function isOperator(value: string): value is CrudFilter["operator"] {
  return ["contains", "eq", "gt", "gte", "in", "lt", "lte"].includes(value);
}

function asJson(value: unknown): JsonValue {
  const serialized = JSON.stringify(value);
  if (serialized === undefined)
    throw new TypeError("Value is not JSON serializable");
  return JSON.parse(serialized) as JsonValue;
}

function asRefineRecord<TData extends BaseRecord>(record: CrudRecord): TData {
  return record as unknown as TData;
}
