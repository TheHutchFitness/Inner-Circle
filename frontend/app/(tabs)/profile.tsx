import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, avatarFor, avatarImage, hasAvatarArt, AVATARS, RANK_COLORS, fmtWeight, frameFor, CLASS_TIER_COLORS, CARD_FRAMES, rankIndex, loadoutTitle } from "@/src/lib/theme";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";
import { StrengthChart } from "@/src/components/StrengthChart";
import { RadarChart } from "@/src/components/RadarChart";
import { HudSectionHeader } from "@/src/components/Hud";
import { HealthCard } from "@/src/components/HealthCard";
import { NutritionCard } from "@/src/components/NutritionCard";
import { SocialLinksEditor } from "@/src/components/SocialLinks";
import { FoundingRibbon, CreatorBadge } from "@/src/components/Badges";
import { SwipeTabs } from "@/src/components/SwipeTabs";

const LIFT_TABS = [["BENCH", "bench"], ["SQUAT", "squat"], ["DEAD", "deadlift"], ["OHP", "ohp"]];

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { user, token, refresh, signOut } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [frameOpen, setFrameOpen] = useState(false);
  const [unlockedFrames, setUnlockedFrames] = useState<string[]>([]);
  const [chart, setChart] = useState<any>(null);
  const [attrs, setAttrs] = useState<any>(null);
  const [liftTab, setLiftTab] = useState("bench");
  const [showStats, setShowStats] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const cardRef = useRef<View>(null);

  const shimmer = useSharedValue(0);
  useEffect(() => { shimmer.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, true); }, []);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: 0.35 + shimmer.value * 0.5 }));

  useEffect(() => {
    (async () => {
      try { setChart(await apiFetch(token, "/api/progress/chart")); } catch {}
      try { setAttrs(await apiFetch(token, "/api/profile/attributes")); } catch {}
    })();
  }, [token, user?.xp]);

  if (!user) return null;
  const av = avatarFor(user.avatar_id);
  const rank = user.rank || "Beginner";
  const rankColor = RANK_COLORS[rank];
  const portrait = avatarImage(user.avatar_id, user.sex);
  const bossFrameUnlocked = (user.extra_unlocks || []).includes("frame_boss");
  const frame = CARD_FRAMES[user.active_frame]
    || ((bossFrameUnlocked && rankIndex(rank) < 5) ? CARD_FRAMES.Boss : frameFor(rank));

  const openFrames = async () => {
    setFrameOpen(true);
    try { const r = await apiFetch(token, "/api/profile/frames"); setUnlockedFrames(r.unlocked || []); } catch {}
  };
  const pickFrame = async (f: string) => {
    try { await apiFetch(token, "/api/profile/set-frame", { method: "POST", body: JSON.stringify({ frame: f }) }); await refresh(); } catch {}
    setFrameOpen(false);
  };
  const tierColor = CLASS_TIER_COLORS[attrs?.class_tier] || rankColor;
  const totalLift = (user.prs?.bench || 0) + (user.prs?.squat || 0) + (user.prs?.deadlift || 0) + (user.prs?.ohp || 0);

  const pickAvatar = async (avatar_id: string) => {
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ avatar_id }) });
      await refresh();
    } catch {}
    setAvatarOpen(false);
  };

  const shareCard = async () => {
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } catch { setMsg("Sharing unavailable here — try on a device."); }
  };

  return (
    <SwipeTabs current="profile">
    <ScrollView style={{ flex: 1, backgroundColor: colors.surface }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
      <View style={styles.topRow}>
        <Text style={styles.hudTag}>⌁ PLAYER CARD</Text>
        <Pressable testID="open-settings" onPress={() => router.push("/settings")} style={styles.gearBtn}><Text style={styles.gearText}>⚙ CONFIG</Text></Pressable>
      </View>

      {/* PLAYER CARD */}
      <View style={styles.cardOuter}>
        <Animated.View style={[styles.cardGlow, { shadowColor: rankColor }, shimmerStyle]} />
        <Pressable testID="change-avatar" onPress={() => setAvatarOpen(true)}>
          <View ref={cardRef} collapsable={false} style={styles.cardWrap}>
            <LinearGradient colors={frame.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { borderColor: frame.border }]}>
              {/* corner brackets */}
              <View style={[styles.corner, styles.tl, { borderColor: frame.border }]} />
              <View style={[styles.corner, styles.tr, { borderColor: frame.border }]} />
              <View style={[styles.corner, styles.bl, { borderColor: frame.border }]} />
              <View style={[styles.corner, styles.br, { borderColor: frame.border }]} />

              <View style={styles.cardHeaderRow}>
                <Text style={[styles.rankStamp, { color: rankColor, borderColor: rankColor }]}>{rank.toUpperCase()}</Text>
                <Text style={styles.lvlStamp}>LV {user.level}</Text>
              </View>

              <View style={[styles.portraitWrap, user.founder_backer && styles.portraitBacker]}>
                {user.use_photo && user.photo_media_id ? (
                  <Image source={{ uri: `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/chat/media/${user.photo_media_id}?token=${token}` }} style={styles.portrait} contentFit="cover" />
                ) : portrait ? (
                  <Image source={portrait} style={styles.portrait} contentFit="cover" />
                ) : (
                  <View style={styles.portraitFallback}><Text style={styles.portraitEmoji}>{av.emoji}</Text></View>
                )}
                <LinearGradient colors={["transparent", "transparent", "rgba(5,5,8,0.95)"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
                <View style={styles.holoLine} pointerEvents="none" />
                {user.founder_backer && (
                  <View style={styles.backerRibbon}><Text style={styles.backerRibbonText}>★ FOUNDING BACKER</Text></View>
                )}
              </View>
              {!!loadoutTitle(user.loadout) && (
                <Text style={styles.loadoutTitle}>❰ {loadoutTitle(user.loadout)} ❱</Text>
              )}

              <View style={styles.namePlate}>
                <Text style={styles.playerName}>{user.display_name?.toUpperCase()}</Text>
                <View style={styles.classRow}>
                  <View style={[styles.tierBadge, { borderColor: tierColor }]}>
                    <Text style={[styles.tierText, { color: tierColor }]}>{attrs?.class_tier || "—"}</Text>
                  </View>
                  <Text style={[styles.playerClass, { color: rankColor }]}>{attrs?.class_title || `${av.label.toUpperCase()} CLASS`}</Text>
                </View>
                <Pressable testID="open-frame-vault" onPress={openFrames}><Text style={styles.frameName}>◈ {frame.name}  ▾</Text></Pressable>
                <View style={styles.pillRow}>
                  {isSubscribed && <View style={[styles.pill, { backgroundColor: colors.warning }]}><Text style={styles.pillText}>★ PREMIUM</Text></View>}
                  {user.skool_verified && <View style={[styles.pill, { backgroundColor: colors.success }]}><Text style={styles.pillText}>✓ SKOOL</Text></View>}
                  {user.founder_backer && <View style={[styles.pill, { backgroundColor: colors.warning }]}><Text style={styles.pillText}>★ FOUNDING BACKER</Text></View>}
                </View>
                {/* mini stat bars */}
                <View style={styles.barsRow}>
                  <StatBar label="PWR" value={Math.min(1, totalLift / 2000)} color={rankColor} />
                  <StatBar label="XP" value={user.level ? (user.xp % 250) / 250 : 0} color={colors.brandPrimary} />
                  <StatBar label="LOGS" value={Math.min(1, (user.workouts_logged || 0) / 100)} color={colors.success} />
                </View>
              </View>
            </LinearGradient>
          </View>
        </Pressable>
        <Text style={styles.tapHint}>TAP THE CARD TO SWITCH YOUR CLASS</Text>
        {user.is_founder && <FoundingRibbon number={user.founder_number} />}
        {(user.social_tiktok || user.social_instagram) && (
          <View style={styles.creatorWrap}><CreatorBadge /></View>
        )}
      </View>

      {/* SOCIAL LINKS — TikTok / Instagram (shown on your card + others') */}
      <SocialLinksEditor
        token={token}
        tiktok={user.social_tiktok}
        instagram={user.social_instagram}
        onSaved={refresh}
      />

      {/* COMBAT STATS RADAR */}
      <HudSectionHeader label="COMBAT STATS" />
      <View style={styles.radarCard}>
        <View style={styles.radarClassRow}>
          <Text style={styles.radarClassTitle}>{attrs?.class_title || "—"}</Text>
          <View style={[styles.tierBadgeLg, { borderColor: tierColor }]}>
            <Text style={[styles.tierTextLg, { color: tierColor }]}>{attrs?.class_tier || "—"}-CLASS</Text>
          </View>
        </View>
        <RadarChart stats={attrs?.stats} color={rankColor} size={230} />
        <Text style={styles.radarNote}>Overall {attrs?.overall ?? 0}/100 · Top {100 - (attrs?.app_percentile ?? 50)}% in-app · vs global lift standards</Text>
      </View>

      {/* STATS / SHARE actions */}
      <View style={styles.actionRow}>
        <Pressable testID="toggle-stats" onPress={() => setShowStats((s) => !s)} style={[styles.actionBtn, showStats && styles.actionBtnActive]}>
          <Text style={[styles.actionText, showStats && styles.actionTextActive]}>▤ STATS</Text>
        </Pressable>
        <Pressable testID="share-card" onPress={shareCard} style={styles.actionBtn}>
          <Text style={styles.actionText}>⇪ SHARE</Text>
        </Pressable>
      </View>
      {msg && <Text style={styles.msg}>{msg}</Text>}

      {/* CONDITIONING — steps, heart rate, sprints */}
      <HudSectionHeader label="CONDITIONING" />
      <HealthCard token={token} onChange={() => { (async () => { try { setAttrs(await apiFetch(token, "/api/profile/attributes")); } catch {} })(); }} />
      <NutritionCard />

      {showStats && (
        <>
          <View style={styles.infoGrid}>
            <View style={styles.info}><Text style={styles.infoL}>BODYWEIGHT</Text><Text style={styles.infoV}>{user.bodyweight_lb} lb</Text></View>
            <View style={styles.info}><Text style={styles.infoL}>AGE</Text><Text style={styles.infoV}>{user.age}</Text></View>
            <View style={styles.info}><Text style={styles.infoL}>TOTAL</Text><Text style={styles.infoV}>{totalLift}</Text></View>
            <View style={styles.info}><Text style={styles.infoL}>STREAK</Text><Text style={styles.infoV}>{user.streak_days}d</Text></View>
          </View>

          <Text style={styles.genderLabel}>GENDER · CHANGES YOUR AVATARS & BACKGROUNDS</Text>
          <View style={styles.genderRow}>
            {([["male", "MALE"], ["female", "FEMALE"], ["other", "PREFER NOT"]] as const).map(([v, lbl]) => (
              <Pressable
                key={v}
                testID={`profile-sex-${v}`}
                onPress={async () => { try { await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ sex: v }) }); await refresh(); } catch {} }}
                style={[styles.genderBtn, (user.sex || "male") === v && styles.genderBtnActive]}
              >
                <Text style={[styles.genderText, (user.sex || "male") === v && styles.genderTextActive]}>{lbl}</Text>
              </Pressable>
            ))}
          </View>

          <HudSectionHeader label="PR VAULT" />
          <View style={styles.grid}>
            {[["BENCH", "bench"], ["SQUAT", "squat"], ["DEADLIFT", "deadlift"], ["OHP", "ohp"]].map(([label, key]) => (
              <View key={key} style={styles.prCard}>
                <View style={[styles.prAccent, { backgroundColor: rankColor }]} />
                <Text style={styles.prLabel}>{label}</Text>
                <Text style={styles.prValue}>{fmtWeight(user.prs?.[key] || 0)}</Text>
              </View>
            ))}
          </View>

          <HudSectionHeader label="STRENGTH CURVE" />
          <View style={styles.chartCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chartTabs}>
              {LIFT_TABS.map(([label, key]) => (
                <Pressable testID={`chart-tab-${key}`} key={key} onPress={() => setLiftTab(key)} style={[styles.chartChip, liftTab === key && styles.chartChipActive]}>
                  <Text style={[styles.chartChipText, liftTab === key && styles.chartChipTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <StrengthChart data={chart?.[liftTab] || []} color={rankColor} />
          </View>

          <HudSectionHeader label="MILESTONE BADGES" />
          <View style={styles.badgeGrid}>
            {(user.badges || []).length === 0 ? (
              <Text style={styles.emptyBadges}>Hit 135, 225, 315+ to earn badges.</Text>
            ) : (
              (user.badges || []).map((b: string) => (
                <View key={b} style={styles.badgeCard}><Text style={styles.badgeText}>{b.replace("_", " ").toUpperCase()}</Text></View>
              ))
            )}
          </View>
        </>
      )}

      <Pressable testID="open-loadout" onPress={() => router.push("/loadout")} style={styles.linkBtn}>
        <Text style={styles.linkText}>◆ LOCKER — PHOTO, FRAMES & GEAR</Text>
      </Pressable>
      <Pressable testID="open-paywall-profile" onPress={() => router.push("/paywall")} style={styles.linkBtn}>
        <Text style={styles.linkText}>MANAGE PREMIUM</Text>
      </Pressable>
      <Pressable testID="open-purchases" onPress={() => router.push("/purchases")} style={styles.linkBtn}>
        <Text style={styles.linkText}>MY PURCHASES</Text>
      </Pressable>
      <Pressable testID="sign-out" onPress={signOut} style={[styles.linkBtn, { borderColor: colors.error }]}>
        <Text style={[styles.linkText, { color: colors.error }]}>SIGN OUT</Text>
      </Pressable>

      <Modal visible={avatarOpen} transparent animationType="fade" onRequestClose={() => setAvatarOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SELECT CLASS</Text>
            <ScrollView style={{ maxHeight: 420 }} contentContainerStyle={styles.avatarGrid}>
              {AVATARS.map((a) => {
                const img = avatarImage(a.id, user.sex);
                return (
                  <Pressable testID={`avatar-${a.id}`} key={a.id} onPress={() => pickAvatar(a.id)} style={[styles.avOpt, user.avatar_id === a.id && styles.avOptSel]}>
                    {img ? <Image source={img} style={styles.avImg} contentFit="cover" /> : <View style={styles.avEmojiWrap}><Text style={{ fontSize: 30 }}>{a.emoji}</Text></View>}
                    <Text style={styles.avOptLabel} numberOfLines={1}>{a.label}</Text>
                    {hasAvatarArt(a.id) && <View style={styles.artTag}><Text style={styles.artTagText}>ART</Text></View>}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setAvatarOpen(false)} style={styles.modalClose}><Text style={{ color: colors.textDim, letterSpacing: 2 }}>CLOSE</Text></Pressable>
          </View>
        </View>
      </Modal>

      <Modal visible={frameOpen} transparent animationType="fade" onRequestClose={() => setFrameOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>FRAME VAULT</Text>
            <Text style={{ color: colors.textDim, fontSize: 12, marginBottom: spacing.sm }}>Equip any frame you&apos;ve unlocked.</Text>
            <ScrollView style={{ maxHeight: 420 }}>
              {unlockedFrames.map((fk) => {
                const cf = CARD_FRAMES[fk];
                const activeKey = user.active_frame || frame.name;
                const isActive = (user.active_frame ? user.active_frame === fk : frame.name === cf.name);
                return (
                  <Pressable testID={`frame-${fk}`} key={fk} onPress={() => pickFrame(fk)} style={[styles.frameOpt, isActive && { borderColor: cf.border }]}>
                    <LinearGradient colors={cf.colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.frameSwatch, { borderColor: cf.border }]}>
                      <Text style={{ color: cf.glow, fontSize: 18 }}>◆</Text>
                    </LinearGradient>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.frameOptName}>{cf.name}</Text>
                      <Text style={styles.frameOptRank}>{fk.toUpperCase()} TIER</Text>
                    </View>
                    {isActive && <Text style={{ color: cf.border, fontWeight: "900" }}>✓</Text>}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable onPress={() => setFrameOpen(false)} style={styles.modalClose}><Text style={{ color: colors.textDim, letterSpacing: 2 }}>CLOSE</Text></Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </SwipeTabs>
  );
}

function StatBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.bar}>
      <Text style={styles.barLabel}>{label}</Text>
      <View style={styles.barTrack}><View style={[styles.barFill, { width: `${Math.max(4, value * 100)}%`, backgroundColor: color }]} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  hudTag: { color: colors.brandPrimary, letterSpacing: 3, fontSize: 12, fontWeight: "900" },
  gearBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, minHeight: 40, justifyContent: "center", borderRadius: radius.sm },
  gearText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 11 },
  cardOuter: { alignItems: "center", paddingHorizontal: spacing.lg },
  cardGlow: { position: "absolute", top: 10, width: "86%", height: "92%", borderRadius: radius.md, shadowOpacity: 0.9, shadowRadius: 24, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  cardWrap: { width: 300, borderRadius: radius.md, overflow: "hidden" },
  card: { width: "100%", padding: spacing.md, borderWidth: 2, borderColor: "rgba(0,229,255,0.4)", borderRadius: radius.md },
  corner: { position: "absolute", width: 18, height: 18, zIndex: 2 },
  tl: { top: 4, left: 4, borderTopWidth: 3, borderLeftWidth: 3 },
  tr: { top: 4, right: 4, borderTopWidth: 3, borderRightWidth: 3 },
  bl: { bottom: 4, left: 4, borderBottomWidth: 3, borderLeftWidth: 3 },
  br: { bottom: 4, right: 4, borderBottomWidth: 3, borderRightWidth: 3 },
  cardHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.sm },
  rankStamp: { fontSize: 12, fontWeight: "900", letterSpacing: 3, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.sm },
  lvlStamp: { color: colors.text, fontSize: 14, fontWeight: "900", letterSpacing: 1, fontVariant: ["tabular-nums"] },
  portraitWrap: { width: "100%", aspectRatio: 0.92, borderRadius: radius.sm, overflow: "hidden", backgroundColor: "#05070C", borderWidth: 1, borderColor: "rgba(0,229,255,0.25)" },
  portraitBacker: { borderWidth: 2.5, borderColor: colors.warning, shadowColor: colors.warning, shadowOpacity: 0.7, shadowRadius: 16, shadowOffset: { width: 0, height: 0 } },
  backerRibbon: { position: "absolute", top: 8, right: 8, backgroundColor: colors.warning, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.sm },
  backerRibbonText: { color: "#221900", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  loadoutTitle: { color: colors.warning, fontSize: 11, letterSpacing: 3, fontWeight: "800", textAlign: "center", marginTop: spacing.sm },
  portrait: { width: "100%", height: "100%" },
  portraitFallback: { flex: 1, alignItems: "center", justifyContent: "center" },
  portraitEmoji: { fontSize: 100 },
  holoLine: { position: "absolute", top: "45%", left: 0, right: 0, height: 2, backgroundColor: "rgba(0,229,255,0.25)" },
  namePlate: { marginTop: spacing.md },
  playerName: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1 },
  classRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 4 },
  tierBadge: { borderWidth: 2, width: 26, height: 26, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  tierText: { fontSize: 14, fontWeight: "900" },
  playerClass: { fontSize: 12, letterSpacing: 3, fontWeight: "900" },
  frameName: { color: colors.textDim, fontSize: 9, letterSpacing: 2, fontWeight: "700", marginTop: 4 },
  pillRow: { flexDirection: "row", gap: 6, marginTop: spacing.sm, flexWrap: "wrap" },
  pill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill },
  pillText: { color: "#001122", fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  barsRow: { marginTop: spacing.md, gap: 6 },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barLabel: { color: colors.textDim, fontSize: 9, fontWeight: "800", letterSpacing: 2, width: 34 },
  barTrack: { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%" },
  tapHint: { color: colors.textDim, fontSize: 10, letterSpacing: 2, marginTop: spacing.sm, fontWeight: "700" },
  creatorWrap: { alignItems: "center", marginTop: spacing.sm },
  radarCard: { marginHorizontal: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, alignItems: "center" },
  radarClassRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, marginBottom: spacing.sm },
  radarClassTitle: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 2 },
  tierBadgeLg: { borderWidth: 2, paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.sm },
  tierTextLg: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
  radarNote: { color: colors.textDim, fontSize: 10, letterSpacing: 1, marginTop: spacing.sm, textAlign: "center", paddingHorizontal: spacing.md },
  actionRow: { flexDirection: "row", gap: spacing.md, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  actionBtn: { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, backgroundColor: colors.surface2 },
  actionBtnActive: { backgroundColor: colors.brandTertiary },
  actionText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2 },
  actionTextActive: { color: colors.brandPrimary },
  msg: { color: colors.warning, textAlign: "center", marginTop: spacing.sm },
  infoGrid: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm },
  info: { flex: 1, minWidth: "45%", backgroundColor: colors.surface2, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  infoL: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "700" },
  infoV: { color: colors.text, fontSize: 18, fontWeight: "900", marginTop: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
  prCard: { width: "48%", backgroundColor: colors.surface2, borderRadius: radius.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  prAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 3 },
  prLabel: { color: colors.brandPrimary, fontSize: 11, letterSpacing: 3, fontWeight: "800" },
  prValue: { color: colors.text, fontSize: 20, fontWeight: "900", marginTop: 4 },
  chartCard: { marginHorizontal: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  chartTabs: { gap: spacing.sm, paddingBottom: spacing.md },
  chartChip: { paddingHorizontal: spacing.md, height: 32, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: colors.surface3, flexShrink: 0 },
  chartChipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chartChipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 11 },
  chartChipTextActive: { color: colors.brandPrimary },
  badgeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: spacing.lg },
  badgeCard: { backgroundColor: colors.brandTertiary, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6, borderWidth: 1, borderColor: colors.borderStrong },
  badgeText: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  emptyBadges: { color: colors.textDim, paddingHorizontal: spacing.lg },
  linkBtn: { marginTop: spacing.md, marginHorizontal: spacing.lg, padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm },
  linkText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 3 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", backgroundColor: colors.surface2, borderRadius: radius.md, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderStrong },
  modalTitle: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "900", textAlign: "center", marginBottom: spacing.md },
  avatarGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm },
  avOpt: { width: "30%", alignItems: "center", padding: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  avOptSel: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  avImg: { width: "100%", aspectRatio: 1, borderRadius: radius.sm },
  avEmojiWrap: { width: "100%", aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  avOptLabel: { color: colors.textMid, fontSize: 10, marginTop: 4, letterSpacing: 1, fontWeight: "700" },
  artTag: { position: "absolute", top: 8, right: 8, backgroundColor: colors.brandPrimary, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 3 },
  artTagText: { color: "#001122", fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  modalClose: { alignItems: "center", marginTop: spacing.lg },
  frameOpt: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.border, marginBottom: spacing.sm, backgroundColor: colors.surface2 },
  frameSwatch: { width: 42, height: 56, borderRadius: radius.sm, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  frameOptName: { color: colors.text, fontWeight: "900", letterSpacing: 1 },
  frameOptRank: { color: colors.textDim, fontSize: 10, letterSpacing: 2, marginTop: 2, fontWeight: "700" },
  genderLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800", marginTop: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.lg },
  genderRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  genderBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  genderBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  genderText: { color: colors.textDim, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  genderTextActive: { color: colors.brandPrimary },
});
