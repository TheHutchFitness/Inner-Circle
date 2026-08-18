import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator, Modal, Switch } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Animated, { useSharedValue, useAnimatedStyle, withSequence, withTiming } from "react-native-reanimated";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { spacing, radius, applyEnhancedPalette } from "@/src/lib/theme";
import { persistEnhancedFlag, reloadApp } from "@/src/lib/enhancedTheme";

const RED = "#FF2A3C";
const BG = "#0B0406";
const CARD = "#170A0C";

export default function Enhanced() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const { isSubscribed } = useSubscription();
  const hasSub = isSubscribed || user?.all_rooms_access;
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dob, setDob] = useState("");
  const [is20, setIs20] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [peds, setPeds] = useState<any[]>([]);
  const [regimen, setRegimen] = useState<any>({ active: null, history: [] });
  const [items, setItems] = useState<any[]>([{ name: "", dosage: "", schedule: "" }]);
  const [pickerFor, setPickerFor] = useState<number | null>(null);

  const glitch = useSharedValue(0);
  const glitchStyle = useAnimatedStyle(() => ({ opacity: glitch.value }));

  const loadRoom = async () => {
    try {
      const [p, r] = await Promise.all([apiFetch(token, "/api/enhanced/peds"), apiFetch(token, "/api/enhanced/regimen")]);
      setPeds(p.peds || []); setRegimen(r);
    } catch {}
  };

  useEffect(() => {
    if (!token) return;
    apiFetch(token, "/api/enhanced/status").then((s) => { setStatus(s); if (user?.enhanced) loadRoom(); }).catch(() => {}).finally(() => setLoading(false));
  }, [token]);

  const verifyAge = async () => {
    setMsg(null);
    if (!is20) { setMsg("Please confirm you are 20 or older."); return; }
    try {
      await apiFetch(token, "/api/enhanced/verify-age", { method: "POST", body: JSON.stringify({ dob }) });
      setStatus((s: any) => ({ ...s, age_verified: true }));
      setConsentOpen(true);
    } catch (e: any) { setMsg(e?.message || "You must be 20 or older."); }
  };

  const accept = async () => {
    try {
      await apiFetch(token, "/api/enhanced/consent", { method: "POST", body: JSON.stringify({ accept: true }) });
      setConsentOpen(false);
      // dramatic red glitch flashes while we cross over
      glitch.value = withSequence(
        withTiming(0.95, { duration: 80 }), withTiming(0.1, { duration: 90 }),
        withTiming(0.85, { duration: 80 }), withTiming(0.15, { duration: 110 }),
        withTiming(0.7, { duration: 90 }), withTiming(0.35, { duration: 130 }),
        withTiming(1, { duration: 400 }),
      );
      // apply red palette + persist so the whole app boots red after reload
      applyEnhancedPalette();
      await persistEnhancedFlag(true);
      await refresh();
      await loadRoom();
      setStatus((s: any) => ({ ...s, enhanced: true }));
      // reload the bundle so every screen re-renders with the crimson palette
      setTimeout(() => reloadApp(), 1300);
    } catch (e: any) { setMsg(e?.message || "Something went wrong"); }
  };

  const deny = async () => { setConsentOpen(false); router.replace("/"); };

  const saveRegimen = async () => {
    setMsg(null);
    const clean = items.filter((i) => i.name && i.dosage && i.schedule);
    if (!clean.length) { setMsg("Add a compound, dose and schedule."); return; }
    try {
      await apiFetch(token, "/api/enhanced/regimen", { method: "POST", body: JSON.stringify({ items: clean }) });
      setItems([{ name: "", dosage: "", schedule: "" }]);
      await loadRoom();
      setMsg("Regimen saved ✓");
    } catch (e: any) { setMsg(e?.message || "Couldn't save"); }
  };

  const enhanced = user?.enhanced || status?.enhanced;

  if (loading) return <View style={[s.wrap, { justifyContent: "center" }]}><ActivityIndicator color={RED} /></View>;

  // Subscriber gate (monthly or annual paid members only)
  if (!hasSub) {
    return (
      <View style={s.wrap}>
        <View style={{ paddingTop: insets.top + spacing.lg, padding: spacing.lg }}>
          <Pressable onPress={() => router.back()}><Text style={s.back}>← BACK</Text></Pressable>
          <Text style={s.warnBig}>☣ THE ENHANCED</Text>
          <View style={s.disc}><Text style={s.discText}>The Enhanced is for paid members only. Subscribe monthly or annually to unlock this room and the protocol tracker.</Text></View>
          <Pressable testID="enhanced-subscribe" onPress={() => router.push("/paywall")} style={s.primary}><Text style={s.primaryText}>VIEW MEMBERSHIP</Text></Pressable>
        </View>
      </View>
    );
  }

  // Gate 1+2: not enhanced yet -> age verify + consent
  if (!enhanced) {
    return (
      <View style={s.wrap}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, padding: spacing.lg }}>
          <Pressable onPress={() => router.back()}><Text style={s.back}>← BACK</Text></Pressable>
          <Text style={s.warnBig}>☣ THE ENHANCED</Text>
          <Text style={s.warn}>{status?.disclaimer}</Text>
          <Text style={s.h2}>AGE VERIFICATION</Text>
          <Text style={s.label}>Date of birth (YYYY-MM-DD)</Text>
          <TextInput value={dob} onChangeText={setDob} placeholder="1998-04-21" placeholderTextColor="#7a4a50" style={s.input} autoCapitalize="none" />
          <Pressable style={s.checkRow} onPress={() => setIs20((v) => !v)}>
            <View style={[s.check, is20 && { backgroundColor: RED }]}>{is20 ? <Text style={s.checkMark}>✓</Text> : null}</View>
            <Text style={s.checkLabel}>I confirm I am 20 years of age or older.</Text>
          </Pressable>
          {!!msg && <Text style={s.msg}>{msg}</Text>}
          <Pressable testID="verify-age" onPress={verifyAge} style={s.primary}><Text style={s.primaryText}>CONTINUE</Text></Pressable>
        </ScrollView>

        <Modal visible={consentOpen} transparent animationType="fade">
          <View style={s.modalWrap}>
            <View style={s.modal}>
              <Text style={s.modalTitle}>⚠ PERMANENT BRAND</Text>
              <Text style={s.modalBody}>
                Entering The Enhanced applies a <Text style={{ color: RED, fontWeight: "900" }}>permanent “ENHANCED” banner</Text> to your profile and turns your app red. This cannot be undone.
              </Text>
              <Text style={s.modalBody}>{status?.disclaimer}</Text>
              <Pressable testID="consent-accept" onPress={accept} style={s.primary}><Text style={s.primaryText}>I ACCEPT — ENTER</Text></Pressable>
              <Pressable testID="consent-deny" onPress={deny} style={s.ghost}><Text style={s.ghostText}>NO THANKS</Text></Pressable>
            </View>
          </View>
        </Modal>
      </View>
    );
  }

  // The room
  return (
    <View style={s.wrap}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.lg, padding: spacing.lg, paddingBottom: 80 }}>
        <Pressable onPress={() => router.back()}><Text style={s.back}>← BACK</Text></Pressable>
        <Text style={s.warnBig}>☣ THE ENHANCED</Text>
        <View style={s.disc}><Text style={s.discText}>{status?.disclaimer}</Text></View>

        <Text style={s.h2}>YOUR ACTIVE REGIMEN</Text>
        {regimen.active ? (
          <View style={s.activeCard}>
            {regimen.active.items.map((it: any, i: number) => (
              <View key={i} style={s.regRow}>
                <Text style={s.regName}>{it.name}</Text>
                <Text style={s.regMeta}>{it.dosage} · {it.schedule}</Text>
              </View>
            ))}
          </View>
        ) : <Text style={s.dim}>No active regimen yet.</Text>}

        <Text style={s.h2}>NEW REGIMEN</Text>
        {items.map((it, idx) => (
          <View key={idx} style={s.builder}>
            <Pressable testID={`ped-pick-${idx}`} onPress={() => setPickerFor(idx)} style={s.select}>
              <Text style={it.name ? s.selectText : s.selectPlaceholder}>{it.name || "Pick compound ▾"}</Text>
            </Pressable>
            <View style={s.row2}>
              <TextInput value={it.dosage} onChangeText={(t) => setItems((a) => a.map((x, i) => i === idx ? { ...x, dosage: t } : x))} placeholder="Dosage (e.g. 250mg)" placeholderTextColor="#7a4a50" style={[s.input, { flex: 1 }]} />
              <TextInput value={it.schedule} onChangeText={(t) => setItems((a) => a.map((x, i) => i === idx ? { ...x, schedule: t } : x))} placeholder="When (e.g. Mon/Thu)" placeholderTextColor="#7a4a50" style={[s.input, { flex: 1 }]} />
            </View>
          </View>
        ))}
        <Pressable onPress={() => setItems((a) => [...a, { name: "", dosage: "", schedule: "" }])}><Text style={s.addMore}>+ ADD ANOTHER COMPOUND</Text></Pressable>
        {!!msg && <Text style={s.msg}>{msg}</Text>}
        <Pressable testID="save-regimen" onPress={saveRegimen} style={s.primary}><Text style={s.primaryText}>SAVE REGIMEN</Text></Pressable>

        {regimen.history?.length > 0 && (
          <>
            <Text style={s.h2}>HISTORY</Text>
            {regimen.history.map((h: any, i: number) => (
              <View key={i} style={s.histCard}>
                <Text style={s.dim}>{h.created_at ? new Date(h.created_at).toLocaleDateString() : ""}</Text>
                {h.items.map((it: any, j: number) => <Text key={j} style={s.histItem}>• {it.name} — {it.dosage} · {it.schedule}</Text>)}
              </View>
            ))}
          </>
        )}

        <Text style={s.h2}>COMPOUND LIBRARY</Text>
        {peds.map((p, i) => (
          <View key={i} style={s.pedCard}>
            <Text style={s.pedName}>{p.name} <Text style={s.pedClass}>· {p.class}</Text></Text>
            <Text style={s.pedDesc}>{p.desc}</Text>
          </View>
        ))}
      </ScrollView>

      <Modal visible={pickerFor !== null} transparent animationType="slide" onRequestClose={() => setPickerFor(null)}>
        <Pressable style={s.modalWrap} onPress={() => setPickerFor(null)}>
          <View style={[s.modal, { maxHeight: "75%" }]}>
            <Text style={s.modalTitle}>PICK A COMPOUND</Text>
            <ScrollView>
              {peds.map((p, i) => (
                <Pressable key={i} testID={`ped-opt-${i}`} style={s.opt} onPress={() => { setItems((a) => a.map((x, idx) => idx === pickerFor ? { ...x, name: p.name } : x)); setPickerFor(null); }}>
                  <Text style={s.optName}>{p.name}</Text>
                  <Text style={s.optClass}>{p.class}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable onPress={() => setPickerFor(null)} style={s.ghost}><Text style={s.ghostText}>CLOSE</Text></Pressable>
          </View>
        </Pressable>
      </Modal>

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: RED }, glitchStyle]} />
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: BG },
  back: { color: RED, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  warnBig: { color: RED, fontSize: 26, fontWeight: "900", letterSpacing: 2 },
  warn: { color: "#E8A0A8", fontSize: 12, lineHeight: 18, marginTop: spacing.sm, marginBottom: spacing.lg },
  disc: { borderWidth: 1, borderColor: RED, borderRadius: radius.sm, padding: spacing.md, marginVertical: spacing.md, backgroundColor: "rgba(255,42,60,0.08)" },
  discText: { color: "#E8A0A8", fontSize: 11, lineHeight: 16 },
  h2: { color: "#fff", fontWeight: "900", letterSpacing: 3, fontSize: 13, marginTop: spacing.xl, marginBottom: spacing.sm },
  label: { color: "#E8A0A8", fontSize: 11, letterSpacing: 1, marginBottom: 4 },
  input: { backgroundColor: CARD, borderWidth: 1, borderColor: "#3a1a1e", borderRadius: radius.sm, color: "#fff", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44 },
  row2: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.md },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: RED, alignItems: "center", justifyContent: "center" },
  checkMark: { color: "#fff", fontWeight: "900" },
  checkLabel: { color: "#fff", flex: 1, fontSize: 13 },
  primary: { backgroundColor: RED, borderRadius: radius.sm, paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.lg, minHeight: 48, justifyContent: "center" },
  primaryText: { color: "#fff", fontWeight: "900", letterSpacing: 2 },
  ghost: { borderWidth: 1, borderColor: "#5a2a2e", borderRadius: radius.sm, paddingVertical: spacing.md, alignItems: "center", marginTop: spacing.sm },
  ghostText: { color: "#E8A0A8", fontWeight: "800", letterSpacing: 2 },
  msg: { color: RED, marginTop: spacing.md, textAlign: "center" },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "center", padding: spacing.lg },
  modal: { backgroundColor: CARD, borderRadius: radius.md, borderWidth: 1, borderColor: RED, padding: spacing.xl },
  modalTitle: { color: RED, fontWeight: "900", fontSize: 18, letterSpacing: 2, marginBottom: spacing.md },
  modalBody: { color: "#fff", lineHeight: 20, marginBottom: spacing.md, fontSize: 13 },
  dim: { color: "#8a5a60", fontSize: 12 },
  activeCard: { backgroundColor: CARD, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: RED, padding: spacing.md },
  regRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  regName: { color: "#fff", fontWeight: "800" },
  regMeta: { color: "#E8A0A8", fontSize: 12 },
  builder: { marginBottom: spacing.md },
  select: { backgroundColor: CARD, borderWidth: 1, borderColor: "#3a1a1e", borderRadius: radius.sm, padding: spacing.md, minHeight: 44, justifyContent: "center" },
  selectText: { color: "#fff", fontWeight: "700" },
  selectPlaceholder: { color: "#7a4a50" },
  addMore: { color: RED, fontWeight: "800", letterSpacing: 1, marginTop: 4 },
  histCard: { backgroundColor: CARD, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  histItem: { color: "#E8A0A8", fontSize: 12, marginTop: 2 },
  pedCard: { backgroundColor: CARD, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.sm },
  pedName: { color: "#fff", fontWeight: "900", letterSpacing: 1 },
  pedClass: { color: RED, fontWeight: "700", fontSize: 12 },
  pedDesc: { color: "#c99", fontSize: 12, lineHeight: 17, marginTop: 4 },
  opt: { paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: "#2a1418" },
  optName: { color: "#fff", fontWeight: "800" },
  optClass: { color: RED, fontSize: 11, marginTop: 2 },
});
