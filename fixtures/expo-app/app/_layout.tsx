import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";

const STACK_OPTIONS = { headerShown: false } as const;

export default function RootLayout() {
  return (
    <>
      <StatusBar style="dark" />
      <Stack screenOptions={STACK_OPTIONS} />
    </>
  );
}
