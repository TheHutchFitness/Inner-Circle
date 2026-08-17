import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

type SetT = { reps: number; weight_lb: number; rpe: number };
type Exercise = { name: string; sets: SetT[] };

export default function WorkoutScreen() {
  const insets = useSafeAreaInsets();
  const { token, refresh } = useAuth();
  const [programs, setPrograms] = useState<any[]>([]);
  const [active, setActive] = useState<{ program?: any; workoutName: string; splitKey: string; exercises: Exercise[] } | null>(null);
  const [rating, setRating] = useState<number>(0);
  const [critique, setCritique] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try { setPrograms(await apiFetch(token, "/api/programs")); } catch {}
    })();
  }, [token]);

  const startWorkout = (program: any, workout: any) => {
    setActive({
      program,
      workoutName: workout.name,
      splitKey: workout.key,
      exercises: workout.exercises.map((n: string) => ({ name: n, sets: [{ reps: 5, weight_lb: 135, rpe: 7 }] })),
    });
    setRating(0); setCritique(""); setNotice(null);
  };

  const addSet = (ei: number) => {
    if (!active) return;
    const copy = { ...active };
    const last = copy.exercises[ei].sets[copy.exercises[ei].sets.length - 1];
    copy.exercises[ei].sets.push({ reps: last.reps, weight_lb: last.weight_lb, rpe: last.rpe });
    setActive(copy);
  };

  const editSet = (ei: number, si: number, field: keyof SetT, val: number) => {
    if (!active) return;
    const copy = { ...active };
    (copy.exercises[ei].sets[si] as any)[field] = Math.max(0, val);
    setActive(copy);
  };

  const removeSet = (ei: number, si: number) => {
    if (!active) return;
    const copy = { ...active };
    if (copy.exercises[ei].sets.length > 1) copy.exercises[ei].sets.splice(si, 1);
    setActive(copy);
  };

  const finish = async () => {
    if (!active) return;
    setSaving(true);
    try {
      const res = await apiFetch(token, "/api/workouts/log", {
        method: "POST",
        body: JSON.stringify({
          program_id: active.program?.program_id,
          workout_name: active.workoutName,
          split_type: `${active.program?.split}_${active.splitKey}`,
          exercises: active.exercises,
          rating,
          critique,
        }),
      });
      await refresh();
      setNotice(`+${res.xp_gained} XP${res.pr_hit ? " · NEW PR!" : ""}`);
      setActive(null);
    } catch (e: any) {
      setNotice(e.message);
    } finally { setSaving(false); }
  };

  if (active) {
    return (
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 140, paddingHorizontal: spacing.lg }}>
          <Text style={styles.eyebrow}>ACTIVE SESSION</Text>
          <Text style={styles.h1}>{active.workoutName.toUpperCase()}</Text>

          {active.exercises.map((ex, ei) => (
            <View key={ei} style={styles.exCard}>
              <Text style={styles.exName}>{ex.name}</Text>
              <View style={styles.setHeader}>
                <Text style={styles.setHeaderText}>SET</Text>
                <Text style={styles.setHeaderText}>REPS</Text>
                <Text style={styles.setHeaderText}>WEIGHT</Text>
                <Text style={styles.setHeaderText}>RPE</Text>
                <Text style={styles.setHeaderText}></Text>
              </View>
              {ex.sets.map((s, si) => (
                <View key={si} style={styles.setRow}>
                  <Text style={styles.setNum}>{si + 1}</Text>
                  <Stepper testID={`set-${ei}-${si}-reps`} value={s.reps} step={1} onChange={(v) => editSet(ei, si, "reps", v)} />
                  <Stepper testID={`set-${ei}-${si}-weight`} value={s.weight_lb} step={5} onChange={(v) => editSet(ei, si, "weight_lb", v)} />
                  <Stepper testID={`set-${ei}-${si}-rpe`} value={s.rpe} step={0.5} decimal onChange={(v) => editSet(ei, si, "rpe", v)} />
                  <Pressable testID={`remove-set-${ei}-${si}`} onPress={() => removeSet(ei, si)} style={styles.rm}><Text style={styles.rmX}>✕</Text></Pressable>
                </View>
              ))}
              <Pressable testID={`add-set-${ei}`} onPress={() => addSet(ei)} style={styles.addSetBtn}>
                <Text style={styles.addSetText}>+ ADD SET</Text>
              </Pressable>
            </View>
          ))}

          <Text style={styles.h2}>RATE THIS WORKOUT</Text>
          <View style={styles.starRow}>
            {[1,2,3,4,5].map((n) => (
              <Pressable testID={`star-${n}`} key={n} onPress={() => setRating(n)}>
                <Text style={[styles.star, n <= rating && styles.starActive]}>★</Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            testID="critique-input"
            value={critique}
            onChangeText={setCritique}
            placeholder="Critique the program / session..."
            placeholderTextColor={colors.textDim}
            multiline
            style={styles.critique}
          />

          {notice && <Text style={styles.notice}>{notice}</Text>}

          <Pressable testID="finish-workout" onPress={finish} disabled={saving} style={styles.finishBtn}>
            <Text style={styles.finishText}>{saving ? "SAVING..." : "FINISH WORKOUT"}</Text>
          </Pressable>
          <Pressable onPress={() => setActive(null)} style={styles.cancelBtn}>
            <Text style={styles.cancelText}>CANCEL</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
      <Text style={[styles.eyebrow, { paddingHorizontal: spacing.lg }]}>PROTOCOLS</Text>
      <Text style={[styles.h1, { paddingHorizontal: spacing.lg }]}>SELECT YOUR SPLIT</Text>
      {notice && <Text style={[styles.notice, { marginHorizontal: spacing.lg }]}>{notice}</Text>}

      {programs.map((p) => (
        <View key={p.program_id} style={styles.progCard}>
          <View style={styles.progHead}>
            <Text style={styles.progName}>{p.name.toUpperCase()}</Text>
            <Text style={styles.progMeta}>{p.days_per_week}x/WK · {p.min_rank.toUpperCase()}+</Text>
          </View>
          {p.workouts.map((w: any) => (
            <Pressable testID={`start-${p.program_id}-${w.key}`} key={w.key} onPress={() => startWorkout(p, w)} style={styles.workoutRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.wkName}>{w.name}</Text>
                <Text style={styles.wkEx}>{w.exercises.slice(0, 3).join(" · ")}</Text>
              </View>
              <Text style={styles.startArrow}>▶</Text>
            </Pressable>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function Stepper({ value, onChange, step, decimal, testID }: { value: number; onChange: (v: number) => void; step: number; decimal?: boolean; testID?: string }) {
  const disp = decimal ? value.toFixed(1) : String(value);
  return (
    <View style={sstyles.wrap}>
      <Pressable testID={`${testID}-down`} onPress={() => onChange(value - step)} style={sstyles.btn}><Text style={sstyles.txt}>−</Text></Pressable>
      <Text testID={testID} style={sstyles.value}>{disp}</Text>
      <Pressable testID={`${testID}-up`} onPress={() => onChange(value + step)} style={sstyles.btn}><Text style={sstyles.txt}>+</Text></Pressable>
    </View>
  );
}

const sstyles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "center", flex: 1, justifyContent: "center" },
  btn: { width: 22, height: 22, backgroundColor: colors.surface3, borderRadius: 3, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  txt: { color: colors.brandPrimary, fontWeight: "900" },
  value: { color: colors.text, marginHorizontal: 4, fontWeight: "700", minWidth: 30, textAlign: "center", fontVariant: ["tabular-nums"] },
});

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md },
  h2: { color: colors.text, fontWeight: "900", letterSpacing: 3, marginTop: spacing.xl, marginBottom: spacing.sm },
  progCard: { backgroundColor: colors.surface2, marginHorizontal: spacing.lg, marginBottom: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  progHead: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface3 },
  progName: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  progMeta: { color: colors.brandPrimary, marginTop: 4, letterSpacing: 3, fontSize: 10, fontWeight: "700" },
  workoutRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  wkName: { color: colors.text, fontWeight: "700", letterSpacing: 1 },
  wkEx: { color: colors.textDim, marginTop: 2, fontSize: 12 },
  startArrow: { color: colors.brandPrimary, fontSize: 16 },
  exCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  exName: { color: colors.text, fontWeight: "800", letterSpacing: 1, fontSize: 15, marginBottom: spacing.sm },
  setHeader: { flexDirection: "row", paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  setHeaderText: { flex: 1, color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "700", textAlign: "center" },
  setRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.surface3 },
  setNum: { flex: 1, color: colors.brandPrimary, textAlign: "center", fontWeight: "900" },
  rm: { flex: 1, alignItems: "center" },
  rmX: { color: colors.error, fontSize: 16 },
  addSetBtn: { marginTop: spacing.sm, padding: spacing.sm, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, borderStyle: "dashed" },
  addSetText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 11 },
  starRow: { flexDirection: "row", gap: spacing.sm },
  star: { color: colors.surface3, fontSize: 32 },
  starActive: { color: colors.warning },
  critique: { marginTop: spacing.md, backgroundColor: colors.surface2, color: colors.text, minHeight: 80, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, textAlignVertical: "top" },
  notice: { marginTop: spacing.md, color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2, textAlign: "center" },
  finishBtn: { backgroundColor: colors.brandPrimary, marginTop: spacing.lg, padding: spacing.lg, alignItems: "center", borderRadius: radius.sm },
  finishText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  cancelBtn: { padding: spacing.md, alignItems: "center", marginTop: spacing.sm },
  cancelText: { color: colors.textDim, letterSpacing: 2 },
});
