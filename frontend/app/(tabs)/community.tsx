import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius } from "@/src/lib/theme";
import { useRouter } from "expo-router";
import { SwipeTabs } from "@/src/components/SwipeTabs";
import { ChatRoom } from "@/src/components/ChatRoom";

export default function Community() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();

  const canChat = isSubscribed || user?.skool_verified || user?.all_rooms_access || user?.is_founder;

  if (!canChat) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.eyebrow}>ACCESS DENIED</Text>
        <Text style={styles.gateTitle}>CIRCLE LOCKED</Text>
        <Text style={styles.gateSub}>The community is exclusive to $5/mo premium members or verified Hutch&apos;s Inner Circle Skool members.</Text>
        <Pressable testID="gate-paywall" onPress={() => router.push("/paywall")} style={styles.gateBtn}>
          <Text style={styles.gateBtnText}>UNLOCK PREMIUM</Text>
        </Pressable>
        <Pressable testID="gate-skool" onPress={() => router.push("/settings")} style={[styles.gateBtn, styles.gateBtnAlt]}>
          <Text style={[styles.gateBtnText, { color: colors.brandPrimary }]}>VERIFY SKOOL MEMBERSHIP</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <SwipeTabs current="community">
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }} keyboardVerticalOffset={0}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <Text style={styles.eyebrow}>▚ THE CIRCLE //</Text>
        <Text style={styles.h1}>SOCIAL HUB</Text>
      </View>
      <ChatRoom
        room="main"
        accent={colors.brandPrimary}
        sendTextColor="#001122"
        placeholder="Drop a PR, ask a question..."
        highlightMine
      />
    </KeyboardAvoidingView>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  enhancedBtn: { marginTop: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: "#FF2A3C", borderRadius: radius.sm, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(255,42,60,0.08)" },
  enhancedBtnText: { color: "#FF2A3C", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md },
  gate: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center", justifyContent: "flex-start" },
  gateTitle: { color: colors.error, fontSize: 28, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm, width: "100%", alignItems: "center" },
  gateBtnAlt: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong, marginTop: spacing.md },
  gateBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
});
