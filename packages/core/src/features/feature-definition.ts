import type { JsonValue } from "../contracts";

export type FeatureAccessDefinition =
  | { readonly mode: "public" }
  | {
      readonly mode: "authenticated";
      readonly permissions: readonly string[];
      readonly resourceScope?: string;
    };

export interface FeatureSeoDefinition {
  readonly canonicalPath: string;
  readonly description: string;
  readonly index: boolean;
  readonly title: string;
}

export interface FeaturePlatformRoutes {
  readonly mobile?: {
    readonly params?: Readonly<Record<string, FeatureValueSchema>>;
    readonly path: string;
  };
  readonly web?: {
    readonly params?: Readonly<Record<string, FeatureValueSchema>>;
    readonly path: string;
    readonly seo: FeatureSeoDefinition;
  };
}

export interface FeatureLayoutNode {
  readonly children: readonly FeatureNode[];
  readonly id: string;
  readonly kind: "layout";
  readonly layout: string;
  readonly props?: Readonly<Record<string, JsonValue>>;
}

export interface FeatureBlockNode {
  readonly actions?: Readonly<Record<string, string>>;
  readonly block: string;
  readonly id: string;
  readonly kind: "block";
  readonly props?: Readonly<Record<string, JsonValue>>;
  readonly query?: string;
}

export type FeatureNode = FeatureBlockNode | FeatureLayoutNode;

export interface FeaturePageDefinition {
  readonly access: FeatureAccessDefinition;
  readonly id: string;
  readonly root: FeatureLayoutNode;
  readonly routes: FeaturePlatformRoutes;
}

export type FeatureValueSchema =
  | {
      readonly enum?: readonly string[];
      readonly format?: "date" | "date-time" | "email" | "uuid";
      readonly maxLength?: number;
      readonly minLength?: number;
      readonly type: "string";
    }
  | {
      readonly maximum?: number;
      readonly minimum?: number;
      readonly type: "number";
    }
  | {
      readonly maximum?: number;
      readonly minimum?: number;
      readonly type: "integer";
    }
  | {
      readonly precision: number;
      readonly scale: number;
      readonly type: "decimal";
    }
  | {
      readonly resource: string;
      readonly type: "reference";
    }
  | {
      readonly type: "nullable";
      readonly value: FeatureValueSchema;
    }
  | {
      readonly oneOf: readonly FeatureValueSchema[];
      readonly type: "union";
    }
  | { readonly type: "boolean" }
  | { readonly type: "null" }
  | {
      readonly items: FeatureValueSchema;
      readonly maxItems?: number;
      readonly minItems?: number;
      readonly type: "array";
    }
  | {
      readonly additionalProperties?: false;
      readonly properties: Readonly<Record<string, FeatureValueSchema>>;
      readonly required?: readonly string[];
      readonly type: "object";
    };

export interface FeatureOperationDefinition {
  readonly access: FeatureAccessDefinition;
  readonly audit?: { readonly event: string; readonly required: boolean };
  readonly handler: string;
  readonly id: string;
  readonly idempotency?: { readonly required: boolean };
  readonly input: FeatureValueSchema;
  readonly kind: "mutation" | "query";
  readonly method: "DELETE" | "GET" | "PATCH" | "POST";
  readonly output: FeatureValueSchema;
  readonly rateLimit?: {
    readonly cost: number;
    readonly limit: number;
    readonly windowMs: number;
  };
  readonly resource?: string;
}

export interface FeatureResourceFieldDefinition {
  readonly create?: boolean;
  readonly computed?: {
    readonly dependencies: readonly string[];
    readonly handler: string;
  };
  readonly exposure?: "private" | "public";
  readonly required: boolean;
  readonly schema: FeatureValueSchema;
  readonly update?: boolean;
}

export interface FeatureResourceIndexDefinition {
  readonly fields: readonly string[];
  readonly id: string;
  readonly unique?: boolean;
}

export interface FeatureResourceRelationDefinition {
  readonly field: string;
  readonly onDelete: "cascade" | "restrict" | "set-null";
  readonly resource: string;
  readonly type: "many-to-one" | "one-to-many" | "one-to-one";
}

export interface FeatureResourceDefinition {
  readonly concurrency?: {
    readonly field: string;
    readonly mode: "version";
  };
  readonly fields: Readonly<Record<string, FeatureResourceFieldDefinition>>;
  readonly id: string;
  readonly indexes?: readonly FeatureResourceIndexDefinition[];
  readonly ownership?:
    | { readonly mode: "global" }
    | { readonly mode: "tenant"; readonly field: string };
  readonly relations?: readonly FeatureResourceRelationDefinition[];
  readonly retention?: {
    readonly archiveAfterDays?: number;
    readonly deleteAfterDays?: number;
    readonly softDelete: boolean;
  };
  readonly seed?: readonly Readonly<Record<string, JsonValue>>[];
}

export interface FeatureDefinition {
  readonly blocks: readonly string[];
  readonly id: string;
  readonly operations: readonly FeatureOperationDefinition[];
  readonly pages: readonly FeaturePageDefinition[];
  readonly resources?: readonly FeatureResourceDefinition[];
  readonly schemaVersion: number;
  readonly version: string;
}

export interface FeatureCatalogDefinition {
  readonly application: {
    readonly defaultLocale: string;
    readonly description: string;
    readonly name: string;
    readonly shortName: string;
  };
  readonly features: readonly FeatureDefinition[];
  readonly schemaVersion: number;
}

export interface CompiledFeatureRoute {
  readonly access: FeatureAccessDefinition;
  readonly featureId: string;
  readonly pageId: string;
  readonly params?: Readonly<Record<string, FeatureValueSchema>>;
  readonly path: string;
  readonly platform: "mobile" | "web";
  readonly seo?: FeatureSeoDefinition;
}

export interface CompiledFeatureCatalog {
  readonly definition: FeatureCatalogDefinition;
  readonly operations: Readonly<Record<string, FeatureOperationDefinition>>;
  readonly pages: Readonly<Record<string, FeaturePageDefinition>>;
  readonly resources: Readonly<Record<string, FeatureResourceDefinition>>;
  readonly routes: readonly CompiledFeatureRoute[];
}
