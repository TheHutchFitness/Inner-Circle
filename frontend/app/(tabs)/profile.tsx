import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, avatarFor, avatarImage, hasAvatarArt, AVATARS, HAIR_COLORS, BEARD_OPTIONS, defaultHair, RANK_COLORS, frameFor, CLASS_TIER_COLORS, CARD_FRAMES, rankIndex, loadoutTitle, bodyImage } from "@/src/lib/theme";
import { useResponsive, webCenter } from "@/src/lib/responsive";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";
import { StrengthChart } from "@/src/components/StrengthChart";
import { RadarChart } from "@/src/components/RadarChart";
import { HudSectionHeader } from "@/src/components/Hud";
import { SocialLinksEditor } from "@/src/components/SocialLinks";
import { FoundingRibbon, CreatorBadge, SeasonChampBadge } from "@/src/components/Badges";
import { PetCompanion } from "@/src/components/PetCompanion";
import { NeonButton } from "@/src/components/NeonButton";
import { NavButton } from "@/src/components/NavButton";
import { GearedAvatar } from "@/src/components/GearedAvatar";
import { SwipeTabs } from "@/src/components/SwipeTabs";
import { GymWatermark } from "@/src/components/GymWatermark";
import { BookingModal } from "@/src/components/BookingModal";
import { isLite } from "@/src/lib/mode";

const LIFT_TABS = [["BENCH", "bench"], ["SQUAT", "squat"], ["DEAD", "deadlift"], ["OHP", "ohp"]];

