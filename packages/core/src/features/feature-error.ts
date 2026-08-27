export type FeatureDefinitionErrorCode =
  | "DUPLICATE_ID"
  | "DUPLICATE_ROUTE"
  | "INVALID_DEFINITION"
  | "UNKNOWN_BLOCK"
  | "UNKNOWN_OPERATION"
  | "UNKNOWN_RESOURCE";

export class FeatureDefinitionError extends Error {
  readonly code: FeatureDefinitionErrorCode;
  readonly path: string;

  constructor(code: FeatureDefinitionErrorCode, path: string) {
    super(`Invalid feature definition at ${path}.`);
    this.name = "FeatureDefinitionError";
    this.code = code;
    this.path = path;
  }
}
