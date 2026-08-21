import { useEffect, useRef, useState, useCallback } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Dimensions, ActivityIndicator, useWindowDimensions, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import Svg, { Polyline, Circle } from "react-native-svg";
import Animated, { useSharedValue, useAnimatedStyle, useAnimatedProps, withTiming, withSequence, withDelay, withRepeat, Easing, runOnJS } from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, bodyImage, weaponImage, weaponName, zoneImage } from "@/src/lib/theme";
import { Image as ExpoImage } from "expo-image";

function weaponLabel(id?: string) {
  return weaponName(id).toUpperCase();
}

function hexA(hex: string, a: number) {
  const h = (hex || "#000000").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0, g = parseInt(n.slice(2, 4), 16) || 0, b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r},${g},${b},${a})`;
}

// Environmental texture per area is now a painted backdrop image (see zoneImage()).
import { HeroSprite } from "@/src/components/HeroSprite";
import { useResponsive } from "@/src/lib/responsive";
import { PetCompanion } from "@/src/components/PetCompanion";
import { GearedAvatar } from "@/src/components/GearedAvatar";
import { MemberSheet } from "@/src/components/MemberSheet";
import { initSfx, playSfx, isSfxEnabled, setSfxEnabled, startZoneMusic, stopMusic } from "@/src/lib/sfx";
import { Chronicle, SystemWindow, StoryBook, type StoryCtx, type SysMsg } from "@/src/components/JourneyStory";
import { JourneyIntro } from "@/src/components/JourneyIntro";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width: SCREEN_W } = Dimensions.get("window");
const MILESTONES = [135, 185, 225, 275, 315, 365, 405, 455, 495, 585, 675];
const LIFT_LABEL: Record<string, string> = { bench: "BENCH", squat: "SQUAT", deadlift: "DEADLIFT", ohp: "OHP" };

const AnimatedPolyline = Animated.createAnimatedComponent(Polyline);

// Drifting ember/spark that floats up the map and fades — pure atmosphere.
function Ember({ x, top, delay, accent, size }: { x: number; top: number; delay: number; accent: string; size: number }) {
  const y = useSharedValue(0);
  const op = useSharedValue(0);
  useEffect(() => {
    const dur = 5200 + delay;
    y.value = withDelay(delay, withRepeat(withTiming(-230, { duration: dur, easing: Easing.linear }), -1, false));
    op.value = withDelay(delay, withRepeat(withSequence(withTiming(0.55, { duration: 1300 }), withTiming(0, { duration: dur - 1300 })), -1, false));
  }, []);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }], opacity: op.value }));
  return <Animated.View pointerEvents="none" style={[{ position: "absolute", left: x, top, width: size, height: size, borderRadius: size / 2, backgroundColor: accent }, st]} />;
}

function EmberField({ accent, width }: { accent: string; width: number }) {
  const embers = useRef(
    Array.from({ length: 16 }, (_, i) => ({ x: 40 + Math.random() * Math.max(1, width - 80), top: 150 + Math.random() * 170, delay: i * 360, size: 2 + Math.round(Math.random() * 3) }))
  ).current;
  return <View pointerEvents="none" style={StyleSheet.absoluteFill}>{embers.map((e, i) => <Ember key={i} {...e} accent={accent} />)}</View>;
}

// Expanding ring drawing the eye to a node (the next available quest, or a boss).
function PulseRing({ x, y, color, size = 46, boss }: { x: number; y: number; color: string; size?: number; boss?: boolean }) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withRepeat(withTiming(1, { duration: boss ? 1200 : 1600, easing: Easing.out(Easing.quad) }), -1, false);
  }, []);
  const st = useAnimatedStyle(() => ({ opacity: 0.75 * (1 - p.value), transform: [{ scale: 0.55 + p.value * 1.15 }] }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", left: x - size / 2, top: y - size / 2, width: size, height: size, borderRadius: size / 2, borderWidth: 2.5, borderColor: color }, st]}
    />
  );
}

// A glowing spark that runs along the path the player has already cleared — momentum.
function PathComet({ coords, accent }: { coords: { x: number; y: number }[]; accent: string }) {
  const n = coords.length;
  const p = useSharedValue(0);
  useEffect(() => {
    if (n < 2) return;
    p.value = 0;
    p.value = withRepeat(withTiming(n - 1, { duration: (n - 1) * 850, easing: Easing.inOut(Easing.sin) }), -1, false);
  }, [n]);
  const st = useAnimatedStyle(() => {
    "worklet";
    if (n < 2) return { opacity: 0 };
    const i = Math.min(n - 2, Math.floor(p.value));
    const t = p.value - i;
    const x = coords[i].x + (coords[i + 1].x - coords[i].x) * t;
    const y = coords[i].y + (coords[i + 1].y - coords[i].y) * t;
    return { opacity: 0.95, transform: [{ translateX: x - 5 }, { translateY: y - 5 }] };
  });
  if (n < 2) return null;
  return <Animated.View pointerEvents="none" style={[styles.comet, { backgroundColor: accent, shadowColor: accent }, st]} />;
}

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

// D&D-style skill map — the 5 combat stats become rollable skills.
const SKILLS: Record<string, { label: string; short: string; hit: string; miss: string }> = {
  strength:  { label: "STRENGTH",  short: "STR", hit: "You heave the iron and shatter its guard.", miss: "The weight stalls — the enemy holds." },
  power:     { label: "POWER",     short: "PWR", hit: "You explode through the rep — devastating.", miss: "No drive behind it. A glancing blow." },
  speed:     { label: "AGILITY",   short: "AGI", hit: "You strike faster than it can react.", miss: "Too slow — it slips your blow." },
  endurance: { label: "ENDURANCE", short: "END", hit: "You grind through the burn and outlast it.", miss: "Your gas tank sputters mid-set." },
  grit:      { label: "GRIT",      short: "GRT", hit: "Pure will — you refuse to break.", miss: "Doubt creeps in. The blow softens." },
};
const ZONE_SKILLS: string[][] = [
  ["grit", "endurance"],                       // 0 Wastes
  ["strength", "power"],                        // 1 Iron Valley
  ["speed", "endurance"],                       // 2 Storm Ridge
  ["power", "grit"],                            // 3 Ember Peaks
  ["strength", "speed", "grit"],                // 4 Crimson Citadel
  ["power", "strength", "grit", "endurance"],   // 5 Ascension
];

function Combat({ node, stats, accent, zoneIndex, onWin, onClose }: { node: any; stats: any; accent: string; zoneIndex?: number; onWin: () => void; onClose: () => void }) {
  const isBoss = !!node?.boss;
  const maxHp = isBoss ? 180 : 100;
  const [hp, setHp] = useState(maxHp);
  const [dmgs, setDmgs] = useState<{ id: number; value: number; crit: boolean }[]>([]);
  const [victory, setVictory] = useState(false);
  const [phase, setPhase] = useState(1);
  const [banner, setBanner] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(20);
  const [result, setResult] = useState<{ d: number; mod: number; dc: number; total: number; outcome: "crit" | "hit" | "miss"; skill: string } | null>(null);
  const heroX = useSharedValue(-40);
  const shake = useSharedValue(0);
  const slash = useSharedValue(0);
  const enemyX = useSharedValue(0);
  const flash = useSharedValue(0);
  const dieScale = useSharedValue(1);
  const timers = useRef<any[]>([]);

  const heroStyle = useAnimatedStyle(() => ({ transform: [{ translateX: heroX.value }] }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const slashStyle = useAnimatedStyle(() => ({ opacity: slash.value, transform: [{ scale: 0.6 + slash.value * 1.1 }, { rotate: "-25deg" }] }));
  const enemyStyle = useAnimatedStyle(() => ({ transform: [{ translateX: enemyX.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const dieStyle = useAnimatedStyle(() => ({ transform: [{ scale: dieScale.value }] }));

  const order = ZONE_SKILLS[Math.max(0, Math.min(5, zoneIndex ?? 0))];
  const skillKey = order[round % order.length];
  const skill = SKILLS[skillKey];
  const statVal = Math.round(stats?.[skillKey] ?? 40);
  const modifier = Math.max(-2, Math.min(9, Math.round((statVal - 40) / 6)));
  const dc = (isBoss ? 12 : 9) + Math.floor(round / 2) + (phase === 2 ? 2 : 0);

  useEffect(() => {
    heroX.value = withTiming(0, { duration: 420, easing: Easing.out(Easing.cubic) });
    return () => { timers.current.forEach(clearTimeout); };
  }, []);

  const applyStrike = (outcome: "crit" | "hit" | "miss") => {
    playSfx("slash");
    const rmHit = setTimeout(() => playSfx("hit"), 90);
    timers.current.push(rmHit);
    const finisher = outcome === "crit";
    try { Haptics.impactAsync(finisher ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium); } catch {}
    heroX.value = withSequence(withTiming(finisher ? 40 : 24, { duration: 100 }), withTiming(6, { duration: 180 }));
    slash.value = withSequence(withTiming(1, { duration: 80 }), withTiming(0, { duration: 240 }));
    shake.value = withSequence(withTiming(-10, { duration: 45 }), withTiming(10, { duration: 60 }), withTiming(0, { duration: 60 }));
    enemyX.value = withSequence(withTiming(finisher ? 24 : 12, { duration: 70 }), withTiming(0, { duration: 130 }));
    if (finisher) flash.value = withSequence(withTiming(0.8, { duration: 70 }), withTiming(0, { duration: 400 }));
    const value = outcome === "crit" ? 34 + Math.floor(Math.random() * 16) : outcome === "hit" ? 20 + Math.floor(Math.random() * 12) : 7 + Math.floor(Math.random() * 5);
    const did = Date.now();
    setDmgs((d) => [...d, { id: did, value, crit: outcome !== "miss" }]);
    const rm = setTimeout(() => setDmgs((d) => d.filter((x) => x.id !== did)), 1000);
    timers.current.push(rm);
    setHp((prev) => {
      const nx = Math.max(0, prev - value);
      if (isBoss && prev > maxHp * 0.5 && nx <= maxHp * 0.5) {
        setPhase(2); setBanner("PHASE II — ENRAGED");
        try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning); } catch {}
        flash.value = withSequence(withTiming(0.6, { duration: 120 }), withTiming(0, { duration: 300 }));
        const clr = setTimeout(() => setBanner(null), 1100); timers.current.push(clr);
      }
      if (nx <= 0) {
        const done = setTimeout(() => {
          setVictory(true); playSfx("victory");
          try { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } catch {}
          slash.value = withRepeat(withSequence(withTiming(1, { duration: 200 }), withTiming(0.3, { duration: 200 })), 2, false);
        }, 450);
        timers.current.push(done);
      }
      return nx;
    });
  };

  const roll = () => {
    if (rolling || victory) return;
    setRolling(true); setResult(null);
    dieScale.value = withSequence(withTiming(1.25, { duration: 120 }), withTiming(1, { duration: 160 }));
    let ticks = 0;
    const iv = setInterval(() => {
      setFace(1 + Math.floor(Math.random() * 20));
      ticks++;
      if (ticks > 12) {
        clearInterval(iv);
        const d = 1 + Math.floor(Math.random() * 20);
        setFace(d);
        const total = d + modifier;
        const nat20 = d === 20; const nat1 = d === 1;
        const success = !nat1 && (nat20 || total >= dc);
        const outcome: "crit" | "hit" | "miss" = nat20 || (success && total >= dc + 6) ? "crit" : success ? "hit" : "miss";
        setResult({ d, mod: modifier, dc, total, outcome, skill: skill.label });
        applyStrike(outcome);
        setRound((r) => r + 1);
        setRolling(false);
      }
    }, 55);
    timers.current.push(iv);
  };

  return (
    <View style={styles.combatWrap}>
      <Animated.View style={[styles.flashLayer, { backgroundColor: isBoss ? "#FFFFFF" : accent }, flashStyle]} pointerEvents="none" />
      <Animated.View style={[styles.combatStage, shakeStyle]}>
        <Text style={styles.combatTitle}>{isBoss ? "☠ BOSS · SKILL CHECK" : "⚔ SKILL CHECK"}</Text>
        <Text style={styles.combatSub}>{node?.title}{isBoss ? `  ·  PHASE ${phase}` : ""}</Text>

        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${(hp / maxHp) * 100}%`, backgroundColor: hp > maxHp * 0.4 ? accent : colors.error }]} />
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
          <View style={styles.checkBox}>
            <Text style={styles.checkStat}>CHECK · <Text style={{ color: accent }}>{skill.label}</Text>  ·  DC {dc}</Text>
            <View style={styles.checkRow}>
              <Animated.View style={[styles.die, { borderColor: accent }, dieStyle]}>
                <Text style={[styles.dieFace, { color: accent }]}>{face}</Text>
              </Animated.View>
              <View style={{ flex: 1 }}>
                <Text style={styles.modText}>{skill.short} modifier: <Text style={{ color: accent }}>{modifier >= 0 ? `+${modifier}` : modifier}</Text>  (stat {statVal})</Text>
                {result ? (
                  <Text style={[styles.resultText, { color: result.outcome === "miss" ? colors.textDim : result.outcome === "crit" ? colors.warning : accent }]}>
                    ⚄ {result.d} {result.mod >= 0 ? "+" : "−"} {Math.abs(result.mod)} = {result.total} vs {result.dc} · {result.outcome === "crit" ? "CRITICAL!" : result.outcome === "hit" ? "HIT" : "MISS"}
                  </Text>
                ) : (
                  <Text style={styles.resultText}>Roll a d20 and add your {skill.short}.</Text>
                )}
              </View>
            </View>
            {result && <Text style={styles.checkStory}>{result.outcome === "miss" ? skill.miss : skill.hit}</Text>}
            <Pressable testID="combat-roll" onPress={roll} disabled={rolling} style={[styles.primaryBtn, { backgroundColor: accent, opacity: rolling ? 0.6 : 1 }]}>
              <Text style={styles.primaryBtnText}>{rolling ? "ROLLING…" : "⚄ ROLL THE DICE"}</Text>
            </Pressable>
          </View>
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
  const cardRef = useRef(null);
  const isLoot = boss || /frame|aura|title|emblem|badge/i.test(label);
  const shareWin = async () => {
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 0.95 });
      if (await Sharing.isAvailableAsync().catch(() => false)) await Sharing.shareAsync(uri, { dialogTitle: "Share your victory" });
    } catch {}
  };
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
       <View ref={cardRef} collapsable={false} style={{ alignItems: "center" }}>
        {isLoot ? (
          <View style={styles.lootHolder}>
            <Animated.Text style={[styles.lootGlow, { color: accent }, glowSt]}>✦</Animated.Text>
            <Animated.Text style={[styles.lootItem, lootSt]}>{boss ? "🎖️" : "🌀"}</Animated.Text>
          </View>
        ) : (
          <Text style={styles.rewardBurst}>✦</Text>
        )}
        <Text style={[styles.rewardTitle, { color: accent }]}>{boss ? "☠ BOSS DEFEATED ☠" : isLoot ? "★ LOOT DROP ★" : "REWARD UNLOCKED"}</Text>
        <Text style={styles.rewardLabel}>{label}</Text>
        <Text style={styles.rewardBrand}>{"THE CIRCLE"}</Text>
       </View>
        {isLoot && <Text style={styles.lootSub}>Equip it in your Locker / Loadout</Text>}
        <Pressable testID="reward-share" onPress={shareWin} style={[styles.primaryBtn, styles.secondaryBtn, { marginBottom: spacing.sm }]}>
          <Text style={[styles.primaryBtnText, { color: accent }]}>📢 SHARE TO STORY</Text>
        </Pressable>
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
        <Text style={styles.zoneRevealKicker}>◇ THE CIRCLE · RANK PROMOTION</Text>
        <View style={[styles.rankBadge, { borderColor: zone?.accent }]}>
          <Text style={[styles.rankBadgeText, { color: zone?.accent }]}>{zone?.tier}</Text>
        </View>
        <Text style={styles.rankAttained}>RANK {zone?.tier} ATTAINED</Text>
        <Text style={[styles.zoneRevealName, { color: zone?.accent }]}>{zone?.name}</Text>
        <Text style={styles.zoneRevealLore}>The Circle has re-recorded you at a higher rank. New quests, new bosses, new rivals await. Read your Chronicle (📜) for the next chapter of your story.</Text>
      </Animated.View>
      <Text style={styles.zoneRevealTap}>tap to continue</Text>
    </Pressable>
  );
}

