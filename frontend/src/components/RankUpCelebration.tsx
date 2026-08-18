import React, { useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Modal } from "react-native";
import { Image } from "expo-image";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withRepeat, withTiming, withSequence } from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { colors, spacing, radius, RANK_COLORS, bgImage } from "@/src/lib/theme";

export function RankUpCelebration({ visible, fromRank, toRank, background, onClose }: { visible: boolean; fromRank?: string; toRank?: string; background?: { id: string; name: string } | null; onClose: () => void }) {
  const scale = useSharedValue(0);
  const ring = useSharedValue(0);
  const rankColor = RANK_COLORS[toRank || ""] || colors.brandPrimary;

  useEffect(() => {
    if (visible) {
      scale.value = 0;
      scale.value = withSpring(1, { damping: 7, stiffness: 110 });
      ring.value = withRepeat(withSequence(withTiming(1, { duration: 900 }), withTiming(0.3, { duration: 900 })), -1, true);
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({ opacity: ring.value, transform: [{ scale: 0.9 + ring.value * 0.3 }] }));

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.ring, { backgroundColor: rankColor }, ringStyle]} />
        <Animated.View style={cardStyle}>
          <LinearGradient colors={[rankColor + "33", "#12141A", "#050508"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.card, { borderColor: rankColor }]}>
            <Text style={styles.eyebrow}>RANK ASCENSION</Text>
            <Text style={[styles.newRank, { color: rankColor, textShadowColor: rankColor }]}>{toRank?.toUpperCase()}</Text>
            <View style={styles.transition}>
              <Text style={styles.fromRank}>{fromRank?.toUpperCase()}</Text>
              <Text style={[styles.arrow, { color: rankColor }]}>⟶</Text>
              <Text style={[styles.toRank, { color: rankColor }]}>{toRank?.toUpperCase()}</Text>
            </View>
            <Text style={styles.sub}>You've crossed the threshold. New protocols and rewards await.</Text>
            {background && (
              <View style={styles.perkWrap}>
                <Image source={bgImage(background.id)} style={styles.perkImg} contentFit="cover" />
                <LinearGradient colors={["transparent", "rgba(0,0,0,0.7)"]} style={StyleSheet.absoluteFill} />
                <View style={styles.perkLabel}>
                  <Text style={styles.perkUnlocked}>NEW BACKGROUND UNLOCKED</Text>
                  <Text style={[styles.perkName, { color: rankColor }]}>{background.name}</Text>
                  <Text style={styles.perkEquipped}>✓ EQUIPPED</Text>
                </View>
              </View>
            )}
            <Text style={styles.brand}>HUTCH'S INNER CIRCLE</Text>
          </LinearGradient>
        </Animated.View>
        <Pressable testID="rankup-close" onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>CONTINUE</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  ring: { position: "absolute", width: 360, height: 360, borderRadius: 180 },
  card: { width: 310, padding: spacing.xl, alignItems: "center", borderWidth: 2, borderRadius: radius.md },
  eyebrow: { color: colors.textDim, letterSpacing: 5, fontSize: 11, fontWeight: "800" },
  newRank: { fontSize: 44, fontWeight: "900", letterSpacing: 4, marginTop: spacing.sm, textShadowRadius: 16 },
  transition: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.md },
  fromRank: { color: colors.textDim, fontWeight: "800", letterSpacing: 2 },
  arrow: { fontSize: 20, fontWeight: "900" },
  toRank: { fontWeight: "900", letterSpacing: 2 },
  sub: { color: colors.textMid, textAlign: "center", marginTop: spacing.lg, lineHeight: 20 },
  perkWrap: { width: "100%", height: 120, borderRadius: radius.sm, overflow: "hidden", marginTop: spacing.lg, borderWidth: 1, borderColor: colors.border },
  perkImg: { width: "100%", height: "100%" },
  perkLabel: { position: "absolute", bottom: spacing.sm, left: spacing.sm },
  perkUnlocked: { color: colors.textDim, fontSize: 9, letterSpacing: 2, fontWeight: "800" },
  perkName: { fontSize: 16, fontWeight: "900", letterSpacing: 1, marginTop: 2 },
  perkEquipped: { color: colors.success, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  brand: { color: colors.textDim, letterSpacing: 3, fontSize: 10, marginTop: spacing.xl, fontWeight: "700" },
  closeBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm },
  closeText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
});
