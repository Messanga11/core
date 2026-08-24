import type { UiMeta } from "./ui-meta";

export interface OperationEnvelope<
  Data,
  Action extends string,
  Reason extends string = string,
> {
  readonly data: Data;
  readonly uiMeta: UiMeta<Action, Reason>;
}
