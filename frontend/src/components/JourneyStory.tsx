import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable } from "react-native";
import Animated, { FadeInDown, FadeIn, useSharedValue, useAnimatedStyle, withTiming, withSequence, withRepeat, Easing, runOnJS } from "react-native-reanimated";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, radius } from "@/src/lib/theme";

const INTRO_KEY = "hic_story_intro_v1";

// The System — blue-glow LitRPG window kit
const SYS = "#3AA0FF";

export type StoryCtx = { name: string; level: number; rank: string; zoneIndex: number };

// Six chapters, one per Journey zone tier (E -> S). Unlocks as the player ascends.
// `body` shows once you reach the zone; `after` unlocks once you CLEAR it and move on.
export const CHAPTERS: { n: string; zone: string; tier: string; title: string; body: (c: StoryCtx) => string; after: (c: StoryCtx) => string }[] = [
  {
    n: "I", zone: "THE WASTES", tier: "E",
    title: "Zero",
    body: (c) => `You Awakened with a Combat Rating of 7, ${c.name} — weaker than an ordinary human. They called you Zero. Then, dying in an alley, a stranger with black eyes pressed a broken circle into your skin and whispered, "There you are — someone empty." The Circle recognized you. Designation: Unranked. Survive.`,
    after: () => `[ THE CIRCLE ] First Turn survived. The weakest Awakened alive refused to stay down — and the Circle recorded it. An Empty Vessel has no ceiling. Rank E cleared.`,
  },
  {
    n: "II", zone: "IRON VALLEY", tier: "D",
    title: "The First Law",
    body: () => `The Circle gives no ability — it records what you do. Run, and you run faster. Lift, and you grow stronger. In the Iron Valley the forges never cool, and every rep is written into your soul. "Consistency is the first law of power," the Circle decrees.`,
    after: () => `[ THE CIRCLE ] Adaptation logged. You showed up and the Valley bent to your will. Rank D cleared — a hunter now, no longer prey.`,
  },
  {
    n: "III", zone: "STORM RIDGE", tier: "C",
    title: "Danger Sense",
    body: () => `A Gate tears open over Storm Ridge and monsters pour out. Every trial is a blade at your throat — and the Circle turns pain into data. "Pain is data. Adapt." Other Awakened race the ridge beside you. Pass them, or be passed.`,
    after: () => `[ THE CIRCLE ] Danger Sense acquired. You walked into the storm and it broke on you instead. Rank C cleared.`,
  },
  {
    n: "IV", zone: "EMBER PEAKS", tier: "B",
    title: "Break the Ceiling",
    body: () => `The Ember Peaks burn away every limit you thought you had. A Gate Boss stirs in the molten dark, ten levels above you, guarding the only path up. The Circle issues a rare directive: "Defeat an enemy far above your rank."`,
    after: () => `[ THE CIRCLE ] Ceiling shattered. You met a monster stronger than you and gave it nothing to break. Rank B cleared.`,
  },
  {
    n: "V", zone: "CRIMSON CITADEL", tier: "A",
    title: "Gauntlet of Champions",
    body: () => `The Crimson Citadel is where A-Ranks are forged — Guilds, banners, and the strongest hunters alive. "Only the relentless walk these halls," the Circle declares. Prove your might against champions and carve your name beside the legends.`,
    after: () => `[ THE CIRCLE ] The champions bowed. Guilds that ignored Zero now speak your name. Rank A cleared — the summit is in sight.`,
  },
  {
    n: "VI", zone: "ASCENSION", tier: "S",
    title: "The Empty Vessel",
    body: (c) => `At the summit stand the S-Ranks — gods among men who can level armies. And now, ${c.name}, they look up at you. The Empty Vessel that could become anything became everything. Something ancient beyond the Gates opens its eyes… and finally sees a rival.`,
    after: (c) => `[ THE CIRCLE ] Rank S attained. There is no path above this one, ${c.name} — only the endless refinement of a legend. New Initiates wake as Zero and see your shadow at the peak. The Circle is complete.`,
  },
];

function SysLine({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <Animated.Text entering={FadeInDown.delay(delay).springify().damping(16)} style={styles.introLine}>
      {children}
    </Animated.Text>
  );
}

