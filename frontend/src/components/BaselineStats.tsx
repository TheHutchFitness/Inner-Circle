import { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform, Keyboard, InputAccessoryView, TouchableOpacity, Animated } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useUnits } from "@/src/lib/units";
import { colors, spacing, radius } from "@/src/lib/theme";

const KG = 2.2046226218;
const ACCESSORY_ID = "baseline-kb-accessory";

// seconds -> "mm:ss" for pre-filling run fields.
function secondsToMMSS(secs: number): string {
  if (!secs || secs <= 0) return "";
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// Parse "mm:ss" or "m:ss" or plain seconds -> total seconds. Empty -> 0.
function parseTime(v: string): number {
  const s = (v || "").trim();
  if (!s) return 0;
  if (s.includes(":")) {
    const parts = s.split(":").map((p) => parseFloat(p) || 0);
    if (parts.length === 2) return Math.round(parts[0] * 60 + parts[1]);
    if (parts.length === 3) return Math.round(parts[0] * 3600 + parts[1] * 60 + parts[2]);
  }
  return Math.round(parseFloat(s) || 0);
}

// Defined at module scope (NOT inside BaselineStats) so their component identity
// stays stable across re-renders — otherwise the TextInput remounts on every
// keystroke and the keyboard closes after each character (iOS).
type FieldProps = {
  label: string;
  value: string;
  onChange: (t: string) => void;
  unitLabel: string;
  inputRef?: (r: TextInput | null) => void;
  onFocus?: () => void;
  onSubmitEditing?: () => void;
  isLast?: boolean;
  numeric?: boolean;
  placeholder?: string;
  testID?: string;
};

function Field({ label, value, onChange, unitLabel, inputRef, onFocus, onSubmitEditing, isLast, numeric = true, placeholder = "0", testID }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          ref={inputRef}
          testID={testID}
          value={value}
          onChangeText={onChange}
          onFocus={onFocus}
          keyboardType={numeric ? "numeric" : "numbers-and-punctuation"}
          placeholder={placeholder}
          placeholderTextColor={colors.textDim}
          style={styles.input}
          returnKeyType={isLast ? "done" : "next"}
          blurOnSubmit={isLast}
          onSubmitEditing={onSubmitEditing}
          inputAccessoryViewID={Platform.OS === "ios" ? ACCESSORY_ID : undefined}
        />
        <Text style={styles.unit}>{unitLabel}</Text>
      </View>
    </View>
  );
}

