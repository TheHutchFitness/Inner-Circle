import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { useResponsive, webCenter } from "@/src/lib/responsive";

export default function Clans() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const { isDesktop } = useResponsive();
  const [clans, setClans] = useState<any[] | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const d = await apiFetch(token, "/api/groups");
        const rows = [...(d.groups || [])].sort((a, b) => (b.member_count || 0) - (a.member_count || 0));
        setClans(rows);
      } catch { setClans([]); }
    })();
  }, [token]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="clans-back" onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>‹ BACK</Text>
        </Pressable>
        <Text style={styles.title}>ALL CLANS</Text>
        <View style={{ width: 60 }} />
      </View>
      {clans === null ? (
        <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>
      ) : clans.length === 0 ? (
        <View style={styles.center}><Text style={styles.empty}>No clans yet — be the first to start one in Social → Groups.</Text></View>
      ) : (
        <ScrollView contentContainerStyle={[{ padding: spacing.lg, paddingBottom: insets.bottom + spacing.xl }, webCenter(isDesktop)]}>
          <Text style={styles.sub}>Ranked by members · tap to open Groups</Text>
          <View style={isDesktop ? styles.grid : undefined}>
            {clans.map((c, i) => (
              <Pressable
                key={c.id}
                testID={`clan-row-${c.id}`}
                onPress={() => router.push("/(tabs)/community")}
                style={[styles.row, isDesktop && styles.rowGrid, i === 0 && styles.rowTop]}
              >
                <Text style={[styles.rank, i === 0 && { color: "#FBBF24" }]}>{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}</Text>
                <View style={[styles.badge, c.color ? { borderColor: c.color } : null]}>
                  <Text style={styles.badgeText}>{c.badge || "🛡"}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, c.color ? { color: c.color } : null]} numberOfLines={1}>{c.name}</Text>
                  <Text style={styles.meta}>◈ Level {c.level} · {c.role !== "none" ? c.role.toUpperCase() : "OPEN"}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.count}>{c.member_count}</Text>
                  <Text style={styles.countLbl}>member{c.member_count === 1 ? "" : "s"}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, backgroundColor: colors.surface2, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 1, width: 60 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  empty: { color: colors.textDim, textAlign: "center", lineHeight: 20 },
  sub: { color: colors.textDim, fontSize: 11, letterSpacing: 1, fontWeight: "700", marginBottom: spacing.md },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  rowGrid: { width: "48.5%" },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  rowTop: { borderColor: "#FBBF24", backgroundColor: "rgba(251,191,36,0.06)" },
  rank: { width: 32, textAlign: "center", color: colors.textMid, fontWeight: "900", fontSize: 14 },
  badge: { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  badgeText: { fontSize: 18 },
  name: { color: colors.text, fontWeight: "900", fontSize: 15 },
  meta: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  count: { color: colors.brandPrimary, fontWeight: "900", fontSize: 18, fontVariant: ["tabular-nums"] },
  countLbl: { color: colors.textDim, fontSize: 10, fontWeight: "700" },
});
