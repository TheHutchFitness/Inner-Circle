import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, avatarFor, RANK_COLORS } from "@/src/lib/theme";
import { SwipeTabs } from "@/src/components/SwipeTabs";

const BOARDS = [
  { key: "xp", label: "LEVEL", desc: "Overall Level" },
  { key: "strength", label: "STRENGTH", desc: "Absolute Big 4" },
  { key: "ratio", label: "BW RATIO", desc: "Total / Bodyweight" },
];

const BOARD_BG: Record<string, any> = {
  xp: require("../../assets/images/board-xp.png"),
  strength: require("../../assets/images/board-strength.png"),
  ratio: require("../../assets/images/board-ratio.png"),
};

const PODIUM_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

export default function Leaderboards() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [board, setBoard] = useState("xp");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setRows(await apiFetch(token, `/api/leaderboard/${board}`)); } catch {}
      setLoading(false);
    })();
  }, [board, token]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <SwipeTabs current="leaderboard">
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Image source={BOARD_BG[board]} style={styles.bgImage} contentFit="cover" />
      <LinearGradient
        colors={["rgba(5,5,8,0.55)", "rgba(5,5,8,0.8)", colors.surface]}
        locations={[0, 0.45, 0.8]}
        style={StyleSheet.absoluteFill}
      />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
      <Text style={styles.eyebrow}>RANKINGS</Text>
      <Text style={styles.h1}>THE CIRCLE</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {BOARDS.map((b) => (
          <Pressable testID={`board-${b.key}`} key={b.key} onPress={() => setBoard(b.key)} style={[styles.chip, board === b.key && styles.chipActive]}>
            <Text style={[styles.chipText, board === b.key && styles.chipTextActive]}>{b.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
      ) : (
        <>
          <View style={styles.podiumWrap}>
            {podium.map((p, i) => {
              const av = avatarFor(p.avatar_id);
              return (
                <View key={p.user_id || i} style={[styles.podiumCard, { borderColor: PODIUM_COLORS[i] }]}>
                  <Text style={[styles.podiumRank, { color: PODIUM_COLORS[i] }]}>#{i + 1}</Text>
                  <View style={[styles.podiumAvatar, { borderColor: PODIUM_COLORS[i] }]}>
                    <Text style={styles.podiumEmoji}>{av.emoji}</Text>
                  </View>
                  <Text style={styles.podiumName} numberOfLines={1}>{p.display_name}</Text>
                  <Text style={[styles.podiumRankBadge, { color: RANK_COLORS[p.rank] }]}>{p.rank}</Text>
                  <Text style={styles.podiumMetric}>{p.metric}</Text>
                  <Text style={styles.podiumMetricLabel}>{p.metric_label}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.listWrap}>
            {rest.map((r, i) => {
              const isMe = r.user_id === user?.user_id;
              const av = avatarFor(r.avatar_id);
              return (
                <View testID={`rank-row-${i+4}`} key={r.user_id} style={[styles.row, isMe && styles.rowMe]}>
                  <Text style={styles.rowRank}>#{i + 4}</Text>
                  <Text style={styles.rowEmoji}>{av.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName}>{r.display_name}</Text>
                    <Text style={[styles.rowSub, { color: RANK_COLORS[r.rank] }]}>{r.rank}</Text>
                  </View>
                  <Text style={styles.rowMetric}>{r.metric}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
    </View>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  bgImage: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700", paddingHorizontal: spacing.lg },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md, paddingHorizontal: spacing.lg },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: colors.surface2, flexShrink: 0 },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  chipTextActive: { color: colors.brandPrimary },
  podiumWrap: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  podiumCard: { flex: 1, alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1 },
  podiumRank: { fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  podiumAvatar: { width: 54, height: 54, borderRadius: radius.md, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, backgroundColor: colors.surface },
  podiumEmoji: { fontSize: 28 },
  podiumName: { color: colors.text, fontWeight: "800", marginTop: 6, fontSize: 12 },
  podiumRankBadge: { fontSize: 9, letterSpacing: 2, fontWeight: "800", marginTop: 2 },
  podiumMetric: { color: colors.text, fontWeight: "900", fontSize: 18, marginTop: 4 },
  podiumMetricLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1 },
  listWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  rowMe: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, borderRadius: radius.sm, marginVertical: 2, borderBottomWidth: 0 },
  rowRank: { color: colors.brandPrimary, fontWeight: "900", width: 40, fontVariant: ["tabular-nums"] },
  rowEmoji: { fontSize: 22 },
  rowName: { color: colors.text, fontWeight: "700" },
  rowSub: { fontSize: 10, letterSpacing: 2, fontWeight: "700", marginTop: 2 },
  rowMetric: { color: colors.text, fontWeight: "900", fontVariant: ["tabular-nums"] },
});
