export interface SqlResult<
  Row extends Record<string, unknown> = Record<string, unknown>,
> {
  readonly rowCount: number | null;
  readonly rows: readonly Row[];
}

export interface SqlClientPort {
  query<Row extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: readonly unknown[],
  ): Promise<SqlResult<Row>>;
  release?(): void;
}

export interface SqlPoolPort {
  connect(): Promise<SqlClientPort>;
  end(): Promise<void>;
}