/** One-time System prologue shown the first time a player opens The Journey. */
export function SystemAwakening({ ctx }: { ctx: StoryCtx }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    (async () => {
      try { if (!(await AsyncStorage.getItem(INTRO_KEY))) setOpen(true); } catch {}
    })();
  }, []);
  const close = async () => {
    setOpen(false);
    try { await AsyncStorage.setItem(INTRO_KEY, "1"); } catch {}
  };
  if (!open) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={close}>
      <View style={styles.introWrap}>
        <Animated.View entering={FadeIn} style={styles.introCard}>
          <Text style={styles.sysTag}>◇ THE CIRCLE</Text>
          <SysLine delay={200}><Text style={styles.sysBright}>[ THE CIRCLE ONLINE ]</Text></SysLine>
          <SysLine delay={700}>[ Player detected: <Text style={styles.sysBright}>{ctx.name}</Text> ]</SysLine>
          <SysLine delay={1200}>[ Rank assigned: <Text style={styles.sysBright}>{ctx.rank}</Text> · Level <Text style={styles.sysBright}>{ctx.level}</Text> ]</SysLine>
          <SysLine delay={1700}>[ Quest received: <Text style={styles.sysBright}>RISE</Text> ]</SysLine>
          <SysLine delay={2100}><Text style={styles.threatLine}>[ WARNING · THE ATROPHY IS HUNTING ]</Text></SysLine>
          <Animated.Text entering={FadeInDown.delay(2600).springify().damping(16)} style={styles.introBody}>
            A decay called <Text style={styles.threatText}>THE ATROPHY</Text> devours all who go soft and still — it made these Wastes. The Circle is the last defense against it. Lift, conquer, ascend… before the rot reaches you. Your story begins now.
          </Animated.Text>
          <Animated.View entering={FadeIn.delay(3200)}>
            <Pressable testID="story-intro-accept" onPress={close} style={styles.acceptBtn}>
              <Text style={styles.acceptText}>ACCEPT THE QUEST</Text>
            </Pressable>
          </Animated.View>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** The Chronicle — the ongoing story, one chapter per zone, unlocking as you ascend. */
export function Chronicle({ visible, onClose, ctx }: { visible: boolean; onClose: () => void; ctx: StoryCtx }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.sysTag}>◇ THE CIRCLE · CHRONICLE</Text>
          <Text style={styles.h1}>THE ASCENT</Text>
          <Text style={styles.sub}>Your legend, chapter by chapter. Each realm you conquer unlocks the next page of the story.</Text>
          <View style={styles.threatCard}>
            <Text style={styles.threatKicker}>☠ THE THREAT · REGRESSION</Text>
            <Text style={styles.threatBody}>The Circle only records what you DO. Go still, skip your training, and it begins to un-write you — dragging your Combat Rating back toward Zero. And beyond the Gates, something ancient has opened its eyes. Keep climbing: an Empty Vessel that stops is an Empty Vessel that fades.</Text>
          </View>
          <ScrollView style={{ maxHeight: 460 }} contentContainerStyle={{ paddingBottom: spacing.md }} showsVerticalScrollIndicator={false}>
            {CHAPTERS.map((ch, i) => {
              const unlocked = i <= ctx.zoneIndex;
              const current = i === ctx.zoneIndex;
              return (
                <View key={ch.n} style={[styles.chap, current && styles.chapCurrent, !unlocked && styles.chapLocked]}>
                  <View style={styles.chapHead}>
                    <View style={[styles.tierPill, current && styles.tierPillCurrent]}>
                      <Text style={styles.tierText}>{ch.tier}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chapKicker}>CHAPTER {ch.n} · {ch.zone}</Text>
                      <Text style={styles.chapTitle}>{unlocked ? ch.title : "??? — Sealed"}</Text>
                    </View>
                    {current && <Text style={styles.hereTag}>YOU ARE HERE</Text>}
                    {!unlocked && <Text style={styles.lockTag}>🔒</Text>}
                  </View>
                  {unlocked ? (
                    <Text style={styles.chapBody}>{ch.body(ctx)}</Text>
                  ) : (
                    <Text style={styles.sealedBody}>Ascend to {ch.zone} (tier {ch.tier}) to unlock this chapter of your story.</Text>
                  )}
                  {i < ctx.zoneIndex && (
                    <View style={styles.afterBox}>
                      <Text style={styles.afterTag}>✦ SECTION CLEARED</Text>
                      <Text style={styles.afterBody}>{ch.after(ctx)}</Text>
                    </View>
                  )}
                </View>
              );
            })}
          </ScrollView>
          <Pressable testID="story-chronicle-close" onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

export type SysMsg = { title: string; lines: string[]; tone?: "info" | "victory" | "danger" };

