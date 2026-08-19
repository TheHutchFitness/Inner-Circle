import { useEffect } from "react";
import { View, Text, StyleSheet } from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";

// Small animated companion shown beside a member's avatar and on the Journey map.
export function PetCompanion({ pet, size = 30 }: { pet: any; size?: number }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withRepeat(withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }), -1, true);
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: -t.value * 4 }],
    shadowColor: pet?.glow || (pet?.colors?.[0] || "#00E5FF"),
    shadowOpacity: 0.5 + t.value * 0.4,
    shadowRadius: 4 + t.value * 6,
    shadowOffset: { width: 0, height: 0 },
  }));
  if (!pet) return null;
  const cols = (pet.colors && pet.colors.length >= 2 ? pet.colors : ["#7A5CFF", "#00E5FF"]) as string[];
  return (
    <Animated.View style={[styles.wrap, { width: size, height: size, borderRadius: size / 2 }, style]}>
      <LinearGradient colors={cols as any} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.grad, { borderRadius: size / 2 }]}>
        <Text style={{ fontSize: size * 0.5 }}>{pet.icon || "🐾"}</Text>
      </LinearGradient>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center" },
  grad: { flex: 1, width: "100%", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.5)" },
});
