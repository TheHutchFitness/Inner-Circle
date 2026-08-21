import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Vibration, Platform } from "react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

function fmt(ms: number) {
  const total = Math.floor(ms / 10); // centiseconds
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
function buzz() { if (Platform.OS !== "web") Vibration.vibrate(200); }

function Stopwatch() {
  const [ms, setMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [laps, setLaps] = useState<number[]>([]);
  const startRef = useRef(0);
  const raf = useRef<any>(null);

  useEffect(() => {
    if (running) {
      startRef.current = Date.now() - ms;
      raf.current = setInterval(() => setMs(Date.now() - startRef.current), 31);
    } else if (raf.current) {
      clearInterval(raf.current);
    }
    return () => { if (raf.current) clearInterval(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  return (
    <View style={styles.block}>
      <Text style={styles.blockTitle}>STOPWATCH</Text>
      <Text testID="sw-time" style={styles.bigTime}>{fmt(ms)}</Text>
      <View style={styles.btnRow}>
        <Pressable testID="sw-toggle" onPress={() => setRunning((r) => !r)} style={[styles.ctrl, running ? styles.ctrlWarn : styles.ctrlGo]}>
          <Text style={[styles.ctrlText, running ? styles.ctrlWarnText : styles.ctrlGoText]}>{running ? "PAUSE" : ms > 0 ? "RESUME" : "START"}</Text>
        </Pressable>
        <Pressable testID="sw-lap" disabled={!running} onPress={() => setLaps((l) => [ms, ...l])} style={[styles.ctrl, styles.ctrlDim, !running && { opacity: 0.4 }]}>
          <Text style={styles.ctrlDimText}>LAP</Text>
        </Pressable>
        <Pressable testID="sw-reset" onPress={() => { setRunning(false); setMs(0); setLaps([]); }} style={[styles.ctrl, styles.ctrlDim]}>
          <Text style={styles.ctrlDimText}>RESET</Text>
        </Pressable>
      </View>
      {laps.map((l, i) => (
        <View key={i} style={styles.lapRow}>
          <Text style={styles.lapLbl}>LAP {laps.length - i}</Text>
          <Text style={styles.lapVal}>{fmt(l)}</Text>
        </View>
      ))}
    </View>
  );
}

const PHASES = { prep: "GET READY", work: "WORK", rest: "REST", done: "COMPLETE" } as const;

function IntervalTimer() {
  const [work, setWork] = useState(30);
  const [rest, setRest] = useState(15);
  const [rounds, setRounds] = useState(8);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<keyof typeof PHASES>("prep");
  const [left, setLeft] = useState(0);
  const [round, setRound] = useState(1);
  const tick = useRef<any>(null);

  const stop = () => { setRunning(false); if (tick.current) clearInterval(tick.current); };
  const reset = () => { stop(); setPhase("prep"); setLeft(0); setRound(1); };
  const start = () => { setPhase("prep"); setLeft(3); setRound(1); setRunning(true); };

  useEffect(() => {
    if (!running) { if (tick.current) clearInterval(tick.current); return; }
    tick.current = setInterval(() => {
      setLeft((prev) => {
        if (prev > 1) return prev - 1;
        // phase transition
        setPhase((ph) => {
          if (ph === "prep") { buzz(); setLeft(work); return "work"; }
          if (ph === "work") {
            buzz();
            let done = false;
            setRound((r) => { if (r >= rounds) { done = true; return r; } return r; });
            if (done) { setLeft(0); stop(); return "done"; }
            setLeft(rest); return "rest";
          }
          if (ph === "rest") { buzz(); setRound((r) => r + 1); setLeft(work); return "work"; }
          return ph;
        });
        return prev; // left is set inside setPhase
      });
    }, 1000);
    return () => { if (tick.current) clearInterval(tick.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const phaseColor = phase === "work" ? colors.brandPrimary : phase === "rest" ? "#38BDF8" : phase === "done" ? colors.success : colors.warning;

  const Stepper = ({ label, value, set, step, min, unit }: any) => (
    <View style={styles.stepper}>
      <Text style={styles.stepLbl}>{label}</Text>
      <View style={styles.stepRow}>
        <Pressable disabled={running} onPress={() => set(Math.max(min, value - step))} style={styles.stepBtn}><Text style={styles.stepBtnT}>−</Text></Pressable>
        <Text style={styles.stepVal}>{value}{unit}</Text>
        <Pressable disabled={running} onPress={() => set(value + step)} style={styles.stepBtn}><Text style={styles.stepBtnT}>+</Text></Pressable>
      </View>
    </View>
  );

  return (
    <View style={[styles.block, { marginTop: spacing.lg }]}>
      <Text style={styles.blockTitle}>INTERVAL / HIIT</Text>
      {running || phase === "done" ? (
        <>
          <Text style={[styles.phaseLbl, { color: phaseColor }]}>{PHASES[phase]}</Text>
          <Text testID="hiit-time" style={[styles.bigTime, { color: phaseColor }]}>{String(left).padStart(2, "0")}</Text>
          <Text style={styles.roundLbl}>ROUND {Math.min(round, rounds)} / {rounds}</Text>
        </>
      ) : (
        <View style={styles.stepperRow}>
          <Stepper label="WORK" value={work} set={setWork} step={5} min={5} unit="s" />
          <Stepper label="REST" value={rest} set={setRest} step={5} min={0} unit="s" />
          <Stepper label="ROUNDS" value={rounds} set={setRounds} step={1} min={1} unit="" />
        </View>
      )}
      <View style={styles.btnRow}>
        {!running ? (
          <Pressable testID="hiit-start" onPress={start} style={[styles.ctrl, styles.ctrlGo]}><Text style={styles.ctrlGoText}>{phase === "done" ? "AGAIN" : "START"}</Text></Pressable>
        ) : (
          <Pressable testID="hiit-stop" onPress={stop} style={[styles.ctrl, styles.ctrlWarn]}><Text style={styles.ctrlWarnText}>PAUSE</Text></Pressable>
        )}
        <Pressable testID="hiit-reset" onPress={reset} style={[styles.ctrl, styles.ctrlDim]}><Text style={styles.ctrlDimText}>RESET</Text></Pressable>
      </View>
    </View>
  );
}

export function TimersTab() {
  return (
    <View>
      <Stopwatch />
      <IntervalTimer />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center" },
  blockTitle: { color: colors.textDim, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginBottom: spacing.sm },
  bigTime: { color: colors.text, fontSize: 52, fontWeight: "900", fontVariant: ["tabular-nums"], letterSpacing: 1 },
  phaseLbl: { fontSize: 15, fontWeight: "900", letterSpacing: 3, marginBottom: 2 },
  roundLbl: { color: colors.textDim, fontSize: 12, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  btnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignSelf: "stretch" },
  ctrl: { flex: 1, paddingVertical: 13, alignItems: "center", borderRadius: radius.sm, borderWidth: 1 },
  ctrlGo: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  ctrlGoText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  ctrlWarn: { backgroundColor: "rgba(255,184,0,0.15)", borderColor: colors.warning },
  ctrlWarnText: { color: colors.warning, fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  ctrlDim: { backgroundColor: colors.surface3, borderColor: colors.borderStrong },
  ctrlDimText: { color: colors.textMid, fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  ctrlText: {},
  lapRow: { flexDirection: "row", justifyContent: "space-between", alignSelf: "stretch", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border },
  lapLbl: { color: colors.textDim, fontWeight: "800", fontSize: 12 },
  lapVal: { color: colors.text, fontWeight: "900", fontSize: 14, fontVariant: ["tabular-nums"] },
  stepperRow: { flexDirection: "row", gap: spacing.sm, alignSelf: "stretch", justifyContent: "space-between" },
  stepper: { flex: 1, alignItems: "center" },
  stepLbl: { color: colors.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  stepBtnT: { color: colors.brandPrimary, fontSize: 18, fontWeight: "900", lineHeight: 20 },
  stepVal: { color: colors.text, fontSize: 16, fontWeight: "900", minWidth: 40, textAlign: "center", fontVariant: ["tabular-nums"] },
});
