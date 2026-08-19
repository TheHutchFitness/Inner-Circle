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

function fmtSeason(s: string) {
  const [y, q] = (s || "").split("-");
  return q ? `${q} ${y}` : s;
}

/** Permanent gold trophy badge(s) for past-season boss-slaying champions. */
export function SeasonChampBadge({ seasons }: { seasons?: string[] | null }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    glow.value = withRepeat(withTiming(1, { duration: 1500, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({
    shadowColor: "#FFD700",
    shadowOpacity: 0.4 + glow.value * 0.5,
    shadowRadius: 7 + glow.value * 9,
    shadowOffset: { width: 0, height: 0 },
  }));
  if (!seasons || seasons.length === 0) return null;
  return (
    <View testID="season-champ-badges" style={styles.champWrap}>
      {seasons.map((s) => (
        <Animated.View key={s} style={[styles.champ, style]}>
          <Text style={styles.champText}>🏆 {fmtSeason(s)} CHAMP</Text>
        </Animated.View>
      ))}
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
  champWrap: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: spacing.sm, marginTop: spacing.sm },
  champ: {
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill,
    borderWidth: 1.5, borderColor: "#FFD700", backgroundColor: "rgba(255,215,0,0.12)",
  },
  champText: { color: "#FFD700", fontSize: 11, fontWeight: "900", letterSpacing: 1 },
});
