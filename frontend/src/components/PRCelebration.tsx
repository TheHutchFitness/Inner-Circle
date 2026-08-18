import React, { useRef } from "react";
import { View, Text, StyleSheet, Pressable, Modal, Platform } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withRepeat, withTiming, withSequence } from "react-native-reanimated";
import { useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { colors, spacing, radius, avatarFor, fmtWeight } from "@/src/lib/theme";

type PR = { lift: string; name: string; weight: number; previous: number };

export function PRCelebration({ visible, prs, user, onClose }: { visible: boolean; prs: PR[]; user: any; onClose: () => void }) {
  const scale = useSharedValue(0);
  const glow = useSharedValue(0);
  const cardRef = useRef<View>(null);

  useEffect(() => {
    if (visible) {
      scale.value = 0;
      scale.value = withSpring(1, { damping: 8, stiffness: 120 });
      glow.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.4, { duration: 800 })), -1, true);
    }
  }, [visible]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));

  const share = async () => {
    try {
      const uri = await captureRef(cardRef, { format: "png", quality: 1 });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri);
    } catch (e) {
      // sharing unsupported (e.g. web) — no-op
    }
  };

  if (!prs || prs.length === 0) return null;
  const av = avatarFor(user?.avatar_id);

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View style={[styles.glow, glowStyle]} />
        <Animated.View style={[cardStyle]}>
          <View ref={cardRef} collapsable={false} style={styles.cardWrap}>
            <LinearGradient colors={["#330000", "#12141A", "#001A33"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.card}>
              <Text style={styles.newpr}>NEW PR</Text>
              <View style={styles.avatarRing}>
                <Text style={styles.avatarEmoji}>{av.emoji}</Text>
              </View>
              <Text style={styles.name}>{user?.display_name?.toUpperCase()}</Text>
              {prs.map((p) => (
                <View key={p.lift} style={styles.prRow}>
                  <Text style={styles.prName}>{p.name.toUpperCase()}</Text>
                  <Text style={styles.prWeight}>{fmtWeight(p.weight)}</Text>
                  {p.previous > 0 && <Text style={styles.prDelta}>+{Math.round(p.weight - p.previous)} lb</Text>}
                </View>
              ))}
              <Text style={styles.brand}>{"HUTCH'S INNER CIRCLE"}</Text>
            </LinearGradient>
          </View>
        </Animated.View>

        <View style={styles.actions}>
          <Pressable testID="pr-share" onPress={share} style={styles.shareBtn}>
            <Text style={styles.shareText}>SHARE CARD</Text>
          </Pressable>
          <Pressable testID="pr-close" onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>DISMISS</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.9)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  glow: { position: "absolute", width: 340, height: 340, borderRadius: 170, backgroundColor: colors.error },
  cardWrap: { borderRadius: radius.md, overflow: "hidden" },
  card: { width: 300, padding: spacing.xl, alignItems: "center", borderWidth: 2, borderColor: colors.error, borderRadius: radius.md },
  newpr: { color: colors.warning, fontSize: 36, fontWeight: "900", letterSpacing: 8 },
  avatarRing: { width: 80, height: 80, borderRadius: radius.md, borderWidth: 3, borderColor: colors.warning, alignItems: "center", justifyContent: "center", marginTop: spacing.md, backgroundColor: "rgba(0,0,0,0.4)" },
  avatarEmoji: { fontSize: 44 },
  name: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 2, marginTop: spacing.sm },
  prRow: { alignItems: "center", marginTop: spacing.md },
  prName: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "800", fontSize: 12 },
  prWeight: { color: colors.text, fontSize: 34, fontWeight: "900", marginTop: 2 },
  prDelta: { color: colors.success, fontWeight: "800", letterSpacing: 2, marginTop: 2 },
  brand: { color: colors.textDim, letterSpacing: 3, fontSize: 10, marginTop: spacing.xl, fontWeight: "700" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  shareBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm },
  shareText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  closeBtn: { borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm },
  closeText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2 },
});
