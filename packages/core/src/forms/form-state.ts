import type { FormValues } from "./form-definition";

export interface FormIssue {
  readonly code: string;
  readonly messageKey: string;
  readonly path: readonly string[];
}

export type FormStatus = "editing" | "reviewing" | "submitting" | "succeeded";

export interface FormState {
  readonly issues: readonly FormIssue[];
  readonly status: FormStatus;
  readonly stepIndex: number;
  readonly values: FormValues;
}

export type FormAction =
  | Readonly<{ name: string; type: "change"; value: FormValues[string] }>
  | Readonly<{ issues: readonly FormIssue[]; type: "reject" }>
  | Readonly<{ stepCount: number; type: "next" }>
  | Readonly<{ type: "previous" }>
  | Readonly<{ type: "review" }>
  | Readonly<{ type: "submit" }>
  | Readonly<{ type: "succeed" }>;

export function createFormState(values: FormValues = {}): FormState {
  return { issues: [], status: "editing", stepIndex: 0, values };
}

export function reduceFormState(
  state: FormState,
  action: FormAction,
): FormState {
  switch (action.type) {
    case "change":
      return {
        ...state,
        issues: state.issues.filter((issue) => issue.path[0] !== action.name),
        status: "editing",
        values: { ...state.values, [action.name]: action.value },
      };
    case "next":
      return {
        ...state,
        stepIndex: Math.min(state.stepIndex + 1, action.stepCount - 1),
      };
    case "previous":
      return {
        ...state,
        status: "editing",
        stepIndex: Math.max(0, state.stepIndex - 1),
      };
    case "review":
      return { ...state, status: "reviewing" };
    case "submit":
      return { ...state, issues: [], status: "submitting" };
    case "reject":
      return { ...state, issues: action.issues, status: "editing" };
    case "succeed":
      return { ...state, issues: [], status: "succeeded" };
  }
}