// First-signup capture of starting lifts + run bests. Skippable.
// Writes baseline_set:true so it only appears once.
export function BaselineStats({ manual = false, onSkip }: { manual?: boolean; onSkip?: () => void }) {
  const insets = useSafeAreaInsets();
  const { token, user, refresh } = useAuth();
  const { unit, setUnit } = useUnits();
  const router = useRouter();
  const [busy, setBusy] = useState<"save" | "skip" | null>(null);
  const [reward, setReward] = useState<number | null>(null);
  const [recap, setRecap] = useState<any>(null);
  const [dist, setDist] = useState<{ totals: number[]; count: number } | null>(null);

  const [bench, setBench] = useState("");
  const [squat, setSquat] = useState("");
  const [deadlift, setDeadlift] = useState("");
  const [ohp, setOhp] = useState("");
  const [t5k, setT5k] = useState("");
  const [t10k, setT10k] = useState("");
  const [t100m, setT100m] = useState("");

  // Ordered refs so a "Next" jumps Bench → Squat → Deadlift → OHP → runs.
  const refs = useRef<Array<TextInput | null>>([]);
  const focusIdx = (i: number) => {
    const n = refs.current[i];
    if (n) n.focus();
    else Keyboard.dismiss();
  };
  const focusedRef = useRef(0);

  // Pre-fill from the member's saved bests so a retest only tweaks what changed.
  useEffect(() => {
    if (!manual || !user) return;
    const dispLift = (lb: number) => {
      if (!lb || lb <= 0) return "";
      return String(Math.round(unit === "kg" ? lb / KG : lb));
    };
    const prs = user.prs || {};
    setBench(dispLift(prs.bench));
    setSquat(dispLift(prs.squat));
    setDeadlift(dispLift(prs.deadlift));
    setOhp(dispLift(prs.ohp));
    const runs = user.baseline_runs || {};
    setT5k(secondsToMMSS(runs.t_5k));
    setT10k(secondsToMMSS(runs.t_10k));
    const s100 = user.sprints?.["100m"];
    setT100m(s100 && s100 > 0 ? String(s100) : "");
    // Only re-run when entering the screen / user loads. Unit handled separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manual, user?.user_id]);

  // Load the member Big-4 distribution once so we can show a LIVE projected
  // percentile as the athlete types (no request per keystroke).
  useEffect(() => {
    let alive = true;
    apiFetch(token, "/api/onboarding/big4-distribution")
      .then((d) => { if (alive && d?.totals) setDist(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, [token]);

  // Live projected percentile from what's currently typed (converted to lb).
  const toLbNum = (s: string) => {
    const v = parseFloat(s) || 0;
    return unit === "kg" ? v * KG : v;
  };
  const previewTotalLb = Math.round(toLbNum(bench) + toLbNum(squat) + toLbNum(deadlift) + toLbNum(ohp));
  let preview: { pct: number; pos: number; n: number } | null = null;
  if (dist && dist.count > 0 && previewTotalLb > 0) {
    const n = dist.count;
    const below = dist.totals.filter((t) => t <= previewTotalLb).length;
    const above = dist.totals.filter((t) => t > previewTotalLb).length;
    preview = { pct: Math.round((below / n) * 100), pos: above + 1, n };
  }

  // Animate the percentage counting up/down when it changes, with a small pop
  // when it improves — so climbing feels rewarding.
  const targetPct = preview ? preview.pct : null;
  const [displayPct, setDisplayPct] = useState(0);
  const displayRef = useRef(0);
  const popAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (targetPct == null) return;
    const start = displayRef.current;
    const end = targetPct;
    if (start === end) return;
    if (end > start) {
      popAnim.setValue(1);
      Animated.sequence([
        Animated.spring(popAnim, { toValue: 1.18, useNativeDriver: true, speed: 20, bounciness: 14 }),
        Animated.spring(popAnim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 10 }),
      ]).start();
    }
    const dur = 600;
    const t0 = Date.now();
    let raf = 0;
    const tick = () => {
      const p = Math.min(1, (Date.now() - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = Math.round(start + (end - start) * eased);
      displayRef.current = val;
      setDisplayPct(val);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetPct, popAnim]);

  // Toggle lb⇄kg right here and convert whatever lifts are already typed.
  const changeUnit = (next: "lb" | "kg") => {
    if (next === unit) return;
    const conv = (s: string) => {
      const v = parseFloat(s);
      if (!s || isNaN(v)) return s;
      const lb = unit === "kg" ? v * KG : v;
      const disp = next === "kg" ? lb / KG : lb;
      return String(Math.round(disp));
    };
    setBench(conv(bench));
    setSquat(conv(squat));
    setDeadlift(conv(deadlift));
    setOhp(conv(ohp));
    setUnit(next);
  };

  const submit = async (skip: boolean) => {
    setBusy(skip ? "skip" : "save");
    const toLb = (s: string) => {
      const v = parseFloat(s) || 0;
      return unit === "kg" ? Math.round(v * KG) : Math.round(v);
    };
    try {
      const res = await apiFetch(token, "/api/onboarding/baseline", {
        method: "POST",
        body: JSON.stringify(
          skip
            ? { skip: true }
            : {
                bench: toLb(bench),
                squat: toLb(squat),
                deadlift: toLb(deadlift),
                ohp: toLb(ohp),
                t_5k: parseTime(t5k),
                t_10k: parseTime(t10k),
                t_100m: parseFloat(t100m) || 0,
              }
        ),
      });
      if (!skip && (res?.reward_xp > 0 || res?.recap)) {
        setReward(res.reward_xp || 0);
        setRecap(res.recap || null);
        setTimeout(async () => { await refresh(); if (manual) router.back(); }, 2400);
        return;
      }
      await refresh();
      if (manual) router.back();
      else if (skip) onSkip?.();
    } catch {
      setBusy(null);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.root, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {manual && (
          <Pressable testID="baseline-back" onPress={() => router.back()} style={{ marginBottom: spacing.sm }}>
            <Text style={{ color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2 }}>← BACK</Text>
          </Pressable>
        )}
        <Text style={styles.eyebrow}>⌁ {manual ? "RETEST YOUR MAXES" : "CALIBRATE YOUR VESSEL"}</Text>
        <Text style={styles.title}>{manual ? "UPDATE YOUR\nSTATS" : "YOUR STARTING\nSTATS"}</Text>
        <Text style={styles.sub}>{manual ? "Log your latest bests to update your player stats and watch your percentile climb. Leave any field blank to keep it." : "Log your current bests so your player stats, rank and combat power start from where you really are. Every athlete begins different. You can skip any field."}</Text>

        <LinearGradient colors={[colors.brandTertiary, colors.surface2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.cardHeaderRow}>
            <Text style={styles.cardTag}>◆ THE BIG FOUR</Text>
            <View style={styles.unitToggle}>
              {(["lb", "kg"] as const).map((u) => (
                <TouchableOpacity
                  key={u}
                  testID={`unit-${u}`}
                  onPress={() => changeUnit(u)}
                  style={[styles.unitBtn, unit === u && styles.unitBtnActive]}
                  activeOpacity={0.8}
                >
                  <Text style={[styles.unitBtnText, unit === u && styles.unitBtnTextActive]}>{u.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <Field label="Bench Press" value={bench} onChange={setBench} unitLabel={unit} testID="bl-bench"
            inputRef={(r) => (refs.current[0] = r)} onFocus={() => (focusedRef.current = 0)} onSubmitEditing={() => focusIdx(1)} />
          <Field label="Squat" value={squat} onChange={setSquat} unitLabel={unit} testID="bl-squat"
            inputRef={(r) => (refs.current[1] = r)} onFocus={() => (focusedRef.current = 1)} onSubmitEditing={() => focusIdx(2)} />
          <Field label="Deadlift" value={deadlift} onChange={setDeadlift} unitLabel={unit} testID="bl-deadlift"
            inputRef={(r) => (refs.current[2] = r)} onFocus={() => (focusedRef.current = 2)} onSubmitEditing={() => focusIdx(3)} />
          <Field label="Overhead Press" value={ohp} onChange={setOhp} unitLabel={unit} testID="bl-ohp"
            inputRef={(r) => (refs.current[3] = r)} onFocus={() => (focusedRef.current = 3)} onSubmitEditing={() => focusIdx(4)} />
        </LinearGradient>

        {preview && (
          <View testID="percentile-preview" style={styles.preview}>
            <Text style={styles.previewGlyph}>📈</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.previewBig}>
                Stronger than <Animated.Text style={{ transform: [{ scale: popAnim }] }}>{displayPct}%</Animated.Text> of The Circle
              </Text>
              <Text style={styles.previewSub}>projected #{preview.pos} of {preview.n} · {previewTotalLb} lb Big-4 total</Text>
            </View>
          </View>
        )}

        <View style={[styles.card, styles.cardAlt]}>
          <Text style={[styles.cardTag, { color: colors.success }]}>▸ SPEED &amp; ENGINE</Text>
          <Field label="Fastest 5K" value={t5k} onChange={setT5k} unitLabel="mm:ss" numeric={false} placeholder="mm:ss" testID="bl-5k"
            inputRef={(r) => (refs.current[4] = r)} onFocus={() => (focusedRef.current = 4)} onSubmitEditing={() => focusIdx(5)} />
          <Field label="Fastest 10K" value={t10k} onChange={setT10k} unitLabel="mm:ss" numeric={false} placeholder="mm:ss" testID="bl-10k"
            inputRef={(r) => (refs.current[5] = r)} onFocus={() => (focusedRef.current = 5)} onSubmitEditing={() => focusIdx(6)} />
          <Field label="Fastest 100m" value={t100m} onChange={setT100m} unitLabel="sec" placeholder="0.0" isLast testID="bl-100m"
            inputRef={(r) => (refs.current[6] = r)} onFocus={() => (focusedRef.current = 6)} onSubmitEditing={() => Keyboard.dismiss()} />
        </View>

        <Pressable testID="baseline-save" disabled={!!busy} onPress={() => submit(false)} style={[styles.primary, !!busy && { opacity: 0.6 }]}>
          {busy === "save" ? <ActivityIndicator color="#001122" /> : <Text style={styles.primaryText}>LOCK IN MY STATS</Text>}
        </Pressable>
        <Pressable testID="baseline-skip" disabled={!!busy} onPress={() => submit(true)} style={styles.skip}>
          {busy === "skip" ? <ActivityIndicator color={colors.textDim} /> : <Text style={styles.skipText}>SKIP FOR NOW</Text>}
        </Pressable>
      </ScrollView>

      {Platform.OS === "ios" && (
        <InputAccessoryView nativeID={ACCESSORY_ID}>
          <View style={styles.accessory}>
            <TouchableOpacity testID="kb-next" onPress={() => focusIdx(Math.min(focusedRef.current + 1, 6))} style={styles.accessoryBtn}>
              <Text style={styles.accessoryNext}>Next ↓</Text>
            </TouchableOpacity>
            <TouchableOpacity testID="kb-done" onPress={() => Keyboard.dismiss()} style={styles.accessoryBtn}>
              <Text style={styles.accessoryDone}>Done</Text>
            </TouchableOpacity>
          </View>
        </InputAccessoryView>
      )}

      {reward !== null && (
        <View style={styles.rewardOverlay} pointerEvents="none">
          <View style={styles.rewardCard}>
            <Text style={styles.rewardGlyph}>⚡</Text>
            <Text style={styles.rewardTitle}>CALIBRATED</Text>
            {reward > 0 && <Text style={styles.rewardXp}>+{reward} XP</Text>}
            {recap ? (
              <>
                <Text style={styles.recapBig}>Stronger than {recap.percentile}%</Text>
                <Text style={styles.recapSub}>of The Circle · you enter at #{recap.position} of {recap.total_members}</Text>
                {recap.trend && !recap.trend.first && (
                  <Text style={[styles.recapTrend, { color: recap.trend.percentile_delta > 0 ? colors.success : recap.trend.percentile_delta < 0 ? colors.error : colors.textDim }]}>
                    {recap.trend.percentile_delta > 0 ? `↑ +${recap.trend.percentile_delta}%` : recap.trend.percentile_delta < 0 ? `↓ ${recap.trend.percentile_delta}%` : "→ no change"} since last test{recap.trend.big4_delta ? ` · ${recap.trend.big4_delta > 0 ? "+" : ""}${recap.trend.big4_delta} lb total` : ""}
                  </Text>
                )}
              </>
            ) : (
              <Text style={styles.rewardSub}>Your vessel is charted. Now go earn the rest.</Text>
            )}
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.surface, zIndex: 900, elevation: 900 },
  scroll: { padding: spacing.lg, paddingBottom: spacing.xl * 2 },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "800", marginTop: spacing.md },
  title: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm, lineHeight: 34 },
  sub: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, marginBottom: spacing.lg },
  card: { borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, padding: spacing.lg, marginBottom: spacing.lg },
  cardAlt: { backgroundColor: colors.surface2, borderColor: colors.borderStrong },
  cardTag: { color: colors.brandPrimary, fontSize: 12, fontWeight: "900", letterSpacing: 2, marginBottom: spacing.sm },
  cardHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  unitToggle: { flexDirection: "row", backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  unitBtn: { paddingHorizontal: spacing.md, paddingVertical: 6, minWidth: 44, alignItems: "center" },
  unitBtnActive: { backgroundColor: colors.brandPrimary },
  unitBtnText: { color: colors.textDim, fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  unitBtnTextActive: { color: "#001122" },
  accessory: { flexDirection: "row", justifyContent: "flex-end", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface2, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 8 },
  accessoryBtn: { paddingHorizontal: spacing.md, paddingVertical: 6 },
  accessoryNext: { color: colors.brandPrimary, fontSize: 15, fontWeight: "800", letterSpacing: 1 },
  accessoryDone: { color: colors.text, fontSize: 15, fontWeight: "800", letterSpacing: 1 },
  preview: { flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.success, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, marginBottom: spacing.lg, marginTop: -spacing.sm },
  previewGlyph: { fontSize: 22 },
  previewBig: { color: colors.success, fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
  previewSub: { color: colors.textMid, fontSize: 12, fontWeight: "600", marginTop: 2 },
  field: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 6 },
  fieldLabel: { color: colors.text, fontSize: 14, fontWeight: "700", flex: 1 },
  inputWrap: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.sm, minWidth: 120 },
  input: { flex: 1, color: colors.text, fontSize: 16, fontWeight: "800", paddingVertical: 10, textAlign: "right", minHeight: 44 },
  unit: { color: colors.textDim, fontSize: 12, fontWeight: "700", marginLeft: 6, width: 34 },
  primary: { marginTop: spacing.sm, paddingVertical: 15, alignItems: "center", borderRadius: radius.sm, backgroundColor: colors.brandPrimary },
  primaryText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  skip: { marginTop: spacing.md, alignItems: "center", padding: spacing.md },
  skipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  rewardOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,4,8,0.92)", alignItems: "center", justifyContent: "center", zIndex: 950 },
  rewardCard: { alignItems: "center", padding: spacing.xl, borderRadius: radius.lg, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: colors.surface2, minWidth: 240 },
  rewardGlyph: { fontSize: 52 },
  rewardTitle: { color: colors.brandPrimary, fontSize: 15, fontWeight: "900", letterSpacing: 4, marginTop: spacing.sm },
  rewardXp: { color: colors.text, fontSize: 40, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  rewardSub: { color: colors.textDim, fontSize: 12, textAlign: "center", marginTop: spacing.sm, lineHeight: 17 },
  recapBig: { color: colors.success, fontSize: 20, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm, textAlign: "center" },
  recapSub: { color: colors.textMid, fontSize: 12, textAlign: "center", marginTop: 4, lineHeight: 17 },
  recapTrend: { fontSize: 12, fontWeight: "900", letterSpacing: 0.5, textAlign: "center", marginTop: spacing.sm },
});
