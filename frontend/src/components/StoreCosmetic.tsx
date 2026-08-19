import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing, interpolate } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { colors, radius } from "@/src/lib/theme";

const RARITY: Record<string, string> = {
  legendary: "#FFB020", mythic: "#B26BFF", exalted: "#00E5FF", eternal: "#FF4D6D",
};

// A code-drawn, animated preview for any store cosmetic (avatar/banner/badge/background/aura/title).
export function StoreCosmetic({ item, size = 84 }: { item: any; size?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 2200, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const cols = (item.colors && item.colors.length >= 2 ? item.colors : ["#7A5Cff", "#00E5FF"]) as string[];
  const glow = item.glow || cols[0];
  const rarityCol = RARITY[item.rarity] || "#FFB020";

  const glowStyle = useAnimatedStyle(() => ({
    shadowColor: glow,
    shadowOpacity: 0.45 + t.value * 0.5,
    shadowRadius: 10 + t.value * 18,
    shadowOffset: { width: 0, height: 0 },
    transform: [{ scale: 0.97 + t.value * 0.06 }],
  }));
  const orbitStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${interpolate(t.value, [0, 1], [0, 360])}deg` }],
    opacity: item.motion === "orbit" ? 1 : 0,
  }));

  const isTitle = item.kind === "title";
  const isBanner = item.kind === "banner" || item.kind === "background";
  const w = isBanner ? size * 2.4 : size;

  return (
    <Animated.View style={[styles.wrap, { width: w, height: isTitle ? 44 : size }, glowStyle]}>
      <LinearGradient colors={cols as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.grad, { borderRadius: isTitle ? radius.pill : radius.md, borderColor: rarityCol }]}>
        {item.motion === "orbit" && (
          <Animated.View style={[styles.orbit, orbitStyle]}><View style={[styles.orbitDot, { backgroundColor: "#fff" }]} /></Animated.View>
        )}
        <Text style={[styles.icon, { fontSize: isTitle ? 16 : size * 0.42 }]}>{isTitle ? item.name : item.icon || "★"}</Text>
      </LinearGradient>
      {!isTitle && <View style={[styles.rarityDot, { backgroundColor: rarityCol }]} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  grad: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", borderWidth: 1.5, overflow: "hidden" },
  icon: { color: "#fff", fontWeight: "900", textShadowColor: "rgba(0,0,0,0.4)", textShadowRadius: 4 },
  orbit: { position: "absolute", width: "90%", height: "90%", alignItems: "center" },
  orbitDot: { width: 8, height: 8, borderRadius: 4, position: "absolute", top: 0 },
  rarityDot: { position: "absolute", top: 6, right: 6, width: 10, height: 10, borderRadius: 5, borderWidth: 1, borderColor: "#000" },
});
