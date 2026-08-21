import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Dimensions } from "react-native";
import { Image as ExpoImage } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, Easing, FadeIn, FadeOut, SlideInLeft } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, radius, ZONE_IMAGES } from "@/src/lib/theme";

const INTRO_KEY = "hic_journey_intro_v3";
const SYS = "#3AA0FF";
const { width: SCREEN_W } = Dimensions.get("window");

// A motion-comic cinematic — the origin of THE CIRCLE (Book One: The First Turn).
type Panel = { img: any; kicker: string; caption: string; sys?: string; tone?: "info" | "danger" };
const LOGIN = require("@/assets/images/login-journey.png");
const PANELS: Panel[] = [
  { img: LOGIN, kicker: "PROLOGUE · THE FIRST TURN", caption: "When the Gates opened, humanity Awakened — and strength became the only currency that mattered.", sys: "[ Ranks assigned: F · E · D · C · B · A · S ]" },
  { img: ZONE_IMAGES[0], kicker: "DESIGNATION: UNRANKED", caption: "You Awakened with nothing. No ability. No bloodline. The weakest ever recorded.", sys: "[ Combat Rating: 7 ]", tone: "danger" },
  { img: ZONE_IMAGES[0], kicker: "THE EMPTY VESSEL", caption: "But an empty vessel has no limits — the Circle cannot restrict what was never defined.", sys: "[ ALL PATHS ARE AVAILABLE ]" },
  { img: ZONE_IMAGES[1], kicker: "THE FIRST LAW", caption: "The Circle records everything you do. Train, and it makes you stronger. Every rep is written into you.", sys: "[ Adaptation recorded ]" },
  { img: ZONE_IMAGES[3], kicker: "THE TRIALS", caption: "The Gates spill monsters. Bosses guard each rank. Rivals climb beside you. Survive. Rise.", sys: "[ Defeat enemies above your level ]" },
  { img: ZONE_IMAGES[5], kicker: "RANK S · ASCENSION", caption: "At the summit stand the S-Ranks — gods among men. One day, they will look up at you.", sys: "[ THE CIRCLE IS WATCHING ]" },
];

function KenBurns({ img, panelKey }: { img: any; panelKey: number }) {
  const scale = useSharedValue(1);
  const tx = useSharedValue(0);
  useEffect(() => {
    scale.value = 1.05; tx.value = -12;
    scale.value = withTiming(1.22, { duration: 4200, easing: Easing.inOut(Easing.ease) });
    tx.value = withTiming(12, { duration: 4200, easing: Easing.inOut(Easing.ease) });
  }, [panelKey]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { translateX: tx.value }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, st]}>
      <ExpoImage source={img} style={StyleSheet.absoluteFill} contentFit="cover" />
    </Animated.View>
  );
}