const TONE: Record<string, string> = { info: "#3AA0FF", victory: "#39D98A", danger: "#FF3B4E" };

/** Solo-Leveling / Vampire-System style blue notification window that snaps in and auto-dismisses. */
export function SystemWindow({ data, onDone }: { data: SysMsg | null; onDone: () => void }) {
  const scale = useSharedValue(0.82);
  const op = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    if (!data) return;
    op.value = 0; scale.value = 0.82; glow.value = 0;
    op.value = withTiming(1, { duration: 150 });
    scale.value = withSequence(
      withTiming(1.05, { duration: 170, easing: Easing.out(Easing.back(2.2)) }),
      withTiming(1, { duration: 130 }),
    );
    glow.value = withRepeat(withTiming(1, { duration: 850, easing: Easing.inOut(Easing.ease) }), -1, true);
    const t = setTimeout(() => {
      op.value = withTiming(0, { duration: 280 }, (f) => { if (f) runOnJS(onDone)(); });
    }, 2200);
    return () => clearTimeout(t);
  }, [data]);
  const cardSt = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ scale: scale.value }] }));
  const glowSt = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.5 }));
  if (!data) return null;
  const c = TONE[data.tone || "info"];
  return (
    <View pointerEvents="none" style={styles.sysOverlay}>
      <Animated.View style={[styles.sysWin, { borderColor: c, shadowColor: c }, cardSt]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.sysGlow, { borderColor: c }, glowSt]} />
        {/* corner brackets */}
        <View style={[styles.corner, styles.tl, { borderColor: c }]} />
        <View style={[styles.corner, styles.tr, { borderColor: c }]} />
        <View style={[styles.corner, styles.bl, { borderColor: c }]} />
        <View style={[styles.corner, styles.br, { borderColor: c }]} />
        <Text style={[styles.sysWinTag, { color: c }]}>◇ THE CIRCLE</Text>
        <Text style={[styles.sysWinTitle, { color: c }]}>{data.title}</Text>
        {data.lines.map((ln, i) => (
          <Text key={i} style={styles.sysWinLine}>{ln}</Text>
        ))}
      </Animated.View>
    </View>
  );
}

