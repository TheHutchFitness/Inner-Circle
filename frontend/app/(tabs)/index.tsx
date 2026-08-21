import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, avatarFor, RANK_COLORS, fmtWeight, bgImage, avatarImage, rankIndex, bodyImage } from "@/src/lib/theme";
import { useResponsive, webCenter } from "@/src/lib/responsive";
import { HudSectionHeader, HudFrame } from "@/src/components/Hud";
import { MemberSheet } from "@/src/components/MemberSheet";
import { SwipeTabs } from "@/src/components/SwipeTabs";
import { GearedAvatar } from "@/src/components/GearedAvatar";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";
import { GymWatermark } from "@/src/components/GymWatermark";
import { LegalNamePrompt } from "@/src/components/LegalNamePrompt";
import { WhatsNew } from "@/src/components/WhatsNew";
import { isLite } from "@/src/lib/mode";
import { SpotlightMedia } from "@/src/components/SpotlightMedia";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

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

function fmtSeason(s: string) {
  const [y, q] = (s || "").split("-");
  return q ? `${q} ${y}` : s;
}

export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const { user, token } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const [suggestion, setSuggestion] = useState<any>(null);
  const [programAlert, setProgramAlert] = useState<any>(null);
  const [nextDose, setNextDose] = useState<any>(null);
  const [ovr, setOvr] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try { const a = await apiFetch(token, "/api/profile/attributes"); setOvr(a?.overall ?? null); } catch {}
    })();
  }, [token, user?.xp]);

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
    if (!user?.enhanced && !user?.enhanced_access) { setNextDose(null); return; }
    (async () => {
      try { setNextDose(await apiFetch(token, "/api/enhanced/next-dose")); } catch {}
    })();
  }, [token, user?.enhanced, user?.enhanced_access]);

  const [featured, setFeatured] = useState<any[]>([]);
  const [questReady, setQuestReady] = useState(0);
  const [questPopupDismissed, setQuestPopupDismissed] = useState(false);
  const [spotId, setSpotId] = useState<string | null>(null);
  const [champion, setChampion] = useState<any>(null);
  const [ipUnread, setIpUnread] = useState(0);
  const [digest, setDigest] = useState<any>(null);
  useEffect(() => {
    (async () => {
      try { setFeatured((await apiFetch(token, "/api/featured")).featured || []); } catch {}
      try { const h = await apiFetch(token, "/api/leaderboard/season/history"); setChampion((h || [])[0] || null); } catch {}
      try { const ipu = await apiFetch(token, "/api/inperson/unread"); setIpUnread((ipu.unread || 0) + (ipu.pending_requests || 0)); } catch {}
      try {
        const d = await apiFetch(token, "/api/profile/gym-digest");
        if (d?.delta !== null && d?.delta !== undefined && d?.week) {
          const dismissed = await AsyncStorage.getItem("gymDigestDismissed");
          if (dismissed !== d.week) setDigest(d);
        }
      } catch {}
    })();
  }, [token]);

  // Refresh the Spotlight whenever Home regains focus (e.g. after an admin
  // features a member and navigates back), so it never shows stale data.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try { const r = await apiFetch(token, "/api/featured"); if (active) setFeatured(r.featured || []); } catch {}
        try {
          const j = await apiFetch(token, "/api/journey");
          const ready = (j?.nodes || []).filter((n: any) => n.complete && !n.claimed).length;
          if (active) { setQuestReady(ready); if (ready > 0) setQuestPopupDismissed(false); }
        } catch {}
      })();
      return () => { active = false; };
    }, [token])
  );

  const dismissDigest = async () => {
    if (digest?.week) await AsyncStorage.setItem("gymDigestDismissed", digest.week);
    setDigest(null);
  };

  if (!user) return null;
  const avatar = avatarFor(user.avatar_id);
  const lite = isLite(user);
  const rank = user.rank || "Beginner";
  const rankColor = RANK_COLORS[rank] || colors.brandPrimary;
  const next = nextRankInfo(user.xp);
  const progress = next.name === "MAX" ? 1 : Math.min(1, user.xp / next.xp);

  const isPremium = isSubscribed || user.skool_verified || user?.is_founder;
  const canAthletesCenter = rankIndex(rank) >= 2 || user?.all_rooms_access || user?.athletes_center_access;
  const canRoom = rankIndex(rank) >= 6 || user?.all_rooms_access;
  const canJudge = isSubscribed || user?.skool_verified || user?.all_rooms_access || user?.is_founder;

  return (
    <SwipeTabs current="index">
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <Image source={bgImage(user.active_background, user.sex)} style={styles.bgArt} contentFit="cover" />
      <LinearGradient
        colors={["rgba(5,5,8,0.35)", "rgba(5,5,8,0.85)", colors.surface]}
        locations={[0, 0.5, 0.82]}
        style={StyleSheet.absoluteFill}
      />
      <GymWatermark />
      <LegalNamePrompt />
      <WhatsNew />
      {questReady > 0 && !questPopupDismissed && (
        <View style={[styles.questPop, { top: insets.top + 8 }]} testID="quest-ready-pop">
          <Pressable onPress={() => { setQuestPopupDismissed(true); router.push("/journey"); }}>
            <Text style={styles.questPopText}>⚔ {questReady} quest{questReady > 1 ? "s" : ""} ready to claim</Text>
          </Pressable>
          <Pressable testID="quest-ready-dismiss" onPress={() => setQuestPopupDismissed(true)} hitSlop={8}>
            <Text style={styles.questPopX}>✕</Text>
          </Pressable>
        </View>
      )}
      <ScrollView style={styles.root} contentContainerStyle={[{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }, webCenter(isDesktop)]}>
      <View style={styles.topBar}>
        <Pressable testID="open-clans" onPress={() => router.push("/clans")} style={styles.hudBtn}>
          <Text style={styles.hudBtnText}>🛡 CLANS</Text>
        </Pressable>
        <Pressable testID="open-progression" onPress={() => router.push("/progression")} style={[styles.hudBtn, styles.hudBtnCenter]}>
          <Text style={styles.hudBtnText}>◈ RANK</Text>
        </Pressable>
        <Pressable testID="open-my-gyms" onPress={() => router.push("/my-gyms")} style={styles.hudBtn}>
          <Text style={styles.hudBtnText}>🏋 GYMS</Text>
        </Pressable>
      </View>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>▚ MISSION BRIEFING //</Text>
        <Text style={styles.title}>WELCOME, {user.display_name?.toUpperCase()}</Text>
      </View>

      {digest && (
        <Pressable testID="gym-digest" onPress={() => router.push("/(tabs)/leaderboard")} style={[styles.digestCard, digest.delta > 0 && styles.digestUp, digest.delta < 0 && styles.digestDown]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.digestLabel}>📊 WEEKLY GYM DIGEST</Text>
            <Text style={styles.digestText}>
              {digest.delta > 0
                ? `You climbed ${digest.delta} spot${digest.delta === 1 ? "" : "s"} at ${digest.gym} — now #${digest.rank}! 🔥`
                : digest.delta < 0
                ? `You slipped ${Math.abs(digest.delta)} spot${Math.abs(digest.delta) === 1 ? "" : "s"} at ${digest.gym} — now #${digest.rank}. Time to grind.`
                : `You held #${digest.rank} at ${digest.gym} this week. Keep pushing.`}
            </Text>
          </View>
          <Pressable testID="gym-digest-dismiss" onPress={dismissDigest} hitSlop={10} style={styles.digestX}><Text style={styles.digestXText}>✕</Text></Pressable>
        </Pressable>
      )}

      <LinearGradient colors={[colors.brandTertiary, colors.surface2]} start={{x:0,y:0}} end={{x:1,y:1}} style={styles.heroCard}>
        <View style={styles.heroRow}>
          <View style={[styles.avatarBox, { borderColor: rankColor }]}>
            {bodyImage(user) ? (
              <GearedAvatar person={user} style={styles.avatarImg} contentFit="cover" />
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
            <View style={styles.levelStatsRow}>
              {ovr != null && <Text style={styles.levelStat}>⚔ {ovr}<Text style={styles.levelStatLbl}> OVR</Text></Text>}
              <Text style={styles.levelStat}>🏋 {user.workouts_logged || 0}<Text style={styles.levelStatLbl}> WK</Text></Text>
              <Text style={styles.levelStat}>🔥 {user.streak_days || 0}d</Text>
              <Text style={styles.levelStat}>🏅 {user.badges?.length || 0}</Text>
            </View>
          </View>
        </View>
        <View style={styles.badgeRow}>
          {isPremium && <View testID="premium-badge" style={styles.premiumBadge}><Text style={styles.premiumBadgeText}>{isSubscribed ? "★ PREMIUM" : user?.skool_verified ? "✓ SKOOL" : "★ FOUNDER"}</Text></View>}
          {user?.is_admin && <Pressable testID="admin-entry" onPress={() => router.push("/admin")} style={styles.adminBtn}><Text style={styles.adminBtnText}>⚙ ADMIN</Text></Pressable>}
          {!lite && <Pressable testID="store-entry" onPress={() => router.push("/store")} style={styles.storeBtn}><Text style={styles.storeBtnText}>🛒 STORE</Text></Pressable>}
        </View>
      </LinearGradient>

      {!lite && champion && (
        <Pressable testID="reigning-champion" onPress={() => setSpotId(champion.user_id)} style={styles.champCard}>
          <View style={styles.champAvatar}><PlayerAvatar person={champion} token={token} size={56} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.champEyebrow}>👑 REIGNING CHAMPION · {fmtSeason(champion.season)}</Text>
            <Text style={styles.champName} numberOfLines={1}>{champion.display_name}</Text>
            <Text style={styles.champMeta}>{champion.bosses} boss{champion.bosses === 1 ? "" : "es"} slain · {(champion.rank || "").toUpperCase()}</Text>
            <Text style={styles.champHint}>Dethrone them this season →</Text>
          </View>
          <Text style={styles.champTrophy}>🏆</Text>
        </Pressable>
      )}

      {!lite && featured.length > 0 && (
        <>
          <HudSectionHeader label="★ SPOTLIGHT" />
          {featured.map((f) => (
            <Pressable key={f.user_id} testID={`spotlight-${f.user_id}`} onPress={() => setSpotId(f.user_id)} style={styles.spotCard}>
              <View style={styles.spotHeadRow}>
                <View style={styles.spotDot} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.spotName}>{f.display_name} <Text style={styles.spotRank}>· {(f.rank || "").toUpperCase()}</Text></Text>
                  {!!f.reason && <Text style={styles.spotReason}>{f.reason}</Text>}
                </View>
                <Text style={styles.spotChevron}>›</Text>
              </View>
              {f.media_id && (
                <SpotlightMedia uri={`${API}/api/chat/media/${f.media_id}?token=${token}`} type={f.media_type} />
              )}
            </Pressable>
          ))}
        </>
      )}

      <HudSectionHeader label="ROOMS" />
      <Pressable testID="open-athletes-center" onPress={() => router.push("/athletes-center")} style={[styles.ctaCard, !canAthletesCenter && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>{`ATHLETE'S CENTER ${canAthletesCenter ? "" : "🔒"}`}</Text>
          <Text style={styles.ctaSub}>AI-built custom programs · Advanced+</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>

      {!lite && (
      <Pressable testID="open-the-room" onPress={() => router.push("/the-room")} style={[styles.ctaCard, !canRoom && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>THE ROOM {canRoom ? "" : "🔒"}</Text>
          <Text style={styles.ctaSub}>Elite-only encrypted chatroom · Elite+</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>
      )}

      <Pressable testID="open-gyms-map" onPress={() => router.push("/gyms-map")} style={styles.ctaCard}>
        <View>
          <Text style={styles.ctaTitle}>GYM MAP</Text>
          <Text style={styles.ctaSub}>Find training spots & real gyms near you · check-ins</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>

      <Pressable testID="open-diet-health" onPress={() => router.push("/diet-health")} style={styles.ctaCard}>
        <View>
          <Text style={styles.ctaTitle}>DIET & HEALTH</Text>
          <Text style={styles.ctaSub}>Conditioning, steps & daily fuel · macros</Text>
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

      {(user?.is_admin || user?.inperson_client) && (
        <Pressable testID="open-inperson" onPress={() => router.push("/inperson")} style={styles.inpersonCta}>
          <View style={{ flex: 1 }}>
            <Text style={styles.inpersonTitle}>🏋 IN-PERSON COACHING ROOM</Text>
            <Text style={styles.ctaSub}>{user?.is_admin ? "Chat, files & assigned workouts for your in-person clients" : "Private room with Coach Hutch · plans, files & chat"}</Text>
          </View>
          {ipUnread > 0 ? <View style={styles.ipBadge}><Text style={styles.ipBadgeText}>{ipUnread}</Text></View> : <Text style={styles.ctaArrow}>▶</Text>}
        </Pressable>
      )}

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

      {!lite && (
      <Pressable testID="open-pr-room" onPress={() => router.push("/pr-room")} style={[styles.ctaCard, !canJudge && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>PR ROOM {canJudge ? "" : "🔒"}</Text>
          <Text style={styles.ctaSub}>Post PRs · AI coach breakdown + member hype · Members</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>
      )}

      {!lite && (
      <Pressable testID="open-form-lab" onPress={() => router.push("/form-lab")} style={[styles.ctaCard, !canJudge && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>FORM LAB {canJudge ? "" : "🔒"}</Text>
          <Text style={styles.ctaSub}>Form checks · AI + member technique critiques · Members</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>
      )}

      {!lite && (
      <Pressable testID="open-judge" onPress={() => router.push("/judge")} style={[styles.ctaCard, !canJudge && styles.locked]}>
        <View>
          <Text style={styles.ctaTitle}>THE JUDGE {canJudge ? "" : "🔒"}</Text>
          <Text style={styles.ctaSub}>AI physique scoring + member critiques · Members</Text>
        </View>
        <Text style={styles.ctaArrow}>▶</Text>
      </Pressable>
      )}

      {!lite && (
      <Pressable testID="open-enhanced" onPress={() => router.push("/enhanced")} style={styles.enhancedCta}>
        <View style={{ flex: 1 }}>
          <Text style={styles.enhancedTitle}>☣ THE ENHANCED {user?.enhanced ? "· ENTER" : "· 20+ · MEMBERS"}</Text>
          <Text style={styles.enhancedSub}>PED/peptide protocol tracker + discussion · Not medical advice</Text>
        </View>
        <Text style={styles.enhancedArrow}>▶</Text>
      </Pressable>
      )}

      {!lite && user?.enhanced && nextDose?.active && (
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

      {!lite && !isPremium && (
        <Pressable testID="open-paywall" onPress={() => router.push("/paywall")} style={styles.premiumCta}>
          <Text style={styles.premiumCtaText}>UNLOCK PREMIUM · $5/mo</Text>
          <Text style={styles.premiumCtaSub}>Chatrooms + AI Programming</Text>
        </Pressable>
      )}
      </ScrollView>
      <MemberSheet userId={spotId} visible={!!spotId} onClose={() => setSpotId(null)} />
    </View>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "transparent" },
  bgArt: { position: "absolute", top: 0, left: 0, right: 0, height: 520 },
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: "rgba(0,85,255,0.35)" },
  hudBtnCenter: { borderColor: colors.brandPrimary, backgroundColor: "rgba(0,85,255,0.28)" },
  questPop: { position: "absolute", right: 12, zIndex: 80, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(255,122,24,0.95)", borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9, shadowColor: "#FF7A18", shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: 8 },
  questPopText: { color: "#fff", fontWeight: "900", fontSize: 12, letterSpacing: 0.5 },
  questPopX: { color: "rgba(255,255,255,0.85)", fontWeight: "900", fontSize: 13 },
  hudBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, backgroundColor: "rgba(0,42,85,0.5)" },
  hudBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  header: { paddingHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.md },
  digestCard: { flexDirection: "row", alignItems: "center", marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  digestUp: { borderColor: colors.success, backgroundColor: "rgba(0,229,180,0.06)" },
  digestDown: { borderColor: colors.warning, backgroundColor: "rgba(245,197,66,0.06)" },
  digestLabel: { color: colors.textDim, fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  digestText: { color: colors.text, fontSize: 13, fontWeight: "700", marginTop: 3, lineHeight: 18 },
  digestX: { paddingHorizontal: 6, paddingVertical: 2 },
  digestXText: { color: colors.textDim, fontWeight: "900", fontSize: 14 },
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
  badgeRow: { flexDirection: "row", marginTop: spacing.md, gap: spacing.sm, flexWrap: "wrap" },
  premiumBadge: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colors.warning },
  premiumBadgeText: { color: "#332200", fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  adminBtn: { backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12 },
  adminBtnText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  storeBtn: { backgroundColor: "rgba(255,234,0,0.1)", borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill, paddingVertical: 5, paddingHorizontal: 12 },
  storeBtnText: { color: colors.warning, fontWeight: "900", fontSize: 11, letterSpacing: 2 },
  spotCard: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.06)" },
  spotHeadRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  champCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginHorizontal: spacing.lg, marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: "#FFD700", backgroundColor: "rgba(255,215,0,0.08)" },
  champAvatar: { width: 58, height: 58, borderRadius: radius.md, borderWidth: 2, borderColor: "#FFD700", alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: colors.surface },
  champEyebrow: { color: "#FFD700", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  champName: { color: colors.text, fontSize: 17, fontWeight: "900", marginTop: 2 },
  champMeta: { color: colors.textMid, fontSize: 11, fontWeight: "700", marginTop: 1 },
  champHint: { color: "#FFD700", fontSize: 10, fontWeight: "800", marginTop: 3 },
  champTrophy: { fontSize: 28 },
  spotDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.warning },
  spotName: { color: colors.text, fontWeight: "900", fontSize: 14 },
  spotRank: { color: colors.textDim, fontWeight: "700", fontSize: 11 },
  spotReason: { color: colors.warning, fontSize: 12, marginTop: 2, lineHeight: 16 },
  spotChevron: { color: colors.textDim, fontSize: 22, fontWeight: "300" },
  grid: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md, flexWrap: "wrap" },
  statCard: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, minWidth: 90 },
  statLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  statValue: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 4 },
  sectionTitle: { color: colors.text, fontSize: 14, letterSpacing: 4, fontWeight: "800", paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  prCard: { width: "48%", backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  prLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 3, fontWeight: "800" },
  prValue: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 4 },
  ctaCard: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inpersonCta: { marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.lg, backgroundColor: "rgba(0,229,255,0.06)", borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  inpersonTitle: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 14 },
  ipBadge: { minWidth: 24, height: 24, borderRadius: 12, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 7 },
  ipBadgeText: { color: "#fff", fontWeight: "900", fontSize: 12 },
  ctaTitle: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 15 },
  ctaSub: { color: colors.textDim, fontSize: 11, marginTop: 4, letterSpacing: 1 },
  ctaArrow: { color: colors.brandPrimary, fontSize: 18 },
  levelStatsRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.sm },
  levelStat: { color: colors.text, fontSize: 12, fontWeight: "900", letterSpacing: 0.5, fontVariant: ["tabular-nums"] },
  levelStatLbl: { color: colors.textDim, fontSize: 10, fontWeight: "700" },
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
