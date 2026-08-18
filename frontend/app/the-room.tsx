import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius } from "@/src/lib/theme";
import { ChatRoom } from "@/src/components/ChatRoom";

export default function TheRoom() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const canRank = ["Elite","Freak"].includes(user?.rank || "") || user?.all_rooms_access;
  const canPremium = isSubscribed || user?.skool_verified || user?.all_rooms_access;
  const canAccess = canRank && canPremium;

  if (!canAccess) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.eyebrow}>RESTRICTED SECTOR</Text>
        <Text style={styles.gateTitle}>THE ROOM</Text>
        <Text style={styles.gateSub}>{!canRank ? "Reach Elite rank (3500+ XP) to enter." : "Premium or Skool membership required."}</Text>
        <Pressable onPress={() => canRank ? router.push("/paywall") : router.back()} style={styles.gateBtn}>
          <Text style={styles.gateBtnText}>{canRank ? "UNLOCK PREMIUM" : "BACK"}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: "#08050C" }} keyboardVerticalOffset={0}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>ELITE ONLY</Text>
        <Text style={styles.h1}>THE ROOM</Text>
      </View>
      <ChatRoom
        room="the_room"
        accent={colors.error}
        sendTextColor={colors.text}
        placeholder="Speak..."
        emptyText="Silence. Break it."
        bottomInset={insets.bottom}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  gate: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center" },
  eyebrow: { color: colors.error, letterSpacing: 4, fontSize: 11, fontWeight: "800" },
  gateTitle: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: 4, marginTop: spacing.sm },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.error, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm },
  gateBtnText: { color: colors.text, fontWeight: "900", letterSpacing: 3 },
  back: { color: colors.error, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 3, marginTop: 4, marginBottom: spacing.md },
});
