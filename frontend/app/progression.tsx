import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, RANK_COLORS, CARD_FRAMES, bgImage } from "@/src/lib/theme";

const RANKS = [
  { name: "Beginner", xp: 0, levels: "LV 1–10",
    perks: ["STEEL FRAME player card", "Core training + workout logging", "3 leaderboards + PR vault"] },
  { name: "Intermediate", xp: 2500, levels: "LV 11–20",
    perks: ["CYAN FRAME player card", "Cyber Grid background perk", "Sharper class tier rating"] },
  { name: "Advanced", xp: 5000, levels: "LV 21–30",
    perks: ["COBALT FRAME player card", "Inferno background perk", "★ Athlete's Center (AI Coach) unlock"] },
  { name: "Vanguard", xp: 7500, levels: "LV 31–40",
    perks: ["VANGUARD FRAME player card", "Vanguard Sapphire background", "PR Radar widget"] },
  { name: "Warrior", xp: 10000, levels: "LV 41–50",
    perks: ["WARRIOR FRAME player card", "Warrior's Forge background", "Class Insignia + Training Heatmap widgets"] },
  { name: "Boss", xp: 12500, levels: "LV 51–60",
    perks: ["BOSS FRAME player card", "Boss Throne background", "Rank Aura widget"] },
  { name: "Elite", xp: 15000, levels: "LV 61–70",
    perks: ["GILDED FRAME player card", "The Void background perk", "★ THE ROOM elite chatroom unlock"] },
  { name: "Freak", xp: 17500, levels: "LV 71+",
    perks: ["CRIMSON PRIME elite frame", "Freak Mode background perk", "Apex leaderboard status"] },
];

export default function Progression() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, token } = useAuth();
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => { try { setData(await apiFetch(token, "/api/unlockables")); } catch {} })();
  }, [token]);

  const curXp = user?.xp ?? 0;
  const curLevel = data?.level ?? user?.level ?? 1;
  const curRank = user?.rank || "Beginner";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>▚ PROGRESSION MAP //</Text>
        <Text style={styles.h1}>RANKS & REWARDS</Text>
        <Text style={styles.helper}>You&apos;re {curRank.toUpperCase()} · LVL {curLevel} · {curXp} XP</Text>

        <Text style={styles.section}>RANK TIERS</Text>
        {RANKS.map((r) => {
          const frame = CARD_FRAMES[r.name];
          const rankColor = RANK_COLORS[r.name] || colors.brandPrimary;
          const unlocked = curXp >= r.xp;
          const isCurrent = curRank === r.name;
          return (
            <View
              key={r.name}
              testID={`rank-${r.name}`}
              style={[styles.rankCard, { borderColor: isCurrent ? rankColor : colors.border }, !unlocked && styles.dim]}
            >
              <View style={styles.rankHead}>
                <LinearGradient colors={frame.colors} style={[styles.framePreview, { borderColor: frame.border }]}>
                  <Text style={[styles.frameGlyph, { color: frame.glow }]}>◆</Text>
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
                    <Text style={[styles.rankName, { color: rankColor }]}>{r.name.toUpperCase()}</Text>
                    {isCurrent && <View style={[styles.pill, { backgroundColor: rankColor }]}><Text style={styles.pillText}>YOU</Text></View>}
                  </View>
                  <Text style={styles.rankXp}>{r.levels} · {r.xp === 0 ? "START" : `${r.xp} XP`}</Text>
                  <Text style={styles.frameName}>{frame.name}</Text>
                </View>
                <Text style={[styles.lockGlyph, { color: unlocked ? colors.success : colors.textDim }]}>{unlocked ? "✓" : "🔒"}</Text>
              </View>
              <View style={styles.perks}>
                {r.perks.map((p, i) => (
                  <View key={i} style={styles.perkRow}>
                    <Text style={[styles.perkDot, { color: rankColor }]}>▹</Text>
                    <Text style={styles.perkText}>{p}</Text>
                  </View>
                ))}
              </View>
            </View>
          );
        })}

        <Text style={styles.section}>LEVEL REWARDS</Text>
        <Text style={styles.subHelper}>Level = every 250 XP. Unlock backgrounds & widgets as you grind.</Text>

        {data?.backgrounds && (
          <>
            <Text style={styles.miniHead}>APP BACKGROUNDS</Text>
            <View style={styles.bgGrid}>
              {data.backgrounds.map((bg: any) => (
                <View key={bg.id} testID={`bg-${bg.id}`} style={[styles.bgCard, !bg.unlocked && styles.dim]}>
                  <Image source={bgImage(bg.id)} style={styles.bgThumb} contentFit="cover" />
                  <View style={styles.bgOverlay}>
                    <Text style={styles.bgName}>{bg.name}</Text>
                    {bg.perk_rank && <Text style={styles.bgPerk}>{bg.perk_rank.toUpperCase()} PERK</Text>}
                    <Text style={[styles.bgLvl, bg.unlocked && { color: colors.success }]}>
                      {bg.unlocked ? "UNLOCKED" : `LVL ${bg.level}`}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {data?.widgets && (
          <>
            <Text style={styles.miniHead}>HUD WIDGETS</Text>
            {data.widgets.map((w: any) => (
              <View key={w.id} testID={`widget-${w.id}`} style={[styles.widgetRow, !w.unlocked && styles.dim]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.widgetName}>{w.name} {w.unlocked ? "" : "🔒"}</Text>
                  <Text style={styles.widgetDesc}>{w.desc}</Text>
                </View>
                <Text style={[styles.widgetLvl, w.unlocked && { color: colors.success }]}>
                  {w.unlocked ? "UNLOCKED" : `LVL ${w.level}`}
                </Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  helper: { color: colors.textMid, marginTop: 4 },
  section: { color: colors.text, fontSize: 14, letterSpacing: 4, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.sm },
  subHelper: { color: colors.textDim, fontSize: 12, marginBottom: spacing.md, lineHeight: 17 },
  dim: { opacity: 0.5 },
  rankCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1.5, padding: spacing.md, marginBottom: spacing.md },
  rankHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  framePreview: { width: 54, height: 72, borderRadius: radius.sm, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  frameGlyph: { fontSize: 22 },
  rankName: { fontSize: 18, fontWeight: "900", letterSpacing: 3 },
  rankXp: { color: colors.textDim, fontSize: 11, letterSpacing: 2, marginTop: 2, fontWeight: "700" },
  frameName: { color: colors.textMid, fontSize: 11, marginTop: 2, letterSpacing: 1 },
  lockGlyph: { fontSize: 18 },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  pillText: { color: "#050508", fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  perks: { marginTop: spacing.md, gap: 6 },
  perkRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm },
  perkDot: { fontSize: 13, lineHeight: 18 },
  perkText: { color: colors.textMid, flex: 1, fontSize: 13, lineHeight: 18 },
  miniHead: { color: colors.brandPrimary, letterSpacing: 3, fontSize: 11, fontWeight: "800", marginTop: spacing.md, marginBottom: spacing.sm },
  bgGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  bgCard: { width: "48%", height: 110, borderRadius: radius.md, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  bgThumb: { ...StyleSheet.absoluteFillObject },
  bgOverlay: { flex: 1, justifyContent: "flex-end", padding: spacing.sm, backgroundColor: "rgba(5,5,8,0.35)" },
  bgName: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 13 },
  bgPerk: { color: colors.warning, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  bgLvl: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: 2 },
  widgetRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  widgetName: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  widgetDesc: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  widgetLvl: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
});
