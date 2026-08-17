import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, avatarFor, RANK_COLORS, fmtWeight } from "@/src/lib/theme";

export default function Recap() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    (async () => {
      try { setData(await apiFetch(token, "/api/recap/weekly")); } catch {}
      setLoading(false);
    })();
  }, [token]);

  const share = async () => {
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } catch {}
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const av = avatarFor(data?.avatar_id);
  const rankColor = RANK_COLORS[data?.rank_now] || colors.brandPrimary;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 40 }}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
      <Text style={styles.eyebrow}>SUNDAY BRIEFING</Text>
      <Text style={styles.h1}>WEEKLY RECAP</Text>

      <View ref={cardRef} collapsable={false}>
        <LinearGradient colors={["#001A33", "#12141A", "#050508"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
          <View style={styles.cardHead}>
            <View style={[styles.avatar, { borderColor: rankColor }]}><Text style={styles.avatarEmoji}>{av.emoji}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{data?.display_name?.toUpperCase()}</Text>
              <Text style={[styles.rank, { color: rankColor }]}>{data?.rank_now?.toUpperCase()} · LVL {data?.level}</Text>
            </View>
          </View>

          {data?.promoted && (
            <View style={styles.promoBanner}>
              <Text style={styles.promoText}>⬆ RANKED UP: {data.rank_start?.toUpperCase()} → {data.rank_now?.toUpperCase()}</Text>
            </View>
          )}

          <View style={styles.statGrid}>
            <View style={styles.stat}><Text style={styles.statVal}>{data?.xp_gained}</Text><Text style={styles.statLbl}>XP GAINED</Text></View>
            <View style={styles.stat}><Text style={styles.statVal}>{data?.workouts}</Text><Text style={styles.statLbl}>SESSIONS</Text></View>
            <View style={styles.stat}><Text style={styles.statVal}>{data?.pr_count}</Text><Text style={styles.statLbl}>NEW PRs</Text></View>
          </View>

          <View style={styles.volumeRow}>
            <Text style={styles.volumeLabel}>TOTAL VOLUME MOVED</Text>
            <Text style={styles.volumeVal}>{fmtWeight(data?.total_volume_lb || 0)}</Text>
          </View>

          {(data?.prs || []).length > 0 && (
            <View style={styles.prList}>
              {data.prs.map((p: any, i: number) => (
                <Text key={i} style={styles.prLine}>🏆 {p.name} — {fmtWeight(p.weight)}</Text>
              ))}
            </View>
          )}

          <Text style={styles.brand}>HUTCH'S INNER CIRCLE</Text>
        </LinearGradient>
      </View>

      {data?.workouts === 0 && <Text style={styles.empty}>No sessions logged this week. Time to get after it.</Text>}

      <Pressable testID="recap-share" onPress={share} style={styles.shareBtn}>
        <Text style={styles.shareText}>SHARE RECAP</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 2, marginTop: 4, marginBottom: spacing.lg },
  card: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatar: { width: 56, height: 56, borderRadius: radius.md, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.4)" },
  avatarEmoji: { fontSize: 30 },
  name: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 1 },
  rank: { fontSize: 11, letterSpacing: 2, fontWeight: "800", marginTop: 2 },
  promoBanner: { marginTop: spacing.md, backgroundColor: colors.warning, padding: spacing.sm, borderRadius: radius.sm, alignItems: "center" },
  promoText: { color: "#332200", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  statGrid: { flexDirection: "row", marginTop: spacing.lg, gap: spacing.sm },
  stat: { flex: 1, alignItems: "center", backgroundColor: "rgba(0,0,0,0.35)", paddingVertical: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  statVal: { color: colors.brandPrimary, fontSize: 26, fontWeight: "900" },
  statLbl: { color: colors.textDim, fontSize: 9, letterSpacing: 2, marginTop: 2, fontWeight: "700" },
  volumeRow: { marginTop: spacing.md, flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: spacing.md, backgroundColor: "rgba(0,0,0,0.35)", borderRadius: radius.sm },
  volumeLabel: { color: colors.textDim, letterSpacing: 2, fontSize: 11, fontWeight: "700" },
  volumeVal: { color: colors.text, fontWeight: "900", fontSize: 18 },
  prList: { marginTop: spacing.md },
  prLine: { color: colors.success, fontWeight: "700", marginTop: 4 },
  brand: { color: colors.textDim, letterSpacing: 3, fontSize: 10, marginTop: spacing.lg, fontWeight: "700", textAlign: "center" },
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.lg },
  shareBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  shareText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
});
