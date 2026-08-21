import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { NeonButton } from "@/src/components/NeonButton";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function MyGyms() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, refresh } = useAuth();
  const [gyms, setGyms] = useState<any[]>([]);
  const [max, setMax] = useState(5);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    try { const r = await apiFetch(token, "/api/gyms/mine"); setGyms(r.gyms || []); setMax(r.max || 5); } catch {}
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const add = async () => {
    const n = name.trim();
    if (!n) return;
    setBusy(true); setErr(null);
    try {
      const r = await apiFetch(token, "/api/gyms/mine", { method: "POST", body: JSON.stringify({ name: n }) });
      setGyms(r.gyms || []); setName(""); refresh?.();
    } catch (e: any) { setErr(e?.message || "Could not add gym"); }
    setBusy(false);
  };

  const doRemove = async (g: any) => {
    try { const r = await apiFetch(token, `/api/gyms/mine?name=${encodeURIComponent(g.name)}`, { method: "DELETE" }); setGyms(r.gyms || []); refresh?.(); } catch {}
  };
  const remove = (g: any) => {
    if (Platform.OS === "web") { if (typeof window !== "undefined" && window.confirm(`Leave ${g.name}?`)) doRemove(g); return; }
    Alert.alert(`Leave ${g.name}?`, "You can re-join any time.", [{ text: "Cancel", style: "cancel" }, { text: "Leave", style: "destructive", onPress: () => doRemove(g) }]);
  };

  const setPrimary = async (g: any) => {
    try { const r = await apiFetch(token, "/api/gyms/mine/primary", { method: "POST", body: JSON.stringify({ name: g.name }) }); setGyms(r.gyms || []); refresh?.(); } catch {}
  };

  const full = gyms.length >= max;

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>▚ YOUR TERRITORY //</Text>
        <Text style={styles.h1}>MY GYMS</Text>
        <Text style={styles.helper}>Join up to {max} gyms. Your ★ primary gym is the one used for in-person coaching.</Text>

        {!full && (
          <View style={styles.addRow}>
            <TextInput
              testID="gym-add-input"
              value={name}
              onChangeText={setName}
              placeholder="Add a gym by name…"
              placeholderTextColor={colors.textDim}
              style={styles.input}
              autoCapitalize="words"
              onSubmitEditing={add}
            />
            <NeonButton testID="gym-add-btn" label={busy ? "…" : "ADD"} loading={busy} onPress={add} style={{ minWidth: 96 }} />
          </View>
        )}
        {full && <Text style={styles.full}>You've reached the {max}-gym limit. Leave one to join another.</Text>}
        {err && <Text style={styles.err}>{err}</Text>}

        {gyms.length === 0 ? (
          <Text style={styles.empty}>You're not part of any gym yet — add your home gym above.</Text>
        ) : gyms.map((g) => (
          <View key={g.name} style={[styles.card, g.primary && styles.cardPrimary]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{g.primary ? "★ " : ""}{g.name}{g.verified ? "  ✓" : ""}</Text>
              <View style={styles.badges}>
                {g.primary && <Text style={styles.badgePrimary}>PRIMARY</Text>}
                {g.coaching_enabled && <Text style={styles.badgeCoach}>🏋 COACHING</Text>}
                {g.verified && <Text style={styles.badgeVer}>VERIFIED</Text>}
              </View>
            </View>
            {!g.primary && (
              <Pressable testID={`gym-primary-${g.name}`} onPress={() => setPrimary(g)} style={styles.smallBtn}><Text style={styles.smallBtnText}>SET ★</Text></Pressable>
            )}
            <Pressable testID={`gym-leave-${g.name}`} onPress={() => remove(g)} style={styles.leaveBtn}><Text style={styles.leaveText}>LEAVE</Text></Pressable>
          </View>
        ))}

        <Pressable testID="open-gyms-map" onPress={() => router.push("/gyms-map")} style={styles.discover}>
          <Text style={styles.discoverText}>🗺  DISCOVER GYMS NEAR ME</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.textMid, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.sm },
  eyebrow: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  h1: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 24, marginTop: 2 },
  helper: { color: colors.textDim, fontSize: 12, marginTop: 4, marginBottom: spacing.lg, lineHeight: 17 },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginBottom: spacing.md },
  input: { flex: 1, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
  full: { color: colors.warning, fontSize: 12, fontWeight: "700", marginBottom: spacing.md },
  err: { color: colors.error, fontSize: 12, fontWeight: "700", marginBottom: spacing.sm },
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.xl, fontSize: 13 },
  card: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardPrimary: { borderColor: colors.brandPrimary, backgroundColor: "rgba(0,85,255,0.10)" },
  name: { color: colors.text, fontWeight: "800", fontSize: 15 },
  badges: { flexDirection: "row", gap: 6, marginTop: 5, flexWrap: "wrap" },
  badgePrimary: { color: colors.brandPrimary, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  badgeCoach: { color: colors.warning, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  badgeVer: { color: colors.success, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  smallBtn: { borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  smallBtnText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  leaveBtn: { borderWidth: 1, borderColor: colors.error, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8 },
  leaveText: { color: colors.error, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  discover: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingVertical: 14, alignItems: "center", backgroundColor: colors.surface2 },
  discoverText: { color: colors.textMid, fontWeight: "900", letterSpacing: 1, fontSize: 13 },
});