/** First-time Journey intro: an anime/LitRPG motion-comic. Auto-advances, tap to skip forward. */
export function JourneyIntro({ ctx }: { ctx: { name: string; enhanced?: boolean } }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const timer = useRef<any>(null);
  // Enhanced users get an extra panel about borrowed power + debt.
  const panels = ctx.enhanced
    ? [...PANELS, { img: ZONE_IMAGES[3], kicker: "⚗ DESIGNATION: ENHANCED", caption: "Artificial Shard compounds burn in your blood. Your climb is faster — but borrowed.", sys: "[ ALL DEBT MUST EVENTUALLY BE PAID ]", tone: "danger" as const }]
    : PANELS;
  const last = step >= panels.length;

  useEffect(() => {
    (async () => { try { if (!(await AsyncStorage.getItem(INTRO_KEY))) setOpen(true); } catch {} })();
  }, []);

  useEffect(() => {
    if (!open || last) return;
    timer.current = setTimeout(() => setStep((s) => s + 1), 3600);
    return () => clearTimeout(timer.current);
  }, [open, step, last]);

  const finish = async () => {
    setOpen(false);
    try { await AsyncStorage.setItem(INTRO_KEY, "1"); } catch {}
  };
  const next = () => { if (!last) { clearTimeout(timer.current); setStep((s) => s + 1); } };

  if (!open) return null;
  const p = panels[Math.min(step, panels.length - 1)];
  const tone = last ? "info" : (p.tone || "info");
  const toneC = tone === "danger" ? "#FF3B4E" : SYS;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={finish}>
      <Pressable style={styles.root} onPress={next}>
        {/* panel art with slow pan/zoom */}
        <KenBurns key={step} img={p.img} panelKey={step} />
        <LinearGradient colors={["rgba(3,5,10,0.35)", "rgba(3,5,10,0.55)", "rgba(3,5,10,0.96)"]} style={StyleSheet.absoluteFill} pointerEvents="none" />

        {/* progress ticks */}
        <View style={styles.ticks}>
          {panels.map((_, i) => (
            <View key={i} style={[styles.tick, i <= Math.min(step, panels.length - 1) && { backgroundColor: toneC }]} />
          ))}
        </View>

        <Pressable testID="journey-intro-skip" onPress={finish} style={styles.skip} hitSlop={12}>
          <Text style={styles.skipText}>SKIP ▶▶</Text>
        </Pressable>

        {/* comic caption panel */}
        <View style={styles.bottom}>
          {!last ? (
            <Animated.View key={step} entering={SlideInLeft.duration(420)} style={[styles.panel, { borderColor: toneC }]}>
              <Text style={[styles.kicker, { color: toneC }]}>{p.kicker}</Text>
              <Text style={styles.caption}>{p.caption}</Text>
              {p.sys ? <Text style={[styles.sysLine, { color: toneC }]}>{p.sys}</Text> : null}
            </Animated.View>
          ) : (
            <Animated.View entering={FadeIn.duration(500)} style={styles.finalWrap}>
              <Text style={styles.finalKicker}>◇ THE CIRCLE HAS RECOGNIZED YOU</Text>
              <Text style={styles.finalTitle}>WOULD YOU LIKE TO BEGIN?</Text>
              <Text style={styles.finalSub}>{ctx.name} · Designation: {ctx.enhanced ? "ENHANCED" : "Unranked"} · Level 0 · Circle: Incomplete</Text>
              <Pressable testID="journey-intro-accept" onPress={finish} style={styles.acceptBtn}>
                <Text style={styles.acceptText}>⚔  YES — BEGIN THE FIRST TURN</Text>
              </Pressable>
            </Animated.View>
          )}
          {!last && <Text style={styles.tapHint}>tap to continue</Text>}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#03050A" },
  ticks: { position: "absolute", top: 54, left: spacing.lg, right: spacing.lg, flexDirection: "row", gap: 5 },
  tick: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.18)" },
  skip: { position: "absolute", top: 66, right: spacing.lg },
  skipText: { color: "rgba(255,255,255,0.7)", fontWeight: "900", letterSpacing: 1, fontSize: 11 },
  bottom: { position: "absolute", left: 0, right: 0, bottom: 0, padding: spacing.lg, paddingBottom: 48 },
  panel: { backgroundColor: "rgba(6,12,22,0.9)", borderLeftWidth: 4, borderRadius: 8, padding: spacing.lg, transform: [{ skewX: "-4deg" }] },
  kicker: { fontWeight: "900", letterSpacing: 2, fontSize: 12, marginBottom: 8 },
  caption: { color: "#F3F7FF", fontSize: 21, lineHeight: 28, fontWeight: "800" },
  sysLine: { marginTop: 10, fontSize: 12.5, fontFamily: "monospace" as any, fontWeight: "700" },
  tapHint: { color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: 1, textAlign: "center", marginTop: spacing.md },
  finalWrap: { alignItems: "center" },
  finalKicker: { color: SYS, fontWeight: "900", letterSpacing: 3, fontSize: 12 },
  finalTitle: { color: "#fff", fontWeight: "900", letterSpacing: 3, fontSize: 30, marginTop: 6, textAlign: "center" },
  finalSub: { color: colors.textMid, fontSize: 14, marginTop: 8, marginBottom: spacing.lg, textAlign: "center" },
  acceptBtn: { borderWidth: 1.5, borderColor: SYS, backgroundColor: "rgba(58,160,255,0.16)", borderRadius: radius.md, paddingVertical: 15, paddingHorizontal: spacing.xl, shadowColor: SYS, shadowOpacity: 0.6, shadowRadius: 20, shadowOffset: { width: 0, height: 0 } },
  acceptText: { color: "#CFE8FF", fontWeight: "900", letterSpacing: 2, fontSize: 15 },
});
