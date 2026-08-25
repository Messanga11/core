import { describe, expect, it } from "vitest";
import type { FormDefinition } from "./form-definition";
import { createFormState, reduceFormState } from "./form-state";
import { validateFormValues } from "./validate-form";

const definition: FormDefinition = {
  id: "team-profile",
  schemaVersion: 1,
  steps: [
    {
      fields: [
        {
          id: "email",
          kind: "email",
          labelKey: "email",
          name: "email",
          rules: [
            { code: "required", messageKey: "required", type: "required" },
            { code: "email", messageKey: "email.invalid", type: "email" },
          ],
        },
        {
          condition: { equals: true, field: "business" },
          id: "company",
          kind: "text",
          labelKey: "company",
          name: "company",
          rules: [
            { code: "required", messageKey: "required", type: "required" },
          ],
        },
      ],
      id: "identity",
      titleKey: "identity",
    },
  ],
  submitLabelKey: "submit",
  titleKey: "team.profile",
};

describe("forms", () => {
  it("validates visible fields and ignores hidden conditional fields", () => {
    expect(
      validateFormValues(definition, { business: false, email: "bad" }),
    ).toEqual({
      issues: [{ code: "email", messageKey: "email.invalid", path: ["email"] }],
      success: false,
    });
    expect(
      validateFormValues(definition, { business: false, email: "a@b.co" }),
    ).toEqual({
      data: { business: false, email: "a@b.co" },
      success: true,
    });
  });

  it("keeps form transitions pure and clears a changed field issue", () => {
    const rejected = reduceFormState(createFormState(), {
      issues: [{ code: "required", messageKey: "required", path: ["email"] }],
      type: "reject",
    });
    const changed = reduceFormState(rejected, {
      name: "email",
      type: "change",
      value: "a@b.co",
    });
    expect(changed.issues).toEqual([]);
    expect(changed.values).toEqual({ email: "a@b.co" });
  });

  it("round-trips a definition through JSON", () => {
    expect(JSON.parse(JSON.stringify(definition))).toEqual(definition);
  });
});
