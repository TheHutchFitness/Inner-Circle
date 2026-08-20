import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform } from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

const PENDING_KEY = "pending_clan_code";

async function readCode(): Promise<string | null> {
  if (Platform.OS === "web") return localStorage.getItem(PENDING_KEY);
  return SecureStore.getItemAsync(PENDING_KEY);
}
async function clearCode() {
  if (Platform.OS === "web") localStorage.removeItem(PENDING_KEY);
  else await SecureStore.deleteItemAsync(PENDING_KEY);
}

// Once a user signs in, honour any clan invite code stashed before login
// (from opening a /clan/CODE link while logged out). Instant-joins, then confirms.
export function ClanInviteGate() {
  const { user, token, loading, intro } = useAuth();
  const router = useRouter();
  const done = useRef(false);
  const [clan, setClan] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user || intro || done.current) return;
    done.current = true;
    (async () => {
      const code = await readCode();
      if (!code) { done.current = false; return; }
      await clearCode();
      const [c, r] = code.split("::");
      try {
        const res = await apiFetch(token, "/api/groups/join-by-code", { method: "POST", body: JSON.stringify({ code: c, ref: r || "" }) });
        setClan(res.name || "the clan");
      } catch {
        done.current = false;
      }
    })();
  }, [loading, user?.user_id, intro]);

  if (!clan) return null;
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.icon}>🎉</Text>
        <Text style={styles.title}>YOU&apos;RE IN</Text>
        <Text style={styles.sub}>Welcome to {clan}. Climb together.</Text>
        <Pressable testID="clan-gate-go" onPress={() => { setClan(null); router.push("/(tabs)/community"); }} style={styles.btn}>
          <Text style={styles.btnText}>OPEN CLAN →</Text>
        </Pressable>
        <Pressable testID="clan-gate-dismiss" onPress={() => setClan(null)}><Text style={styles.dismiss}>Later</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,2,6,0.9)", alignItems: "center", justifyContent: "center", zIndex: 960, elevation: 960, padding: spacing.xl },
  card: { width: "88%", alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.brandPrimary, padding: spacing.xl, gap: spacing.sm },
  icon: { fontSize: 48 },
  title: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 2 },
  sub: { color: colors.textMid, fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: spacing.sm },
  btn: { backgroundColor: colors.brandPrimary, paddingVertical: 13, paddingHorizontal: spacing.xl, borderRadius: radius.sm },
  btnText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  dismiss: { color: colors.textDim, fontSize: 12, fontWeight: "700", marginTop: spacing.sm, letterSpacing: 1 },
});