export default function Profile() {
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
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
  const [showBadges, setShowBadges] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [gymInput, setGymInput] = useState<string>("");
  const [gyms, setGyms] = useState<string[]>([]);
  const [gymEditing, setGymEditing] = useState(false);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [prs, setPrs] = useState<any>(null);
  const [gymRank, setGymRank] = useState<any>(null);
  const [myGroups, setMyGroups] = useState<any[]>([]);
  const cardRef = useRef<View>(null);
  const gymCardRef = useRef<View>(null);

  const shimmer = useSharedValue(0);
  useEffect(() => { shimmer.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, true); }, []);
  const shimmerStyle = useAnimatedStyle(() => ({ opacity: 0.35 + shimmer.value * 0.5 }));

  useEffect(() => {
    (async () => {
      try { setChart(await apiFetch(token, "/api/progress/chart")); } catch {}
      try { setAttrs(await apiFetch(token, "/api/profile/attributes")); } catch {}
      try { setPrs(await apiFetch(token, "/api/profile/prs")); } catch {}
      try { setGymRank(await apiFetch(token, "/api/profile/gym-rank")); } catch {}
      try { setMyGroups((await apiFetch(token, "/api/my-groups")).groups || []); } catch {}
      try { setGyms((await apiFetch(token, "/api/gyms")).gyms || []); } catch {}
    })();
  }, [token, user?.xp]);

  const loadBookings = async () => {
    try { setBookings((await apiFetch(token, "/api/inperson/bookings")).bookings || []); } catch {}
  };
  const acceptSession = async (id: string) => {
    try { await apiFetch(token, `/api/inperson/booking/${id}/accept`, { method: "POST" }); await loadBookings(); await refresh(); }
    catch (e: any) { setMsg(e?.message || "Could not accept"); }
  };
  useEffect(() => { if (user?.inperson_client) loadBookings(); }, [token, user?.inperson_client]);

  if (!user) return null;
  const av = avatarFor(user.avatar_id);
  const lite = isLite(user);
  const rank = user.rank || "Beginner";
  const rankColor = RANK_COLORS[rank];
  const portrait = bodyImage(user);
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
  };

  const pickHair = async (equipped_hair: string) => {
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ equipped_hair }) });
      await refresh();
    } catch {}
  };

  const pickBeard = async (equipped_beard: string) => {
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ equipped_beard }) });
      await refresh();
    } catch {}
  };

  const shareCard = async () => {
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } catch { setMsg("Sharing unavailable here — try on a device."); }
  };

  const shareGymRank = async () => {
    try {
      const uri = await captureRef(gymCardRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
      else setMsg("Sharing unavailable here — try on a device.");
    } catch { setMsg("Sharing unavailable here — try on a device."); }
  };

  const saveGym = async () => {
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ gym: gymInput.trim() }) });
      await refresh();
      setGymEditing(false);
      setMsg("Gym saved ✓");
    } catch (e: any) { setMsg(e?.message || "Failed to save gym"); }
  };

  const requestInperson = async () => {
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ inperson_request: true }) });
      await refresh();
      setMsg("Request sent — Coach Hutch will review it");
    } catch (e: any) { setMsg(e?.message || "Select your gym first"); }
  };

  return (
    <SwipeTabs current="profile">
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
    <GymWatermark />
    <ScrollView style={{ flex: 1, backgroundColor: "transparent" }} contentContainerStyle={[{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }, webCenter(isDesktop)]}>
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
                {(bodyImage(user)) ? (
                  <GearedAvatar person={user} style={styles.portrait} contentFit="cover" />
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
                  <Pressable testID="badges-tab" onPress={(e: any) => { e?.stopPropagation?.(); setShowBadges((s) => !s); }} style={[styles.badgesTab, showBadges && styles.badgesTabOn]}>
                    <Text style={[styles.badgesTabText, showBadges && styles.badgesTabTextOn]}>🏅 BADGES{(user.badges || []).length ? ` ${user.badges.length}` : ""}</Text>
                  </Pressable>
                </View>
                <Pressable testID="open-frame-vault" onPress={openFrames}><Text style={styles.frameName}>◈ {frame.name}  ▾</Text></Pressable>
                {user.equipped_pet && (
                  <View style={styles.petRow}>
                    <PetCompanion pet={user.equipped_pet} size={34} />
                    <Text style={styles.petName}>{user.equipped_pet.name}</Text>
                  </View>
                )}
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
                <View style={styles.cardStatsRow}>
                  <View style={styles.cardStat}><Text style={styles.cardStatV}>{user.bodyweight_lb}</Text><Text style={styles.cardStatL}>BW LB</Text></View>
                  <View style={styles.cardStat}><Text style={styles.cardStatV}>{user.age}</Text><Text style={styles.cardStatL}>AGE</Text></View>
                  <View style={styles.cardStat}><Text style={styles.cardStatV}>{totalLift}</Text><Text style={styles.cardStatL}>TOTAL</Text></View>
                  <View style={styles.cardStat}><Text style={styles.cardStatV}>{user.streak_days}d</Text><Text style={styles.cardStatL}>STREAK</Text></View>
                </View>
                {/* COMBAT STATS — compact radar built into the card */}
                <View style={styles.cardRadarInline}>
                  <RadarChart stats={attrs?.stats} color={rankColor} size={130} />
                  <View style={styles.ovrPill}><Text style={styles.ovrPillText}>OVR {attrs?.overall ?? 0}</Text></View>
                </View>
              </View>
            </LinearGradient>
          </View>
        </Pressable>
        <Text style={styles.tapHint}>TAP THE CARD TO CHANGE YOUR AVATAR</Text>
        {showBadges && (
          <View style={styles.badgesPanel}>
            <Text style={styles.badgesPanelLabel}>MILESTONE BADGES</Text>
            <View style={styles.badgeGrid}>
              {(user.badges || []).length === 0 ? (
                <Text style={styles.emptyBadges}>Hit 135, 225, 315+ to earn badges.</Text>
              ) : (
                (user.badges || []).map((b: string) => (
                  <View key={b} style={styles.badgeCard}><Text style={styles.badgeText}>{b.replace("_", " ").toUpperCase()}</Text></View>
                ))
              )}
            </View>
          </View>
        )}
        {user.is_founder && <FoundingRibbon number={user.founder_number} />}
        <SeasonChampBadge seasons={user.season_champ_titles} />
        {(user.social_tiktok || user.social_instagram || user.social_youtube) && (
          <View style={styles.creatorWrap}><CreatorBadge /></View>
        )}
      </View>

      {/* SOCIAL LINKS — TikTok / Instagram / YouTube (shown on your card + others') */}
      <SocialLinksEditor
        token={token}
        tiktok={user.social_tiktok}
        instagram={user.social_instagram}
        youtube={user.social_youtube}
        onSaved={refresh}
      />

      {/* STATS / SHARE actions */}
      <View style={styles.actionRow}>
        <Pressable testID="share-card" onPress={shareCard} style={styles.actionBtn}>
          <Text style={styles.actionText}>⇪ SHARE</Text>
        </Pressable>
      </View>
      {msg && <Text style={styles.msg}>{msg}</Text>}

      {/* PERSONAL RECORDS — big lift bests + recent PR feed */}
      {prs && (
        <>
          <HudSectionHeader label="PERSONAL RECORDS" />
          <View style={styles.prTiles}>
            {([["squat", "SQUAT"], ["bench", "BENCH"], ["deadlift", "DEADLIFT"], ["ohp", "OHP"]] as const).map(([k, lbl]) => (
              <View key={k} style={styles.prTile}>
                <Text style={styles.prValue}>{prs.bests?.[k] || 0}</Text>
                <Text style={styles.prUnit}>lb</Text>
                <Text style={styles.prLabel}>{lbl}</Text>
              </View>
            ))}
          </View>
          <View style={styles.prTotalRow}>
            <Text style={styles.prTotalLabel}>BIG 4 TOTAL</Text>
            <Text style={styles.prTotalValue}>{prs.bests?.total || 0} lb</Text>
          </View>
          {(prs.recent?.length || 0) > 0 && (
            <View style={styles.prFeed}>
              <Text style={styles.prFeedLabel}>RECENT PRs</Text>
              {prs.recent.map((r: any, i: number) => (
                <View key={i} style={styles.prFeedRow}>
                  <Text style={styles.prFeedIcon}>🏆</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.prFeedName}>{r.name} · {r.weight} lb</Text>
                    <Text style={styles.prFeedMeta}>+{Math.max(0, r.weight - r.previous)} lb over previous · {new Date(r.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
        </>
      )}

      {/* MY GROUP — clans the athlete belongs to */}
      <HudSectionHeader label="MY GROUPS" />
      <View style={{ paddingHorizontal: spacing.lg }}>
        {myGroups.length === 0 ? (
          <Pressable testID="find-groups" onPress={() => router.push("/(tabs)/community")} style={styles.groupEmptyBtn}>
            <Text style={styles.groupEmptyText}>🛡 You're not in a group yet — find one in Social → Groups</Text>
          </Pressable>
        ) : (
          myGroups.map((g) => (
            <Pressable key={g.id} testID={`my-group-${g.id}`} onPress={() => router.push("/(tabs)/community")} style={styles.myGroupCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.myGroupName}>🛡 {g.name}{g.role === "creator" ? " 👑" : ""}</Text>
                <Text style={styles.myGroupMeta}>◈ Level {g.level} · {g.member_count} member{g.member_count === 1 ? "" : "s"}</Text>
              </View>
              <Text style={styles.gcArrow}>›</Text>
            </Pressable>
          ))
        )}
      </View>

      {/* MY GYM — association + in-person coaching request */}
      <HudSectionHeader label="MY GYM" />
      <View style={styles.gymCard}>
        {gymEditing ? (
          <>
            <TextInput
              testID="gym-input"
              value={gymInput}
              onChangeText={setGymInput}
              placeholder="Enter your gym name…"
              placeholderTextColor={colors.textDim}
              style={styles.gymInput}
              autoCapitalize="words"
            />
            {gyms.length > 0 && (
              <View style={styles.gymChips}>
                {gyms
                  .filter((g) => !gymInput.trim() || g.toLowerCase().includes(gymInput.trim().toLowerCase()))
                  .slice(0, 6)
                  .map((g) => (
                    <Pressable key={g} testID={`profile-gym-chip-${g}`} onPress={() => setGymInput(g)} style={styles.gymChip}>
                      <Text style={styles.gymChipText}>{g}</Text>
                    </Pressable>
                  ))}
              </View>
            )}
            <View style={styles.gymBtnRow}>
              <Pressable testID="gym-save" onPress={saveGym} style={styles.gymSaveBtn}><Text style={styles.gymSaveText}>SAVE</Text></Pressable>
              <Pressable testID="gym-cancel" onPress={() => setGymEditing(false)} style={styles.gymCancelBtn}><Text style={styles.gymCancelText}>CANCEL</Text></Pressable>
            </View>
          </>
        ) : (
          <View style={styles.gymViewRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.gymName}>{user.inperson_gym ? user.inperson_gym : "No gym set"}</Text>
              <Text style={styles.gymHint}>{user.inperson_gym ? "You're associated with this gym" : "Add your gym to unlock in-person coaching"}</Text>
            </View>
            <Pressable testID="gym-edit" onPress={() => { setGymInput(user.inperson_gym || ""); setGymEditing(true); }} style={styles.gymEditBtn}>
              <Text style={styles.gymEditText}>{user.inperson_gym ? "EDIT" : "ADD"}</Text>
            </Pressable>
          </View>
        )}

        {!!gymRank && gymRank.rank > 0 && (
          <>
            <View ref={gymCardRef} collapsable={false} style={[styles.gymRankCard, gymRank.rank === 1 && styles.gymRankCardTop]}>
              <Text style={styles.gymRankBrand}>THE CIRCLE</Text>
              <Text style={[styles.gymRankBig, gymRank.rank === 1 && { color: colors.warning }]}>{gymRank.rank === 1 ? "🏆 #1" : `#${gymRank.rank}`}</Text>
              <Text style={styles.gymRankLabel}>{gymRank.rank === 1 ? "TOP LIFTER AT" : "RANKED AT"}</Text>
              <Text style={styles.gymRankGym}>📍 {gymRank.gym}</Text>
              <Text style={styles.gymRankMeta}>Big 4 Total · {gymRank.big4} lb · {gymRank.members} member{gymRank.members === 1 ? "" : "s"}</Text>
              <Text style={styles.gymRankFooter}>{user.display_name}</Text>
            </View>
            <Pressable testID="share-gym-rank" onPress={shareGymRank} style={styles.gymShareBtn}>
              <Text style={styles.gymShareText}>📢 SHARE MY GYM RANK</Text>
            </Pressable>
          </>
        )}

        {user.inperson_client ? (
          <View style={[styles.ipStatus, { borderColor: colors.success }]}>
            <Text style={[styles.ipStatusText, { color: colors.success }]}>✓ ENROLLED · IN-PERSON CLIENT</Text>
          </View>
        ) : user.inperson_request ? (
          <View style={[styles.ipStatus, { borderColor: colors.warning }]}>
            <Text style={[styles.ipStatusText, { color: colors.warning }]}>⏳ REQUEST PENDING APPROVAL</Text>
          </View>
        ) : !user.coaching_available ? (
          <View style={[styles.ipStatus, { borderColor: colors.border }]}>
            <Text style={[styles.ipStatusText, { color: colors.textDim }]}>{user.inperson_gym ? "This gym doesn't offer in-person coaching yet" : "Set a gym that offers coaching to request it"}</Text>
          </View>
        ) : (
          <NeonButton
            testID="request-inperson"
            onPress={requestInperson}
            disabled={!user.inperson_gym}
            label="🏋 REQUEST IN-PERSON COACHING"
          />
        )}

        {user.inperson_client && (
          <>
            <NeonButton testID="profile-request-session" onPress={() => { setRescheduleId(null); setBookingOpen(true); }} label="📅 REQUEST A TRAINING SESSION" variant="orangeBlue" style={{ marginTop: spacing.sm }} />
            {bookings.filter((b) => b.status === "approved" || b.status === "pending").length > 0 && (
              <View style={styles.bookingList}>
                {bookings.filter((b) => b.status === "approved" || b.status === "pending").slice(0, 5).map((b) => (
                  <Pressable
                    key={b.id}
                    testID={`profile-booking-${b.id}`}
                    disabled={b.status !== "approved"}
                    onPress={() => { setRescheduleId(b.id); setBookingOpen(true); }}
                    style={styles.bookingRow}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bookingDate}>{b.date} · {b.time}</Text>
                      {b.status === "approved" && <Text style={styles.bookingHint}>tap to reschedule</Text>}
                      {b.status === "pending" && b.proposed_by === "coach" && <Text style={styles.bookingHint}>coach proposed a new time</Text>}
                      {b.status === "approved" && !!b.coach_note && <Text style={styles.bookingCoachNote}>📝 {b.coach_note}</Text>}
                    </View>
                    {b.status === "pending" && b.proposed_by === "coach" ? (
                      <Pressable testID={`profile-accept-${b.id}`} onPress={() => acceptSession(b.id)} style={styles.acceptBtn}>
                        <Text style={styles.acceptText}>ACCEPT</Text>
                      </Pressable>
                    ) : (
                      <View style={[styles.bookingPill, b.status === "approved" ? styles.bookingApproved : styles.bookingPending]}>
                        <Text style={[styles.bookingPillText, { color: b.status === "approved" ? colors.success : colors.warning }]}>{b.status === "approved" ? "✓ CONFIRMED" : "PENDING"}</Text>
                      </View>
                    )}
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      <View style={styles.navGroup}>
        {!lite && <NavButton testID="open-loadout" onPress={() => router.push("/loadout")} icon="◆" label="INVENTORY — GEAR & FRAMES" tone="blue" />}
        {!lite && <NavButton testID="open-armory" onPress={() => router.push("/gear")} icon="⚔" label="THE ARMORY — SKINS & WEAPONS" tone="gold" />}
        {!lite && <NavButton testID="open-paywall-profile" onPress={() => router.push("/paywall")} icon="★" label="MANAGE PREMIUM" tone="gold" />}
        <NavButton testID="open-purchases" onPress={() => router.push("/purchases")} icon="🧾" label="MY PURCHASES" tone="blue" />
        <NavButton testID="sign-out" onPress={signOut} icon="⏻" label="SIGN OUT" tone="red" />
      </View>

      <Modal visible={avatarOpen} transparent animationType="fade" onRequestClose={() => setAvatarOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>SELECT AVATAR</Text>
            <ScrollView style={{ maxHeight: 360 }} contentContainerStyle={styles.avatarGrid}>
              {AVATARS.map((a) => {
                const img = avatarImage(a.id, user.sex, user.equipped_hair, user.equipped_beard);
                return (
                  <Pressable testID={`avatar-${a.id}`} key={a.id} onPress={() => pickAvatar(a.id)} style={[styles.avOpt, user.avatar_id === a.id && styles.avOptSel]}>
                    {img ? <Image source={img} style={styles.avImg} contentFit="cover" /> : <View style={styles.avEmojiWrap}><Text style={{ fontSize: 30 }}>{a.emoji}</Text></View>}
                    <Text style={styles.avOptLabel} numberOfLines={1}>{a.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Text style={styles.hairTitle}>HAIR COLOUR</Text>
            <View style={styles.hairRow}>
              {HAIR_COLORS.map((h) => {
                const on = (user.equipped_hair || defaultHair(user.avatar_id)) === h.id;
                return (
                  <Pressable testID={`hair-${h.id}`} key={h.id} onPress={() => pickHair(h.id)} style={styles.hairOpt}>
                    <View style={[styles.hairSwatch, { backgroundColor: h.swatch }, on && styles.hairSwatchOn]} />
                    <Text style={[styles.hairLabel, on && { color: colors.brandPrimary }]}>{h.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            {user.sex !== "female" && (
              <>
                <Text style={styles.hairTitle}>FACIAL HAIR</Text>
                <View style={styles.hairRow}>
                  {BEARD_OPTIONS.map((b) => {
                    const on = (user.equipped_beard || "none") === b.id;
                    return (
                      <Pressable testID={`beard-${b.id}`} key={b.id} onPress={() => pickBeard(b.id)} style={[styles.beardOpt, on && styles.beardOptOn]}>
                        <Text style={[styles.beardLabel, on && { color: colors.brandPrimary }]}>{b.id === "beard" ? "🧔 " : "🙂 "}{b.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
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
    <BookingModal visible={bookingOpen} onClose={() => setBookingOpen(false)} onBooked={loadBookings} rescheduleId={rescheduleId} />
    </View>
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
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.lg, paddingRight: 72, marginBottom: spacing.md },
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
  cardStatsRow: { flexDirection: "row", marginTop: spacing.md, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)", paddingTop: spacing.sm },
  cardStat: { flex: 1, alignItems: "center" },
  cardStatV: { color: colors.text, fontSize: 15, fontWeight: "900", fontVariant: ["tabular-nums"] },
  cardStatL: { color: colors.textDim, fontSize: 8, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  bar: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barLabel: { color: colors.textDim, fontSize: 9, fontWeight: "800", letterSpacing: 2, width: 34 },
  barTrack: { flex: 1, height: 6, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" },
  barFill: { height: "100%" },
  tapHint: { color: colors.textDim, fontSize: 10, letterSpacing: 2, marginTop: spacing.sm, fontWeight: "700" },
  creatorWrap: { alignItems: "center", marginTop: spacing.sm },
  petRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8 },
  petName: { color: colors.textMid, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  radarCard: { marginHorizontal: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, alignItems: "center" },
  cardRadar: { marginTop: spacing.sm, marginHorizontal: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.md, alignItems: "center" },
  cardRadarInline: { alignItems: "center", marginTop: spacing.sm },
  ovrPill: { borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.brandTertiary },
  ovrPillText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 12, letterSpacing: 1 },
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
  badgesTab: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  badgesTabOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  badgesTabText: { color: colors.textDim, fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  badgesTabTextOn: { color: colors.brandPrimary },
  badgesPanel: { marginTop: spacing.sm, marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  badgesPanelLabel: { color: colors.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 2, marginBottom: spacing.sm },
  badgeText: { color: colors.brandPrimary, fontSize: 10, letterSpacing: 1, fontWeight: "800" },
  emptyBadges: { color: colors.textDim, paddingHorizontal: spacing.lg },
  linkBtn: { marginTop: spacing.md, marginHorizontal: spacing.lg, padding: spacing.md, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm },
  navGroup: { paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.sm },
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
  hairTitle: { color: colors.textMid, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: spacing.md, marginBottom: spacing.sm },
  hairRow: { flexDirection: "row", justifyContent: "space-between" },
  hairOpt: { alignItems: "center", minWidth: 44 },
  hairSwatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "transparent" },
  hairSwatchOn: { borderColor: colors.brandPrimary },
  hairLabel: { color: colors.textDim, fontSize: 9, marginTop: 4, fontWeight: "700", letterSpacing: 0.5 },
  beardOpt: { flex: 1, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginHorizontal: 4 },
  beardOptOn: { borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.08)" },
  beardLabel: { color: colors.textMid, fontSize: 12, fontWeight: "800", letterSpacing: 0.5 },
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
  modeRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg },
  modeBtn: { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface2 },
  modeBtnOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  modeTitle: { color: colors.textDim, fontSize: 15, fontWeight: "900", letterSpacing: 2 },
  modeTitleOn: { color: colors.brandPrimary },
  modeSub: { color: colors.textDim, fontSize: 10, marginTop: 4, lineHeight: 14 },

  gymCard: { marginHorizontal: spacing.lg, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  gymViewRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  gymName: { color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
  gymHint: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  gymEditBtn: { borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 8 },
  gymEditText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  gymInput: { backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  gymChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  gymChip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  gymChipText: { color: colors.textMid, fontSize: 11, fontWeight: "700" },
  gymBtnRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  gymSaveBtn: { flex: 1, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
  gymSaveText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  gymCancelBtn: { flex: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
  gymCancelText: { color: colors.textDim, fontWeight: "900", letterSpacing: 2 },
  ipStatus: { marginTop: spacing.md, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 10, alignItems: "center" },
  ipStatusText: { fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  ipRequestBtn: { marginTop: spacing.md, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
  ipRequestDisabled: { opacity: 0.45 },
  ipRequestText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  sessionBtn: { marginTop: spacing.md, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
  sessionBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  bookingList: { marginTop: spacing.md, gap: spacing.sm },
  bookingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  bookingDate: { color: colors.text, fontWeight: "800", fontSize: 13 },
  bookingHint: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  bookingCoachNote: { color: colors.brandPrimary, fontSize: 11, marginTop: 3, fontWeight: "700" },
  bookingPill: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  bookingApproved: { borderColor: colors.success, backgroundColor: "rgba(0,229,180,0.08)" },
  bookingPending: { borderColor: colors.warning, backgroundColor: "rgba(245,197,66,0.08)" },
  bookingPillText: { fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  acceptBtn: { backgroundColor: colors.success, borderRadius: radius.pill, paddingHorizontal: spacing.md, paddingVertical: 6 },
  acceptText: { color: "#001a10", fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  prTiles: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg },
  prTile: { flex: 1, alignItems: "center", paddingVertical: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  prValue: { color: colors.brandPrimary, fontSize: 20, fontWeight: "900", fontVariant: ["tabular-nums"] },
  prUnit: { color: colors.textDim, fontSize: 9, marginTop: -2 },
  prLabel: { color: colors.textMid, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  prTotalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginHorizontal: spacing.lg, marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  prTotalLabel: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  prTotalValue: { color: colors.brandPrimary, fontWeight: "900", fontSize: 16, fontVariant: ["tabular-nums"] },
  prFeed: { marginHorizontal: spacing.lg, marginTop: spacing.sm },
  prFeedLabel: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  prFeedRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
  prFeedIcon: { fontSize: 16 },
  prFeedName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  prFeedMeta: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  gymRankCard: { marginTop: spacing.md, alignItems: "center", padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3 },
  gymRankCardTop: { borderColor: colors.warning, backgroundColor: "rgba(245,197,66,0.06)" },
  gymRankBrand: { color: colors.textDim, fontSize: 9, fontWeight: "900", letterSpacing: 3 },
  gymRankBig: { color: colors.brandPrimary, fontSize: 42, fontWeight: "900", marginTop: 4 },
  gymRankLabel: { color: colors.textMid, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: 2 },
  gymRankGym: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 4 },
  gymRankMeta: { color: colors.textDim, fontSize: 11, marginTop: 6 },
  gymRankFooter: { color: colors.brandPrimary, fontSize: 12, fontWeight: "800", marginTop: 8 },
  gymShareBtn: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 11, alignItems: "center" },
  gymShareText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  groupEmptyBtn: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  groupEmptyText: { color: colors.textDim, fontSize: 12, lineHeight: 18 },
  myGroupCard: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary, marginBottom: spacing.sm },
  myGroupName: { color: colors.text, fontWeight: "900", fontSize: 15 },
  myGroupMeta: { color: colors.brandPrimary, fontSize: 11, marginTop: 2, fontWeight: "700" },
  gcArrow: { color: colors.brandPrimary, fontSize: 22, fontWeight: "900" },
});
