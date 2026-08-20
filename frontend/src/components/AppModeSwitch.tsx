import { useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, radius } from "@/src/lib/theme";

// A tiny always-on-top FULL/LITE switch pinned to the top-right of every screen.
// Hidden until the athlete is past onboarding (mode picked + tour seen).
export function AppModeSwitch() {
  const insets = useSafeAreaInsets();
  const { user, token, refresh, intro, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  if (loading || !user || intro) return null;
  if (user.mode_selected !== true || user.tour_seen !== true) return null;

  const lite = !!user.lite_mode;

  const set = async (nextLite: boolean) => {
    if (busy || lite === nextLite) return;
    setBusy(true);
    try {
      await apiFetch(token, "/api/profile/update", { method: "PATCH", body: JSON.stringify({ lite_mode: nextLite }) });
      await refresh();
    } catch {}
    setBusy(false);
  };

  return (
    <View style={[styles.wrap, { top: insets.top + 6 }]} pointerEvents="box-none">
      <View style={styles.pill}>
        <Pressable testID="global-mode-full" onPress={() => set(false)} style={[styles.seg, !lite && styles.segOn]}>
          <Text style={[styles.segText, !lite && styles.segTextOn]}>◆</Text>
        </Pressable>
        <Pressable testID="global-mode-lite" onPress={() => set(true)} style={[styles.seg, lite && styles.segOn]}>
          <Text style={[styles.segText, lite && styles.segTextOn]}>▤</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 10, zIndex: 60, elevation: 60 },
  pill: {
    flexDirection: "row", backgroundColor: "rgba(5,5,8,0.82)", borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.borderStrong, padding: 2,
  },
  seg: { width: 26, height: 22, alignItems: "center", justifyContent: "center", borderRadius: radius.pill },
  segOn: { backgroundColor: colors.brandPrimary },
  segText: { color: colors.textDim, fontSize: 11, fontWeight: "900" },
  segTextOn: { color: "#001122" },
});
