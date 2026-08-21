import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, RANK_COLORS } from "@/src/lib/theme";

// Short weekly recap on Home: XP/rank moves, races won/lost, strength trend + shields.
export function WeeklyDigestCard() {
  const { token } = useAuth();
  const [d, setD] = useState<any>(null);

  useEffect(() => {
    let on = true;
    (async () => {
      try {
        const r = await apiFetch(token, "/api/digest/weekly");
        if (on) setD(r);
      } catch {}
    })();
    return () => { on = false; };
  }, [token]);

  if (!d) return null;

  const rankColor = RANK_COLORS[d.rank] || colors.brandPrimary;
  const stats: { label: string; value: string; color?: string }[] = [];
  if (typeof d.xp_gained === "number") stats.push({ label: "XP THIS WEEK", value: `${d.xp_gained >= 0 ? "+" : ""}${d.xp_gained}`, color: d.xp_gained > 0 ? colors.success : colors.textMid });
  stats.push({ label: "RACES", value: `${d.races?.won || 0}W · ${d.races?.lost || 0}L`, color: (d.races?.won || 0) >= (d.races?.lost || 0) ? colors.success : colors.error });
  stats.push({ label: "WORKOUTS", value: `${d.workouts || 0}`, color: colors.text });
  if (d.cardio_km > 0) stats.push({ label: "DISTANCE", value: `${d.cardio_km} km`, color: colors.text });
  if (d.trend) stats.push({ label: "TREND", value: `${d.trend.percentile_delta > 0 ? "↑ +" : d.trend.percentile_delta < 0 ? "↓ " : "→ "}${d.trend.percentile_delta}%`, color: d.trend.percentile_delta > 0 ? colors.success : d.trend.percentile_delta < 0 ? colors.error : colors.textMid });

  const shieldColor = d.shield_tier === "gold" ? "#FFD24A" : d.shield_tier === "silver" ? "#CBD5E1" : "#E08A4B";

  return (
    <View style={[styles.card, { borderColor: rankColor }]}>
      <View style={styles.head}>
        <Text style={styles.title}>📊 YOUR WEEK</Text>
        <Text style={[styles.rank, { color: rankColor }]}>
          LV {d.level} · {(d.rank || "").toUpperCase()}{d.level_up > 0 ? `  ▲${d.level_up}` : ""}
        </Text>
      </View>
      <View style={styles.grid}>
        {stats.map((s) => (
          <View key={s.label} style={styles.cell}>
            <Text style={[styles.cellV, s.color ? { color: s.color } : null]}>{s.value}</Text>
            <Text style={styles.cellL}>{s.label}</Text>
          </View>
        ))}
      </View>
      {d.shield_tier && (
        <Text style={[styles.shield, { color: shieldColor }]}>🛡 {d.shield_tier.toUpperCase()} DEFENDER · {d.shield_count} lead{d.shield_count === 1 ? "" : "s"} defended</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: spacing.lg, marginBottom: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, padding: spacing.md },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 13, fontWeight: "900", letterSpacing: 2 },
  rank: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "33.33%", paddingVertical: 6 },
  cellV: { color: colors.text, fontSize: 18, fontWeight: "900" },
  cellL: { color: colors.textDim, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginTop: 2 },
  shield: { fontSize: 11, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm },
});
