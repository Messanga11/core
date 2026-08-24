import type { UiRuntimeAdapter } from "@messanga11/core";

const ALLOWED_PROTOCOLS = new Set(["https:"]);

export function createWebRuntimeAdapter(): UiRuntimeAdapter<HTMLElement | null> {
  return {
    announce(event) {
      const region = document.querySelector<HTMLElement>("[data-live-region]");
      if (region) {
        region.dataset.politeness = event.politeness;
        region.textContent = event.messageKey;
      }
    },
    feedback() {},
    focus(targetId) {
      document.getElementById(targetId)?.focus();
    },
    async openExternalUrl(url) {
      if (!isAllowedExternalUrl(url)) {
        throw new TypeError("External URL is not allowed.");
      }
      window.open(url, "_blank", "noopener,noreferrer");
    },
    resolvePrimitive(name) {
      return document.querySelector<HTMLElement>(
        `[data-primitive="${CSS.escape(name)}"]`,
      );
    },
  };
}

export function isAllowedExternalUrl(value: string): boolean {
  try {
    return ALLOWED_PROTOCOLS.has(new URL(value).protocol);
  } catch {
    return false;
  }
}
