import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { colors, spacing, radius } from "@/src/lib/theme";

/** Glowing gold ribbon marking one of the first 100 Founding Beta members. */
export function FoundingRibbon({ number }: { number?: number | null }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({
    shadowColor: colors.warning,
    shadowOpacity: 0.4 + glow.value * 0.5,
    shadowRadius: 8 + glow.value * 10,
    shadowOffset: { width: 0, height: 0 },
    borderColor: colors.warning,
  }));
  return (
    <Animated.View testID="founding-ribbon" style={[styles.ribbon, style]}>
      <Text style={styles.ribbonText}>★ FOUNDING 100{number ? ` · #${number}` : ""}</Text>
    </Animated.View>
  );
}

/** Small badge shown on members who linked a TikTok/Instagram. */
export function CreatorBadge() {
  return (
    <View testID="creator-badge" style={styles.creator}>
      <Text style={styles.creatorText}>✔ CREATOR</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    alignSelf: "center", marginTop: spacing.sm, paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: radius.pill, borderWidth: 1.5, backgroundColor: "rgba(255,234,0,0.12)",
  },
  ribbonText: { color: colors.warning, fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },
  creator: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm,
    borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.1)",
  },
  creatorText: { color: colors.brandPrimary, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
});
