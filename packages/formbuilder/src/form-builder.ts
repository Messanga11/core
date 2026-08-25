import type {
  FormDefinition,
  FormFieldDefinition,
  FormIssue,
  FormValues,
} from "@messanga11/core/forms";
import { validateFormValues } from "@messanga11/core/forms";
import { useForm, useStore } from "@tanstack/react-form";
import { type ReactNode, useState } from "react";

export interface FormFieldRenderContext {
  readonly field: FormFieldDefinition;
  readonly issues: readonly FormIssue[];
  readonly setValue: (value: FormValues[string]) => void;
  readonly value: FormValues[string] | undefined;
}

export interface FormRenderContext {
  readonly canGoBack: boolean;
  readonly canGoNext: boolean;
  readonly definition: FormDefinition;
  readonly goBack: () => void;
  readonly goNext: () => void;
  readonly issues: readonly FormIssue[];
  readonly renderField: (field: FormFieldDefinition) => ReactNode;
  readonly status: "editing" | "reviewing" | "submitting" | "succeeded";
  readonly stepIndex: number;
  readonly submit: () => void;
  readonly values: FormValues;
}

export interface FormRenderer {
  readonly field: (context: FormFieldRenderContext) => ReactNode;
  readonly focus?: (fieldName: string) => void;
  readonly form: (context: FormRenderContext) => ReactNode;
}

export interface FormBuilderProps {
  readonly defaultValues?: FormValues;
  readonly definition: FormDefinition;
  readonly onSubmit: (values: FormValues) => Promise<void> | void;
  readonly renderer: FormRenderer;
}

export function FormBuilder(props: FormBuilderProps): ReactNode {
  const [completion, setCompletion] = useState<"editing" | "succeeded">(
    "editing",
  );
  const initialValues: Record<string, unknown> = {
    ...(props.defaultValues ?? {}),
  };
  const form = useForm({
    defaultValues: { stepIndex: 0, values: initialValues },
    onSubmit: async ({ value }) => {
      await props.onSubmit(asFormValues(value.values));
      setCompletion("succeeded");
    },
  });
  const state = useStore(form.store, (snapshot) => snapshot);
  const stepCount = props.definition.steps.length;
  const stepIndex = Math.min(
    state.values.stepIndex,
    Math.max(0, stepCount - 1),
  );
  const values = asFormValues(state.values.values);
  const validation = validateFormValues(props.definition, values);
  const issues = validation.success ? [] : validation.issues;
  const setStep = (next: number) => form.setFieldValue("stepIndex", next);
  const renderField = (field: FormFieldDefinition): ReactNode =>
    isFieldVisible(field, values)
      ? props.renderer.field({
          field,
          issues: issues.filter((issue) => issue.path[0] === field.name),
          setValue: (value) =>
            form.setFieldValue("values", {
              ...values,
              [field.name]: value,
            }),
          value: values[field.name],
        })
      : null;
  return props.renderer.form({
    canGoBack: stepIndex > 0,
    canGoNext: stepIndex < stepCount - 1,
    definition: props.definition,
    goBack: () => setStep(Math.max(0, stepIndex - 1)),
    goNext: () => setStep(Math.min(stepCount - 1, stepIndex + 1)),
    issues,
    renderField,
    status: state.isSubmitting ? "submitting" : completion,
    stepIndex,
    submit: () => {
      if (validation.success) {
        void form.handleSubmit();
      } else {
        const firstField = validation.issues[0]?.path[0];
        if (firstField) props.renderer.focus?.(firstField);
      }
    },
    values,
  });
}

function isFieldVisible(
  field: FormFieldDefinition,
  values: FormValues,
): boolean {
  return (
    field.condition === undefined ||
    values[field.condition.field] === field.condition.equals
  );
}

function asFormValues(values: Record<string, unknown>): FormValues {
  return values as FormValues;
}
