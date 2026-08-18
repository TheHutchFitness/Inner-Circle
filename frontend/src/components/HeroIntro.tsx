import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Dimensions, Platform } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, withDelay, withSequence,
  withRepeat, Easing, runOnJS, cancelAnimation,
} from "react-native-reanimated";
import { avatarImage, avatarFor, RANK_COLORS } from "@/src/lib/theme";

const { width, height } = Dimensions.get("window");

export function HeroIntro({ user, mode, onDone }: { user: any; mode: "signup" | "login"; onDone: () => void }) {
  const isSignup = mode === "signup";
  const total = isSignup ? 4600 : 1600;
  const rank = user?.rank || "Beginner";
  const rankColor = RANK_COLORS[rank] || "#00E5FF";
  const portrait = avatarImage(user?.avatar_id, user?.sex);
  const av = avatarFor(user?.avatar_id);

  const [done, setDone] = useState(false);
  const portraitScale = useSharedValue(isSignup ? 1.35 : 1.12);
  const portraitOpacity = useSharedValue(0);
  const glow = useSharedValue(0);
  const sweep = useSharedValue(-height);
  const stamp = useSharedValue(0);
  const xp = useSharedValue(0);
  const titleY = useSharedValue(30);
  const titleO = useSharedValue(0);
  const flashO = useSharedValue(0);

  const finish = () => { if (!done) { setDone(true); onDone(); } };

  useEffect(() => {
    portraitOpacity.value = withTiming(1, { duration: isSignup ? 700 : 350 });
    portraitScale.value = withTiming(1, { duration: isSignup ? 2600 : 900, easing: Easing.out(Easing.cubic) });
    glow.value = withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.ease) }), -1, true);
    sweep.value = withRepeat(withTiming(height, { duration: 1400, easing: Easing.linear }), -1, false);
    titleO.value = withDelay(isSignup ? 500 : 200, withTiming(1, { duration: 500 }));
    titleY.value = withDelay(isSignup ? 500 : 200, withTiming(0, { duration: 500, easing: Easing.out(Easing.cubic) }));

    if (isSignup) {
      stamp.value = withDelay(2200, withSequence(
        withTiming(1.4, { duration: 180 }),
        withTiming(1, { duration: 220, easing: Easing.out(Easing.back(2)) }),
      ));
      flashO.value = withDelay(2200, withSequence(withTiming(0.9, { duration: 90 }), withTiming(0, { duration: 400 })));
      xp.value = withDelay(2600, withTiming(1, { duration: 1400, easing: Easing.out(Easing.cubic) }));
    } else {
      stamp.value = withDelay(500, withSequence(
        withTiming(1.3, { duration: 140 }),
        withTiming(1, { duration: 180, easing: Easing.out(Easing.back(2)) }),
      ));
      flashO.value = withDelay(500, withSequence(withTiming(0.7, { duration: 80 }), withTiming(0, { duration: 300 })));
      xp.value = withDelay(650, withTiming(1, { duration: 700 }));
    }

    const t = setTimeout(() => runOnJS(finish)(), total);
    return () => {
      clearTimeout(t);
      [portraitScale, portraitOpacity, glow, sweep, stamp, xp, titleY, titleO, flashO].forEach((s) => cancelAnimation(s));
    };
  }, []);

  const portraitStyle = useAnimatedStyle(() => ({ opacity: portraitOpacity.value, transform: [{ scale: portraitScale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.3 + glow.value * 0.55 }));
  const sweepStyle = useAnimatedStyle(() => ({ transform: [{ translateY: sweep.value }] }));
  const stampStyle = useAnimatedStyle(() => ({ opacity: stamp.value > 0 ? 1 : 0, transform: [{ scale: stamp.value }] }));
  const xpStyle = useAnimatedStyle(() => ({ width: `${xp.value * 100}%` }));
  const titleStyle = useAnimatedStyle(() => ({ opacity: titleO.value, transform: [{ translateY: titleY.value }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashO.value }));

  const lvl = user?.level ?? 1;

  return (
    <View style={[styles.root, { pointerEvents: "none" }]}>
      <View style={styles.portraitWrap}>
        {portrait ? (
          <Animated.View style={[StyleSheet.absoluteFill, portraitStyle]}>
            <Image source={portrait} style={StyleSheet.absoluteFill} contentFit="cover" />
          </Animated.View>
        ) : (
          <Animated.Text style={[styles.emoji, portraitStyle]}>{av.emoji}</Animated.Text>
        )}
        <LinearGradient colors={["rgba(5,5,8,0.2)", "rgba(5,5,8,0.55)", "rgba(5,5,8,0.98)"]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
        <Animated.View style={[styles.radialGlow, { shadowColor: rankColor, borderColor: rankColor }, glowStyle]} />
        <Animated.View style={[styles.sweep, { backgroundColor: rankColor }, sweepStyle]} />
      </View>

      <Animated.View style={[styles.flash, flashStyle]} />

      <View style={styles.bottom}>
        <Animated.View style={[styles.stamp, { borderColor: rankColor }, stampStyle]}>
          <Text style={[styles.stampText, { color: rankColor }]}>{rank.toUpperCase()}</Text>
        </Animated.View>

        <Animated.View style={titleStyle}>
          <Text style={styles.kicker}>{isSignup ? "⌁ SYSTEM · SOUL LINK ESTABLISHED" : "⌁ SYSTEM · WELCOME BACK"}</Text>
          <Text style={styles.title}>{isSignup ? "HERO AWAKENED" : `${(user?.display_name || "ATHLETE").toUpperCase()}`}</Text>
          <Text style={[styles.sub, { color: rankColor }]}>{isSignup ? "YOUR ASCENSION BEGINS" : `LEVEL ${lvl} · ${rank.toUpperCase()}`}</Text>
        </Animated.View>

        <View style={styles.xpTrack}>
          <Animated.View style={[styles.xpFill, { backgroundColor: rankColor }, xpStyle]} />
        </View>
        <Text style={styles.lvlText}>LV {lvl}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { ...StyleSheet.absoluteFillObject, backgroundColor: "#050508", zIndex: 999, elevation: 999 },
  portraitWrap: { position: "absolute", top: 0, left: 0, right: 0, height: height * 0.72, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  emoji: { fontSize: 160 },
  radialGlow: { position: "absolute", width: width * 0.86, height: width * 0.86, borderRadius: width, borderWidth: 2, shadowOpacity: 1, shadowRadius: 60, shadowOffset: { width: 0, height: 0 } },
  sweep: { position: "absolute", left: 0, right: 0, height: 2, opacity: 0.5 },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: "#FFFFFF", zIndex: 5 },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 28, paddingBottom: 70, alignItems: "center" },
  stamp: { borderWidth: 2, paddingHorizontal: 18, paddingVertical: 6, borderRadius: 6, marginBottom: 18, backgroundColor: "rgba(0,0,0,0.4)" },
  stampText: { fontSize: 18, fontWeight: "900", letterSpacing: 6 },
  kicker: { color: "#8AA0B4", fontSize: 11, letterSpacing: 3, fontWeight: "800", textAlign: "center", fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  title: { color: "#FFFFFF", fontSize: 34, fontWeight: "900", letterSpacing: 2, textAlign: "center", marginTop: 8 },
  sub: { fontSize: 13, fontWeight: "900", letterSpacing: 4, textAlign: "center", marginTop: 6 },
  xpTrack: { width: "80%", height: 8, backgroundColor: "rgba(255,255,255,0.1)", borderRadius: 4, overflow: "hidden", marginTop: 24 },
  xpFill: { height: "100%" },
  lvlText: { color: "#8AA0B4", fontSize: 11, letterSpacing: 3, fontWeight: "800", marginTop: 8 },
});