/** "The Story So Far" — the full LitRPG novel, coming soon. */
export function StoryBook({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={[styles.card, { alignItems: "center" }]}>
          <Text style={styles.sysTag}>◇ THE CIRCLE</Text>
          <Text style={[styles.h1, { textAlign: "center" }]}>THE STORY SO FAR</Text>
          <Text style={[styles.sub, { textAlign: "center" }]}>Book One: The First Turn</Text>
          <Text style={styles.bookGlyph}>📖</Text>
          <Text style={styles.bookLocked}>The story is still being written.</Text>
          <Text style={styles.bookSub}>An anime / LitRPG saga — the full origin of The Circle, your Awakening as the Empty Vessel, and the climb from Zero to Rank S. Come back soon: Chapter One drops when it's complete.</Text>
          <View style={styles.bookBadge}><Text style={styles.bookBadgeText}>✍  COMING SOON · CHAPTER ONE</Text></View>
          <Pressable testID="storybook-close" onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // intro
  introWrap: { flex: 1, backgroundColor: "rgba(2,4,10,0.94)", justifyContent: "center", padding: spacing.lg },
  introCard: { backgroundColor: "rgba(8,14,26,0.96)", borderRadius: radius.lg, borderWidth: 1, borderColor: SYS, padding: spacing.lg, shadowColor: SYS, shadowOpacity: 0.6, shadowRadius: 24, shadowOffset: { width: 0, height: 0 } },
  sysTag: { color: SYS, fontWeight: "900", letterSpacing: 3, fontSize: 11, marginBottom: spacing.md },
  introLine: { color: SYS, fontFamily: "monospace" as any, fontSize: 14, lineHeight: 24, letterSpacing: 0.5 },
  sysBright: { color: "#CFE8FF", fontWeight: "900" },
  introBody: { color: colors.textMid, fontSize: 14, lineHeight: 21, marginTop: spacing.md },
  threatLine: { color: "#FF3B4E", fontWeight: "900" },
  threatText: { color: "#FF6B78", fontWeight: "900" },
  acceptBtn: { marginTop: spacing.lg, borderWidth: 1, borderColor: SYS, backgroundColor: "rgba(58,160,255,0.14)", borderRadius: radius.md, paddingVertical: 14, alignItems: "center" },
  acceptText: { color: "#CFE8FF", fontWeight: "900", letterSpacing: 2, fontSize: 13 },
  // chronicle
  wrap: { flex: 1, backgroundColor: "rgba(2,4,10,0.9)", justifyContent: "center", padding: spacing.lg },
  card: { backgroundColor: "rgba(8,14,26,0.98)", borderRadius: radius.lg, borderWidth: 1, borderColor: SYS, padding: spacing.lg },
  h1: { color: "#CFE8FF", fontWeight: "900", letterSpacing: 3, fontSize: 24, marginTop: 2 },
  sub: { color: colors.textDim, fontSize: 12.5, marginTop: 4, marginBottom: spacing.md, lineHeight: 18 },
  threatCard: { backgroundColor: "rgba(255,42,60,0.08)", borderRadius: radius.md, borderWidth: 1, borderColor: "#FF2A3C", padding: spacing.md, marginBottom: spacing.md },
  threatKicker: { color: "#FF3B4E", fontWeight: "900", fontSize: 11, letterSpacing: 1.5, marginBottom: 5 },
  threatBody: { color: "#FFC2C8", fontSize: 12.5, lineHeight: 18 },
  afterBox: { marginTop: 10, borderLeftWidth: 2, borderLeftColor: SYS, paddingLeft: 10, backgroundColor: "rgba(58,160,255,0.06)", borderRadius: 6, paddingVertical: 8, paddingRight: 8 },
  afterTag: { color: SYS, fontWeight: "900", fontSize: 9, letterSpacing: 1.5, marginBottom: 3 },
  afterBody: { color: "#CFE8FF", fontSize: 12, lineHeight: 18, fontFamily: "monospace" as any },
  chap: { backgroundColor: "rgba(255,255,255,0.03)", borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  chapCurrent: { borderColor: SYS, backgroundColor: "rgba(58,160,255,0.08)" },
  chapLocked: { opacity: 0.6 },
  chapHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: 8 },
  tierPill: { width: 30, height: 30, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface3 },
  tierPillCurrent: { borderColor: SYS, backgroundColor: "rgba(58,160,255,0.18)" },
  tierText: { color: "#CFE8FF", fontWeight: "900", fontSize: 13 },
  chapKicker: { color: SYS, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  chapTitle: { color: colors.text, fontWeight: "900", fontSize: 15, marginTop: 1 },
  hereTag: { color: SYS, fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  lockTag: { fontSize: 14 },
  chapBody: { color: colors.textMid, fontSize: 13, lineHeight: 19 },
  sealedBody: { color: colors.textDim, fontSize: 12.5, lineHeight: 18, fontStyle: "italic" },
  closeBtn: { marginTop: spacing.sm, alignItems: "center", paddingVertical: 12 },
  closeText: { color: colors.textDim, letterSpacing: 3, fontWeight: "800" },
  bookGlyph: { fontSize: 52, marginTop: spacing.lg, marginBottom: spacing.sm },
  bookLocked: { color: colors.text, fontSize: 17, fontWeight: "900", letterSpacing: 0.5, textAlign: "center" },
  bookSub: { color: colors.textMid, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.lg },
  bookBadge: { borderWidth: 1, borderColor: SYS, backgroundColor: "rgba(58,160,255,0.12)", borderRadius: radius.pill, paddingHorizontal: spacing.lg, paddingVertical: 8 },
  bookBadgeText: { color: "#CFE8FF", fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },
  // system window (Solo-Leveling style)
  sysOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", zIndex: 900 },
  sysWin: { minWidth: 260, maxWidth: "84%", backgroundColor: "rgba(6,12,22,0.96)", borderWidth: 1.5, borderRadius: 6, paddingVertical: spacing.md, paddingHorizontal: spacing.lg, alignItems: "center", shadowOpacity: 0.8, shadowRadius: 26, shadowOffset: { width: 0, height: 0 }, elevation: 12 },
  sysGlow: { borderWidth: 1, borderRadius: 6 },
  corner: { position: "absolute", width: 12, height: 12, borderColor: SYS },
  tl: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  sysWinTag: { fontSize: 10, fontWeight: "900", letterSpacing: 3, marginBottom: 6 },
  sysWinTitle: { fontSize: 18, fontWeight: "900", letterSpacing: 2, textAlign: "center" },
  sysWinLine: { color: "#CFE8FF", fontSize: 12.5, lineHeight: 18, textAlign: "center", marginTop: 6, fontFamily: "monospace" as any },
});
