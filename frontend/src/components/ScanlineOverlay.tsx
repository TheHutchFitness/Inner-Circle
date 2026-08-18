import React, { useEffect } from "react";
import { StyleSheet, View, Platform } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

// Subtle animated CRT scanline sweep + static line grid — Pip-Boy / HUD flavor.
// Non-interactive overlay; mount high in the tree.
export function ScanlineOverlay({ height = 844 }: { height?: number }) {
  const y = useSharedValue(-120);

  useEffect(() => {
    y.value = withRepeat(withTiming(height, { duration: 5200, easing: Easing.linear }), -1, false);
  }, [height]);

  const sweep = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
      {/* Static faint horizontal scanlines */}
      <View style={styles.lines}>
        {Array.from({ length: Math.ceil(height / 4) }).map((_, i) => (
          <View key={i} style={styles.line} />
        ))}
      </View>
      {/* Moving glow sweep */}
      <Animated.View style={[styles.sweepWrap, sweep]}>
        <LinearGradient
          colors={["transparent", "rgba(0,229,255,0.10)", "rgba(0,229,255,0.03)", "transparent"]}
          style={styles.sweep}
        />
      </Animated.View>
      {/* Vignette edges */}
      <LinearGradient colors={["rgba(0,0,0,0.28)", "transparent"]} style={styles.top} />
      <LinearGradient colors={["transparent", "rgba(0,0,0,0.32)"]} style={styles.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  lines: { ...StyleSheet.absoluteFillObject, opacity: Platform.OS === "web" ? 0.04 : 0.06, justifyContent: "space-between" },
  line: { height: 1, backgroundColor: "#8fd9ff" },
  sweepWrap: { position: "absolute", left: 0, right: 0, height: 120 },
  sweep: { flex: 1 },
  top: { position: "absolute", top: 0, left: 0, right: 0, height: 90 },
  bottom: { position: "absolute", bottom: 0, left: 0, right: 0, height: 120 },
});
