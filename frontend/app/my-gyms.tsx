import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Platform, Alert, ActivityIndicator, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
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
  const [dir, setDir] = useState<string[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [checkingId, setCheckingId] = useState<string | null>(null);

  const load = async () => {
    try { const r = await apiFetch(token, "/api/gyms/mine"); setGyms(r.gyms || []); setMax(r.max || 5); } catch {}
    try { const s = await apiFetch(token, "/api/gyms/checkins"); setStreak(s.streak || 0); } catch {}
  };
  const loadDir = async () => {
    try { const r = await apiFetch(token, "/api/gyms"); setDir(r.gyms || []); } catch {}
  };
  useEffect(() => { load(); loadDir(); /* eslint-disable-next-line */ }, []);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };

  const promptSettings = () => {
    Alert.alert(
      "Location is off",
      "Enable location access in Settings to check in when you're at your gym.",
      [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }],
    );
  };

  const checkIn = async (g: any) => {
    setCheckingId(g.name);
    try {
      // Contextual location permission — check-in needs you to be at the gym (within 500 m).
      const cur = await Location.getForegroundPermissionsAsync();
      let status = cur.status;
      if (status !== "granted") {
        if (cur.canAskAgain) {
          const req = await Location.requestForegroundPermissionsAsync();
          status = req.status;
          if (status !== "granted") {
            if (!req.canAskAgain) promptSettings();
            else flash("Location is needed to check in at your gym");
            setCheckingId(null); return;
          }
        } else { promptSettings(); setCheckingId(null); return; }
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const r = await apiFetch(token, "/api/gyms/check-in", { method: "POST", body: JSON.stringify({ gym: g.name, gym_id: g.id, lat: pos.coords.latitude, lng: pos.coords.longitude }) });
      if (typeof r.streak === "number") setStreak(r.streak);
      if (r.already) flash(`Already checked in at ${g.name} today ✓`);
      else {
        const bonus = r.streak_bonus ? ` · 🔥 ${r.streak}-day streak (+${r.streak_bonus})` : "";
        flash(`Checked in · +${r.xp_awarded} XP 💪${bonus}`);
      }
      await load(); refresh?.();
    } catch (e: any) { flash(e?.message || "Couldn't check in"); }
    setCheckingId(null);
  };

  const add = async (picked?: string) => {
    const n = (picked ?? name).trim();
    if (!n) return;
    setBusy(true); setErr(null); setShowDrop(false);
    try {
      const r = await apiFetch(token, "/api/gyms/mine", { method: "POST", body: JSON.stringify({ name: n }) });
      setGyms(r.gyms || []); setName(""); refresh?.();
    } catch (e: any) { setErr(e?.message || "Could not add gym"); }
    setBusy(false);
  };
  const joined = new Set(gyms.map((g) => g.name.toLowerCase()));
  const suggestions = dir
    .filter((d) => !joined.has(d.toLowerCase()) && (name.trim() === "" || d.toLowerCase().includes(name.trim().toLowerCase())))
    .slice(0, 8);

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
        <Text style={styles.helper}>Join up to {max} gyms. Your ★ primary gym is the one used for in-person coaching. Check in once a day while you're at the gym (within 500 m) to earn XP and build your streak.</Text>

        {streak > 0 && <Text style={styles.streakBanner}>🔥 {streak}-day check-in streak</Text>}

        {!full && (
          <View style={styles.addWrap}>
            <View style={styles.addRow}>
              <Pressable style={styles.dropToggle} onPress={() => setShowDrop((s) => !s)} testID="gym-dropdown-toggle">
                <Text style={styles.dropToggleText}>▾</Text>
              </Pressable>
              <TextInput
                testID="gym-add-input"
                value={name}
                onChangeText={(t) => { setName(t); setShowDrop(true); }}
                onFocus={() => setShowDrop(true)}
                placeholder="Pick or type a gym…"
                placeholderTextColor={colors.textDim}
                style={styles.input}
                autoCapitalize="words"
                onSubmitEditing={() => add()}
              />
              <NeonButton testID="gym-add-btn" label={busy ? "…" : "ADD"} loading={busy} onPress={() => add()} style={{ minWidth: 90 }} />
            </View>
            {showDrop && suggestions.length > 0 && (
              <View style={styles.dropdown}>
                {suggestions.map((s) => (
                  <Pressable key={s} testID={`gym-opt-${s}`} onPress={() => add(s)} style={styles.dropItem}>
                    <Text style={styles.dropItemText}>🏋 {s}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        )}
        {full && <Text style={styles.full}>You've reached the {max}-gym limit. Leave one to join another.</Text>}
        {err && <Text style={styles.err}>{err}</Text>}

        {gyms.length === 0 ? (
          <Text style={styles.empty}>You're not part of any gym yet — add your home gym above.</Text>
        ) : gyms.map((g) => (
          <View key={g.name} style={[styles.card, g.primary && styles.cardPrimary]}>
            <View style={styles.cardTop}>
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
            {g.checked_in_today ? (
              <View style={styles.checkedBox}><Text style={styles.checkedText}>✓ CHECKED IN TODAY</Text></View>
            ) : (
              <Pressable testID={`gym-checkin-${g.name}`} onPress={() => checkIn(g)} disabled={checkingId === g.name} style={styles.checkinBtn}>
                {checkingId === g.name ? <ActivityIndicator color="#001122" /> : <Text style={styles.checkinText}>💪 CHECK IN · +150 XP</Text>}
              </Pressable>
            )}
          </View>
        ))}

        <Pressable testID="open-gyms-map" onPress={() => router.push("/gyms-map")} style={styles.discover}>
          <Text style={styles.discoverText}>🗺  DISCOVER GYMS NEAR ME</Text>
        </Pressable>
      </ScrollView>
      {toast && <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>}
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.textMid, fontWeight: "800", letterSpacing: 1, marginBottom: spacing.sm },
  eyebrow: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  h1: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 24, marginTop: 2 },
  helper: { color: colors.textDim, fontSize: 12, marginTop: 4, marginBottom: spacing.lg, lineHeight: 17 },
  addRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center" },
  addWrap: { marginBottom: spacing.md },
  dropToggle: { width: 40, height: 46, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  dropToggleText: { color: colors.brandPrimary, fontSize: 16, fontWeight: "900" },
  dropdown: { marginTop: 6, backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  dropItem: { paddingVertical: 12, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  dropItemText: { color: colors.text, fontSize: 14, fontWeight: "600" },
  input: { flex: 1, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
  full: { color: colors.warning, fontSize: 12, fontWeight: "700", marginBottom: spacing.md },
  err: { color: colors.error, fontSize: 12, fontWeight: "700", marginBottom: spacing.sm },
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.xl, fontSize: 13 },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  cardPrimary: { borderColor: colors.brandPrimary, backgroundColor: "rgba(0,85,255,0.10)" },
  streakBanner: { color: colors.warning, fontSize: 13, fontWeight: "900", letterSpacing: 0.5, marginBottom: spacing.md },
  checkinBtn: { marginTop: spacing.md, backgroundColor: colors.success, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
  checkinText: { color: "#001a10", fontWeight: "900", letterSpacing: 1, fontSize: 13 },
  checkedBox: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.success, borderRadius: radius.sm, paddingVertical: 11, alignItems: "center", backgroundColor: "rgba(16,185,129,0.08)" },
  checkedText: { color: colors.success, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  toast: { position: "absolute", alignSelf: "center", bottom: 40, backgroundColor: "rgba(0,0,0,0.92)", paddingHorizontal: spacing.lg, paddingVertical: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, maxWidth: "90%" },
  toastText: { color: colors.text, fontWeight: "700", textAlign: "center" },
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
