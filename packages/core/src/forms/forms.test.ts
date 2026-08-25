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

  it("covers every bounded form transition", () => {
    const issue = { code: "required", messageKey: "required", path: ["name"] };
    const initial = createFormState({ name: "Ada" });
    const next = reduceFormState(initial, { stepCount: 2, type: "next" });
    expect(
      reduceFormState(next, { stepCount: 2, type: "next" }).stepIndex,
    ).toBe(1);
    expect(reduceFormState(initial, { type: "previous" }).stepIndex).toBe(0);
    expect(reduceFormState(initial, { type: "review" }).status).toBe(
      "reviewing",
    );
    expect(reduceFormState(initial, { type: "submit" })).toMatchObject({
      issues: [],
      status: "submitting",
    });
    expect(reduceFormState(initial, { type: "succeed" }).status).toBe(
      "succeeded",
    );
    const rejected = reduceFormState(initial, {
      issues: [issue],
      type: "reject",
    });
    expect(
      reduceFormState(rejected, { name: "other", type: "change", value: true })
        .issues,
    ).toEqual([issue]);
  });

  it("evaluates every declarative validation rule", () => {
    const rulesDefinition: FormDefinition = {
      id: "rules",
      schemaVersion: 1,
      steps: [
        {
          fields: [
            field("name", [rule("minLength", 3), rule("maxLength", 5)]),
            {
              ...field("age", [rule("min", 18), rule("max", 65)]),
              kind: "number",
            },
            {
              ...field("tags", [rule("required"), rule("minLength", 2)]),
              kind: "multi-select",
            },
          ],
          id: "rules",
          titleKey: "rules",
        },
      ],
      submitLabelKey: "submit",
      titleKey: "rules",
    };
    const result = validateFormValues(rulesDefinition, {
      age: 70,
      name: "ab",
      tags: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toEqual([
        "minLength",
        "max",
        "required",
        "minLength",
      ]);
    }
    expect(
      validateFormValues(rulesDefinition, {
        age: 17,
        name: "abcdef",
        tags: ["one", "two"],
      }).success,
    ).toBe(false);
  });

  it("rejects malformed emails without evaluating hidden requirements", () => {
    const emails: FormDefinition = {
      ...definition,
      steps: [
        {
          fields: [
            {
              ...field("email", [rule("email")]),
              kind: "email",
            },
            {
              ...field("hidden", [rule("required")]),
              condition: { equals: true, field: "show" },
            },
          ],
          id: "email",
          titleKey: "email",
        },
      ],
    };
    for (const email of [
      42,
      "@host.test",
      "user@host",
      `${"a".repeat(250)}@x.co`,
    ]) {
      expect(validateFormValues(emails, { email, show: false }).success).toBe(
        false,
      );
    }
    expect(
      validateFormValues(emails, { email: "a@b.co", show: false }).success,
    ).toBe(true);
  });
});

function field(
  name: string,
  rules: NonNullable<
    FormDefinition["steps"][number]["fields"][number]["rules"]
  >,
): FormDefinition["steps"][number]["fields"][number] {
  return { id: name, kind: "text", labelKey: name, name, rules };
}

function rule(
  type: "email" | "max" | "maxLength" | "min" | "minLength" | "required",
  value?: number,
) {
  return {
    code: type,
    messageKey: type,
    type,
    ...(value === undefined ? {} : { value }),
  } as const;
}
