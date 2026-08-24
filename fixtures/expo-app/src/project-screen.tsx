import type { AppRouter } from "@messanga11/next-fixture/router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import * as SecureStore from "expo-secure-store";
import { useState } from "react";
import {
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

const PROJECT_ID = "project:fixture";
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api/trpc";

export function ProjectScreen() {
  const [client] = useState(createClient);
  const [name, setName] = useState("Architecture Core");
  const [confirmedName, setConfirmedName] = useState("Architecture Core");
  const [version, setVersion] = useState(1);
  const [message, setMessage] = useState("Prêt");
  const [submitting, setSubmitting] = useState(false);
  const isDisabled = submitting || name.trim().length === 0;

  async function renameProject() {
    const previous = confirmedName;
    setConfirmedName(name);
    setSubmitting(true);
    setMessage("Enregistrement…");
    try {
      await SecureStore.setItemAsync("fixture-session", "fixture-session");
      await client.project.create.mutate({
        id: PROJECT_ID,
        idempotencyKey: "create:fixture",
        name: previous,
      });
      const response = await client.project.rename.mutate({
        expectedVersion: version,
        id: PROJECT_ID,
        idempotencyKey: `rename:${version}:${name}`,
        name,
      });
      if (response.data.status === "conflict") {
        setConfirmedName(response.data.current.name);
        setVersion(response.data.current.version);
        setMessage("Conflit détecté. État serveur restauré.");
      } else {
        setVersion(response.data.project.version);
        setMessage("Nom enregistré.");
      }
    } catch {
      setConfirmedName(previous);
      setMessage("Connexion impossible. Modification annulée.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.shell}>
        <Text style={styles.eyebrow}>FIXTURE NATIVE</Text>
        <Text accessibilityRole="header" style={styles.title}>
          Projet partagé
        </Text>
        <Text style={styles.lede}>
          Expo projette les mêmes contrats et décisions que le Web.
        </Text>
        <View style={styles.panel}>
          <Text style={styles.projectName}>{confirmedName}</Text>
          <Text style={styles.revision}>Révision {version} · tenant isolé</Text>
          <Text style={styles.label}>Nouveau nom</Text>
          <TextInput
            accessibilityLabel="Nouveau nom du projet"
            maxLength={120}
            onChangeText={setName}
            style={styles.input}
            value={name}
          />
          <Pressable
            accessibilityRole="button"
            disabled={isDisabled}
            onPress={renameProject}
            style={isDisabled ? styles.disabledButton : styles.button}
          >
            <Text style={styles.buttonLabel}>
              {submitting ? "Enregistrement…" : "Renommer"}
            </Text>
          </Pressable>
          <Text accessibilityLiveRegion="polite" style={styles.status}>
            {message}
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function createClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        headers: () => ({
          authorization: "Bearer fixture-session",
          "x-project-id": PROJECT_ID,
          "x-request-id": crypto.randomUUID(),
        }),
        url: API_URL,
      }),
    ],
  });
}

const styles = StyleSheet.create({
  button: {
    alignItems: "center",
    backgroundColor: "#1d1d1a",
    borderRadius: 999,
    minHeight: 50,
    justifyContent: "center",
    marginTop: 20,
  },
  buttonLabel: { color: "#fff", fontSize: 16, fontWeight: "700" },
  disabledButton: {
    alignItems: "center",
    backgroundColor: "#1d1d1a",
    borderRadius: 999,
    justifyContent: "center",
    marginTop: 20,
    minHeight: 50,
    opacity: 0.45,
  },
  eyebrow: {
    color: "#68645c",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
  },
  input: {
    backgroundColor: "#fff",
    borderColor: "#aaa59b",
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 16,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  label: {
    color: "#34322d",
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 8,
    marginTop: 24,
  },
  lede: { color: "#5b5851", fontSize: 17, lineHeight: 25, marginTop: 10 },
  panel: {
    backgroundColor: "#fffef9",
    borderColor: "#d8d4ca",
    borderRadius: 18,
    borderWidth: 1,
    marginTop: 36,
    padding: 24,
  },
  projectName: { color: "#171714", fontSize: 22, fontWeight: "700" },
  revision: { color: "#68645c", marginTop: 5 },
  safeArea: { backgroundColor: "#f4f2ed", flex: 1 },
  shell: { flex: 1, paddingHorizontal: 24, paddingTop: 48 },
  status: { color: "#57534b", marginTop: 18, minHeight: 22 },
  title: {
    color: "#171714",
    fontSize: 48,
    fontWeight: "800",
    letterSpacing: -2.2,
    lineHeight: 50,
    marginTop: 8,
  },
});
