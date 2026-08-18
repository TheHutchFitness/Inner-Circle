import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, avatarFor, RANK_COLORS, fmtWeight, bgImage, avatarImage, rankIndex } from "@/src/lib/theme";
import { HudSectionHeader, HudFrame } from "@/src/components/Hud";
import { SwipeTabs } from "@/src/components/SwipeTabs";

function nextRankInfo(xp: number) {
  const thresholds = [
    { name: "Intermediate", xp: 2500 },
    { name: "Advanced", xp: 5000 },
    { name: "Vanguard", xp: 7500 },
    { name: "Warrior", xp: 10000 },
    { name: "Boss", xp: 12500 },
    { name: "Elite", xp: 15000 },
    { name: "Freak", xp: 17500 },
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
  const [programAlert, setProgramAlert] = useState<any>(null);
  const [nextDose, setNextDose] = useState<any>(null);

  useEffect(() => {
    (async () => {
      try { setSuggestion(await apiFetch(token, "/api/workouts/next-suggestion")); } catch {}
    })();
  }, [token, user?.xp]);

  useEffect(() => {
    (async () => {
      try { setProgramAlert(await apiFetch(token, "/api/custom-program/alert")); } catch {}
    })();
  }, [token]);

  useEffect(() => {
    if (!user?.enhanced) { setNextDose(null); return; }
    (async () => {
      try { setNextDose(await apiFetch(token, "/api/enhanced/next-dose")); } catch {}
    })();
  }, [token, user?.enhanced]);

  if (!user) return null;
  const avatar = avatarFor(user.avatar_id);
  const rank = user.rank || "Beginner";
  const rankColor = RANK_COLORS[rank] || colors.brandPrimary;
  const next = nextRankInfo(user.xp);
  const progress = next.name === "MAX" ? 1 : Math.min(1, user.xp / next.xp);

  const isPremium = isSubscribed || user.skool_verified;
  const canAthletesCenter = rankIndex(rank) >= 2 || user?.all_rooms_access || user?.athletes_center_access;
  const canRoom = rankIndex(rank) >= 6 || user?.all_rooms_access;
  const canJudge = isSubscribed || user?.skool_verified || user?.all_rooms_access;

  return (
    <SwipeTabs current="index">
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Image source={bgImage(user.active_background, user.sex)} style={styles.bgArt} contentFit="cover" />
      <LinearGradient
        colors={["rgba(5,5,8,0.35)", "rgba(5,5,8,0.85)", colors.surface]}
        locations={[0, 0.5, 0.82]}
        style={StyleSheet.absoluteFill}
      />
      <ScrollView style={styles.root} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
      <View style={styles.topBar}>
        <Pressable testID="open-recap" onPress={() => router.push("/recap")} style={styles.hudBtn}>
          <Text style={styles.hudBtnText}>▤ RECAP</Text>
        </Pressable>
        <Pressable testID="open-vault" onPress={() => router.push("/vault")} style={styles.hudBtn}>
          <Text style={styles.hudBtnText}>⬡ INVENTORY</Text>
        </Pressable>
        <Pressable testID="open-progression" onPress={() => router.push("/progression")} style={styles.hudBtn}>
          <Text style={styles.hudBtnText}>◈ RANKS</Text>
        </Pressable>
      </View>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>▚ MISSION BRIEFING //</Text>
        <Text style={styles.title}>WELCOME, {user.display_name?.toUpperCase()}</Text>
      </View>

      <LinearGradient colors={[colors.brandTertiary, colors.surface2]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={[styles.avatarBox, { borderColor: rankColor }]}>
            {avatarImage(user.avatar_id, user.sex) ? (
              <Image source={avatarImage(user.avatar_id, user.sex)} style={styles.avatarImg} contentFit="cover" />
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

      <HudSectionHeader label="ROOMS" />
      <Pressable testID="open-athletes-center" onPress={() => router.push("/athletes-center")} style={[styles.ctaCard, !canAthletesCenter && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>{`ATHLETE'S CENTER ${canAthletesCenter ? "" : "🔒"}`}</Text>
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

      <Pressable testID="open-cardio" onPress={() => router.push("/cardio")} style={styles.ctaCard}>
        <View>
          <Text style={styles.ctaTitle}>CARDIO · GPS TRACKER</Text>
          <Text style={styles.ctaSub}>Live map runs & rides · pace, elevation, temp</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>

      <Pressable testID="open-coach" onPress={() => router.push("/coach")} style={styles.ctaCard}>
        <View>
          <Text style={styles.ctaTitle}>AI COACH · CHAT</Text>
          <Text style={styles.ctaSub}>Ask training & nutrition questions · GPT-5.4</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>

      <Pressable testID="open-founders" onPress={() => router.push("/founders")} style={styles.ctaCard}>
        <View>
          <Text style={styles.ctaTitle}>FOUNDERS</Text>
          <Text style={styles.ctaSub}>First 100 members + development backers</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>

      <Pressable testID="open-judge" onPress={() => router.push("/judge")} style={[styles.ctaCard, !canJudge && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>THE JUDGE {canJudge ? "" : "🔒"}</Text>
          <Text style={styles.ctaSub}>AI physique scoring + member critiques · Members</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>

      <Pressable testID="open-enhanced" onPress={() => router.push("/enhanced")} style={styles.enhancedCta}>
        <View style={{ flex: 1 }}>
          <Text style={styles.enhancedTitle}>☣ THE ENHANCED {user?.enhanced ? "· ENTER" : "· 20+ · MEMBERS"}</Text>
          <Text style={styles.enhancedSub}>PED/peptide protocol tracker + discussion · Not medical advice</Text>
        </View>
        <Text style={styles.enhancedArrow}>▶</Text>
      </Pressable>

      {user?.enhanced && nextDose?.active && (
        <Pressable testID="protocol-reminder" onPress={() => router.push("/enhanced")} style={styles.doseCard}>
          <View style={styles.doseHead}>
            <Text style={styles.doseTitle}>{`⏱ TODAY'S PROTOCOL · ${nextDose.today}`}</Text>
            {nextDose.due_count > 0 && <View style={styles.doseBadge}><Text style={styles.doseBadgeText}>{nextDose.due_count} DUE</Text></View>}
          </View>
          {(nextDose.items || []).slice(0, 5).map((it: any, i: number) => (
            <View key={i} style={styles.doseRow}>
              <View style={[styles.doseDot, it.due_today ? styles.doseDotOn : styles.doseDotOff]} />
              <Text style={[styles.doseName, !it.due_today && styles.doseNameDim]} numberOfLines={1}>{it.name}</Text>
              <Text style={styles.doseMeta} numberOfLines={1}>{it.due_today ? `${it.dosage} · today` : it.schedule || "—"}</Text>
            </View>
          ))}
          {nextDose.due_count === 0 && <Text style={styles.doseRest}>No doses scheduled today — recovery day.</Text>}
        </Pressable>
      )}

      <Pressable testID="open-custom-program" onPress={() => router.push("/custom-program")} style={styles.customProgCta}>
        <View style={{ flex: 1 }}>
          <View style={styles.customProgTitleRow}>
            <Text style={styles.customProgTitle}>★ 1-ON-1 CUSTOM PROGRAM</Text>
            {programAlert?.unseen && <View style={styles.readyBadge}><Text style={styles.readyBadgeText}>PROGRAM READY</Text></View>}
            {!programAlert?.unseen && programAlert?.intake_pending && <View style={styles.intakeBadge}><Text style={styles.intakeBadgeText}>COMPLETE INTAKE</Text></View>}
          </View>
          <Text style={styles.customProgSub}>
            {programAlert?.program_ready
              ? "Your program from Coach Hutch is ready — tap to download"
              : programAlert?.intake_pending
              ? "You're in! Tap to complete your intake so Coach can start"
              : "Human-written for your goals + instant Athlete's Center · $200"}
          </Text>
        </View>
        <Text style={styles.customProgArrow}>▶</Text>
      </Pressable>

      {!isPremium && (
        <Pressable testID="open-paywall" onPress={() => router.push("/paywall")} style={styles.premiumCta}>
          <Text style={styles.premiumCtaText}>UNLOCK PREMIUM · $5/mo</Text>
          <Text style={styles.premiumCtaSub}>Chatrooms + AI Programming</Text>
        </Pressable>
      )}
      </ScrollView>
    </View>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  bgArt: { position: "absolute", top: 0, left: 0, right: 0, height: 520 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: "rgba(0,85,255,0.35)" },
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
  customProgCta: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.lg, backgroundColor: "rgba(255,234,0,0.06)", borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.warning, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  customProgTitle: { color: colors.warning, fontWeight: "900", letterSpacing: 2, fontSize: 15 },
  customProgTitleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, flexWrap: "wrap" },
  readyBadge: { backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  readyBadgeText: { color: "#002200", fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  intakeBadge: { backgroundColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  intakeBadgeText: { color: "#221900", fontWeight: "900", fontSize: 8, letterSpacing: 1 },
  enhancedCta: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: "#FF2A3C", backgroundColor: "rgba(255,42,60,0.07)" },
  enhancedTitle: { color: "#FF2A3C", fontWeight: "900", letterSpacing: 1, fontSize: 15 },
  enhancedSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  enhancedArrow: { color: "#FF2A3C", fontSize: 14 },
  doseCard: { marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: "#FF2A3C", backgroundColor: "rgba(255,42,60,0.06)" },
  doseHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  doseTitle: { color: "#FF2A3C", fontWeight: "900", letterSpacing: 1, fontSize: 11 },
  doseBadge: { backgroundColor: "#FF2A3C", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  doseBadgeText: { color: "#fff", fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  doseRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  doseDot: { width: 8, height: 8, borderRadius: 4 },
  doseDotOn: { backgroundColor: "#FF2A3C" },
  doseDotOff: { backgroundColor: colors.border },
  doseName: { color: colors.text, fontWeight: "800", fontSize: 12, flex: 1 },
  doseNameDim: { color: colors.textDim, fontWeight: "600" },
  doseMeta: { color: colors.textDim, fontSize: 10, maxWidth: 130, textAlign: "right" },
  doseRest: { color: colors.textDim, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  customProgSub: { color: colors.textMid, fontSize: 11, marginTop: 4, letterSpacing: 1, lineHeight: 16 },
  customProgArrow: { color: colors.warning, fontSize: 18, marginLeft: spacing.sm },
  premiumCta: { marginHorizontal: spacing.lg, marginTop: spacing.lg, padding: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: radius.md, alignItems: "center" },
  premiumCtaText: { color: "#001122", fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  premiumCtaSub: { color: "#001122", marginTop: 4, letterSpacing: 1, fontSize: 11 },
});
