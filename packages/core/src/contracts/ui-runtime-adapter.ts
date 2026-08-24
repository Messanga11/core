export interface UiAnnouncement {
  readonly messageKey: string;
  readonly politeness: "assertive" | "polite";
}

export interface UiFeedback {
  readonly kind: "error" | "success" | "warning";
}

export interface UiRuntimeAdapter<PrimitiveHandle = unknown> {
  announce(event: UiAnnouncement): Promise<void> | void;
  feedback(event: UiFeedback): Promise<void> | void;
  focus(targetId: string): Promise<void> | void;
  openExternalUrl(url: string): Promise<void>;
  resolvePrimitive(name: string): PrimitiveHandle;
}
