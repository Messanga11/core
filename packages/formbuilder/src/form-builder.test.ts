import { describe, expect, it } from "vitest";
import type { FormRenderer } from "./form-builder";

describe("FormRenderer", () => {
  it("keeps platform rendering injectable", () => {
    const renderer: FormRenderer = {
      field: ({ field }) => field.name,
      form: ({ definition }) => definition.id,
    };
    expect(renderer.form).toBeTypeOf("function");
    expect(renderer.field).toBeTypeOf("function");
  });
});
