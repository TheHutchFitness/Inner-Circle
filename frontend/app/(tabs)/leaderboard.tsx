import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal, TextInput } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, withDelay, Easing } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, avatarFor, RANK_COLORS, loadoutTitle } from "@/src/lib/theme";
import { SwipeTabs } from "@/src/components/SwipeTabs";
import { MemberSheet } from "@/src/components/MemberSheet";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";
import { GymWatermark } from "@/src/components/GymWatermark";

function HeroSweep() {
  const x = useSharedValue(-0.4);
  useEffect(() => {
    x.value = withDelay(600, withRepeat(withTiming(1.4, { duration: 3200, easing: Easing.inOut(Easing.ease) }), -1, false));
  }, []);
  const st = useAnimatedStyle(() => ({
    transform: [{ translateX: (x.value * 520) - 160 }, { skewX: "-18deg" }],
    opacity: x.value < 0 || x.value > 1.2 ? 0 : 0.5,
  }));
  return (
    <Animated.View pointerEvents="none" style={[styles.sweep, st]}>
      <LinearGradient
        colors={["transparent", "rgba(120,200,255,0.28)", "rgba(180,225,255,0.5)", "rgba(120,200,255,0.28)", "transparent"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={{ flex: 1 }}
      />
    </Animated.View>
  );
}

const BOARDS = [
  { key: "xp", label: "LEVEL", desc: "Overall Level" },
  { key: "strength", label: "STRENGTH", desc: "Absolute Big 4" },
  { key: "squat", label: "🏋 SQUAT", desc: "Squat PR" },
  { key: "bench", label: "🏋 BENCH", desc: "Bench PR" },
  { key: "deadlift", label: "🏋 DEADLIFT", desc: "Deadlift PR" },
  { key: "ratio", label: "BW RATIO", desc: "Total / Bodyweight" },
  { key: "season", label: "🔥 SEASON", desc: "Bosses beaten this season · vaults soon" },
];

function fmtSeason(s: string) {
  const [y, q] = (s || "").split("-");
  return q ? `${q} ${y}` : s;
}

function seasonDaysLeft() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3);
  const end = new Date(now.getFullYear(), q * 3 + 3, 1); // start of next quarter
  return Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 86400000));
}

const RANK_BG: Record<string, { male: any; female: any }> = {
  strength: {
    male: require("../../assets/images/rank-strength-male.png"),
    female: require("../../assets/images/rank-strength-female.png"),
  },
  cardio: {
    male: require("../../assets/images/rank-cardio-male.png"),
    female: require("../../assets/images/rank-cardio-female.png"),
  },
};

const PODIUM_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

