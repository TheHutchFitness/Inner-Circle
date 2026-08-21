import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useUnits } from "@/src/lib/units";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, rankIndex } from "@/src/lib/theme";
import { PRCelebration } from "@/src/components/PRCelebration";
import { RankUpCelebration } from "@/src/components/RankUpCelebration";
import { ExerciseLibraryModal } from "@/src/components/ExerciseLibraryModal";
import { takePendingWorkout } from "@/src/lib/pendingWorkout";
import { SwipeTabs } from "@/src/components/SwipeTabs";
import { NeonButton } from "@/src/components/NeonButton";

type SetT = { reps: number; weight_lb: number; rpe: number; id?: string };
type Exercise = { name: string; sets: SetT[] };
type Active = { templateName: string; splitKey: string; exercises: Exercise[]; source?: string; monthlyDay?: number };

const MONTHLY_SPLITS = [
  { id: "ppl", name: "PUSH/PULL/LEGS", meta: "6 days/wk" },
  { id: "upper_lower", name: "UPPER/LOWER", meta: "4 days/wk" },
  { id: "fullbody", name: "FULL BODY", meta: "3 days/wk" },
  { id: "bro", name: "BRO SPLIT", meta: "5 days/wk" },
];

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const { isSubscribed } = useSubscription();
  const units = useUnits();
  const [templates, setTemplates] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [active, setActive] = useState<Active | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [libOpen, setLibOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [critique, setCritique] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [celebration, setCelebration] = useState<any>(null);
  const [rankUp, setRankUp] = useState<any>(null);
  const [restActive, setRestActive] = useState(false);
  const [restRemaining, setRestRemaining] = useState(0);
  const [restDuration, setRestDuration] = useState(120);
  const [monthly, setMonthly] = useState<any>(null);
  const [coachPlans, setCoachPlans] = useState<any[]>([]);
  const [splitChoice, setSplitChoice] = useState("ppl");
  const [calOpen, setCalOpen] = useState(false);
  const [genBusy, setGenBusy] = useState(false);
  const [presets, setPresets] = useState<any[]>([]);
  const [presetPickerFor, setPresetPickerFor] = useState<number | null>(null);
  const [assignPickerOpen, setAssignPickerOpen] = useState(false);
  const [ipClients, setIpClients] = useState<any[]>([]);
  const [assignMsg, setAssignMsg] = useState<string | null>(null);

  const openAssignPicker = async () => {
    setAssignMsg(null);
    setAssignPickerOpen(true);
    try { setIpClients(await apiFetch(token, "/api/inperson/clients")); } catch {}
  };
  const assignToClient = async (clientId: string) => {
    if (!active) return;
    const exercises = active.exercises
      .filter((e) => e.sets.length > 0)
      .map((e) => ({ name: e.name, sets: e.sets.map((s) => ({ reps: s.reps, weight_lb: s.weight_lb, rpe: s.rpe })) }));
    if (exercises.length === 0) { setAssignMsg("Add at least one set first."); return; }
    try {
      await apiFetch(token, `/api/inperson/thread/${clientId}/assign`, {
        method: "POST",
        body: JSON.stringify({ name: active.templateName, exercises }),
      });
      setAssignPickerOpen(false);
      setNotice("Workout assigned to client ✓");
    } catch (e: any) { setAssignMsg(e.message); }
  };

  const rank = user?.rank || "Beginner";
  const canAC = (rankIndex(rank) >= 2 || user?.all_rooms_access || user?.athletes_center_access)
    && (isSubscribed || user?.skool_verified || user?.all_rooms_access || user?.athletes_center_access || user?.is_founder);

  useEffect(() => {
    if (!restActive) return;
    if (restRemaining <= 0) { setRestActive(false); return; }
    const t = setTimeout(() => setRestRemaining((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [restActive, restRemaining]);
  const startRest = (secs = restDuration) => { setRestDuration(secs); setRestRemaining(secs); setRestActive(true); };

  const loadHistory = async () => { try { setHistory(await apiFetch(token, "/api/workouts/history")); } catch {} };
  const loadMonthly = async () => { try { setMonthly(await apiFetch(token, "/api/programs/monthly/current")); } catch {} };
  const loadCoachPlans = async () => { try { setCoachPlans(await apiFetch(token, "/api/coach/plans")); } catch {} };
  const loadPresets = async () => { try { setPresets(await apiFetch(token, "/api/presets")); } catch {} };

  const savePreset = async (set: SetT) => {
    try {
      await apiFetch(token, "/api/presets", { method: "POST", body: JSON.stringify({ reps: set.reps, weight_lb: set.weight_lb, rpe: set.rpe }) });
      await loadPresets();
      setNotice("Saved to presets ★");
    } catch {}
  };
  const deletePreset = async (id: string) => {
    try { await apiFetch(token, `/api/presets/${id}`, { method: "DELETE" }); await loadPresets(); } catch {}
  };
  const addSetFromPreset = (ei: number, p: any) => {
    if (!active) return;
    const copy = { ...active };
    copy.exercises[ei].sets.push({ reps: p.reps, weight_lb: p.weight_lb, rpe: p.rpe, id: sid() });
    setActive({ ...copy });
    setPresetPickerFor(null);
  };

  useEffect(() => {
    (async () => {
      try { setTemplates(await apiFetch(token, "/api/workout/templates")); } catch {}
      loadHistory();
      loadMonthly();
      loadCoachPlans();
      loadPresets();
    })();
  }, [token]);

  // Ensure every set has a stable id (covers AI/monthly/template/repeat/plan paths)
  // so each SetRow keeps its own independent input state across re-renders.
  useEffect(() => {
    if (!active) return;
    let changed = false;
    const exs = active.exercises.map((ex: any) => ({
      ...ex,
      sets: (ex.sets || []).map((s: any) => {
        if (!s.id) { changed = true; return { ...s, id: sid() }; }
        return s;
      }),
    }));
    if (changed) setActive({ ...active, exercises: exs });
  }, [active]);

  // Accept an AI-built session from the Athlete's Center
  useFocusEffect(useCallback(() => {
    const pending = takePendingWorkout();
    if (pending) {
      setActive({ templateName: pending.name, splitKey: pending.split_key || "custom", exercises: pending.exercises, source: (pending as any).source || "ai" });
      setSummary(null); setRating(0); setCritique(""); setNotice(null);
    } else {
      loadHistory();
      loadMonthly();
      loadCoachPlans();
    }
  }, []));

  const startTemplate = (tpl: any) => {
    setActive({
      templateName: tpl.name === "Custom" ? "Custom Workout" : tpl.name,
      splitKey: tpl.id,
      exercises: (tpl.exercises || []).map((n: string) => ({ name: n, sets: [] as SetT[] })),
    });
    setSummary(null); setRating(0); setCritique(""); setNotice(null);
    if (tpl.id === "custom") setTimeout(() => setLibOpen(true), 300);
  };

  // Re-use a past workout: preload its exercises + sets, all still editable
  const repeatWorkout = (w: any) => {    setActive({
      templateName: w.workout_name || "Workout",
      splitKey: w.split_type || "custom",
      exercises: (w.exercises || []).map((ex: any) => ({
        name: ex.name,
        sets: (ex.sets || []).map((s: any) => ({ reps: s.reps ?? 8, weight_lb: s.weight_lb ?? 0, rpe: s.rpe ?? 7 })),
      })),
    });
    setSummary(null); setRating(0); setCritique(""); setNotice(null);
  };

  // Turn a saved Coach Plan into a tap-to-start logged workout
  const startCoachPlan = (plan: any) => {
    const lines = (plan.text || "").split("\n").map((l: string) => l.trim()).filter(Boolean);
    const exercises: any[] = [];
    for (const raw of lines) {
      const l = raw.replace(/^[-•*\d.)\s]+/, "").trim();
      if (l.length < 3 || /^(day|week|phase|warm|cool|rest|note|superset|circuit)/i.test(l)) continue;
      const m = l.match(/(\d+)\s*[xX]\s*(\d+)/);
      if (!m) continue; // only include real prescribed exercise lines (Name SxR)
      const S = Math.min(8, Math.max(1, parseInt(m[1]))); const R = parseInt(m[2]);
      const name = (l.slice(0, m.index).replace(/[:\-–]\s*$/, "").trim() || l).slice(0, 44);
      const sets: SetT[] = [];
      for (let i = 0; i < S; i++) sets.push({ reps: R, weight_lb: 0, rpe: 7 });
      exercises.push({ name, sets });
    }
    if (exercises.length === 0) exercises.push({ name: plan.title, sets: [] as SetT[] });
    setActive({ templateName: plan.title, splitKey: "coach", exercises });
    setSummary(null); setRating(0); setCritique(""); setNotice(null);
  };

  const addExercises = (names: string[]) => {
    if (!active) return;
    const existing = new Set(active.exercises.map((e) => e.name));
    const toAdd = names.filter((n) => !existing.has(n)).map((n) => ({ name: n, sets: [] as SetT[] }));
    setActive({ ...active, exercises: [...active.exercises, ...toAdd] });
  };

  const removeExercise = (ei: number) => {
    if (!active) return;
    const copy = { ...active, exercises: active.exercises.filter((_, i) => i !== ei) };
    setActive(copy);
  };

  const addSet = (ei: number) => {
    if (!active) return;
    const copy = { ...active };
    const sets = copy.exercises[ei].sets;
    const last = sets[sets.length - 1];
    sets.push(last ? { ...last, id: sid() } : { reps: 8, weight_lb: units.toLb(units.unit === "kg" ? 40 : 95), rpe: 7, id: sid() });
    setActive({ ...copy });
  };

  const editSet = (ei: number, si: number, field: keyof SetT, val: number) => {
    if (!active) return;
    const copy = { ...active };
    (copy.exercises[ei].sets[si] as any)[field] = Math.max(0, val);
    setActive({ ...copy });
  };
  const editWeight = (ei: number, si: number, displayVal: number) => {
    if (!active) return;
    const copy = { ...active };
    copy.exercises[ei].sets[si].weight_lb = Math.max(0, Math.round(units.toLb(displayVal) * 10) / 10);
    setActive({ ...copy });
  };
  const removeSet = (ei: number, si: number) => {
    if (!active) return;
    const copy = { ...active };
    copy.exercises[ei].sets.splice(si, 1);
    setActive({ ...copy });
  };

  // Monthly program actions
  const generateMonthly = async () => {
    setGenBusy(true); setNotice(null);
    try {
      await apiFetch(token, "/api/programs/monthly/generate", { method: "POST", body: JSON.stringify({ split: splitChoice }) });
      await loadMonthly();
    } catch (e: any) { setNotice(e.message); }
    setGenBusy(false);
  };

  const endMonthly = async () => {
    try {
      await apiFetch(token, "/api/programs/monthly/current", { method: "DELETE" });
      setCalOpen(false);
      await loadMonthly();
    } catch {}
  };

  const startMonthlyToday = () => {
    const t = monthly?.today;
    if (!t || t.template_id === "rest") return;
    setActive({
      templateName: t.name,
      splitKey: t.template_id,
      exercises: (t.exercises || []).map((n: string) => ({ name: n, sets: [] as SetT[] })),
      source: "monthly",
      monthlyDay: t.day,
    });
    setSummary(null); setRating(0); setCritique(""); setNotice(null);
  };

  const finish = async () => {
    if (!active) return;
    const logged = active.exercises.filter((e) => e.sets.length > 0);
    if (logged.length === 0) { setNotice("Add at least one set before finishing."); return; }
    setSaving(true);
    try {
      const res = await apiFetch(token, "/api/workouts/log", {
        method: "POST",
        body: JSON.stringify({
          workout_name: active.templateName,
          split_type: active.splitKey,
          exercises: logged,
          rating, critique,
          source: active.source || null,
          monthly_day: active.monthlyDay || null,
        }),
      });
      await refresh();
      await loadHistory();
      await loadMonthly();
      setSummary({
        name: active.templateName,
        exercises: logged,
        xp: res.xp_gained,
        pr_hit: res.pr_hit,
      });
      if (res.pr_hit && res.pr_details?.length) setCelebration({ prs: res.pr_details, user: res.user });
      if (res.ranked_up) setRankUp({ from: res.prev_rank, to: res.user.rank, background: res.unlocked_background });
      setActive(null);
    } catch (e: any) { setNotice(e.message); }
    finally { setSaving(false); }
  };

  // ---------- SESSION SUMMARY (post-finish) ----------
  if (summary) {
    return (
      <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingTop: insets.top + spacing.lg, paddingHorizontal: spacing.lg, paddingBottom: 120 }}>
        <Text style={styles.eyebrow}>SESSION COMPLETE</Text>
        <Text style={styles.h1}>{summary.name.toUpperCase()}</Text>
        <View style={styles.summaryXp}><Text style={styles.summaryXpText}>+{summary.xp} XP{summary.pr_hit ? "  ·  NEW PR!" : ""}</Text></View>
        <Text style={styles.summaryHint}>Tap any exercise to see its full stats, logs & graphs.</Text>
        {summary.exercises.map((ex: Exercise, i: number) => (
          <Pressable testID={`summary-ex-${i}`} key={i} onPress={() => router.push(`/exercise-stats?name=${encodeURIComponent(ex.name)}`)} style={styles.summaryRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryExName}>{ex.name}</Text>
              <Text style={styles.summaryExSub}>{ex.sets.length} set{ex.sets.length === 1 ? "" : "s"} · {units.fmt(Math.max(...ex.sets.map((s) => s.weight_lb)), 0)} top</Text>
            </View>
            <Text style={styles.summaryArrow}>📊</Text>
          </Pressable>
        ))}
        <Pressable testID="summary-done" onPress={() => setSummary(null)} style={styles.finishBtn}><Text style={styles.finishText}>DONE</Text></Pressable>
        <PRCelebration visible={!!celebration} prs={celebration?.prs || []} user={celebration?.user} onClose={() => setCelebration(null)} />
        <RankUpCelebration visible={!!rankUp && !celebration} fromRank={rankUp?.from} toRank={rankUp?.to} background={rankUp?.background} onClose={() => setRankUp(null)} />
      </ScrollView>
    );
  }

  // ---------- ACTIVE SESSION ----------
  if (active) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 160, paddingHorizontal: spacing.lg }}>
          <View style={styles.sessionHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.eyebrow}>ACTIVE SESSION</Text>
              <Text style={styles.h1}>{active.templateName.toUpperCase()}</Text>
            </View>
            <Pressable testID="unit-toggle" onPress={units.toggle} style={styles.unitBtn}><Text style={styles.unitText}>{units.unit.toUpperCase()}</Text></Pressable>
            <Pressable testID="start-rest" onPress={() => startRest()} style={styles.restBtn}><Text style={styles.restBtnText}>⏱ REST</Text></Pressable>
          </View>

          {active.exercises.map((ex, ei) => (
            <View key={ei} style={styles.exCard}>
              <View style={styles.exHead}>
                <Pressable testID={`ex-stats-${ei}`} onPress={() => router.push(`/exercise-stats?name=${encodeURIComponent(ex.name)}`)} style={{ flex: 1 }}>
                  <Text style={styles.exName}>{ex.name}</Text>
                  <Text style={styles.exStatsLink}>📊 VIEW STATS</Text>
                </Pressable>
                <Pressable testID={`remove-ex-${ei}`} onPress={() => removeExercise(ei)} style={styles.exRemove}><Text style={styles.rmX}>✕</Text></Pressable>
              </View>
              {ex.sets.length > 0 && (
                <View style={styles.setHeader}>
                  <Text style={[styles.setHeaderText, { width: 40, flex: 0 }]}>SET</Text>
                  <Text style={[styles.setHeaderText, { flex: 1 }]}>REPS</Text>
                  <Text style={[styles.setHeaderText, { flex: 1 }]}>{units.unit.toUpperCase()}</Text>
                  <View style={{ width: 56 }} />
                </View>
              )}
              {ex.sets.map((s, si) => (
                <SetRow
                  key={`${s.id || si}-${units.unit}`}
                  index={si}
                  set={s}
                  unit={units.unit}
                  toDisplay={units.toDisplay}
                  onReps={(v) => editSet(ei, si, "reps", v)}
                  onWeight={(v) => editWeight(ei, si, v)}
                  onSave={() => savePreset(s)}
                  onRemove={() => removeSet(ei, si)}
                  repsTestID={`set-${ei}-${si}-reps`}
                  weightTestID={`set-${ei}-${si}-weight`}
                  saveTestID={`save-preset-${ei}-${si}`}
                  removeTestID={`remove-set-${ei}-${si}`}
                />
              ))}
              <View style={styles.addRow}>
                <Pressable testID={`add-set-${ei}`} onPress={() => addSet(ei)} style={[styles.addSetBtn, { flex: 1, marginTop: 0 }]}>
                  <Text style={styles.addSetText}>{ex.sets.length === 0 ? "+ ADD FIRST SET" : "+ ADD SET"}</Text>
                </Pressable>
                <Pressable testID={`presets-${ei}`} onPress={() => setPresetPickerFor(ei)} style={styles.presetBtn}>
                  <Text style={styles.presetBtnText}>★</Text>
                </Pressable>
              </View>
            </View>
          ))}

          <Pressable testID="add-exercise" onPress={() => setLibOpen(true)} style={styles.addExBtn}>
            <Text style={styles.addExText}>+ ADD EXERCISE</Text>
          </Pressable>

          <Text style={styles.h2}>RATE THIS WORKOUT</Text>
          <View style={styles.starRow}>
            {[1,2,3,4,5].map((n) => (
              <Pressable testID={`star-${n}`} key={n} onPress={() => setRating(n)}><Text style={[styles.star, n <= rating && styles.starActive]}>★</Text></Pressable>
            ))}
          </View>
          <TextInput testID="critique-input" value={critique} onChangeText={setCritique} placeholder="Notes on this session..." placeholderTextColor={colors.textDim} multiline style={styles.critique} />

          {notice && <Text style={styles.notice}>{notice}</Text>}

          <NeonButton testID="finish-workout" onPress={finish} loading={saving} label="FINISH WORKOUT" style={{ marginTop: spacing.md }} />
          {user?.is_admin && (
            <Pressable testID="assign-to-client" onPress={openAssignPicker} style={styles.assignBtn}><Text style={styles.assignBtnText}>🏋 ASSIGN TO IN-PERSON CLIENT</Text></Pressable>
          )}
          <Pressable onPress={() => setActive(null)} style={styles.cancelBtn}><Text style={styles.cancelText}>CANCEL</Text></Pressable>
        </ScrollView>

        <Modal visible={assignPickerOpen} transparent animationType="slide" onRequestClose={() => setAssignPickerOpen(false)}>
          <View style={styles.apBg}>
            <View style={styles.apCard}>
              <Text style={styles.apTitle}>ASSIGN “{active.templateName?.toUpperCase()}”</Text>
              <Text style={styles.apHint}>Pick a client — this workout loads straight into their logger.</Text>
              {assignMsg && <Text style={styles.notice}>{assignMsg}</Text>}
              <ScrollView style={{ maxHeight: 320 }}>
                {ipClients.length === 0 ? (
                  <Text style={styles.apEmpty}>No in-person clients yet. Enroll one in the Admin Panel.</Text>
                ) : ipClients.map((c) => (
                  <Pressable key={c.user_id} testID={`assign-client-${c.user_id}`} onPress={() => assignToClient(c.user_id)} style={styles.apRow}>
                    <Text style={styles.apName}>{c.display_name}</Text>
                    <Text style={styles.apGym}>{c.inperson_gym ? `🏋 ${c.inperson_gym}` : ""}  ›</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Pressable onPress={() => setAssignPickerOpen(false)} style={styles.apCancel}><Text style={styles.cancelText}>CLOSE</Text></Pressable>
            </View>
          </View>
        </Modal>

        {restActive && (
          <View style={styles.restBar}>
            <View style={styles.restLeft}>
              <Text style={styles.restLabel}>REST</Text>
              <Text style={styles.restTime}>{Math.floor(restRemaining / 60)}:{String(restRemaining % 60).padStart(2, "0")}</Text>
            </View>
            <View style={styles.restProgTrack}><View style={[styles.restProgFill, { width: `${(restRemaining / restDuration) * 100}%` }]} /></View>
            <Pressable testID="rest-minus" onPress={() => setRestRemaining((s) => Math.max(0, s - 15))} style={styles.restCtrl}><Text style={styles.restCtrlText}>-15</Text></Pressable>
            <Pressable testID="rest-plus" onPress={() => setRestRemaining((s) => s + 15)} style={styles.restCtrl}><Text style={styles.restCtrlText}>+15</Text></Pressable>
            <Pressable testID="rest-skip" onPress={() => setRestActive(false)} style={styles.restSkip}><Text style={styles.restSkipText}>SKIP</Text></Pressable>
          </View>
        )}

        <ExerciseLibraryModal visible={libOpen} onClose={() => setLibOpen(false)} onAdd={addExercises} token={token} />

        <Modal visible={presetPickerFor !== null} transparent animationType="slide" onRequestClose={() => setPresetPickerFor(null)}>
          <Pressable style={styles.presetModalWrap} onPress={() => setPresetPickerFor(null)}>
            <Pressable style={styles.presetModal} onPress={() => {}}>
              <Text style={styles.presetModalTitle}>★ SET PRESETS</Text>
              <Text style={styles.presetModalSub}>Tap a preset to add it as a set. Save any set with the ☆ on its row.</Text>
              {presets.length === 0 ? (
                <Text style={styles.presetEmpty}>No presets yet. Tap the ☆ on a set to save your favourite rep/weight combos.</Text>
              ) : (
                <ScrollView style={{ maxHeight: 340 }}>
                  {presets.map((p) => (
                    <View key={p.preset_id} style={styles.presetRow}>
                      <Pressable testID={`use-preset-${p.preset_id}`} style={{ flex: 1 }} onPress={() => presetPickerFor !== null && addSetFromPreset(presetPickerFor, p)}>
                        <Text style={styles.presetLabel}>{p.label}</Text>
                        <Text style={styles.presetMeta}>{units.fmt(p.weight_lb, 0)} · {p.reps} reps · RPE {p.rpe}</Text>
                      </Pressable>
                      <Pressable testID={`del-preset-${p.preset_id}`} onPress={() => deletePreset(p.preset_id)} hitSlop={8}><Text style={styles.rmX}>✕</Text></Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}
              <Pressable onPress={() => setPresetPickerFor(null)} style={styles.presetClose}><Text style={styles.presetCloseText}>CLOSE</Text></Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    );
  }

  // ---------- TRAIN LANDING ----------
  return (
    <SwipeTabs current="workout">
    <>
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
      <Text style={[styles.eyebrow, { paddingHorizontal: spacing.lg }]}>PROTOCOLS</Text>
      <Text style={[styles.h1, { paddingHorizontal: spacing.lg }]}>SELECT YOUR SPLIT</Text>
      {notice && <Text style={[styles.notice, { marginHorizontal: spacing.lg }]}>{notice}</Text>}

      <View style={styles.tplGrid}>
        {canAC ? (
          <Pressable testID="ac-square" onPress={() => router.push("/athletes-center")} style={[styles.tplCard, styles.acCard]}>
            <Text style={[styles.tplName, { color: colors.brandPrimary }]}>ATHLETE&apos;S CENTER</Text>
            <Text style={styles.tplFocus}>AI Coach · Custom protocols</Text>
            <Text style={[styles.tplMeta, { color: colors.brandPrimary }]}>⚡ ENTER</Text>
          </Pressable>
        ) : (
          <View testID="ac-square-locked" style={[styles.tplCard, styles.acLocked]}>
            <Text style={[styles.tplName, { color: colors.textDim }]}>RESTRICTED ACCESS</Text>
            <Text style={styles.tplFocus}>Athlete&apos;s Center · Advanced+ & Premium/Skool</Text>
            <Text style={styles.tplMeta}>🔒 LOCKED</Text>
          </View>
        )}
        {templates.map((t) => (
          <Pressable testID={`template-${t.id}`} key={t.id} onPress={() => startTemplate(t)} style={[styles.tplCard, t.id === "custom" && styles.tplCustom]}>
            <Text style={[styles.tplName, t.id === "custom" && { color: colors.brandPrimary }]}>{t.name.toUpperCase()}</Text>
            <Text style={styles.tplFocus}>{t.focus}</Text>
            <Text style={styles.tplMeta}>{t.id === "custom" ? "BLANK" : `${t.exercises.length} EXERCISES`}</Text>
          </Pressable>
        ))}
      </View>

      {coachPlans.length > 0 && (
        <>
          <Text style={[styles.h2, { paddingHorizontal: spacing.lg }]}>COACH PLANS</Text>
          {coachPlans.map((p) => (
            <View key={p.plan_id} testID={`coach-plan-${p.plan_id}`} style={styles.coachPlanCard}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={styles.coachPlanTitle}>{p.title}</Text>
                <Pressable testID={`coach-plan-del-${p.plan_id}`} onPress={async () => { await apiFetch(token, `/api/coach/plans/${p.plan_id}`, { method: "DELETE" }); loadCoachPlans(); }} hitSlop={10}>
                  <Text style={styles.coachPlanDel}>✕</Text>
                </Pressable>
              </View>
              <Text style={styles.coachPlanText}>{p.text}</Text>
              <Pressable testID={`coach-plan-start-${p.plan_id}`} onPress={() => startCoachPlan(p)} style={styles.coachPlanStart}>
                <Text style={styles.coachPlanStartText}>✎ EDIT & START</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}

      <Text style={[styles.h2, { paddingHorizontal: spacing.lg }]}>MONTHLY PROTOCOL</Text>
      {!monthly?.active ? (
        <View style={styles.monthlyCard}>
          <Text style={styles.monthlySub}>Pick a split — the app builds a 28-day schedule and queues your workout every day.</Text>
          <View style={styles.splitRow}>
            {MONTHLY_SPLITS.map((s) => (
              <Pressable testID={`msplit-${s.id}`} key={s.id} onPress={() => setSplitChoice(s.id)} style={[styles.splitChip, splitChoice === s.id && styles.splitChipActive]}>
                <Text style={[styles.splitChipText, splitChoice === s.id && { color: colors.brandPrimary }]}>{s.name}</Text>
                <Text style={styles.splitChipMeta}>{s.meta}</Text>
              </Pressable>
            ))}
          </View>
          <Pressable testID="generate-monthly" onPress={generateMonthly} disabled={genBusy} style={styles.genBtn}>
            <Text style={styles.genBtnText}>{genBusy ? "BUILDING..." : "GENERATE MONTH PLAN"}</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.monthlyCard}>
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.monthlyTitle}>{monthly.split_name?.toUpperCase()} · DAY {(monthly.today_index ?? 0) + 1}/28</Text>
              <Text style={styles.monthlySub}>
                {monthly.finished
                  ? "Program complete. Generate a fresh month below."
                  : monthly.today?.template_id === "rest"
                    ? "Rest day — recover, hydrate, eat."
                    : `Today: ${monthly.today?.name} · ${(monthly.today?.exercises || []).length} exercises`}
              </Text>
              <Text style={styles.monthlyProgress}>{(monthly.completed_days || []).length} sessions completed</Text>
            </View>
            {!monthly.finished && monthly.today?.template_id !== "rest" && (
              <Pressable testID="start-monthly" onPress={startMonthlyToday} style={styles.startBtn}>
                <Text style={styles.startBtnText}>START</Text>
              </Pressable>
            )}
          </View>
          <Pressable testID="toggle-calendar" onPress={() => setCalOpen(!calOpen)}>
            <Text style={styles.calToggle}>{calOpen ? "▾ HIDE SCHEDULE" : "▸ VIEW 28-DAY SCHEDULE"}</Text>
          </Pressable>
          {calOpen && (
            <View style={styles.calGrid}>
              {(monthly.days || []).map((d: any) => {
                const done = (monthly.completed_days || []).includes(d.day);
                const isToday = d.day === (monthly.today_index ?? 0) + 1 && !monthly.finished;
                return (
                  <View key={d.day} style={[styles.calCell, isToday && styles.calToday, done && styles.calDone]}>
                    <Text style={styles.calDay}>{d.day}</Text>
                    <Text style={[styles.calName, done && { color: colors.success }]} numberOfLines={1}>
                      {d.template_id === "rest" ? "—" : done ? "✓" : d.name.slice(0, 5).toUpperCase()}
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
          {monthly.finished ? (
            <Pressable testID="generate-monthly" onPress={generateMonthly} disabled={genBusy} style={styles.genBtn}>
              <Text style={styles.genBtnText}>{genBusy ? "BUILDING..." : "GENERATE NEW MONTH"}</Text>
            </Pressable>
          ) : (
            <Pressable testID="end-monthly" onPress={endMonthly}>
              <Text style={styles.endProgram}>END PROGRAM</Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={[styles.h2, { paddingHorizontal: spacing.lg }]}>HISTORY</Text>
      {history.length === 0 ? (
        <Text style={styles.emptyHist}>No sessions yet. Pick a split above to start training.</Text>
      ) : (
        history.map((w) => {
          const open = expanded === w.workout_id;
          const d = w.logged_at ? new Date(w.logged_at) : null;
          return (
            <View key={w.workout_id} style={styles.histCard}>
              <Pressable testID={`hist-${w.workout_id}`} onPress={() => setExpanded(open ? null : w.workout_id)} style={styles.histHead}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={styles.histName}>{(w.workout_name || "Workout").toUpperCase()}</Text>
                    {w.source === "ai" && <View style={styles.srcChip}><Text style={styles.srcChipText}>AI</Text></View>}
                    {w.source === "monthly" && <View style={[styles.srcChip, { borderColor: colors.warning }]}><Text style={[styles.srcChipText, { color: colors.warning }]}>PLAN</Text></View>}
                  </View>
                  <Text style={styles.histMeta}>{d ? d.toLocaleDateString() : ""} · {(w.exercises || []).length} exercises · +{w.xp_gained || 0} XP</Text>
                </View>
                <Pressable testID={`repeat-${w.workout_id}`} onPress={() => repeatWorkout(w)} style={styles.repeatBtn} hitSlop={6}>
                  <Text style={styles.repeatText}>↻ REPEAT</Text>
                </Pressable>
                <Text style={styles.histChevron}>{open ? "▾" : "▸"}</Text>
              </Pressable>
              {open && (w.exercises || []).map((ex: any, i: number) => (
                <Pressable testID={`hist-ex-${w.workout_id}-${i}`} key={i} onPress={() => router.push(`/exercise-stats?name=${encodeURIComponent(ex.name)}`)} style={styles.histExRow}>
                  <Text style={styles.histExName}>{ex.name}</Text>
                  <Text style={styles.histExSub}>{(ex.sets || []).length} sets  📊</Text>
                </Pressable>
              ))}
            </View>
          );
        })
      )}
    </ScrollView>
    <PRCelebration visible={!!celebration} prs={celebration?.prs || []} user={celebration?.user} onClose={() => setCelebration(null)} />
    <RankUpCelebration visible={!!rankUp && !celebration} fromRank={rankUp?.from} toRank={rankUp?.to} background={rankUp?.background} onClose={() => setRankUp(null)} />
    </>
    </SwipeTabs>
  );
}

const sstyles = StyleSheet.create({
  setRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.surface3, gap: spacing.sm },
  setNumWrap: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  setNumText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 16, fontVariant: ["tabular-nums"] },
  cell: { flex: 1 },
  cellInput: {
    color: colors.text, fontWeight: "800", fontSize: 17, textAlign: "center",
    height: 44, paddingVertical: 0, paddingHorizontal: 4,
    backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border,
    fontVariant: ["tabular-nums"],
  },
  actions: { width: 56, flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 12 },
  saveStar: { color: colors.warning, fontSize: 18 },
  rmX: { color: colors.error, fontSize: 16 },
});

function fmtNum(value: number, decimal?: boolean) {
  if (decimal) return (Math.round(value * 10) / 10).toString();
  return String(Math.round(value || 0));
}

let SET_SEQ = 0;
function sid() { return `s${Date.now().toString(36)}_${SET_SEQ++}`; }

// Self-contained set row: SET number (auto-ascending) + independent REPS & WEIGHT
// text boxes. Each input keeps its OWN local text state so typing never jumps or
// clears; changes are reported up on every keystroke. Keyed by set id + unit upstream.
function SetRow({
  index, set, unit, toDisplay, onReps, onWeight, onSave, onRemove,
  repsTestID, weightTestID, saveTestID, removeTestID,
}: {
  index: number;
  set: SetT;
  unit: string;
  toDisplay: (lb: number) => number;
  onReps: (v: number) => void;
  onWeight: (displayVal: number) => void;
  onSave: () => void;
  onRemove: () => void;
  repsTestID: string; weightTestID: string; saveTestID: string; removeTestID: string;
}) {
  const [reps, setReps] = useState(fmtNum(set.reps));
  const [wt, setWt] = useState(fmtNum(Math.round(toDisplay(set.weight_lb) * 10) / 10, unit === "kg"));

  const onRepsText = (t: string) => {
    const c = t.replace(/[^0-9]/g, "").slice(0, 4);
    setReps(c);
    onReps(c === "" ? 0 : parseInt(c, 10) || 0);
  };
  const onWtText = (t: string) => {
    let c = t.replace(/[^0-9.]/g, "").slice(0, 6);
    const firstDot = c.indexOf(".");
    if (firstDot !== -1) c = c.slice(0, firstDot + 1) + c.slice(firstDot + 1).replace(/\./g, "");
    setWt(c);
    onWeight(c === "" || c === "." ? 0 : parseFloat(c) || 0);
  };

  return (
    <View style={sstyles.setRow}>
      <View style={sstyles.setNumWrap}><Text style={sstyles.setNumText}>{index + 1}</Text></View>
      <View style={sstyles.cell}>
        <TextInput
          testID={repsTestID}
          value={reps}
          onChangeText={onRepsText}
          onBlur={() => setReps(fmtNum(set.reps))}
          keyboardType="number-pad"
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor={colors.textDim}
          style={sstyles.cellInput}
        />
      </View>
      <View style={sstyles.cell}>
        <TextInput
          testID={weightTestID}
          value={wt}
          onChangeText={onWtText}
          onBlur={() => setWt(fmtNum(Math.round(toDisplay(set.weight_lb) * 10) / 10, unit === "kg"))}
          keyboardType="decimal-pad"
          selectTextOnFocus
          placeholder="0"
          placeholderTextColor={colors.textDim}
          style={sstyles.cellInput}
        />
      </View>
      <View style={sstyles.actions}>
        <Pressable testID={saveTestID} onPress={onSave} hitSlop={8}><Text style={sstyles.saveStar}>☆</Text></Pressable>
        <Pressable testID={removeTestID} onPress={onRemove} hitSlop={8}><Text style={sstyles.rmX}>✕</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md },
  h2: { color: colors.text, fontWeight: "900", letterSpacing: 3, marginTop: spacing.xl, marginBottom: spacing.sm },
  sessionHead: { flexDirection: "row", alignItems: "center" },
  unitBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.sm, minWidth: 52, alignItems: "center" },
  unitText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2 },
  restBtn: { marginLeft: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.sm, alignItems: "center", backgroundColor: "rgba(0,180,220,0.10)" },
  restBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  tplGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
  tplCard: { width: "48%", backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 96, justifyContent: "space-between" },
  tplCustom: { borderColor: colors.brandPrimary, borderStyle: "dashed" },
  tplName: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 15 },
  tplFocus: { color: colors.textDim, fontSize: 11, marginTop: 4, lineHeight: 15 },
  tplMeta: { color: colors.brandPrimary, fontSize: 9, letterSpacing: 2, fontWeight: "800", marginTop: spacing.sm },
  emptyHist: { color: colors.textDim, paddingHorizontal: spacing.lg, marginTop: spacing.sm },
  histCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  histHead: { flexDirection: "row", alignItems: "center", padding: spacing.md },
  histName: { color: colors.text, fontWeight: "800", letterSpacing: 1, fontSize: 13 },
  histMeta: { color: colors.textDim, fontSize: 11, marginTop: 3 },
  histChevron: { color: colors.brandPrimary, fontSize: 16, paddingHorizontal: spacing.sm },
  repeatBtn: { borderWidth: 1, borderColor: colors.brandPrimary, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, marginLeft: 8 },
  repeatText: { color: colors.brandPrimary, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  acCard: { borderColor: colors.brandPrimary, borderWidth: 1, backgroundColor: "rgba(34,211,238,0.06)" },
  acLocked: { borderColor: colors.border, opacity: 0.65 },
  srcChip: { borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  srcChipText: { color: colors.brandPrimary, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  monthlyCard: { marginHorizontal: spacing.lg, marginBottom: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md },
  coachPlanCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, padding: spacing.md },
  coachPlanTitle: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1, flex: 1 },
  coachPlanDel: { color: colors.textDim, fontSize: 16, fontWeight: "900", paddingLeft: spacing.md },
  coachPlanText: { color: colors.textMid, marginTop: spacing.sm, lineHeight: 20 },
  coachPlanStart: { marginTop: spacing.md, backgroundColor: colors.brandPrimary, paddingVertical: 12, alignItems: "center", borderRadius: radius.sm },
  coachPlanStartText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  monthlyTitle: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  monthlySub: { color: colors.textDim, marginTop: 4, lineHeight: 18, fontSize: 12 },
  monthlyProgress: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 1, fontWeight: "800", marginTop: 4 },
  splitRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: spacing.md },
  splitChip: { width: "48%", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: spacing.sm, backgroundColor: colors.surface3 },
  splitChipActive: { borderColor: colors.brandPrimary, backgroundColor: "rgba(34,211,238,0.08)" },
  splitChipText: { color: colors.textMid, fontWeight: "900", letterSpacing: 1, fontSize: 11 },
  splitChipMeta: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  genBtn: { marginTop: spacing.md, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, minHeight: 44, justifyContent: "center" },
  genBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  startBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderRadius: radius.sm, minHeight: 44, justifyContent: "center" },
  startBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  calToggle: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginTop: spacing.md },
  calGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: spacing.sm },
  calCell: { width: "13%", aspectRatio: 0.9, borderWidth: 1, borderColor: colors.border, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  calToday: { borderColor: colors.brandPrimary, backgroundColor: "rgba(34,211,238,0.1)" },
  calDone: { borderColor: colors.success },
  calDay: { color: colors.textDim, fontSize: 9, fontWeight: "700" },
  calName: { color: colors.textMid, fontSize: 8, fontWeight: "800" },
  endProgram: { color: colors.error, fontSize: 11, letterSpacing: 2, fontWeight: "800", marginTop: spacing.md, textAlign: "center" },
  histExRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, paddingHorizontal: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  histExName: { color: colors.textMid, fontWeight: "600" },
  histExSub: { color: colors.brandPrimary, fontSize: 11, fontWeight: "700" },
  exCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  exHead: { flexDirection: "row", alignItems: "flex-start", marginBottom: spacing.sm },
  exName: { color: colors.text, fontWeight: "800", letterSpacing: 1, fontSize: 15 },
  exStatsLink: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 3 },
  exRemove: { padding: 4 },
  setHeader: { flexDirection: "row", alignItems: "center", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm },
  setHeaderText: { flex: 1, color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "700", textAlign: "center" },
  setRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.surface3 },
  setNum: { flex: 1, color: colors.brandPrimary, textAlign: "center", fontWeight: "900" },
  rm: { flex: 1, alignItems: "center" },
  rmX: { color: colors.error, fontSize: 16 },
  addSetBtn: { marginTop: spacing.sm, padding: spacing.sm, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, borderStyle: "dashed" },
  addSetText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 11 },
  addRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, alignItems: "stretch" },
  presetBtn: { width: 48, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, borderStyle: "dashed" },
  presetBtnText: { color: colors.warning, fontSize: 18, fontWeight: "900" },
  rowActions: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 12 },
  saveStar: { color: colors.warning, fontSize: 17 },
  presetModalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  presetModal: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.warning, padding: spacing.lg, paddingBottom: spacing.xxl },
  presetModalTitle: { color: colors.warning, fontWeight: "900", letterSpacing: 2, fontSize: 15 },
  presetModalSub: { color: colors.textDim, fontSize: 11, marginTop: 4, marginBottom: spacing.md, lineHeight: 15 },
  presetEmpty: { color: colors.textDim, fontSize: 12, lineHeight: 18, paddingVertical: spacing.lg, textAlign: "center" },
  presetRow: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  presetLabel: { color: colors.text, fontWeight: "800", fontSize: 14 },
  presetMeta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  presetClose: { marginTop: spacing.md, padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  presetCloseText: { color: colors.textMid, fontWeight: "800", letterSpacing: 2 },
  addExBtn: { padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, marginBottom: spacing.sm },
  addExText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2 },
  starRow: { flexDirection: "row", gap: spacing.sm },
  star: { color: colors.surface3, fontSize: 32 },
  starActive: { color: colors.warning },
  critique: { marginTop: spacing.md, backgroundColor: colors.surface2, color: colors.text, minHeight: 80, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, textAlignVertical: "top" },
  notice: { marginTop: spacing.md, color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2, textAlign: "center" },
  finishBtn: { backgroundColor: colors.brandPrimary, marginTop: spacing.lg, padding: spacing.lg, alignItems: "center", borderRadius: radius.sm },
  finishText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  cancelBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  assignBtn: { marginTop: spacing.sm, padding: spacing.md, alignItems: "center", borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.08)" },
  assignBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 13 },
  apBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  apCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.brandPrimary },
  apTitle: { color: colors.text, fontSize: 15, fontWeight: "900", letterSpacing: 1 },
  apHint: { color: colors.textDim, fontSize: 12, marginTop: 4, marginBottom: spacing.sm },
  apEmpty: { color: colors.textDim, fontSize: 13, paddingVertical: spacing.md, textAlign: "center" },
  apRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  apName: { color: colors.text, fontWeight: "800", fontSize: 15 },
  apGym: { color: colors.textMid, fontSize: 12 },
  apCancel: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  cancelText: { color: colors.textDim, letterSpacing: 2 },
  summaryXp: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, marginBottom: spacing.md },
  summaryXpText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2 },
  summaryHint: { color: colors.textDim, marginBottom: spacing.md, fontSize: 12 },
  summaryRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  summaryExName: { color: colors.text, fontWeight: "800", fontSize: 14 },
  summaryExSub: { color: colors.textDim, fontSize: 11, marginTop: 3 },
  summaryArrow: { fontSize: 18 },
  restBar: { position: "absolute", left: spacing.md, right: spacing.md, bottom: 80, flexDirection: "row", alignItems: "center", gap: spacing.sm, backgroundColor: "rgba(10,12,18,0.96)", borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  restLeft: { alignItems: "flex-start" },
  restLabel: { color: colors.brandPrimary, fontSize: 9, letterSpacing: 2, fontWeight: "800" },
  restTime: { color: colors.text, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  restProgTrack: { flex: 1, height: 4, backgroundColor: colors.surface3, borderRadius: 2, overflow: "hidden" },
  restProgFill: { height: "100%", backgroundColor: colors.brandPrimary },
  restCtrl: { paddingHorizontal: 8, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  restCtrlText: { color: colors.textMid, fontWeight: "800", fontSize: 11 },
  restSkip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.sm, backgroundColor: colors.brandPrimary },
  restSkipText: { color: "#001122", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
});
