import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

const PENDING_KEY = "pending_clan_code";

async function stashCode(code: string) {
  if (Platform.OS === "web") localStorage.setItem(PENDING_KEY, code);
  else await SecureStore.setItemAsync(PENDING_KEY, code);
}

// Deep-link target for clan invite links: frontend://clan/CODE (native) or /clan/CODE (web).
export default function ClanInvite() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, loading } = useAuth();
  const [state, setState] = useState<"working" | "done" | "error">("working");
  const [msg, setMsg] = useState("");
  const [clan, setClan] = useState<string>("");

  useEffect(() => {
    if (loading) return;
    const c = String(code || "").trim().toUpperCase();
    if (!c) { setState("error"); setMsg("Invalid invite link."); return; }
    // Not signed in yet → remember the code and send them to log in / sign up first.
    if (!user) {
      stashCode(c).finally(() => router.replace("/"));
      return;
    }
    (async () => {
      try {
        const r = await apiFetch(token, "/api/groups/join-by-code", { method: "POST", body: JSON.stringify({ code: c }) });
        setClan(r.name || "the clan");
        setState("done");
      } catch (e: any) {
        setMsg(e?.message || "Couldn't join this clan.");
        setState("error");
      }
    })();
  }, [loading, user, code]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {state === "working" && (
        <>
          <ActivityIndicator color={colors.brandPrimary} size="large" />
          <Text style={styles.sub}>Joining your clan…</Text>
        </>
      )}
      {state === "done" && (
        <>
          <Text style={styles.icon}>🎉</Text>
          <Text style={styles.title}>YOU&apos;RE IN</Text>
          <Text style={styles.sub}>Welcome to {clan}. Time to climb together.</Text>
          <Pressable testID="clan-go" onPress={() => router.replace("/(tabs)/community")} style={styles.btn}>
            <Text style={styles.btnText}>OPEN CLAN →</Text>
          </Pressable>
        </>
      )}
      {state === "error" && (
        <>
          <Text style={styles.icon}>⚠️</Text>
          <Text style={styles.title}>INVITE ISSUE</Text>
          <Text style={styles.sub}>{msg}</Text>
          <Pressable testID="clan-home" onPress={() => router.replace("/(tabs)")} style={styles.btn}>
            <Text style={styles.btnText}>GO HOME</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  icon: { fontSize: 54 },
  title: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 2 },
  sub: { color: colors.textMid, fontSize: 14, textAlign: "center", lineHeight: 20 },
  btn: { marginTop: spacing.md, backgroundColor: colors.brandPrimary, paddingVertical: 14, paddingHorizontal: spacing.xl, borderRadius: radius.sm },
  btnText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
});
