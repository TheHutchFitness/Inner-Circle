import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, avatarFor, RANK_COLORS, fmtWeight, bgImage, avatarImage } from "@/src/lib/theme";
import { HudSectionHeader, HudFrame } from "@/src/components/Hud";

function nextRankInfo(xp: number) {
  const thresholds = [
    { name: "Intermediate", xp: 500 },
    { name: "Advanced", xp: 1500 },
    { name: "Elite", xp: 3500 },
    { name: "Freak", xp: 8000 },
  ];
  for (const t of thresholds) if (xp < t.xp) return { name: t.name, xp: t.xp };
  return { name: "MAX", xp };
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try { setSuggestion(await apiFetch(token, "/api/workouts/next-suggestion")); } catch {}
    })();
  }, [token, user?.xp]);

  if (!user) return null;
  const avatar = avatarFor(user.avatar_id);
  const rank = user.rank || "Beginner";
  const rankColor = RANK_COLORS[rank] || colors.brandPrimary;
  const next = nextRankInfo(user.xp);
  const progress = next.name === "MAX" ? 1 : Math.min(1, user.xp / next.xp);

  const isPremium = isSubscribed || user.skool_verified;
  const canAthletesCenter = rank === "Advanced" || rank === "Elite" || rank === "Freak";
  const canRoom = rank === "Elite" || rank === "Freak";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Image source={bgImage(user.active_background)} style={styles.bgArt} contentFit="cover" />
      <LinearGradient
        colors={["rgba(5,5,8,0.35)", "rgba(5,5,8,0.85)", colors.surface]}
        locations={[0, 0.5, 0.82]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
      <View style={styles.topBar}>
        <Text style={styles.hudTag}>⌁ HQ TERMINAL · ONLINE</Text>
        <View style={styles.topBarBtns}>
          <Pressable testID="open-recap" onPress={() => router.push("/recap")} style={styles.hudBtn}>
            <Text style={styles.hudBtnText}>▤ RECAP</Text>
          </Pressable>
          <Pressable testID="open-vault" onPress={() => router.push("/vault")} style={styles.hudBtn}>
            <Text style={styles.hudBtnText}>◈ VAULT</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>▚ MISSION BRIEFING //</Text>
        <Text style={styles.title}>WELCOME, {user.display_name?.toUpperCase()}</Text>
      </View>

      <LinearGradient colors={[colors.brandTertiary, colors.surface2]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={[styles.avatarBox, { borderColor: rankColor }]}>
            {avatarImage(user.avatar_id) ? (
              <Image source={avatarImage(user.avatar_id)} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <Text style={styles.avatarEmoji}>{avatar.emoji}</Text>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.rankText, { color: rankColor }]}>{rank.toUpperCase()}</Text>
            <Text style={styles.level}>LVL {user.level} · {user.xp} XP</Text>
            <View style={styles.xpBar}>
              <View style={[styles.xpFill, { width: `${progress * 100}%`, backgroundColor: rankColor }]} />
            </View>
            <Text style={styles.xpNext}>NEXT: {next.name} @ {next.xp} XP</Text>
          </View>
        </View>
        <View style={styles.badgeRow}>
          {isPremium && <View testID="premium-badge" style={styles.premiumBadge}><Text style={styles.premiumBadgeText}>{isSubscribed ? "★ PREMIUM" : "✓ SKOOL"}</Text></View>}
        </View>
      </LinearGradient>

      <View style={styles.grid}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>WORKOUTS</Text>
          <Text style={styles.statValue}>{user.workouts_logged || 0}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>STREAK</Text>
          <Text style={styles.statValue}>{user.streak_days || 0}d</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>BADGES</Text>
          <Text style={styles.statValue}>{user.badges?.length || 0}</Text>
        </View>
      </View>

      <HudSectionHeader label="PR VAULT" />
      <View style={styles.grid}>
        {[["BENCH","bench"],["SQUAT","squat"],["DEAD","deadlift"],["OHP","ohp"]].map(([label,key]) => (
          <View key={key} style={styles.prCard}>
            <Text style={styles.prLabel}>{label}</Text>
            <Text style={styles.prValue}>{fmtWeight(user.prs?.[key] || 0)}</Text>
          </View>
        ))}
      </View>

      <HudSectionHeader label="NEXT MISSION" />
      {suggestion ? (
        <Pressable testID="adaptive-suggestion" onPress={() => router.push("/(tabs)/workout")} style={styles.adaptiveCard}>
          <View style={styles.adaptiveHead}>
            <Text style={styles.adaptiveTag}>ADAPTIVE · {suggestion.based_on?.toUpperCase()}</Text>
            <Text style={styles.adaptiveArrow}>▶</Text>
          </View>
          <Text style={styles.adaptiveTitle}>{suggestion.workout?.name?.toUpperCase()}</Text>
          <Text style={styles.adaptiveProg}>{suggestion.program_name}</Text>
          <View style={styles.focusPill}>
            <Text style={styles.focusPillText}>FOCUS: {suggestion.focus_lift?.toUpperCase()}</Text>
          </View>
          <Text style={styles.adaptiveNote}>{suggestion.focus_note}</Text>
        </Pressable>
      ) : (
        <Pressable testID="quick-start-workout" onPress={() => router.push("/(tabs)/workout")} style={styles.ctaCard}>
          <View>
            <Text style={styles.ctaTitle}>QUICK START</Text>
            <Text style={styles.ctaSub}>Launch training session</Text>
          </View>
          <Text style={styles.ctaArrow}>▶</Text>
        </Pressable>
      )}

      <HudSectionHeader label="PROTOCOLS" />
      <Pressable testID="open-athletes-center" onPress={() => router.push("/athletes-center")} style={[styles.ctaCard, !canAthletesCenter && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>ATHLETE'S CENTER {canAthletesCenter ? "" : "🔒"}</Text>
          <Text style={styles.ctaSub}>AI-built custom programs · Advanced+</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>

      <Pressable testID="open-the-room" onPress={() => router.push("/the-room")} style={[styles.ctaCard, !canRoom && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>THE ROOM {canRoom ? "" : "🔒"}</Text>
          <Text style={styles.ctaSub}>Elite-only encrypted chatroom · Elite+</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>

      {!isPremium && (
        <Pressable testID="open-paywall" onPress={() => router.push("/paywall")} style={styles.premiumCta}>
          <Text style={styles.premiumCtaText}>UNLOCK PREMIUM · $5/mo</Text>
          <Text style={styles.premiumCtaSub}>Chatrooms + AI Programming</Text>
        </Pressable>
      )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  bgArt: { position: "absolute", top: 0, left: 0, right: 0, height: 520 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: "rgba(0,85,255,0.35)" },
  hudTag: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 2, fontWeight: "800", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  topBarBtns: { flexDirection: "row", gap: spacing.sm },
  hudBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: "rgba(0,42,85,0.5)" },
  hudBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  header: { paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.md },
  vaultBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  vaultBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  adaptiveCard: { marginHorizontal: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  adaptiveHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  adaptiveTag: { color: colors.brandPrimary, letterSpacing: 3, fontSize: 10, fontWeight: "800" },
  adaptiveArrow: { color: colors.brandPrimary, fontSize: 16 },
  adaptiveTitle: { color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: 1, marginTop: 6 },
  adaptiveProg: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  focusPill: { alignSelf: "flex-start", backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 4, marginTop: spacing.md, borderWidth: 1, borderColor: colors.borderStrong },
  focusPillText: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  adaptiveNote: { color: colors.textMid, fontSize: 12, marginTop: spacing.sm, lineHeight: 18 },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  title: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  heroCard: { marginHorizontal: spacing.lg, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong },
  heroRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  avatarBox: { width: 68, height: 68, borderRadius: radius.md, borderWidth: 2, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: "100%", height: "100%" },
  avatarEmoji: { fontSize: 38 },
  rankText: { fontSize: 18, fontWeight: "900", letterSpacing: 3 },
  level: { color: colors.textDim, fontSize: 12, marginTop: 2, letterSpacing: 2 },
  xpBar: { height: 6, backgroundColor: colors.surface3, borderRadius: 3, marginTop: 8, overflow: "hidden" },
  xpFill: { height: "100%" },
  xpNext: { color: colors.textDim, fontSize: 10, marginTop: 4, letterSpacing: 2 },
  badgeRow: { flexDirection: "row", marginTop: spacing.md },
  premiumBadge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.warning },
  premiumBadgeText: { color: "#332200", fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  grid: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md, flexWrap: "wrap" },
  statCard: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minWidth: 90 },
  statLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  statValue: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 4 },
  sectionTitle: { color: colors.text, fontSize: 14, letterSpacing: 4, fontWeight: "800", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  prCard: { width: "48%", backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  prLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 3, fontWeight: "800" },
  prValue: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 4 },
  ctaCard: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  ctaTitle: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 15 },
  ctaSub: { color: colors.textDim, fontSize: 11, marginTop: 4, letterSpacing: 1 },
  ctaArrow: { color: colors.brandPrimary, fontSize: 18 },
  locked: { opacity: 0.55, borderColor: colors.borderStrong },
  premiumCta: { marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: radius.md, alignItems: "center" },
  premiumCtaText: { color: "#001122", fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  premiumCtaSub: { color: "#001122", marginTop: 4, letterSpacing: 1, fontSize: 11 },
});
