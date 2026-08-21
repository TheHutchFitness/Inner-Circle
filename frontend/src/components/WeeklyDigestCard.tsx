import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing } from "@/src/lib/theme";

// Subtle, low-key weekly recap strip meant to sit quietly over the Journey map
// backdrop — one dim line, no heavy card. Backend keeps tracking regardless.
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

  const parts: string[] = [];
  if (typeof d.xp_gained === "number" && d.xp_gained !== 0) parts.push(`${d.xp_gained > 0 ? "+" : ""}${d.xp_gained} XP`);
  if ((d.races?.won || 0) + (d.races?.lost || 0) > 0) parts.push(`${d.races.won}W·${d.races.lost}L`);
  if (d.workouts > 0) parts.push(`${d.workouts} logs`);
  if (d.trend && d.trend.percentile_delta) parts.push(`${d.trend.percentile_delta > 0 ? "↑" : "↓"}${Math.abs(d.trend.percentile_delta)}%`);
  if (d.shield_tier) parts.push(`🛡${d.shield_tier[0].toUpperCase()}`);

  if (parts.length === 0) return null;

  return (
    <View style={styles.strip} pointerEvents="none">
      <Text style={styles.text} numberOfLines={1}>THIS WEEK · {parts.join("  ·  ")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { alignSelf: "center", marginTop: 2, marginBottom: spacing.xs, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.28)" },
  text: { color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1, opacity: 0.85 },
});
