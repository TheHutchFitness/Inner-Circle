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
import { initSfx, playSfx, isSfxEnabled, setSfxEnabled, startZoneMusic, stopMusic } from "@/src/lib/sfx";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
  const isBoss = !!node?.boss;
  const [hp, setHp] = useState(100);
  const [dmgs, setDmgs] = useState<{ id: number; value: number; crit: boolean }[]>([]);
  const [victory, setVictory] = useState(false);
  const [phase, setPhase] = useState(1);
  const [banner, setBanner] = useState<string | null>(null);
  const heroX = useSharedValue(-40);
  const shake = useSharedValue(0);
  const slash = useSharedValue(0);
  const enemyX = useSharedValue(0);
  const flash = useSharedValue(0);
  const timers = useRef<any[]>([]);

  const heroStyle = useAnimatedStyle(() => ({ transform: [{ translateX: heroX.value }] }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const slashStyle = useAnimatedStyle(() => ({ opacity: slash.value, transform: [{ scale: 0.6 + slash.value * 1.1 }, { rotate: "-25deg" }] }));
  const enemyStyle = useAnimatedStyle(() => ({ transform: [{ translateX: enemyX.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));

  const power = Math.round((stats?.strength || 40) * 0.35 + (stats?.power || 40) * 0.3 + (stats?.grit || 40) * 0.15);
  const normalHits = isBoss ? 5 : 3;

  const doHit = (i: number, total: number, finisher: boolean) => {
    playSfx("slash");
    const rmHit = setTimeout(() => playSfx("hit"), 90);
    timers.current.push(rmHit);
    try { Haptics.impactAsync(finisher ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium); } catch {}
    const crit = finisher || Math.random() < 0.35;
    const base = Math.max(12, Math.round(power * (0.35 + Math.random() * 0.5)));
    const value = finisher ? Math.round(base * 2.6) : crit ? Math.round(base * 1.6) : base;
    heroX.value = withSequence(withTiming(finisher ? 40 : 26, { duration: finisher ? 90 : 110 }), withTiming(6, { duration: 180 }));
    slash.value = withSequence(withTiming(1, { duration: finisher ? 60 : 90 }), withTiming(0, { duration: 240 }));
    shake.value = withSequence(withTiming(-10, { duration: 45 }), withTiming(10, { duration: 60 }), withTiming(0, { duration: 60 }));
    enemyX.value = withSequence(withTiming(finisher ? 24 : 14, { duration: 70 }), withTiming(0, { duration: 130 }));
    if (finisher) flash.value = withSequence(withTiming(0.85, { duration: 70 }), withTiming(0, { duration: 400 }));
    const did = Date.now() + i;
    setDmgs((d) => [...d, { id: did, value, crit }]);
    const rm = setTimeout(() => setDmgs((d) => d.filter((x) => x.id !== did)), 1000);
    timers.current.push(rm);
  };

  useEffect(() => {
    heroX.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    let t = 500;
    const step = 560;
    const half = Math.ceil(normalHits / 2);
    for (let i = 0; i < normalHits; i++) {
      const at = t + i * step;
      // Boss phase transition at halfway
      if (isBoss && i === half) {
        const pt = setTimeout(() => {
          setPhase(2); setBanner("PHASE II — ENRAGED");
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
          flash.value = withSequence(withTiming(0.6, { duration: 120 }), withTiming(0, { duration: 300 }));
          const clr = setTimeout(() => setBanner(null), 1100);
          timers.current.push(clr);
        }, at - 200);
        timers.current.push(pt);
      }
      const hitAt = at + (isBoss && i >= half ? 400 : 0);
      const th = setTimeout(() => {
        doHit(i, normalHits, false);
        const frac = (i + 1) / (normalHits + (isBoss ? 1 : 0));
        setHp(Math.max(isBoss ? 12 : 0, Math.round(100 - frac * 100)));
      }, hitAt);
      timers.current.push(th);
    }
    // Boss finisher
    if (isBoss) {
      const finAt = t + normalHits * step + 500;
      const fb = setTimeout(() => { setBanner("FINISHER!"); }, finAt - 350);
      const ft = setTimeout(() => { doHit(99, normalHits, true); setHp(0); setBanner(null); }, finAt);
      timers.current.push(fb, ft);
    }
    const winAt = t + normalHits * step + (isBoss ? 1100 : 250);
    const done = setTimeout(() => {
      setVictory(true);
      playSfx("victory");
      try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
      slash.value = withRepeat(withSequence(withTiming(1, { duration: 200 }), withTiming(0.3, { duration: 200 })), 2, false);
    }, winAt);
    timers.current.push(done);
    return () => { timers.current.forEach(clearTimeout); };
  }, []);

  return (
    <View style={styles.combatWrap}>
      <Animated.View style={[styles.flashLayer, { backgroundColor: isBoss ? "#FFFFFF" : accent }, flashStyle]} pointerEvents="none" />
      <Animated.View style={[styles.combatStage, shakeStyle]}>
        <Text style={styles.combatTitle}>{isBoss ? "☠ BOSS BATTLE" : "⚔ ENCOUNTER"}</Text>
        <Text style={styles.combatSub}>{node?.title}{isBoss ? `  ·  PHASE ${phase}` : ""}</Text>

        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${hp}%`, backgroundColor: hp > 40 ? accent : colors.error }]} />
          {isBoss && <View style={styles.hpPhaseMark} />}
        </View>

        <View style={styles.arena}>
          <Animated.View style={[styles.fighter, heroStyle]}>
            <HeroSprite size={78} color={accent} facing={1} />
          </Animated.View>
          <Animated.View style={[styles.slash, slashStyle]} pointerEvents="none">
            <Text style={[styles.slashText, { color: accent }]}>⟋</Text>
          </Animated.View>
          <Animated.View style={[styles.enemy, enemyStyle]}>
            <Text style={styles.enemyGlyph}>{isBoss ? (phase === 2 ? "😡" : "👹") : "👾"}</Text>
            <View style={styles.dmgHolder}>
              {dmgs.map((d) => <DamageNumber key={d.id} value={d.value} crit={d.crit} />)}
            </View>
          </Animated.View>
        </View>

        {banner && <Text style={[styles.phaseBanner, { color: colors.error }]}>{banner}</Text>}

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

function Reward({ label, boss, accent, onClose }: { label: string; boss: boolean; accent: string; onClose: () => void }) {
  const s = useSharedValue(0);
  const dropY = useSharedValue(-260);
  const spin = useSharedValue(0);
  const glow = useSharedValue(0);
  const isLoot = boss || /frame|aura|title|emblem|badge/i.test(label);
  useEffect(() => {
    s.value = withSequence(withTiming(1.15, { duration: 260 }), withTiming(1, { duration: 160 }));
    if (isLoot) {
      playSfx("victory");
      dropY.value = withSequence(withTiming(10, { duration: 520, easing: Easing.bounce }), withTiming(0, { duration: 160 }));
      spin.value = withTiming(1, { duration: 700 });
      glow.value = withRepeat(withSequence(withTiming(1, { duration: 700 }), withTiming(0.3, { duration: 700 })), -1, false);
    }
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const lootSt = useAnimatedStyle(() => ({ transform: [{ translateY: dropY.value }, { rotate: `${spin.value * 360}deg` }] }));
  const glowSt = useAnimatedStyle(() => ({ opacity: glow.value, transform: [{ scale: 1 + glow.value * 0.5 }] }));
  return (
    <View style={styles.combatWrap}>
      <Animated.View style={[styles.rewardCard, { borderColor: accent }, st]}>
        {isLoot ? (
          <View style={styles.lootHolder}>
            <Animated.Text style={[styles.lootGlow, { color: accent }, glowSt]}>✦</Animated.Text>
            <Animated.Text style={[styles.lootItem, lootSt]}>{boss ? "🎖️" : "🌀"}</Animated.Text>
          </View>
        ) : (
          <Text style={styles.rewardBurst}>✦</Text>
        )}
        <Text style={[styles.rewardTitle, { color: accent }]}>{isLoot ? "★ LOOT DROP ★" : "REWARD UNLOCKED"}</Text>
        <Text style={styles.rewardLabel}>{label}</Text>
        {isLoot && <Text style={styles.lootSub}>Equip it in your Locker / Loadout</Text>}
        {isLoot && (
          <Pressable testID="loot-equip" onPress={() => { onClose(); router.push("/loadout"); }} style={[styles.primaryBtn, { backgroundColor: accent, marginBottom: spacing.sm }]}>
            <Text style={styles.primaryBtnText}>⚙ EQUIP NOW</Text>
          </Pressable>
        )}
        <Pressable testID="reward-continue" onPress={onClose} style={[styles.primaryBtn, isLoot ? styles.secondaryBtn : { backgroundColor: accent }]}>
          <Text style={[styles.primaryBtnText, isLoot && { color: accent }]}>CONTINUE THE JOURNEY</Text>
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

function ZoneReveal({ zone, onClose }: { zone: any; onClose: () => void }) {
  const s = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    playSfx("victory");
    s.value = withSequence(withTiming(1.2, { duration: 400, easing: Easing.out(Easing.back(2)) }), withTiming(1, { duration: 200 }));
    glow.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.3, { duration: 900 })), -1, false);
    const t = setTimeout(onClose, 3800);
    return () => clearTimeout(t);
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }], opacity: Math.min(1, s.value) }));
  const glowSt = useAnimatedStyle(() => ({ opacity: glow.value }));
  return (
    <Pressable style={styles.combatWrap} onPress={onClose}>
      <LinearGradient colors={[zone?.primary || "#000", "#050508"]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[st, { alignItems: "center" }]}>
        <Animated.Text style={[styles.zoneRevealGlow, { color: zone?.accent }, glowSt]}>✦</Animated.Text>
        <Text style={styles.zoneRevealKicker}>NEW ZONE UNLOCKED</Text>
        <Text style={[styles.zoneRevealName, { color: zone?.accent }]}>{zone?.name}</Text>
        <Text style={styles.zoneRevealTier}>TIER {zone?.tier} REACHED</Text>
      </Animated.View>
      <Text style={styles.zoneRevealTap}>tap to continue</Text>
    </Pressable>
  );
}

export default function Journey() {
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [combatNode, setCombatNode] = useState<any>(null);
  const [reward, setReward] = useState<{ label: string; boss: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<{ lift: string; value: number } | null>(null);
  const [zoneReveal, setZoneReveal] = useState<any>(null);
  const [sfxOn, setSfxOn] = useState(true);
  const [taunt, setTaunt] = useState<{ id: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await apiFetch(token, "/api/journey");
      setData(d);
      // Zone unlock: reveal once when the player enters a higher tier zone
      try {
        const seen = await AsyncStorage.getItem("hic_zone_seen");
        const idx = d?.zone?.index ?? 0;
        if (seen === null) { await AsyncStorage.setItem("hic_zone_seen", String(idx)); }
        else if (idx > parseInt(seen, 10)) { setZoneReveal(d.zone); await AsyncStorage.setItem("hic_zone_seen", String(idx)); }
      } catch {}
    } catch {}
    setLoading(false);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { initSfx().then(() => setSfxOn(isSfxEnabled())); return () => stopMusic(); }, []);

  useEffect(() => {
    if (!data) return;
    if (isSfxEnabled()) startZoneMusic(data?.zone?.index ?? 0);
    const behind = (data.neighbors || []).filter((n: any) => !n.is_me && !n.ahead);
    if (behind.length) {
      const passed = behind.reduce((a: any, b: any) => (b.xp > a.xp ? b : a));
      const t = setTimeout(() => showTaunt(passed.user_id, true), 900);
      return () => clearTimeout(t);
    }
  }, [data?.zone?.index, data?.me?.xp]);

  const TAUNTS_PASSED = ["You're leaving me behind…", "How?! Get back here!", "Tch. I'll catch up.", "This isn't over, warrior."];
  const TAUNTS_TAP = ["Respect. Keep climbing.", "Catch me if you can.", "Grind harder.", "See you at the top."];
  const showTaunt = (id: string, passed = false) => {
    const pool = passed ? TAUNTS_PASSED : TAUNTS_TAP;
    setTaunt({ id, text: pool[Math.floor(Math.random() * pool.length)] });
    setTimeout(() => setTaunt((cur) => (cur?.id === id ? null : cur)), 2600);
  };

  const toggleSfx = async () => { const n = !sfxOn; setSfxOn(n); await setSfxEnabled(n); if (n) { playSfx("slash"); startZoneMusic(data?.zone?.index ?? 0); } };

  const sendChallenge = async (nb: any) => {
    setTaunt(null);
    try {
      const r = await apiFetch(token, "/api/journey/challenge", { method: "POST", body: JSON.stringify({ to_user_id: nb.user_id }) });
      flash(`⚔ Challenge sent to ${r?.to_name || nb.name}!`);
    } catch { flash("Couldn't send challenge"); }
  };

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
      setReward({ label, boss: !!combatNode.boss });
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
  const realNeighbors: any[] = (data?.neighbors || []).filter((n: any) => !n.is_me);
  const myXp = data?.me?.xp || 0;
  const myLevel = data?.me?.level || 1;

  // Filler NPCs so the road never feels empty when few real rivals are nearby.
  const FILLER = [
    { n: "Ronin", d: -1 }, { n: "Vesper", d: 1 }, { n: "Kael", d: -2 }, { n: "Nyx", d: 2 },
    { n: "Draven", d: -1 }, { n: "Astra", d: 1 }, { n: "Orion", d: 2 }, { n: "Rin", d: -2 },
  ];
  const fillers = realNeighbors.length >= 4 ? [] : FILLER.slice(0, 4 - realNeighbors.length).map((f, i) => ({
    user_id: `npc_${i}`,
    name: f.n,
    level: Math.max(1, myLevel + f.d),
    xp: Math.max(0, myXp + f.d * 220 + (i % 2 ? 60 : -60)),
    is_me: false,
    ahead: f.d > 0,
    enhanced: false,
    founder: false,
    filler: true,
  }));
  const neighbors: any[] = [...realNeighbors, ...fillers];
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable testID="journey-sfx" onPress={toggleSfx} hitSlop={10}><Text style={[styles.prBtn, { color: sfxOn ? accent : colors.textDim }]}>{sfxOn ? "🔊" : "🔇"}</Text></Pressable>
          <Pressable testID="journey-milestone" onPress={openTopMilestone} hitSlop={10}><Text style={[styles.prBtn, { color: accent }]}>PRs ✦</Text></Pressable>
        </View>
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

      {(data?.challenges?.length || 0) > 0 && (
        <View style={[styles.challengeBanner, { borderColor: accent }]}>
          <Text style={styles.challengeBannerText}>🔥 {data.challenges[0].from_name} {data.challenges.length > 1 ? `+${data.challenges.length - 1} more ` : ""}challenged you to catch them!</Text>
        </View>
      )}

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
            <Pressable key={nb.user_id} testID={`rival-${nb.user_id}`} onPress={() => showTaunt(nb.user_id)} style={[styles.neighbor, { left: neighborX(nb.xp) - 18, top: 24 }]}>
              {taunt?.id === nb.user_id && (
                <View style={[styles.taunt, { borderColor: accent }]}>
                  <Text style={styles.tauntText}>{taunt?.text}</Text>
                  {nb.filler ? (
                    <Text style={styles.npcTag}>WANDERER</Text>
                  ) : (
                    <Pressable testID={`challenge-${nb.user_id}`} onPress={() => sendChallenge(nb)} style={[styles.challengeBtn, { borderColor: accent }]}>
                      <Text style={[styles.challengeText, { color: accent }]}>⚔ CATCH ME</Text>
                    </Pressable>
                  )}
                </View>
              )}
              <View style={[styles.neighborDot, nb.filler && styles.neighborDotNpc, nb.founder && { borderColor: colors.warning }]}>
                <Text style={[styles.neighborInit, nb.filler && { color: colors.textDim }]}>{(nb.name || "A")[0].toUpperCase()}</Text>
              </View>
              <Text style={styles.neighborName} numberOfLines={1}>{nb.enhanced ? "☣" : ""}{nb.name}</Text>
              <Text style={styles.neighborLv}>Lv{nb.level}</Text>
            </Pressable>
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
      {reward && <Reward label={reward.label} boss={reward.boss} accent={accent} onClose={finishReward} />}
      {milestone && <MilestoneOverlay lift={milestone.lift} value={milestone.value} accent={accent} token={token} onClose={() => setMilestone(null)} />}
      {zoneReveal && <ZoneReveal zone={zoneReveal} onClose={() => setZoneReveal(null)} />}
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
  taunt: { position: "absolute", bottom: 44, width: 108, marginLeft: -32, backgroundColor: "rgba(5,5,8,0.95)", borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 4, zIndex: 20 },
  tauntText: { color: colors.text, fontSize: 9, fontWeight: "700", textAlign: "center" },
  challengeBtn: { marginTop: 4, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 3, alignItems: "center" },
  challengeText: { fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  challengeBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.xs, padding: spacing.sm, borderWidth: 1, borderRadius: radius.sm, backgroundColor: "rgba(0,0,0,0.4)" },
  challengeBannerText: { color: colors.text, fontSize: 11, fontWeight: "700", textAlign: "center" },
  secondaryBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  neighborDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface3, borderWidth: 2, borderColor: colors.textDim, alignItems: "center", justifyContent: "center" },
  neighborDotNpc: { borderStyle: "dashed", opacity: 0.7 },
  npcTag: { color: colors.textDim, fontSize: 8, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginTop: 3 },
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
  flashLayer: { ...StyleSheet.absoluteFillObject },
  combatStage: { width: "100%", alignItems: "center" },
  combatTitle: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 18 },
  combatSub: { color: colors.textMid, marginTop: 4, marginBottom: spacing.lg, textAlign: "center", paddingHorizontal: spacing.lg },
  hpBar: { width: "80%", height: 10, borderRadius: 5, backgroundColor: colors.surface3, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: spacing.xl },
  hpFill: { height: "100%" },
  hpPhaseMark: { position: "absolute", left: "50%", top: 0, bottom: 0, width: 2, backgroundColor: colors.surface },
  phaseBanner: { fontWeight: "900", letterSpacing: 4, fontSize: 20, marginTop: spacing.md },
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
  lootHolder: { width: 120, height: 120, alignItems: "center", justifyContent: "center" },
  lootGlow: { position: "absolute", fontSize: 100 },
  lootItem: { fontSize: 62 },
  lootSub: { color: colors.textDim, fontSize: 11, marginBottom: spacing.md, letterSpacing: 1 },
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
  // zone reveal
  zoneRevealGlow: { fontSize: 60, marginBottom: spacing.md },
  zoneRevealKicker: { color: colors.textMid, fontWeight: "800", letterSpacing: 4, fontSize: 12 },
  zoneRevealName: { fontWeight: "900", letterSpacing: 4, fontSize: 30, marginTop: spacing.sm, textAlign: "center" },
  zoneRevealTier: { color: colors.textDim, letterSpacing: 2, fontSize: 12, marginTop: spacing.sm },
  zoneRevealTap: { position: "absolute", bottom: 60, color: colors.textDim, letterSpacing: 2, fontSize: 11 },
});
