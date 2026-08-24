import type { UiRuntimeAdapter } from "@messanga11/core";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { AccessibilityInfo } from "react-native";
import { isAllowedExternalUrl } from "./url-policy";

export interface FocusTarget {
  focus(): void;
}

export function createNativeRuntimeAdapter(
  focusTargets: ReadonlyMap<string, FocusTarget>,
): UiRuntimeAdapter<FocusTarget | undefined> {
  return {
    announce(event) {
      AccessibilityInfo.announceForAccessibility(event.messageKey);
    },
    async feedback(event) {
      const feedback =
        event.kind === "success"
          ? Haptics.NotificationFeedbackType.Success
          : event.kind === "warning"
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Error;
      await Haptics.notificationAsync(feedback);
    },
    focus(targetId) {
      focusTargets.get(targetId)?.focus();
    },
    async openExternalUrl(url) {
      if (!isAllowedExternalUrl(url)) {
        throw new TypeError("External URL is not allowed.");
      }
      await Linking.openURL(url);
    },
    resolvePrimitive(name) {
      return focusTargets.get(name);
    },
  };
}
