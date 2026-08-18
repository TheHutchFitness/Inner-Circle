import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useUnits } from "@/src/lib/units";
import { colors, spacing, radius } from "@/src/lib/theme";
import { StrengthChart } from "@/src/components/StrengthChart";

const RANGES = [["1w", "1W"], ["1m", "1M"], ["3m", "3M"], ["all", "ALL"]];
const TABS = ["STATS", "LOG", "GRAPHS"];

export default function ExerciseStats() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const units = useUnits();
  const { name } = useLocalSearchParams<{ name: string }>();
  const exName = typeof name === "string" ? name : "";
  const [tab, setTab] = useState("STATS");
  const [rng, setRng] = useState("1m");
  const [stats, setStats] = useState<any>(null);
  const [log, setLog] = useState<any[]>([]);
  const [graph, setGraph] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const q = `name=${encodeURIComponent(exName)}&rng=${rng}`;
        const [s, l, g] = await Promise.all([
          apiFetch(token, `/api/exercise/stats?${q}`),
          apiFetch(token, `/api/exercise/log?${q}`),
          apiFetch(token, `/api/exercise/graph?${q}`),
        ]);
        setStats(s); setLog(l.sessions || []); setGraph(g.points || []);
      } catch {}
      setLoading(false);
    })();
  }, [exName, rng, token]);

  const wUnit = units.unit;
  const w = (lb: number, d = 0) => `${units.toDisplay(lb).toFixed(d)}`;
  const vol = (lb: number) => `${units.toDisplay(lb).toFixed(0)}`;
  const dateStr = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "—");

  const chartData = graph.map((p) => ({ date: p.date, weight: units.toDisplay(p.weight) }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable testID="es-back" onPress={() => router.back()}><Text style={styles.back}>←</Text></Pressable>
        <View style={{ flex: 1, alignItems: "center" }}>
          <Text style={styles.title} numberOfLines={1}>{exName}</Text>
        </View>
        <Pressable testID="es-unit" onPress={units.toggle} style={styles.unitBtn}><Text style={styles.unitText}>{wUnit.toUpperCase()}</Text></Pressable>
      </View>

      <View style={styles.tabRow}>
        {TABS.map((t) => (
          <Pressable testID={`es-tab-${t}`} key={t} onPress={() => setTab(t)} style={styles.tabBtn}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            {tab === t && <View style={styles.tabUnderline} />}
          </Pressable>
        ))}
      </View>

      <View style={styles.rangeRow}>
        {RANGES.map(([k, l]) => (
          <Pressable testID={`es-range-${k}`} key={k} onPress={() => setRng(k)} style={[styles.rangeChip, rng === k && styles.rangeChipActive]}>
            <Text style={[styles.rangeText, rng === k && styles.rangeTextActive]}>{l}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}>
          {tab === "STATS" && stats && (
            <>
              <View style={styles.grid}>
                <StatBox label="Total Sets" value={String(stats.total_sets)} />
                <StatBox label="Total Workouts" value={String(stats.total_workouts)} />
              </View>
              <View style={styles.grid3}>
                <StatBox label={`Total Wt (${wUnit})`} value={w(stats.total_weight)} sm />
                <StatBox label="Total Reps" value={String(stats.total_reps)} sm />
                <StatBox label="Total Vol" value={vol(stats.total_volume)} sm />
              </View>
              <View style={styles.grid3}>
                <StatBox label={`Avg Wt (${wUnit})`} value={w(stats.avg_weight, 1)} sm />
                <StatBox label="Avg Reps" value={stats.avg_reps.toFixed(1)} sm />
                <StatBox label="Avg Vol" value={vol(stats.avg_volume)} sm />
              </View>
              <View style={styles.grid3}>
                <StatBox label={`Max Wt (${wUnit})`} value={w(stats.max_weight, 1)} date={dateStr(stats.max_weight_date)} sm />
                <StatBox label="Max Reps" value={String(stats.max_reps)} date={dateStr(stats.max_reps_date)} sm />
                <StatBox label="Max Vol" value={vol(stats.max_volume)} date={dateStr(stats.max_volume_date)} sm />
              </View>
              <View style={styles.grid3}>
                <StatBox label={`Avg Max Wt`} value={w(stats.avg_max_weight, 1)} sm />
                <StatBox label="Avg Max Reps" value={stats.avg_max_reps.toFixed(1)} sm />
                <StatBox label="Avg Max Vol" value={vol(stats.avg_max_volume)} sm />
              </View>
            </>
          )}

          {tab === "LOG" && (
            log.length === 0 ? <Text style={styles.empty}>No sets logged in this range.</Text> :
            log.map((s, i) => (
              <View key={i} style={styles.logCard}>
                <View style={styles.logHead}>
                  <Text style={styles.logDate}>{dateStr(s.date)}</Text>
                  <Text style={styles.logWk}>{s.workout_name}</Text>
                </View>
                {s.sets.map((st: any, j: number) => (
                  <View key={j} style={styles.logSet}>
                    <Text style={styles.logSetNum}>SET {j + 1}</Text>
                    <Text style={styles.logSetVal}>{w(st.weight_lb, 1)} {wUnit} × {st.reps}</Text>
                    <Text style={styles.logSetRpe}>RPE {st.rpe}</Text>
                  </View>
                ))}
              </View>
            ))
          )}

          {tab === "GRAPHS" && (
            chartData.length === 0 ? <Text style={styles.empty}>Log a few sessions to see your progress curve.</Text> :
            <View style={styles.graphCard}>
              <Text style={styles.graphTitle}>TOP SET WEIGHT ({wUnit})</Text>
              <StrengthChart data={chartData} color={colors.brandPrimary} />
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

function StatBox({ label, value, date, sm }: { label: string; value: string; date?: string; sm?: boolean }) {
  return (
    <View style={styles.box}>
      <Text style={styles.boxLabel}>{label}</Text>
      <Text style={[styles.boxValue, sm && { fontSize: 22 }]}>{value}</Text>
      {date && <Text style={styles.boxDate}>{date}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm },
  back: { color: colors.brandPrimary, fontSize: 24, fontWeight: "900", width: 32 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 16 },
  unitBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.sm, minWidth: 44, alignItems: "center" },
  unitText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1 },
  tabRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBtn: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  tabText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 13 },
  tabTextActive: { color: colors.brandPrimary },
  tabUnderline: { position: "absolute", bottom: 0, height: 2, width: 40, backgroundColor: colors.brandPrimary },
  rangeRow: { flexDirection: "row", gap: spacing.sm, padding: spacing.lg, paddingBottom: 0 },
  rangeChip: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  rangeChipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  rangeText: { color: colors.textDim, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  rangeTextActive: { color: colors.brandPrimary },
  grid: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  grid3: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  box: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, minHeight: 76, justifyContent: "center" },
  boxLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 1, fontWeight: "700" },
  boxValue: { color: colors.text, fontSize: 26, fontWeight: "900", marginTop: 4, fontVariant: ["tabular-nums"] },
  boxDate: { color: colors.textDim, fontSize: 9, marginTop: 2 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 40 },
  logCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  logHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: 6 },
  logDate: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1 },
  logWk: { color: colors.textDim, fontSize: 12 },
  logSet: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  logSetNum: { color: colors.textDim, fontSize: 11, letterSpacing: 1, fontWeight: "700", width: 60 },
  logSetVal: { color: colors.text, fontWeight: "800", flex: 1, textAlign: "center" },
  logSetRpe: { color: colors.textMid, fontSize: 11, width: 60, textAlign: "right" },
  graphCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  graphTitle: { color: colors.textDim, letterSpacing: 2, fontWeight: "800", fontSize: 11, marginBottom: spacing.sm },
});
