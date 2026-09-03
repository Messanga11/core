import { describe, expect, it } from "vitest";
import { compileFeatureCatalog } from "./compile-feature-catalog";
import type { FeatureCatalogDefinition } from "./feature-definition";
import { generateFeatureOpenApiDocument } from "./openapi";

describe("feature OpenAPI generation", () => {
  it("derives secured operation contracts from the compiled catalog", () => {
    const document = generateFeatureOpenApiDocument(
      compileFeatureCatalog(catalog),
      { serverUrl: "https://api.example.com" },
    );
    const serialized = JSON.parse(JSON.stringify(document));
    const operation = serialized.paths["/api/features/orders/create"].post;

    expect(serialized.openapi).toBe("3.1.0");
    expect(serialized.servers).toEqual([{ url: "https://api.example.com/" }]);
    expect(operation.operationId).toBe("orders.create");
    expect(operation.security).toEqual([{ sessionCookie: [] }]);
    expect(
      operation.requestBody.content["application/json"].schema.properties.total,
    ).toEqual({
      pattern: "^-?\\d{1,10}(?:\\.\\d{1,2})?$",
      type: "string",
      "x-messanga-decimal": { precision: 12, scale: 2 },
    });
    expect(
      operation.responses["200"].content["application/json"].schema,
    ).toEqual(catalog.features[0]?.operations[0]?.output);
  });

  it("rejects non-HTTP server URLs", () => {
    expect(() =>
      generateFeatureOpenApiDocument(compileFeatureCatalog(catalog), {
        serverUrl: "file:///tmp/api",
      }),
    ).toThrow("HTTP or HTTPS");
  });
});

const catalog: FeatureCatalogDefinition = {
  application: {
    defaultLocale: "en",
    description: "Orders API",
    name: "Orders",
    shortName: "Orders",
  },
  features: [
    {
      blocks: [],
      id: "orders",
      operations: [
        {
          access: { mode: "authenticated", permissions: ["orders:create"] },
          audit: { event: "orders.created", required: true },
          handler: "orders.create",
          id: "create",
          idempotency: { required: true },
          input: {
            additionalProperties: false,
            properties: { total: { precision: 12, scale: 2, type: "decimal" } },
            required: ["total"],
            type: "object",
          },
          kind: "mutation",
          method: "POST",
          output: {
            additionalProperties: false,
            properties: { id: { type: "string" } },
            required: ["id"],
            type: "object",
          },
          rateLimit: { cost: 1, limit: 20, windowMs: 60_000 },
        },
      ],
      pages: [],
      schemaVersion: 1,
      version: "1.0.0",
    },
  ],
  schemaVersion: 1,
};
