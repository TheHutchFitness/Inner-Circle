import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, RANK_COLORS } from "@/src/lib/theme";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";

const STRENGTH_BOARDS = [
  { key: "xp", label: "LEVEL" },
  { key: "strength", label: "STRENGTH" },
  { key: "squat", label: "SQUAT" },
  { key: "bench", label: "BENCH" },
  { key: "deadlift", label: "DEADLIFT" },
  { key: "ratio", label: "BW RATIO" },
];

const PODIUM = ["#FFD700", "#C0C0C0", "#CD7F32"];

// A single self-contained leaderboard pane used for the desktop side-by-side view.
export function LeaderboardColumn({ mode, onMember }: { mode: "strength" | "cardio"; onMember: (id: string) => void }) {
  const { token, user } = useAuth();
  const [board, setBoard] = useState("xp");
  const [activity, setActivity] = useState<"run" | "bike">("run");
  const [cboard, setCboard] = useState<"overall" | "single" | "speed">("overall");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (mode === "strength") setRows(await apiFetch(token, `/api/leaderboard/${board}?filter=all`));
        else setRows(await apiFetch(token, `/api/cardio/leaderboard?board=${cboard}&activity=${activity}&dist=5`));
      } catch { setRows([]); }
      setLoading(false);
    })();
  }, [token, mode, board, activity, cboard]);

  return (
    <View style={styles.col}>
      <Text style={[styles.colTitle, { color: mode === "cardio" ? colors.success : colors.brandPrimary }]}>
        {mode === "cardio" ? "🏃 CARDIO" : "💪 STRENGTH"}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {mode === "strength"
          ? STRENGTH_BOARDS.map((b) => (
              <Pressable key={b.key} testID={`col-${mode}-board-${b.key}`} onPress={() => setBoard(b.key)} style={[styles.chip, board === b.key && styles.chipOn]}>
                <Text style={[styles.chipText, board === b.key && styles.chipTextOn]}>{b.label}</Text>
              </Pressable>
            ))
          : (
            <>
              {[["run", "RUN"], ["bike", "BIKE"]].map(([k, l]) => (
                <Pressable key={k} testID={`col-cardio-act-${k}`} onPress={() => setActivity(k as any)} style={[styles.chip, activity === k && styles.chipOn]}>
                  <Text style={[styles.chipText, activity === k && styles.chipTextOn]}>{l}</Text>
                </Pressable>
              ))}
              {[["overall", "OVERALL"], ["single", "LONGEST"], ["speed", "SPEED"]].map(([k, l]) => (
                <Pressable key={k} testID={`col-cardio-board-${k}`} onPress={() => setCboard(k as any)} style={[styles.chip, cboard === k && styles.chipOn]}>
                  <Text style={[styles.chipText, cboard === k && styles.chipTextOn]}>{l}</Text>
                </Pressable>
              ))}
            </>
          )}
      </ScrollView>
      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 30 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.empty}>No entries yet.</Text>
      ) : (
        <View>
          {rows.slice(0, 25).map((r, i) => {
            const isMe = r.user_id === user?.user_id;
            return (
              <Pressable key={r.user_id || i} onPress={() => r.user_id && onMember(r.user_id)} style={[styles.row, isMe && styles.rowMe, i < 3 && { borderColor: PODIUM[i] }]}>
                <Text style={[styles.rank, i < 3 && { color: PODIUM[i] }]}>#{i + 1}</Text>
                <View style={{ marginRight: 6 }}><PlayerAvatar person={r} token={token} size={30} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, r.founder_backer && { color: colors.warning }]} numberOfLines={1}>{r.display_name}</Text>
                  <Text style={[styles.sub, { color: RANK_COLORS[r.rank] }]}>{r.rank}</Text>
                </View>
                <Text style={styles.metric}>{r.metric}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { flex: 1 },
  colTitle: { fontWeight: "900", letterSpacing: 2, fontSize: 14, marginBottom: spacing.sm, textAlign: "center" },
  chipRow: { gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: colors.surface2 },
  chipOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 1, fontSize: 11 },
  chipTextOn: { color: colors.brandPrimary },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 30 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, marginBottom: 6, gap: 8, backgroundColor: colors.surface2 },
  rowMe: { backgroundColor: colors.brandTertiary },
  rank: { color: colors.brandPrimary, fontWeight: "900", width: 34, fontVariant: ["tabular-nums"] },
  name: { color: colors.text, fontWeight: "700", fontSize: 13 },
  sub: { fontSize: 9, letterSpacing: 2, fontWeight: "700", marginTop: 1 },
  metric: { color: colors.text, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