export default function Journey() {
  const { token, user } = useAuth();
  const previewParam = useLocalSearchParams<{ preview?: string }>().preview;
  // Admin non-destructive preview: force the displayed zone (art + story) without changing data.
  const previewZone = (user?.is_admin && previewParam != null && previewParam !== "")
    ? Math.max(0, Math.min(5, parseInt(String(previewParam), 10) || 0))
    : null;
  const insets = useSafeAreaInsets();
  const { isDesktop } = useResponsive();
  const { width: winW } = useWindowDimensions();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [combatNode, setCombatNode] = useState<any>(null);
  const [questInfo, setQuestInfo] = useState<any>(null);
  const [reward, setReward] = useState<{ label: string; boss: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [milestone, setMilestone] = useState<{ lift: string; value: number } | null>(null);
  const [zoneReveal, setZoneReveal] = useState<any>(null);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [storybookOpen, setStorybookOpen] = useState(false);
  const [clanRank, setClanRank] = useState<any>(null);
  const [sysWin, setSysWin] = useState<SysMsg | null>(null);
  const [sfxOn, setSfxOn] = useState(true);
  const [taunt, setTaunt] = useState<{ id: string; text: string } | null>(null);
  const [peekUser, setPeekUser] = useState<string | null>(null);
  const [rivalSheet, setRivalSheet] = useState<any>(null);
  const [races, setRaces] = useState<any[]>([]);
  const [raceHistory, setRaceHistory] = useState<any[]>([]);

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
      // Stat growth — The Circle celebrates a big jump since your last visit
      try {
        const cur = d?.me?.stats || {};
        const snapRaw = await AsyncStorage.getItem("hic_stats_snap");
        const NAMES: Record<string, string> = { strength: "STRENGTH", power: "POWER", speed: "AGILITY", endurance: "ENDURANCE", grit: "GRIT" };
        if (snapRaw) {
          const prev = JSON.parse(snapRaw);
          let best: { k: string; gain: number } | null = null;
          for (const k of Object.keys(NAMES)) {
            const gain = Math.round((cur[k] || 0) - (prev[k] || 0));
            if (gain >= 4 && (!best || gain > best.gain)) best = { k, gain };
          }
          if (best) setSysWin({ title: `${NAMES[best.k]} ASCENDED`, lines: [`Your ${NAMES[best.k]} rose +${best.gain}.`, "The Circle records your growth."], tone: "victory" });
        }
        await AsyncStorage.setItem("hic_stats_snap", JSON.stringify(cur));
      } catch {}
      // Atrophy — warn when the looming threat grows
      try {
        const at = d?.atrophy;
        if (at && at.level >= 2) {
          const seenLvl = parseInt((await AsyncStorage.getItem("hic_atrophy_lvl")) || "0", 10);
          if (at.level > seenLvl) setSysWin({ title: "⚠ REGRESSION SETS IN", lines: [at.note, `${at.days_idle} days without training.`], tone: "danger" });
        }
        if (at) await AsyncStorage.setItem("hic_atrophy_lvl", String(at.level));
      } catch {}
      // Enhanced designation — one-time in-story acknowledgement of borrowed power
      try {
        if (user?.enhanced && !(await AsyncStorage.getItem("hic_enh_seen"))) {
          setSysWin({ title: "⚗ DESIGNATION: ENHANCED", lines: ["The Circle detects artificial Shard compounds.", "Adaptation is borrowed. All debt must be paid."], tone: "danger" });
          await AsyncStorage.setItem("hic_enh_seen", "1");
        }
      } catch {}
      try { setClanRank(await apiFetch(token, "/api/journey/clans")); } catch {}
      try { const rr = await apiFetch(token, "/api/journey/races"); setRaces(rr.races || []); } catch {}
      try { const rh = await apiFetch(token, "/api/journey/races/history"); setRaceHistory(rh.history || []); } catch {}
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
    setRivalSheet(null);
    try {
      const r = await apiFetch(token, "/api/journey/challenge", { method: "POST", body: JSON.stringify({ to_user_id: nb.user_id }) });
      flash(`⚔ Challenge sent to ${r?.to_name || nb.name}!`);
      try { const rr = await apiFetch(token, "/api/journey/races"); setRaces(rr.races || []); } catch {}
    } catch { flash("Couldn't send challenge"); }
  };

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 1600); };

  // Map ambience: flowing dashed path + a gentle hero idle bob.
  const dashOffset = useSharedValue(0);
  const heroBob = useSharedValue(0);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    dashOffset.value = withRepeat(withTiming(-24, { duration: 900, easing: Easing.linear }), -1, false);
    heroBob.value = withRepeat(withSequence(withTiming(-5, { duration: 900, easing: Easing.inOut(Easing.sin) }), withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) })), -1, false);
  }, []);
  const dashProps = useAnimatedProps(() => ({ strokeDashoffset: dashOffset.value }));
  const heroBobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: heroBob.value }] }));

  const accent = data?.zone?.accent || colors.brandPrimary;
  const primary = data?.zone?.primary || colors.brand;

  const onNodePress = (n: any) => {
    // Fallout-style: tapping any quest opens its info panel first.
    setQuestInfo(n);
  };
  const engageQuest = () => {
    const n = questInfo;
    setQuestInfo(null);
    if (!n) return;
    if (n.claimed) return flash("✓ Already cleared");
    if (!n.complete) return flash("🔒 Finish the objectives first");
    // Solo-Leveling style: The Circle issues the quest before the fight.
    setSysWin({
      title: n.boss ? "⚠ BOSS ENCOUNTER" : "QUEST ACCEPTED",
      lines: [ (n.title || n.name || "Quest").toUpperCase(), n.boss ? "A guardian of The Atrophy blocks your ascent." : "The Circle calls. Answer it." ],
      tone: n.boss ? "danger" : "info",
    });
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

  const finishReward = async () => {
    setReward(null);
    await load();
    // Story flourish once the reward reveal closes.
    setSysWin({ title: "QUEST CLEARED", lines: ["The Circle acknowledges your victory.", "The Atrophy is pushed back — for now."], tone: "victory" });
  };

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
  const neighbors: any[] = [...realNeighbors, ...fillers].sort((a, b) => a.xp - b.xp);
  const claimedCount = nodes.filter((n) => n.claimed).length;
  const heroIndex = Math.min(claimedCount, Math.max(0, nodes.length - 1));

  const contentW = isDesktop ? Math.max(winW - 32, nodes.length * 200 + 120) * zoom : Math.max(SCREEN_W * 1.5, nodes.length * 116 + 120);
  const mapH = isDesktop ? 460 : 340;
  const baseY = isDesktop ? 210 : 150;
  const amp = isDesktop ? 74 : 46;
  const nodeX = (i: number) => 70 + (nodes.length <= 1 ? 0 : i * ((contentW - 150) / (nodes.length - 1)));
  const nodeY = (i: number) => baseY + Math.sin(i * 0.9) * amp;

  const xps = neighbors.map((n) => n.xp);
  const minXp = Math.min(...xps, 0); const maxXp = Math.max(...xps, 1);
  const neighborX = (xp: number) => 70 + ((xp - minXp) / Math.max(1, maxXp - minXp)) * (contentW - 150);

  const points = nodes.map((_, i) => `${nodeX(i)},${nodeY(i)}`).join(" ");
  const traveledPoints = nodes.slice(0, heroIndex + 1).map((_, i) => `${nodeX(i)},${nodeY(i)}`).join(" ");
  const traveledCoords = nodes.slice(0, heroIndex + 1).map((_, i) => ({ x: nodeX(i), y: nodeY(i) }));
  const activeIndex = nodes.findIndex((n) => n.complete && !n.claimed);

  return (
    <View style={styles.root}>
      <ExpoImage source={zoneImage(previewZone ?? data?.zone?.index)} style={StyleSheet.absoluteFill} contentFit="cover" transition={300} />
      <LinearGradient colors={[hexA(primary, 0.5), "rgba(5,5,8,0.86)", "rgba(5,5,8,0.96)"]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable testID="journey-back" onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>‹ BACK</Text></Pressable>
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.zoneName, { color: accent }]}>{data?.zone?.name}</Text>
          <Text style={styles.zoneTier}>TIER {data?.zone?.tier} · RANK #{data?.me?.rank_position}/{data?.me?.total_players}</Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.md }}>
          <Pressable testID="journey-storybook" onPress={() => setStorybookOpen(true)} hitSlop={10}><Text style={[styles.prBtn, { color: accent }]}>📖</Text></Pressable>
          <Pressable testID="journey-story" onPress={() => setChronicleOpen(true)} hitSlop={10}><Text style={[styles.prBtn, { color: accent }]}>📜</Text></Pressable>
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

      {/* The Atrophy — looming threat meter that grows with inactivity */}
      {data?.atrophy && data.atrophy.level > 0 && (
        <Pressable testID="atrophy-meter" onPress={() => setChronicleOpen(true)} style={styles.atrophyWrap}>
          <View style={styles.atrophyTop}>
            <Text style={styles.atrophyLbl}>⚠ REGRESSION</Text>
            <Text style={styles.atrophyDays}>{data.atrophy.days_idle}d idle</Text>
          </View>
          <View style={styles.atrophyTrack}>
            <View style={[styles.atrophyFill, { width: `${(data.atrophy.level / 4) * 100}%` }]} />
          </View>
          <Text style={styles.atrophyNote} numberOfLines={1}>{data.atrophy.note}</Text>
        </Pressable>
      )}

      {/* Clans climb a shared Circle ranking together */}
      {clanRank && (
        <Pressable testID="clan-circle-rank" onPress={() => router.push("/(tabs)/community?group=1")} style={styles.clanRankWrap}>
          {clanRank.mine?.length > 0 ? (
            <Text style={styles.clanRankText}>🛡 {clanRank.mine[0].name} · Circle Rank <Text style={styles.clanRankNum}>#{clanRank.mine[0].rank}</Text> of {clanRank.total} · {clanRank.mine[0].xp.toLocaleString()} XP</Text>
          ) : (
            <Text style={styles.clanRankText}>🛡 Join a Clan to climb the Circle ranking together →</Text>
          )}
        </Pressable>
      )}

      {(data?.challenges?.length || 0) > 0 && (
        <View style={[styles.challengeBanner, { borderColor: accent }]}>
          <Text style={styles.challengeBannerText}>🔥 {data.challenges[0].from_name} {data.challenges.length > 1 ? `+${data.challenges.length - 1} more ` : ""}challenged you to catch them!</Text>
        </View>
      )}

      {races.length > 0 && (
        <View style={styles.raceWrap}>
          <Text style={styles.raceHeader}>⚔ ACTIVE RACES</Text>
          {races.map((r) => {
            const behind = !r.i_lead && !r.overtaken;
            const label = r.overtaken
              ? (r.won_by_me ? `🏆 You caught ${r.other_name}! +${r.reward_xp} XP` : `${r.other_name} caught you — defend next time`)
              : r.nudge
              ? `⚠ ${r.other_name} is closing — only ${r.gap} XP behind!`
              : (r.i_lead ? `You lead by ${r.gap} XP` : `${r.gap} XP behind ${r.other_name}`);
            const statusColor = r.overtaken ? (r.won_by_me ? colors.success : colors.error) : r.nudge ? colors.warning : behind ? accent : colors.textDim;
            const statusText = r.overtaken ? (r.won_by_me ? "🏆 WON" : "🏁 LOST") : r.nudge ? "⚠ CLOSING" : behind ? "CLOSING" : "AHEAD";
            const borderCol = r.overtaken ? (r.won_by_me ? colors.success : colors.error) : r.nudge ? colors.warning : colors.borderStrong;
            return (
              <View key={r.id} style={[styles.raceCard, { borderColor: borderCol }]}>
                <View style={styles.raceRow}>
                  <Text style={styles.raceVs} numberOfLines={1}>YOU <Text style={styles.raceVsDim}>vs</Text> {r.other_enhanced ? "☣ " : ""}{r.other_name}</Text>
                  <Text style={[styles.raceStatus, { color: statusColor }]}>{statusText}</Text>
                </View>
                <View style={styles.raceTrack}>
                  <View style={[styles.raceFill, { width: `${Math.round(r.progress * 100)}%`, backgroundColor: r.overtaken ? (r.won_by_me ? colors.success : colors.error) : r.nudge ? colors.warning : accent }]} />
                  <Text style={styles.raceFlag}>🏁</Text>
                </View>
                <Text style={[styles.raceLabel, r.nudge && { color: colors.warning, fontWeight: "800" }]}>{label}</Text>
                {r.shield_awarded && <Text style={styles.shieldNote}>🛡 LEAD DEFENDED · +{r.shield_xp} XP</Text>}
              </View>
            );
          })}
        </View>
      )}

      {raceHistory.length > 0 && (
        <View style={styles.raceWrap}>
          <Text style={styles.raceHeader}>📜 PAST RACES</Text>
          {raceHistory.slice(0, 6).map((h) => (
            <View key={h.id} style={styles.histRow}>
              <Text style={[styles.histIcon, { color: h.won ? colors.success : colors.error }]}>{h.won ? "🏆" : "☠"}</Text>
              <Text style={styles.histText} numberOfLines={1}>{h.won ? `Caught ${h.other_name}` : `${h.other_name} caught you`}</Text>
              <Text style={[styles.histResult, { color: h.won ? colors.success : colors.error }]}>{h.won ? "WON" : "LOST"}</Text>
            </View>
          ))}
        </View>
      )}

      {isDesktop && (
        <View style={styles.zoomBar}>
          <Pressable testID="journey-zoom-out" onPress={() => setZoom((z) => Math.max(0.6, +(z - 0.2).toFixed(2)))} style={styles.zoomBtn}><Text style={styles.zoomBtnText}>−</Text></Pressable>
          <Pressable testID="journey-zoom-reset" onPress={() => setZoom(1)} style={styles.zoomReset}><Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text></Pressable>
          <Pressable testID="journey-zoom-in" onPress={() => setZoom((z) => Math.min(2, +(z + 0.2).toFixed(2)))} style={styles.zoomBtn}><Text style={styles.zoomBtnText}>+</Text></Pressable>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ width: contentW }} style={styles.mapScroll}>
        <View style={{ width: contentW, height: mapH }}>
          <ExpoImage source={zoneImage(previewZone ?? data?.zone?.index)} style={[StyleSheet.absoluteFill, styles.mapArt]} contentFit="cover" transition={300} />
          <LinearGradient
            colors={[hexA(primary, 0.22), "rgba(5,5,8,0.42)", hexA(accent, 0.14)]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill} pointerEvents="none"
          />
          <EmberField accent={accent} width={contentW} />
          <Svg width={contentW} height={mapH} style={StyleSheet.absoluteFill}>
            <AnimatedPolyline points={points} fill="none" stroke={colors.border} strokeWidth={5} strokeDasharray="2 10" strokeLinecap="round" animatedProps={dashProps} />
            {traveledPoints.split(" ").length > 1 && (
              <Polyline points={traveledPoints} fill="none" stroke={accent} strokeWidth={5} strokeLinecap="round" />
            )}
            {nodes.map((n, i) => (
              <Circle key={i} cx={nodeX(i)} cy={nodeY(i)} r={n.boss ? 20 : 15}
                fill={n.claimed ? accent : n.complete ? primary : "#12141A"}
                stroke={n.complete && !n.claimed ? accent : colors.border} strokeWidth={n.complete && !n.claimed ? 3 : 2} />
            ))}
          </Svg>

          {/* animated momentum spark along the cleared path */}
          <PathComet coords={traveledCoords} accent={accent} />

          {/* pulsing rings: next available quest + any unclaimed boss */}
          {activeIndex >= 0 && <PulseRing x={nodeX(activeIndex)} y={nodeY(activeIndex)} color={accent} size={nodes[activeIndex]?.boss ? 60 : 46} boss={nodes[activeIndex]?.boss} />}
          {nodes.map((n, i) => (n.boss && !n.claimed && i !== activeIndex ? <PulseRing key={`bp-${i}`} x={nodeX(i)} y={nodeY(i)} color={colors.error} size={60} boss /> : null))}

          {/* node touch targets + labels */}
          {nodes.map((n, i) => (
            <Pressable key={i} testID={`journey-node-${i}`} onPress={() => onNodePress(n)}
              style={[styles.nodeHit, { left: nodeX(i) - 46, top: nodeY(i) - 30 }]}>
              <Text style={styles.nodeIcon}>{n.claimed ? "✓" : n.boss ? "☠" : n.complete ? "⚔" : "🔒"}</Text>
              <Text style={[styles.nodeScope, { color: n.boss ? colors.error : n.claimed ? colors.success : n.complete ? accent : colors.textDim }]} numberOfLines={1}>
                {n.custom ? "CUSTOM" : (n.scope || "").toUpperCase()}{n.boss ? " · BOSS" : ""}
              </Text>
              <Text style={styles.nodeLabel} numberOfLines={2}>{n.title}</Text>
              {!!(n.reward_label || n.reward_xp) && <Text style={styles.nodeReward} numberOfLines={1}>🎁 {n.reward_label || `${n.reward_xp} XP`}</Text>}
              {Array.isArray(n.objectives) && n.objectives[0] && !n.claimed && (
                <Text style={styles.nodeObj} numberOfLines={1}>{Math.min(n.objectives[0].current || 0, n.objectives[0].target || 1)}/{n.objectives[0].target || 1} {n.objectives[0].label || ""}</Text>
              )}
            </Pressable>
          ))}

          {/* rivals lane — staggered into two rows so markers never overlap */}
          {neighbors.filter((nb) => !nb.is_me).map((nb, i) => (
            <Pressable
              key={nb.user_id}
              testID={`rival-${nb.user_id}`}
              onPress={() => { showTaunt(nb.user_id); setRivalSheet(nb); }}
              style={[styles.neighbor, { left: neighborX(nb.xp) - 22, top: 14 + (i % 2) * 60 }]}
            >
              {taunt?.id === nb.user_id && (
                <View style={[styles.taunt, { borderColor: accent }]}>
                  <Text style={styles.tauntText}>{taunt?.text}</Text>
                </View>
              )}
              <View style={[styles.neighborDot, nb.filler && styles.neighborDotNpc, nb.ahead && styles.neighborDotAhead, nb.founder && { borderColor: colors.warning }]}>
                <Text style={[styles.neighborInit, nb.filler && { color: colors.textDim }]}>{(nb.name || "A")[0].toUpperCase()}</Text>
                {!nb.filler && <View style={[styles.rivalTag, { backgroundColor: accent }]}><Text style={styles.rivalTagText}>⚔</Text></View>}
              </View>
              <View style={styles.neighborChip}>
                <Text style={styles.neighborName} numberOfLines={1}>{nb.enhanced ? "☣ " : ""}{nb.name}</Text>
                <Text style={styles.neighborLv}>Lv{nb.level}</Text>
              </View>
            </Pressable>
          ))}

          {/* hero */}
          <Animated.View style={[styles.hero, heroBobStyle, { left: nodeX(heroIndex) - 24, top: nodeY(heroIndex) - 78 }]}>
            <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
              {bodyImage(user) ? (
                <GearedAvatar person={user} style={{ width: 54, height: 78 }} contentFit="contain" />
              ) : (
                <HeroSprite size={52} color={accent} facing={1} />
              )}
              {user?.equipped_pet && <PetCompanion pet={user.equipped_pet} size={26} />}
            </View>
            <View style={[styles.heroTag, { borderColor: accent }]}><Text style={styles.heroTagText}>YOU · Lv{data?.me?.level}</Text></View>
          </Animated.View>
        </View>
      </ScrollView>

      {isDesktop && nodes.length > 0 && (
        <View style={styles.minimap}>
          <Text style={styles.minimapLabel}>SEASON</Text>
          <View style={styles.minimapTrack}>
            {nodes.map((n, i) => (
              <View key={i} style={styles.minimapDotWrap}>
                <View style={[
                  styles.minimapDot,
                  { backgroundColor: n.claimed ? accent : n.complete ? primary : colors.border },
                  n.boss && styles.minimapBoss,
                  i === heroIndex && { borderColor: "#fff", borderWidth: 2, transform: [{ scale: 1.5 }] },
                ]} />
              </View>
            ))}
          </View>
          <Text style={styles.minimapPct}>{Math.round((nodes.filter((n) => n.claimed).length / nodes.length) * 100)}%</Text>
        </View>
      )}

      {/* Fallout-style Pip-Boy HUD — always-on stats, weapon, HP/AC/AP + message log */}
      <View style={[styles.hud, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.hudLog}>
          <Text style={styles.hudLogText} numberOfLines={2}>
            <Text style={{ color: accent }}>▸ You see: </Text>
            {toast || `${data?.zone?.name || "the wasteland"} — ${data?.me?.class_title || "Athlete"}`}
          </Text>
        </View>
        <View style={styles.hudWeapon}>
          {weaponImage(user?.equipped_weapon) ? (
            <ExpoImage source={weaponImage(user?.equipped_weapon)} style={styles.hudWeaponImg} contentFit="contain" />
          ) : null}
          <Text style={styles.hudWeaponLabel} numberOfLines={1}>{weaponLabel(user?.equipped_weapon)}</Text>
          <Text style={styles.hudAp}>AP {Math.max(6, Math.round(6 + (data?.me?.stats?.speed || 40) / 22))}</Text>
        </View>
        <View style={styles.hudVitals}>
          <View style={styles.hudVitalRow}><Text style={styles.hudVitalLbl}>HP</Text><Text style={styles.hudVitalVal}>{String(Math.round(30 + (data?.me?.stats?.endurance || 40) * 0.8 + myLevel * 4)).padStart(3, "0")}</Text></View>
          <View style={styles.hudVitalRow}><Text style={styles.hudVitalLbl}>AC</Text><Text style={styles.hudVitalVal}>{String(Math.round((data?.me?.stats?.speed || 40) * 0.14)).padStart(3, "0")}</Text></View>
        </View>
      </View>

      {toast && <View style={styles.toast}><Text style={styles.toastText}>{toast}</Text></View>}

      {combatNode && <Combat node={combatNode} stats={data?.me?.stats} accent={accent} zoneIndex={data?.zone?.index} onWin={claim} onClose={() => setCombatNode(null)} />}
      {reward && <Reward label={reward.label} boss={reward.boss} accent={accent} onClose={finishReward} />}
      {milestone && <MilestoneOverlay lift={milestone.lift} value={milestone.value} accent={accent} token={token} onClose={() => setMilestone(null)} />}
      {zoneReveal && <ZoneReveal zone={zoneReveal} onClose={() => setZoneReveal(null)} />}
      <SystemWindow data={sysWin} onDone={() => setSysWin(null)} />
      {questInfo && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setQuestInfo(null)}>
          <Pressable style={styles.qiWrap} onPress={() => setQuestInfo(null)}>
            <Pressable style={[styles.qiCard, { borderColor: accent }]} onPress={() => {}}>
              <Text style={[styles.qiKicker, { color: accent }]}>
                {questInfo.boss ? "☠ BOSS ENCOUNTER" : "QUEST"} · {questInfo.claimed ? "CLEARED" : questInfo.complete ? "READY" : "LOCKED"}
              </Text>
              <Text style={styles.qiTitle}>{questInfo.title || questInfo.name || "Unknown Quest"}</Text>
              {!!(questInfo.flavor || questInfo.desc) && <Text style={styles.qiDesc}>{questInfo.flavor || questInfo.desc}</Text>}
              {Array.isArray(questInfo.objectives) && questInfo.objectives.length > 0 && (
                <View style={styles.qiObjs}>
                  <Text style={styles.qiObjHead}>OBJECTIVES</Text>
                  {questInfo.objectives.map((o: any, i: number) => {
                    const cur = o.current ?? 0, tgt = o.target ?? 1;
                    const done = cur >= tgt;
                    const pct = Math.max(0, Math.min(1, tgt ? cur / tgt : 0));
                    return (
                      <View key={i} style={styles.qiObj}>
                        <View style={styles.qiObjTop}>
                          <Text style={[styles.qiObjLabel, done && { color: colors.success }]} numberOfLines={1}>{done ? "✓ " : "◻ "}{o.label}</Text>
                          <Text style={[styles.qiObjNum, done && { color: colors.success }]}>{cur.toLocaleString?.() ?? cur}/{tgt.toLocaleString?.() ?? tgt}</Text>
                        </View>
                        <View style={styles.qiBar}><View style={[styles.qiBarFill, { width: `${pct * 100}%`, backgroundColor: done ? colors.success : accent }]} /></View>
                      </View>
                    );
                  })}
                </View>
              )}
              <View style={styles.qiRow}>
                <View style={styles.qiStat}><Text style={styles.qiStatLbl}>REWARD</Text><Text style={styles.qiStatVal}>{questInfo.reward_label || `${questInfo.reward_xp || 0} XP`}</Text></View>
                <View style={styles.qiStat}><Text style={styles.qiStatLbl}>STATUS</Text><Text style={[styles.qiStatVal, { color: questInfo.claimed ? colors.success : questInfo.complete ? accent : colors.textDim }]}>{questInfo.claimed ? "✓ DONE" : questInfo.complete ? "READY" : "IN PROGRESS"}</Text></View>
              </View>
              {!questInfo.complete && !questInfo.claimed && (
                <Text style={styles.qiHint}>Finish this quest's objectives in your training to unlock the encounter.</Text>
              )}
              <Pressable
                testID="quest-engage"
                onPress={engageQuest}
                disabled={questInfo.claimed || !questInfo.complete}
                style={[styles.qiBtn, { backgroundColor: accent }, (questInfo.claimed || !questInfo.complete) && { opacity: 0.4 }]}
              >
                <Text style={styles.qiBtnText}>{questInfo.claimed ? "CLEARED ✓" : questInfo.complete ? (questInfo.boss ? "⚔ ENGAGE BOSS" : "⚔ ENGAGE") : "🔒 LOCKED"}</Text>
              </Pressable>
              <Pressable onPress={() => setQuestInfo(null)} style={styles.qiClose}><Text style={styles.qiCloseText}>CLOSE</Text></Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      )}
      <MemberSheet userId={peekUser} visible={!!peekUser} onClose={() => setPeekUser(null)} />

      {/* Rival action sheet — clear, tappable CHALLENGE + LOADOUT buttons */}
      <Modal transparent visible={!!rivalSheet} animationType="slide" onRequestClose={() => setRivalSheet(null)}>
        <Pressable style={styles.rsOverlay} onPress={() => setRivalSheet(null)}>
          <Pressable style={[styles.rsSheet, { borderColor: accent }]} onPress={(e) => e.stopPropagation()}>
            {rivalSheet && (
              <>
                <View style={styles.rsHead}>
                  <View style={[styles.rsAvatar, { borderColor: rivalSheet.founder ? colors.warning : accent }]}>
                    <Text style={styles.rsAvatarText}>{(rivalSheet.name || "A")[0].toUpperCase()}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rsName} numberOfLines={1}>{rivalSheet.enhanced ? "☣ " : ""}{rivalSheet.name}</Text>
                    <Text style={styles.rsMeta}>Lv{rivalSheet.level} · {rivalSheet.ahead ? "AHEAD OF YOU" : "BEHIND YOU"}{rivalSheet.founder ? " · ★ FOUNDER" : ""}</Text>
                  </View>
                </View>
                {rivalSheet.filler ? (
                  <Text style={styles.rsNpc}>A wandering spirit of the road. Real rivals appear as you climb the ranks — challenge them to a race.</Text>
                ) : (
                  <>
                    <Pressable testID={`peek-${rivalSheet.user_id}`} onPress={() => { const id = rivalSheet.user_id; setRivalSheet(null); setPeekUser(id); }} style={[styles.rsBtn, styles.rsBtnGhost]}>
                      <Text style={styles.rsBtnGhostText}>👁  VIEW LOADOUT</Text>
                    </Pressable>
                    <Pressable testID={`challenge-${rivalSheet.user_id}`} onPress={() => sendChallenge(rivalSheet)} style={[styles.rsBtn, { backgroundColor: accent }]}>
                      <Text style={styles.rsBtnText}>⚔  CHALLENGE TO A RACE</Text>
                    </Pressable>
                  </>
                )}
                <Pressable onPress={() => setRivalSheet(null)} style={styles.rsClose}><Text style={styles.rsCloseText}>CLOSE</Text></Pressable>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {data && (() => {
        const ctx: StoryCtx = { name: user?.display_name || "Player", level: data?.me?.level || myLevel, rank: user?.rank || "Beginner", zoneIndex: previewZone ?? (data?.zone?.index ?? 0), enhanced: !!user?.enhanced };
        return (
          <>
            <JourneyIntro ctx={{ name: ctx.name, enhanced: ctx.enhanced }} />
            <Chronicle visible={chronicleOpen} onClose={() => setChronicleOpen(false)} ctx={ctx} />
            <StoryBook visible={storybookOpen} onClose={() => setStorybookOpen(false)} />
          </>
        );
      })()}
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
  mapArt: { opacity: 0.92 },
  zoomBar: { position: "absolute", top: 90, right: 16, zIndex: 60, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(5,5,8,0.85)", borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 4 },
  zoomBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center" },
  zoomBtnText: { color: colors.text, fontSize: 20, fontWeight: "900", lineHeight: 22 },
  zoomReset: { paddingHorizontal: 8, minWidth: 52, alignItems: "center" },
  zoomLabel: { color: colors.textMid, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] },
  nodeHit: { position: "absolute", width: 92, alignItems: "center", marginLeft: 0 },
  nodeIcon: { color: colors.text, fontWeight: "900", fontSize: 16, marginBottom: 24 },
  nodeScope: { fontSize: 8, fontWeight: "900", letterSpacing: 1, marginBottom: 1 },
  nodeLabel: { color: colors.text, fontSize: 9.5, textAlign: "center", width: 92, fontWeight: "800", lineHeight: 12 },
  nodeReward: { color: colors.warning, fontSize: 8.5, textAlign: "center", fontWeight: "800", marginTop: 1 },
  nodeObj: { color: colors.textDim, fontSize: 8, textAlign: "center", marginTop: 1 },
  neighbor: { position: "absolute", width: 56, alignItems: "center", zIndex: 15 },
  taunt: { position: "absolute", bottom: 52, width: 116, marginLeft: -30, backgroundColor: "rgba(5,5,8,0.96)", borderWidth: 1, borderRadius: radius.sm, paddingHorizontal: 8, paddingVertical: 5, zIndex: 30 },
  tauntText: { color: colors.text, fontSize: 10, fontWeight: "700", textAlign: "center" },
  challengeBanner: { marginHorizontal: spacing.lg, marginBottom: spacing.xs, padding: spacing.sm, borderWidth: 1, borderRadius: radius.sm, backgroundColor: "rgba(0,0,0,0.4)" },
  challengeBannerText: { color: colors.text, fontSize: 11, fontWeight: "700", textAlign: "center" },
  raceWrap: { marginHorizontal: spacing.lg, marginBottom: spacing.sm },
  raceHeader: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginBottom: 6 },
  raceCard: { backgroundColor: "rgba(0,0,0,0.5)", borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm, padding: spacing.sm, marginBottom: 6 },
  raceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  raceVs: { color: colors.text, fontSize: 12, fontWeight: "800", flex: 1, marginRight: 8 },
  raceVsDim: { color: colors.textDim, fontWeight: "700" },
  raceStatus: { fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  raceTrack: { height: 10, borderRadius: 5, backgroundColor: colors.surface3, overflow: "hidden", justifyContent: "center" },
  raceFill: { position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 5, minWidth: 4 },
  raceFlag: { position: "absolute", right: 2, fontSize: 9 },
  raceLabel: { color: colors.textMid, fontSize: 10, fontWeight: "700", marginTop: 5 },
  shieldNote: { color: colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  histRow: { flexDirection: "row", alignItems: "center", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.06)" },
  histIcon: { fontSize: 13, width: 22 },
  histText: { color: colors.textMid, fontSize: 12, fontWeight: "700", flex: 1 },
  histResult: { fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  secondaryBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  neighborDot: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, borderWidth: 2, borderColor: colors.textDim, alignItems: "center", justifyContent: "center" },
  neighborDotAhead: { borderColor: colors.error },
  neighborDotNpc: { opacity: 0.5, backgroundColor: colors.surface3 },
  npcTag: { color: colors.textDim, fontSize: 8, fontWeight: "900", letterSpacing: 1, textAlign: "center", marginTop: 3 },
  neighborInit: { color: colors.text, fontWeight: "900", fontSize: 15 },
  rivalTag: { position: "absolute", bottom: -4, right: -4, width: 16, height: 16, borderRadius: 8, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: "#05060A" },
  rivalTagText: { color: "#05060A", fontSize: 8, fontWeight: "900" },
  neighborChip: { marginTop: 4, backgroundColor: "rgba(5,6,10,0.82)", borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, alignItems: "center", maxWidth: 64 },
  neighborName: { color: colors.text, fontSize: 9.5, fontWeight: "800", textAlign: "center" },
  neighborLv: { color: colors.textDim, fontSize: 8.5, fontWeight: "700" },
  rsOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  rsSheet: { backgroundColor: colors.surface, borderTopWidth: 2, borderLeftWidth: 1, borderRightWidth: 1, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, paddingBottom: spacing.xl },
  rsHead: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.lg },
  rsAvatar: { width: 52, height: 52, borderRadius: 26, borderWidth: 2, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  rsAvatarText: { color: colors.text, fontWeight: "900", fontSize: 22 },
  rsName: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 1 },
  rsMeta: { color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 3 },
  rsNpc: { color: colors.textMid, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  rsBtn: { minHeight: 50, borderRadius: radius.md, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  rsBtnText: { color: "#05060A", fontWeight: "900", letterSpacing: 1.5, fontSize: 14 },
  rsBtnGhost: { borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  rsBtnGhostText: { color: colors.text, fontWeight: "900", letterSpacing: 1.5, fontSize: 14 },
  rsClose: { alignItems: "center", padding: spacing.sm },
  rsCloseText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  hero: { position: "absolute", alignItems: "center" },
  comet: { position: "absolute", width: 10, height: 10, borderRadius: 5, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 }, elevation: 6 },
  heroTag: { borderWidth: 1, borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: "rgba(0,0,0,0.6)", marginTop: 2 },
  heroTagText: { color: colors.text, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  legend: { alignItems: "center", paddingVertical: spacing.md, paddingHorizontal: spacing.lg },
  hud: { flexDirection: "row", alignItems: "stretch", gap: 6, paddingHorizontal: 8, paddingTop: 8, backgroundColor: "#141007", borderTopWidth: 2, borderTopColor: "#2E2611" },
  hudLog: { flex: 1.3, backgroundColor: "#0A0E06", borderWidth: 2, borderColor: "#243B1E", borderRadius: 6, padding: 8, justifyContent: "center" },
  hudLogText: { color: "#7CFF6B", fontSize: 10, lineHeight: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },
  hudWeapon: { flex: 1.1, backgroundColor: "#161206", borderWidth: 2, borderColor: "#4A3B14", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, alignItems: "center", justifyContent: "center" },
  hudWeaponImg: { width: 34, height: 20, marginBottom: 2 },
  hudWeaponLabel: { color: "#E7C46A", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
  hudAp: { color: "#C9A94A", fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  hudVitals: { backgroundColor: "#161206", borderWidth: 2, borderColor: "#4A3B14", borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, justifyContent: "center", gap: 2, minWidth: 70 },
  hudVitalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  atrophyWrap: { marginHorizontal: spacing.lg, marginTop: spacing.xs, marginBottom: spacing.xs, backgroundColor: "rgba(255,42,60,0.06)", borderWidth: 1, borderColor: "rgba(255,42,60,0.35)", borderRadius: radius.sm, padding: 8 },
  atrophyTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 5 },
  atrophyLbl: { color: "#FF6B78", fontWeight: "900", letterSpacing: 1.5, fontSize: 10.5 },
  atrophyDays: { color: "#FFB3B9", fontWeight: "800", fontSize: 10.5 },
  atrophyTrack: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  atrophyFill: { height: "100%", backgroundColor: "#FF2A3C", borderRadius: 3 },
  atrophyNote: { color: "#FFC2C8", fontSize: 10.5, marginTop: 5 },
  clanRankWrap: { marginHorizontal: spacing.lg, marginBottom: spacing.xs, backgroundColor: "rgba(0,85,255,0.08)", borderWidth: 1, borderColor: "rgba(0,85,255,0.35)", borderRadius: radius.sm, paddingVertical: 9, paddingHorizontal: 12 },
  clanRankText: { color: "#BCD4FF", fontSize: 12, fontWeight: "800" },
  clanRankNum: { color: colors.brandPrimary, fontWeight: "900" },
  hudVitalLbl: { color: "#8A6E2A", fontSize: 9, fontWeight: "900", letterSpacing: 1 },
  hudVitalVal: { color: "#7CFF6B", fontSize: 16, fontWeight: "900", fontVariant: ["tabular-nums"] },
  qiWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.8)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  qiCard: { width: "100%", maxWidth: 420, backgroundColor: "#0D0F14", borderWidth: 2, borderRadius: radius.md, padding: spacing.lg },
  qiKicker: { fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  qiTitle: { color: colors.text, fontSize: 20, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  qiDesc: { color: colors.textMid, fontSize: 13, lineHeight: 19, marginTop: spacing.sm },
  qiObjs: { marginTop: spacing.md, gap: spacing.sm },
  qiObjHead: { color: colors.textDim, fontSize: 9, fontWeight: "900", letterSpacing: 2 },
  qiObj: { gap: 4 },
  qiObjTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  qiObjLabel: { color: colors.text, fontSize: 12, fontWeight: "700", flex: 1, marginRight: 8 },
  qiObjNum: { color: colors.textMid, fontSize: 11, fontWeight: "900", fontVariant: ["tabular-nums"] },
  qiBar: { height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  qiBarFill: { height: "100%", borderRadius: 3 },
  qiRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.md },
  qiStat: { flex: 1, backgroundColor: "rgba(255,255,255,0.04)", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.sm },
  qiStatLbl: { color: colors.textDim, fontSize: 8, fontWeight: "900", letterSpacing: 1 },
  qiStatVal: { color: colors.text, fontSize: 13, fontWeight: "900", marginTop: 3 },
  qiHint: { color: colors.textDim, fontSize: 11, fontStyle: "italic", marginTop: spacing.md, lineHeight: 16 },
  qiBtn: { marginTop: spacing.lg, borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  qiBtnText: { color: "#fff", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
  qiClose: { marginTop: spacing.md, alignItems: "center" },
  qiCloseText: { color: colors.textDim, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  minimap: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface2 },
  minimapLabel: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 2, width: 56 },
  minimapTrack: { flex: 1, flexDirection: "row", alignItems: "center", height: 18 },
  minimapDotWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  minimapDot: { width: 7, height: 7, borderRadius: 4 },
  minimapBoss: { width: 10, height: 10, borderRadius: 5 },
  minimapPct: { color: colors.brandPrimary, fontSize: 12, fontWeight: "900", width: 44, textAlign: "right", fontVariant: ["tabular-nums"] },
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
  checkBox: { width: "100%", marginTop: spacing.lg, alignItems: "stretch" },
  checkStat: { color: colors.textMid, fontWeight: "900", letterSpacing: 1, fontSize: 12, textAlign: "center", marginBottom: spacing.sm },
  checkRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginBottom: spacing.sm },
  die: { width: 56, height: 56, borderRadius: 10, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  dieFace: { fontSize: 24, fontWeight: "900" },
  modText: { color: colors.textDim, fontSize: 12, marginBottom: 3 },
  resultText: { color: colors.textMid, fontSize: 12.5, fontWeight: "800" },
  checkStory: { color: "#CFE8FF", fontSize: 12.5, lineHeight: 18, textAlign: "center", marginBottom: spacing.md, fontStyle: "italic" },
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
  rewardBrand: { color: colors.textDim, letterSpacing: 3, fontSize: 10, fontWeight: "700", marginBottom: spacing.md },
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
  rankBadge: { width: 96, height: 96, borderRadius: 20, borderWidth: 3, alignItems: "center", justifyContent: "center", marginTop: spacing.md, backgroundColor: "rgba(0,0,0,0.4)" },
  rankBadgeText: { fontSize: 52, fontWeight: "900" },
  rankAttained: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 20, marginTop: spacing.md },
  zoneRevealLore: { color: "#CFE8FF", fontSize: 12.5, lineHeight: 19, textAlign: "center", marginTop: spacing.md, paddingHorizontal: spacing.xl, maxWidth: 420 },
  zoneRevealTap: { position: "absolute", bottom: 60, color: colors.textDim, letterSpacing: 2, fontSize: 11 },
});