export default function Leaderboards() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const [board, setBoard] = useState("xp");
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"strength" | "cardio">("strength");
  const [activity, setActivity] = useState<"run" | "bike">("run");
  const [cardioBoard, setCardioBoard] = useState<"overall" | "single" | "speed">("overall");
  const [dist, setDist] = useState(5);
  const [active, setActive] = useState<number | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [popFilter, setPopFilter] = useState<"all" | "enhanced" | "natural">("all");
  const [gymScope, setGymScope] = useState(false);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [roster, setRoster] = useState<any[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [rosterQuery, setRosterQuery] = useState("");
  const [gymCount, setGymCount] = useState(0);
  const myGym = (user?.inperson_gym || "").trim();

  useEffect(() => {
    if (!myGym) return;
    (async () => {
      try { setGymCount((await apiFetch(token, "/api/profile/gym-rank")).members || 0); } catch {}
    })();
  }, [token, myGym]);

  const openRoster = async () => {
    setRosterOpen(true); setRosterLoading(true); setRosterQuery("");
    try { setRoster(await apiFetch(token, `/api/leaderboard/strength?gym=${encodeURIComponent(myGym)}`)); }
    catch { setRoster([]); }
    setRosterLoading(false);
  };
  const [seasonView, setSeasonView] = useState<"live" | "history">("live");
  const [champs, setChamps] = useState<any[]>([]);
  const [champsLoading, setChampsLoading] = useState(false);

  useEffect(() => {
    if (board !== "season" || seasonView !== "history") return;
    let alive = true;
    (async () => {
      setChampsLoading(true);
      try { const r = await apiFetch(token, "/api/leaderboard/season/history"); if (alive) setChamps(r); }
      catch { if (alive) setChamps([]); }
      if (alive) setChampsLoading(false);
    })();
    return () => { alive = false; };
  }, [board, seasonView, token]);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try { const r = await apiFetch(token, "/api/active-count"); if (alive) setActive(r.active); } catch {}
    };
    poll();
    const iv = setInterval(poll, 20000);
    return () => { alive = false; clearInterval(iv); };
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        if (mode === "strength") {
          const gq = gymScope && myGym ? `&gym=${encodeURIComponent(myGym)}` : "";
          setRows(await apiFetch(token, `/api/leaderboard/${board}?filter=${popFilter}${gq}`));
        } else {
          setRows(await apiFetch(token, `/api/cardio/leaderboard?board=${cardioBoard}&activity=${activity}&dist=${dist}`));
        }
      } catch { setRows([]); }
      setLoading(false);
    })();
  }, [board, token, mode, activity, cardioBoard, dist, popFilter, gymScope]);

  const podium = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <SwipeTabs current="leaderboard">
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={styles.heroClip}>
        <Image source={RANK_BG[mode][user?.sex === "female" ? "female" : "male"]} style={styles.bgImage} contentFit="cover" />
        <HeroSweep />
      </View>
      <LinearGradient
        colors={["rgba(5,5,8,0.55)", "rgba(5,5,8,0.8)", colors.surface]}
        locations={[0, 0.45, 0.8]}
        style={StyleSheet.absoluteFill}
      />
      <GymWatermark />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: 100 }}>
      <Text style={styles.eyebrow}>RANKINGS</Text>
      <View style={styles.titleRow}>
        <Text style={styles.h1}>THE CIRCLE</Text>
        <View style={styles.activePill}>
          <View style={styles.activeDot} />
          <Text style={styles.activeText}>{active ?? "—"} ACTIVE</Text>
        </View>
      </View>

      <View style={styles.modeRow}>
        <Pressable testID="mode-strength" onPress={() => setMode("strength")} style={[styles.modeBtn, mode === "strength" && styles.modeBtnActive]}>
          <Text style={[styles.modeText, mode === "strength" && styles.modeTextActive]}>💪 STRENGTH</Text>
        </Pressable>
        <Pressable testID="mode-cardio" onPress={() => setMode("cardio")} style={[styles.modeBtn, mode === "cardio" && styles.modeBtnActive]}>
          <Text style={[styles.modeText, mode === "cardio" && styles.modeTextActive]}>🏃 CARDIO</Text>
        </Pressable>
      </View>

      {mode === "strength" ? (
        <>
        <View style={styles.popRow}>
          {(["all", "natural", "enhanced"] as const).map((f) => (
            <Pressable key={f} testID={`pop-${f}`} onPress={() => setPopFilter(f)}
              style={[styles.popBtn, popFilter === f && (f === "enhanced" ? styles.popEnhanced : styles.popActive)]}>
              <Text style={[styles.popText, popFilter === f && { color: f === "enhanced" ? "#FF2A3C" : colors.brandPrimary }]}>
                {f === "all" ? "ALL" : f === "natural" ? "🌿 NATURAL" : "☣ ENHANCED"}
              </Text>
            </Pressable>
          ))}
        </View>
        {!!myGym && (
          <View style={styles.scopeRow}>
            <Pressable testID="scope-global" onPress={() => setGymScope(false)} style={[styles.scopeBtn, !gymScope && styles.scopeActive]}>
              <Text style={[styles.scopeText, !gymScope && styles.scopeTextActive]}>🌐 THE CIRCLE</Text>
            </Pressable>
            <Pressable testID="scope-gym" onPress={() => setGymScope(true)} style={[styles.scopeBtn, gymScope && styles.scopeActive]}>
              <Text style={[styles.scopeText, gymScope && styles.scopeTextActive]} numberOfLines={1}>🏋 {myGym.toUpperCase()}{gymCount > 0 ? ` · ${gymCount}` : ""}</Text>
            </Pressable>
          </View>
        )}
        {!!myGym && gymScope && (
          <Pressable testID="open-roster" onPress={openRoster} style={styles.rosterBtn}>
            <Text style={styles.rosterBtnText}>👥 VIEW FULL ROSTER · {gymCount} ATHLETE{gymCount === 1 ? "" : "S"}</Text>
          </Pressable>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {BOARDS.map((b) => (
            <Pressable testID={`board-${b.key}`} key={b.key} onPress={() => setBoard(b.key)} style={[styles.chip, board === b.key && styles.chipActive]}>
              <Text style={[styles.chipText, board === b.key && styles.chipTextActive]}>{b.label}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {board === "season" && (
          <View style={styles.seasonBanner}>
            <Text style={styles.seasonBannerText}>🔥 SEASON ENDS IN {seasonDaysLeft()} DAYS — grind bosses before it vaults</Text>
          </View>
        )}
        {board === "season" && (
          <View style={styles.seasonViewRow}>
            <Pressable testID="season-live" onPress={() => setSeasonView("live")} style={[styles.svBtn, seasonView === "live" && styles.svBtnActive]}>
              <Text style={[styles.svText, seasonView === "live" && styles.svTextActive]}>THIS SEASON</Text>
            </Pressable>
            <Pressable testID="season-history" onPress={() => setSeasonView("history")} style={[styles.svBtn, seasonView === "history" && styles.svBtnActive]}>
              <Text style={[styles.svText, seasonView === "history" && styles.svTextActive]}>🏆 PAST CHAMPIONS</Text>
            </Pressable>
          </View>
        )}
        </>
      ) : (
        <>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {[["run", "🏃 RUN"], ["bike", "🚴 BIKE"]].map(([k, l]) => (
              <Pressable testID={`activity-${k}`} key={k} onPress={() => setActivity(k as any)} style={[styles.chip, activity === k && styles.chipActive]}>
                <Text style={[styles.chipText, activity === k && styles.chipTextActive]}>{l}</Text>
              </Pressable>
            ))}
            {[["overall", "OVERALL"], ["single", "LONGEST"], ["speed", "SPEED"]].map(([k, l]) => (
              <Pressable testID={`cboard-${k}`} key={k} onPress={() => setCardioBoard(k as any)} style={[styles.chip, cardioBoard === k && styles.chipActive]}>
                <Text style={[styles.chipText, cardioBoard === k && styles.chipTextActive]}>{l}</Text>
              </Pressable>
            ))}
          </ScrollView>
          {cardioBoard === "speed" && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {[1, 5, 10, 20].map((d) => (
                <Pressable testID={`dist-${d}`} key={d} onPress={() => setDist(d)} style={[styles.chip, dist === d && styles.chipActive]}>
                  <Text style={[styles.chipText, dist === d && styles.chipTextActive]}>{d}K+</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {board === "season" && seasonView === "history" ? (
        champsLoading ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
        ) : champs.length === 0 ? (
          <Text style={styles.emptyBoard}>No past champions yet — this season's top boss-slayer will be crowned here when the season ends.</Text>
        ) : (
          <View style={styles.listWrap}>
            <Text style={styles.hofHint}>🏆 HALL OF FAME — top boss-slayer of each past season</Text>
            {champs.map((c) => (
              <Pressable key={c.season} testID={`champ-${c.season}`} onPress={() => c.user_id && setMemberId(c.user_id)} style={styles.champCard}>
                <View style={styles.champSeasonCol}>
                  <Text style={styles.champTrophy}>🏆</Text>
                  <Text style={styles.champSeason}>{fmtSeason(c.season)}</Text>
                </View>
                <View style={{ marginHorizontal: 6 }}><PlayerAvatar person={c} token={token} size={44} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.champName, c.founder_backer && { color: colors.warning }]} numberOfLines={1}>{c.display_name}</Text>
                  <Text style={[styles.rowSub, { color: RANK_COLORS[c.rank] }]}>{c.rank} · LV {c.level}</Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.champBosses}>{c.bosses}</Text>
                  <Text style={styles.podiumMetricLabel}>BOSSES</Text>
                </View>
              </Pressable>
            ))}
          </View>
        )
      ) : loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
      ) : rows.length === 0 ? (
        <Text style={styles.emptyBoard}>{gymScope && myGym ? `No ranked athletes at ${myGym} yet — log your lifts to lead your gym.` : `No entries yet. Be the first to log ${mode === "cardio" ? "a " + activity : "your lifts"}.`}</Text>
      ) : (
        <>
          <View style={styles.podiumWrap}>
            {podium.map((p, i) => {
              const av = avatarFor(p.avatar_id);
              return (
                <Pressable key={p.user_id || i} onPress={() => p.user_id && setMemberId(p.user_id)} style={[styles.podiumCard, { borderColor: PODIUM_COLORS[i] }]}>
                  <Text style={[styles.podiumRank, { color: PODIUM_COLORS[i] }]}>#{i + 1}</Text>
                  <View style={styles.podiumAvatar}>
                    <PlayerAvatar person={p} token={token} size={52} />
                  </View>
                  <Text style={[styles.podiumName, p.founder_backer && { color: colors.warning }]} numberOfLines={1}>{p.display_name}</Text>
                  <View style={styles.podiumRankRow}>
                    <Text style={[styles.podiumRankBadge, { color: RANK_COLORS[p.rank] }]}>{p.rank}</Text>
                    {p.founder_backer && <Text style={styles.backerStar}>★</Text>}
                  </View>
                  <Text style={styles.podiumMetric}>{p.metric}</Text>
                  <Text style={styles.podiumMetricLabel}>{p.metric_label}</Text>
                  {mode === "strength" && board !== "strength" && !!p.total_lift && <Text style={styles.podiumTotal}>Σ {p.total_lift} lb</Text>}
                </Pressable>
              );
            })}
          </View>

          <View style={styles.listWrap}>
            {rest.map((r, i) => {
              const isMe = r.user_id === user?.user_id;
              const av = avatarFor(r.avatar_id);
              return (
                <Pressable testID={`rank-row-${i+4}`} key={r.user_id} onPress={() => r.user_id && setMemberId(r.user_id)} style={[styles.row, isMe && styles.rowMe]}>
                  <Text style={styles.rowRank}>#{i + 4}</Text>
                  <View style={{ marginRight: 4 }}><PlayerAvatar person={r} token={token} size={34} /></View>
                  <View style={{ flex: 1 }}>
                    <View style={styles.rowNameRow}>
                      <Text style={[styles.rowName, r.founder_backer && { color: colors.warning }]}>{r.display_name}</Text>
                      {r.founder_backer && <View style={styles.backerPill}><Text style={styles.backerPillText}>★ BACKER</Text></View>}
                    </View>
                    <Text style={[styles.rowSub, { color: RANK_COLORS[r.rank] }]}>{r.rank}{loadoutTitle(r.loadout) ? ` · ${loadoutTitle(r.loadout)}` : ""}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={styles.rowMetric}>{r.metric}</Text>
                    {mode === "strength" && board !== "strength" && !!r.total_lift && <Text style={styles.rowTotal}>Σ {r.total_lift} lb</Text>}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </ScrollView>
    <MemberSheet userId={memberId} visible={!!memberId} onClose={() => setMemberId(null)} />
    <Modal visible={rosterOpen} transparent animationType="slide" onRequestClose={() => setRosterOpen(false)}>
      <View style={styles.rosterOverlay}>
        <View style={styles.rosterSheet}>
          <View style={styles.rosterHead}>
            <Text style={styles.rosterTitle}>🏋 {myGym.toUpperCase()} ROSTER · {gymCount}</Text>
            <Pressable testID="roster-close" onPress={() => setRosterOpen(false)}><Text style={styles.rosterClose}>✕</Text></Pressable>
          </View>
          {roster.length > 6 && (
            <TextInput
              testID="roster-search"
              value={rosterQuery}
              onChangeText={setRosterQuery}
              placeholder="Search athletes…"
              placeholderTextColor={colors.textDim}
              style={styles.rosterSearch}
              autoCapitalize="none"
            />
          )}
          {rosterLoading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 30 }} />
          ) : roster.length === 0 ? (
            <Text style={styles.emptyBoard}>No athletes at this gym yet.</Text>
          ) : (
            <ScrollView contentContainerStyle={{ paddingBottom: spacing.lg }}>
              {roster
                .filter((r) => !rosterQuery.trim() || (r.display_name || "").toLowerCase().includes(rosterQuery.trim().toLowerCase()))
                .map((r, i) => (
                <Pressable key={r.user_id} testID={`roster-${i}`} onPress={() => { setRosterOpen(false); setMemberId(r.user_id); }} style={styles.row}>
                  <Text style={styles.rowRank}>#{roster.indexOf(r) + 1}</Text>
                  <View style={{ marginRight: 4 }}><PlayerAvatar person={r} token={token} size={34} /></View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.rowName, r.founder_backer && { color: colors.warning }]} numberOfLines={1}>{r.display_name}</Text>
                    <Text style={[styles.rowSub, { color: RANK_COLORS[r.rank] }]}>{r.rank}</Text>
                  </View>
                  <Text style={styles.rowMetric}>{r.total_lift} lb</Text>
                </Pressable>
              ))}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
    </View>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  bgImage: { position: "absolute", top: 0, left: 0, right: 0, height: 420 },
  heroClip: { position: "absolute", top: 0, left: 0, right: 0, height: 420, overflow: "hidden" },
  sweep: { position: "absolute", top: 0, bottom: 0, left: 0, width: 120 },
  modeRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.md },
  modeBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  modeBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  modeText: { color: colors.textDim, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  modeTextActive: { color: colors.brandPrimary },
  emptyBoard: { color: colors.textDim, textAlign: "center", marginTop: 40, paddingHorizontal: spacing.xl, lineHeight: 20 },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700", paddingHorizontal: spacing.lg },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md, paddingHorizontal: spacing.lg },
  titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingRight: spacing.lg },
  activePill: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,229,180,0.12)", borderWidth: 1, borderColor: colors.success, paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: radius.pill, marginBottom: spacing.md, marginTop: 4 },
  activeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success },
  activeText: { color: colors.success, fontSize: 10, fontWeight: "900", letterSpacing: 1, fontVariant: ["tabular-nums"] },
  chipRow: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingBottom: spacing.sm },
  popRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  scopeRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  scopeBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  scopeActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  scopeText: { color: colors.textDim, fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
  scopeTextActive: { color: colors.brandPrimary },
  popBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 7, alignItems: "center", backgroundColor: colors.surface2 },
  popActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  popEnhanced: { borderColor: "#FF2A3C", backgroundColor: "rgba(255,42,60,0.1)" },
  popText: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  chip: { paddingHorizontal: spacing.md, height: 36, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: colors.surface2, flexShrink: 0 },
  chipActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  chipTextActive: { color: colors.brandPrimary },
  seasonBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: "#FF6A00", backgroundColor: "rgba(255,106,0,0.12)" },
  seasonBannerText: { color: "#FFB07A", fontWeight: "900", fontSize: 11, letterSpacing: 0.5, textAlign: "center" },
  seasonViewRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginBottom: spacing.sm },
  svBtn: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingVertical: 7, alignItems: "center", backgroundColor: colors.surface2 },
  svBtnActive: { borderColor: colors.warning, backgroundColor: "rgba(255,215,0,0.10)" },
  svText: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  svTextActive: { color: colors.warning },
  hofHint: { color: colors.textDim, fontSize: 10, letterSpacing: 1, fontWeight: "700", marginBottom: spacing.sm, textAlign: "center" },
  champCard: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: "rgba(255,215,0,0.35)", backgroundColor: "rgba(255,215,0,0.05)", borderRadius: radius.md, marginBottom: spacing.sm, gap: 4 },
  champSeasonCol: { alignItems: "center", width: 48 },
  champTrophy: { fontSize: 20 },
  champSeason: { color: colors.warning, fontSize: 9, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  champName: { color: colors.text, fontWeight: "800", fontSize: 14 },
  champBosses: { color: colors.warning, fontWeight: "900", fontSize: 20, fontVariant: ["tabular-nums"] },
  podiumWrap: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.md },
  podiumCard: { flex: 1, alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1 },
  podiumRank: { fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  podiumAvatar: { width: 54, height: 54, borderRadius: radius.md, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: spacing.sm, backgroundColor: colors.surface },
  podiumEmoji: { fontSize: 28 },
  podiumName: { color: colors.text, fontWeight: "800", marginTop: 6, fontSize: 12 },
  podiumRankBadge: { fontSize: 9, letterSpacing: 2, fontWeight: "800", marginTop: 2 },
  podiumRankRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  backerStar: { color: colors.warning, fontSize: 10, fontWeight: "900" },
  rowNameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  backerPill: { backgroundColor: "rgba(255,234,0,0.14)", borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1 },
  backerPillText: { color: colors.warning, fontSize: 7, fontWeight: "900", letterSpacing: 1 },
  podiumMetric: { color: colors.text, fontWeight: "900", fontSize: 18, marginTop: 4 },
  podiumMetricLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1 },
  podiumTotal: { color: colors.brandPrimary, fontSize: 9, fontWeight: "800", marginTop: 2, fontVariant: ["tabular-nums"] },
  rosterBtn: { marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  rosterBtnText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  rosterOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  rosterSheet: { maxHeight: "82%", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.borderStrong },
  rosterHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  rosterTitle: { color: colors.brandPrimary, fontWeight: "900", fontSize: 15, letterSpacing: 1 },
  rosterClose: { color: colors.textDim, fontSize: 20, fontWeight: "900", paddingHorizontal: 8 },
  rosterSearch: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm, fontSize: 14 },
  listWrap: { paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.md },
  rowMe: { backgroundColor: colors.brandTertiary, paddingHorizontal: spacing.md, borderRadius: radius.sm, marginVertical: 2, borderBottomWidth: 0 },
  rowRank: { color: colors.brandPrimary, fontWeight: "900", width: 40, fontVariant: ["tabular-nums"] },
  rowEmoji: { fontSize: 22 },
  rowName: { color: colors.text, fontWeight: "700" },
  rowSub: { fontSize: 10, letterSpacing: 2, fontWeight: "700", marginTop: 2 },
  rowMetric: { color: colors.text, fontWeight: "900", fontVariant: ["tabular-nums"] },
  rowTotal: { color: colors.textDim, fontSize: 9, fontWeight: "800", marginTop: 1, fontVariant: ["tabular-nums"] },
});
