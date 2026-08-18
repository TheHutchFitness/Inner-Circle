import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import Svg, { Polyline, Circle } from "react-native-svg";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withSequence, withDelay, withRepeat, Easing, runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { HeroSprite } from "@/src/components/HeroSprite";

const { width: SCREEN_W } = Dimensions.get("window");
const MILESTONES = [135, 185, 225, 275, 315, 365, 405, 455, 495, 585, 675];
const LIFT_LABEL: Record<string, string> = { bench: "BENCH", squat: "SQUAT", deadlift: "DEADLIFT", ohp: "OHP" };

function DamageNumber({ value, crit }: { value: number; crit?: boolean }) {
  const y = useSharedValue(0);
  const op = useSharedValue(1);
  useEffect(() => {
    y.value = withTiming(-60, { duration: 900, easing: Easing.out(Easing.quad) });
    op.value = withDelay(400, withTiming(0, { duration: 500 }));
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }, { scale: crit ? 1.4 : 1 }], opacity: op.value }));
  return (
    <Animated.View style={[styles.dmgWrap, st]} pointerEvents="none">
      <Text style={[styles.dmgText, crit && styles.dmgCrit]}>{crit ? `${value}!` : value}</Text>
    </Animated.View>
  );
}

function Combat({ node, stats, accent, onWin, onClose }: { node: any; stats: any; accent: string; onWin: () => void; onClose: () => void }) {
  const [hp, setHp] = useState(100);
  const [dmgs, setDmgs] = useState<{ id: number; value: number; crit: boolean }[]>([]);
  const [victory, setVictory] = useState(false);
  const heroX = useSharedValue(-40);
  const shake = useSharedValue(0);
  const slash = useSharedValue(0);
  const enemyX = useSharedValue(0);
  const timers = useRef<any[]>([]);

  const heroStyle = useAnimatedStyle(() => ({ transform: [{ translateX: heroX.value }] }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const slashStyle = useAnimatedStyle(() => ({ opacity: slash.value, transform: [{ scale: 0.6 + slash.value * 0.9 }, { rotate: "-25deg" }] }));
  const enemyStyle = useAnimatedStyle(() => ({ transform: [{ translateX: enemyX.value }] }));

  const power = Math.round((stats?.strength || 40) * 0.35 + (stats?.power || 40) * 0.3 + (stats?.grit || 40) * 0.15);
  const hits = node?.boss ? 4 : 3;

  useEffect(() => {
    heroX.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    let remaining = 100;
    for (let i = 0; i < hits; i++) {
      const t = setTimeout(() => {
        try { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); } catch {}
        const crit = Math.random() < 0.35 || i === hits - 1;
        const base = Math.max(12, Math.round(power * (0.35 + Math.random() * 0.5)));
        const value = crit ? Math.round(base * 1.6) : base;
        // lunge + slash + shake
        heroX.value = withSequence(withTiming(26, { duration: 110 }), withTiming(6, { duration: 160 }));
        slash.value = withSequence(withTiming(1, { duration: 90 }), withTiming(0, { duration: 220 }));
        shake.value = withSequence(withTiming(-8, { duration: 45 }), withTiming(8, { duration: 60 }), withTiming(0, { duration: 60 }));
        enemyX.value = withSequence(withTiming(14, { duration: 70 }), withTiming(0, { duration: 130 }));
        const did = Date.now() + i;
        setDmgs((d) => [...d, { id: did, value, crit }]);
        const rm = setTimeout(() => setDmgs((d) => d.filter((x) => x.id !== did)), 1000);
        timers.current.push(rm);
        remaining = Math.max(0, remaining - Math.round(100 / hits) - (crit ? 4 : 0));
        setHp(i === hits - 1 ? 0 : remaining);
      }, 550 + i * 560);
      timers.current.push(t);
    }
    const done = setTimeout(() => {
      setVictory(true);
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      slash.value = withRepeat(withSequence(withTiming(1, { duration: 200 }), withTiming(0.3, { duration: 200 })), 2, false);
    }, 550 + hits * 560 + 250);
    timers.current.push(done);
    return () => { timers.current.forEach(clearTimeout); };
  }, []);

  return (
    <View style={styles.combatWrap}>
      <Animated.View style={[styles.combatStage, shakeStyle]}>
        <Text style={styles.combatTitle}>{node?.boss ? "☠ BOSS BATTLE" : "⚔ ENCOUNTER"}</Text>
        <Text style={styles.combatSub}>{node?.title}</Text>

        {/* enemy HP */}
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${hp}%`, backgroundColor: hp > 40 ? accent : colors.error }]} />
        </View>

        <View style={styles.arena}>
          <Animated.View style={[styles.fighter, heroStyle]}>
            <HeroSprite size={78} color={accent} facing={1} />
          </Animated.View>

          <Animated.View style={[styles.slash, slashStyle]} pointerEvents="none">
            <Text style={[styles.slashText, { color: accent }]}>⟋</Text>
          </Animated.View>

          <Animated.View style={[styles.enemy, enemyStyle]}>
            <Text style={styles.enemyGlyph}>{node?.boss ? "👹" : "👾"}</Text>
            <View style={styles.dmgHolder}>
              {dmgs.map((d) => <DamageNumber key={d.id} value={d.value} crit={d.crit} />)}
            </View>
          </Animated.View>
        </View>

        {victory ? (
          <View style={styles.victoryBox}>
            <Text style={[styles.victoryText, { color: accent }]}>VICTORY</Text>
            <Pressable testID="combat-claim" onPress={onWin} style={[styles.primaryBtn, { backgroundColor: accent }]}>
              <Text style={styles.primaryBtnText}>CLAIM {node?.reward_label || "REWARD"}</Text>
            </Pressable>
          </View>
        ) : (
          <Text style={styles.combatHint}>POWER {power} · landing hits...</Text>
        )}
      </Animated.View>
      <Pressable testID="combat-flee" onPress={onClose} style={styles.fleeBtn}><Text style={styles.fleeText}>{victory ? "" : "FLEE"}</Text></Pressable>
    </View>
  );
}

function Reward({ label, accent, onClose }: { label: string; accent: string; onClose: () => void }) {
  const s = useSharedValue(0);
  useEffect(() => { s.value = withSequence(withTiming(1.15, { duration: 260 }), withTiming(1, { duration: 160 })); }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <View style={styles.combatWrap}>
      <Animated.View style={[styles.rewardCard, { borderColor: accent }, st]}>
        <Text style={styles.rewardBurst}>✦</Text>
        <Text style={[styles.rewardTitle, { color: accent }]}>REWARD UNLOCKED</Text>
        <Text style={styles.rewardLabel}>{label}</Text>
        <Pressable testID="reward-continue" onPress={onClose} style={[styles.primaryBtn, { backgroundColor: accent }]}>
          <Text style={styles.primaryBtnText}>CONTINUE THE JOURNEY</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

function MilestoneOverlay({ lift, value, accent, onClose, token }: { lift: string; value: number; accent: string; onClose: () => void; token: string | null }) {
  const [members, setMembers] = useState<any[] | null>(null);
  const ring = useSharedValue(0);
  useEffect(() => {
    ring.value = withRepeat(withTiming(1, { duration: 1400 }), -1, false);
    (async () => {
      try { const r = await apiFetch(token, `/api/journey/similar?lift=${lift}&value=${value}`); setMembers(r.members || []); } catch { setMembers([]); }
    })();
  }, []);
  const ringStyle = useAnimatedStyle(() => ({ opacity: 1 - ring.value, transform: [{ scale: 1 + ring.value * 1.4 }] }));
  return (
    <View style={styles.combatWrap}>
      <View style={styles.milestoneCard}>
        <View style={styles.ringHolder}>
          <Animated.View style={[styles.ring, { borderColor: accent }, ringStyle]} />
          <Text style={[styles.milestoneValue, { color: accent }]}>{value}</Text>
        </View>
        <Text style={styles.milestoneTitle}>{LIFT_LABEL[lift]} MILESTONE</Text>
        <Text style={styles.milestoneSub}>Athletes who&apos;ve also conquered {value} lb:</Text>
        {members === null ? <ActivityIndicator color={accent} style={{ marginVertical: 16 }} /> : (
          members.length === 0 ? <Text style={styles.milestoneEmpty}>You&apos;re blazing this trail solo. 🔥</Text> : (
            <ScrollView style={{ maxHeight: 190 }}>
              {members.map((m, i) => (
                <View key={i} style={styles.mRow}>
                  <Text style={styles.mName}>{m.enhanced ? "☣ " : ""}{m.name}</Text>
                  <Text style={[styles.mVal, { color: accent }]}>{Math.round(m.value)} lb</Text>
                </View>
              ))}
            </ScrollView>
          )
        )}
        <Pressable testID="milestone-close" onPress={onClose} style={[styles.primaryBtn, { backgroundColor: accent }]}>
          <Text style={styles.primaryBtnText}>ONWARD</Text>
        </Pressable>
      </View>
    </View>
  );
}

export default function Journey() {
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [combatNode, setCombatNode] = useState<any>(null);
  const [reward, setReward] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<{ lift: string; value: number } | null>(null);

  const load = useCallback(async () => {
    try { setData(await apiFetch(token, "/api/journey")); } catch {}
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1600); };

  const accent = data?.zone?.accent || colors.brandPrimary;
  const primary = data?.zone?.primary || colors.brand;

  const onNodePress = (n: any) => {
    if (n.claimed) return flash("✓ Already cleared");
    if (!n.complete) return flash("🔒 Finish the objectives first");
    setCombatNode(n);
  };

  const claim = async () => {
    if (!combatNode) return;
    try {
      const res = await apiFetch(token, "/api/quests/claim", { method: "POST", body: JSON.stringify({ quest_id: combatNode.id }) });
      const label = res?.reward_label || combatNode.reward_label || `${combatNode.reward_xp} XP`;
      setCombatNode(null);
      setReward(label);
    } catch (e: any) { setCombatNode(null); flash(e?.message || "Couldn't claim"); }
  };

  const finishReward = async () => { setReward(null); await load(); };

  const openTopMilestone = () => {
    const prs = user?.prs || {};
    let bestLift = "bench"; let bestVal = 0;
    for (const l of ["deadlift", "squat", "bench", "ohp"]) {
      if ((prs[l] || 0) > bestVal) { bestVal = prs[l] || 0; bestLift = l; }
    }
    const reached = [...MILESTONES].reverse().find((m) => m <= bestVal);
    if (!reached) return flash("Log a PR to unlock milestones");
    setMilestone({ lift: bestLift, value: reached });
  };

  if (loading) {
    return <View style={styles.loadWrap}><ActivityIndicator color={colors.brandPrimary} size="large" /></View>;
  }

  const nodes: any[] = data?.nodes || [];
  const neighbors: any[] = data?.neighbors || [];
  const claimedCount = nodes.filter((n) => n.claimed).length;
  const heroIndex = Math.min(claimedCount, Math.max(0, nodes.length - 1));

  const contentW = Math.max(SCREEN_W * 1.5, nodes.length * 116 + 120);
  const nodeX = (i: number) => 70 + (nodes.length <= 1 ? 0 : i * ((contentW - 150) / (nodes.length - 1)));
  const nodeY = (i: number) => 150 + Math.sin(i * 0.9) * 46;

  const xps = neighbors.map((n) => n.xp);
  const minXp = Math.min(...xps, 0); const maxXp = Math.max(...xps, 1);
  const neighborX = (xp: number) => 70 + ((xp - minXp) / Math.max(1, maxXp - minXp)) * (contentW - 150);

  const points = nodes.map((_, i) => `${nodeX(i)},${nodeY(i)}`).join(" ");
  const traveledPoints = nodes.slice(0, heroIndex + 1).map((_, i) => `${nodeX(i)},${nodeY(i)}`).join(" ");

  return (
    <View style={styles.root}>
      <LinearGradient colors={[primary, "#050508", "#050508"]} style={StyleSheet.absoluteFill} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="journey-back" onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.zoneName, { color: accent }]}>{data?.zone?.name}</Text>
          <Text style={styles.zoneTier}>TIER {data?.zone?.tier} · RANK #{data?.me?.rank_position}/{data?.me?.total_players}</Text>
        </View>
        <Pressable testID="journey-milestone" onPress={openTopMilestone} hitSlop={10}><Text style={[styles.prBtn, { color: accent }]}>PRs ✦</Text></Pressable>
      </View>

      {/* combat stats */}
      <View style={styles.statsRow}>
        {[["STR", "strength"], ["PWR", "power"], ["SPD", "speed"], ["END", "endurance"], ["GRT", "grit"]].map(([lbl, k]) => (
          <View key={k} style={styles.statChip}>
            <Text style={styles.statVal}>{data?.me?.stats?.[k] ?? "—"}</Text>
            <Text style={styles.statLbl}>{lbl}</Text>
          </View>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: contentW }} style={styles.mapScroll}>
        <View style={{ width: contentW, height: 340 }}>
          <Svg width={contentW} height={340} style={StyleSheet.absoluteFill}>
            <Polyline points={points} fill="none" stroke={colors.border} strokeWidth={5} strokeDasharray="2 10" strokeLinecap="round" />
            {traveledPoints.split(" ").length > 1 && (
              <Polyline points={traveledPoints} fill="none" stroke={accent} strokeWidth={5} strokeLinecap="round" />
            )}
            {nodes.map((n, i) => (
              <Circle key={i} cx={nodeX(i)} cy={nodeY(i)} r={n.boss ? 20 : 15}
                fill={n.claimed ? accent : n.complete ? primary : "#12141A"}
                stroke={n.complete && !n.claimed ? accent : colors.border} strokeWidth={n.complete && !n.claimed ? 3 : 2} />
            ))}
          </Svg>

          {/* node touch targets + labels */}
          {nodes.map((n, i) => (
            <Pressable key={i} testID={`journey-node-${i}`} onPress={() => onNodePress(n)}
              style={[styles.nodeHit, { left: nodeX(i) - 26, top: nodeY(i) - 26 }]}>
              <Text style={styles.nodeIcon}>{n.claimed ? "✓" : n.boss ? "☠" : n.complete ? "⚔" : "🔒"}</Text>
              <Text style={styles.nodeLabel} numberOfLines={1}>{n.title}</Text>
            </Pressable>
          ))}

          {/* neighbors lane */}
          {neighbors.filter((nb) => !nb.is_me).map((nb) => (
            <View key={nb.user_id} style={[styles.neighbor, { left: neighborX(nb.xp) - 18, top: 24 }]}>
              <View style={[styles.neighborDot, nb.founder && { borderColor: colors.warning }]}>
                <Text style={styles.neighborInit}>{(nb.name || "A")[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.neighborName} numberOfLines={1}>{nb.enhanced ? "☣" : ""}{nb.name}</Text>
              <Text style={styles.neighborLv}>Lv{nb.level}</Text>
            </View>
          ))}

          {/* hero */}
          <View style={[styles.hero, { left: nodeX(heroIndex) - 24, top: nodeY(heroIndex) - 78 }]}>
            <HeroSprite size={52} color={accent} facing={1} />
            <View style={[styles.heroTag, { borderColor: accent }]}><Text style={styles.heroTagText}>YOU · Lv{data?.me?.level}</Text></View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.legend}>
        <Text style={styles.legendText}>{data?.me?.class_title} · {data?.me?.class_tier}-CLASS</Text>
        <Text style={styles.legendDim}>Tap a ⚔ node to battle · beat quests to advance & pass rivals</Text>
      </View>

      {toast && <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>}

      {combatNode && <Combat node={combatNode} stats={data?.me?.stats} accent={accent} onWin={claim} onClose={() => setCombatNode(null)} />}
      {reward && <Reward label={reward} accent={accent} onClose={finishReward} />}
      {milestone && <MilestoneOverlay lift={milestone.lift} value={milestone.value} accent={accent} token={token} onClose={() => setMilestone(null)} />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#050508" },
  loadWrap: { flex: 1, backgroundColor: "#050508", alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  back: { color: colors.textMid, fontWeight: "800", letterSpacing: 1 },
  prBtn: { fontWeight: "900", letterSpacing: 1 },
  zoneName: { fontWeight: "900", letterSpacing: 3, fontSize: 16 },
  zoneTier: { color: colors.textDim, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  statsRow: { flexDirection: "row", justifyContent: "space-around", paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  statChip: { alignItems: "center", backgroundColor: "rgba(0,0,0,0.35)", borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border },
  statVal: { color: colors.text, fontWeight: "900", fontSize: 15, fontVariant: ["tabular-nums"] },
  statLbl: { color: colors.textDim, fontSize: 8, letterSpacing: 1, marginTop: 1 },
  mapScroll: { flex: 1, marginTop: spacing.sm },
  nodeHit: { position: "absolute", width: 92, alignItems: "center", marginLeft: -20 },
  nodeIcon: { color: colors.text, fontWeight: "900", fontSize: 16, marginBottom: 24 },
  nodeLabel: { color: colors.textMid, fontSize: 9, textAlign: "center", width: 92, fontWeight: "700" },
  neighbor: { position: "absolute", width: 44, alignItems: "center" },
  neighborDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface3, borderWidth: 2, borderColor: colors.textDim, alignItems: "center", justifyContent: "center" },
  neighborInit: { color: colors.text, fontWeight: "900", fontSize: 12 },
  neighborName: { color: colors.textMid, fontSize: 8, marginTop: 2, maxWidth: 52, textAlign: "center" },
  neighborLv: { color: colors.textDim, fontSize: 8 },
  hero: { position: "absolute", alignItems: "center" },
  heroTag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: "rgba(0,0,0,0.6)", marginTop: 2 },
  heroTagText: { color: colors.text, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  legend: { alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  legendText: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  legendDim: { color: colors.textDim, fontSize: 10, marginTop: 4, textAlign: "center" },
  toast: { position: "absolute", bottom: 90, alignSelf: "center", backgroundColor: "rgba(0,0,0,0.9)", paddingHorizontal: spacing.lg, paddingVertical: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border },
  toastText: { color: colors.text, fontWeight: "700" },
  // combat
  combatWrap: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(2,2,6,0.94)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  combatStage: { width: "100%", alignItems: "center" },
  combatTitle: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 18 },
  combatSub: { color: colors.textMid, marginTop: 4, marginBottom: spacing.lg, textAlign: "center", paddingHorizontal: spacing.lg },
  hpBar: { width: "80%", height: 10, borderRadius: 5, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: spacing.xl },
  hpFill: { height: "100%" },
  arena: { width: "100%", height: 140, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.xxl },
  fighter: { width: 80 },
  slash: { position: "absolute", right: "34%", top: 20 },
  slashText: { fontSize: 90, fontWeight: "900" },
  enemy: { width: 90, alignItems: "center" },
  enemyGlyph: { fontSize: 64 },
  dmgHolder: { position: "absolute", top: -10, width: 90, alignItems: "center" },
  dmgWrap: { position: "absolute" },
  dmgText: { color: colors.warning, fontWeight: "900", fontSize: 22, fontVariant: ["tabular-nums"] },
  dmgCrit: { color: colors.error, fontSize: 30 },
  combatHint: { color: colors.textDim, marginTop: spacing.xl, letterSpacing: 1, fontSize: 11 },
  victoryBox: { alignItems: "center", marginTop: spacing.xl },
  victoryText: { fontWeight: "900", letterSpacing: 6, fontSize: 30, marginBottom: spacing.lg },
  primaryBtn: { paddingVertical: 14, paddingHorizontal: spacing.xl, borderRadius: radius.sm, alignItems: "center" },
  primaryBtnText: { color: "#050508", fontWeight: "900", letterSpacing: 1 },
  fleeBtn: { position: "absolute", bottom: 40 },
  fleeText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2 },
  // reward
  rewardCard: { width: "88%", alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 2, padding: spacing.xl },
  rewardBurst: { fontSize: 46, color: colors.warning },
  rewardTitle: { fontWeight: "900", letterSpacing: 3, fontSize: 15, marginTop: spacing.sm },
  rewardLabel: { color: colors.text, fontWeight: "800", fontSize: 18, marginVertical: spacing.lg, textAlign: "center" },
  // milestone
  milestoneCard: { width: "88%", alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, padding: spacing.xl },
  ringHolder: { width: 110, height: 110, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  ring: { position: "absolute", width: 80, height: 80, borderRadius: 40, borderWidth: 3 },
  milestoneValue: { fontWeight: "900", fontSize: 34, fontVariant: ["tabular-nums"] },
  milestoneTitle: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 15 },
  milestoneSub: { color: colors.textDim, fontSize: 12, marginTop: 6, marginBottom: spacing.md, textAlign: "center" },
  milestoneEmpty: { color: colors.textMid, marginVertical: spacing.lg },
  mRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.border, width: 260 },
  mName: { color: colors.text, fontWeight: "700" },
  mVal: { fontWeight: "900", fontVariant: ["tabular-nums"] },
});
