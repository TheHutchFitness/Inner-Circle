import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius } from "@/src/lib/theme";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SwipeTabs } from "@/src/components/SwipeTabs";
import { ChatRoom } from "@/src/components/ChatRoom";
import { GroupsPanel } from "@/src/components/GroupsPanel";

export default function Community() {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const params = useLocalSearchParams<{ group?: string }>();
  const lite = !!user?.lite_mode;
  const [room, setRoom] = useState<"main" | "gym" | "groups">(params.group ? "groups" : lite ? "groups" : "main");
  const gym = (user?.inperson_gym || "").trim();

  const canChat = isSubscribed || user?.skool_verified || user?.all_rooms_access || user?.is_founder || user?.inperson_client;

  const Tab = ({ id, label }: { id: "main" | "gym" | "groups"; label: string }) => (
    <Pressable testID={`chat-room-${id}`} onPress={() => setRoom(id)} style={[styles.roomTab, room === id && styles.roomTabOn]}>
      <Text style={[styles.roomTabText, room === id && styles.roomTabTextOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return (
    <SwipeTabs current="community">
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }} keyboardVerticalOffset={0}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <Text style={styles.eyebrow}>▚ THE CIRCLE //</Text>
        <Text style={styles.h1}>{room === "groups" ? "GROUPS" : "SOCIAL HUB"}</Text>
        <View style={styles.roomTabs}>
          {!lite && <Tab id="main" label="◍ ALL" />}
          {!lite && !!gym && <Tab id="gym" label={`🏋 ${gym.toUpperCase()}`} />}
          <Tab id="groups" label="🛡 GROUPS" />
        </View>
      </View>

      {room === "groups" ? (
        <GroupsPanel />
      ) : !canChat ? (
        <View style={[styles.gate, { paddingTop: spacing.xl }]}>
          <Text style={styles.eyebrow}>ACCESS DENIED</Text>
          <Text style={styles.gateTitle}>CIRCLE LOCKED</Text>
          <Text style={styles.gateSub}>The chat is exclusive to $5/mo premium members or verified Hutch&apos;s Inner Circle Skool members. Groups are open to everyone.</Text>
          <Pressable testID="gate-paywall" onPress={() => router.push("/paywall")} style={styles.gateBtn}>
            <Text style={styles.gateBtnText}>UNLOCK PREMIUM</Text>
          </Pressable>
        </View>
      ) : (
        <ChatRoom
          key={room}
          room={room}
          accent={room === "gym" ? colors.success : colors.brandPrimary}
          sendTextColor={room === "gym" ? "#001a10" : "#001122"}
          placeholder={room === "gym" ? `Talk with your ${gym} crew...` : "Drop a PR, ask a question..."}
          highlightMine
        />
      )}
    </KeyboardAvoidingView>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  enhancedBtn: { marginTop: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: "#FF2A3C", borderRadius: radius.sm, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(255,42,60,0.08)" },
  enhancedBtnText: { color: "#FF2A3C", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md },
  roomTabs: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  roomTab: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  roomTabOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  roomTabText: { color: colors.textDim, fontWeight: "900", letterSpacing: 1, fontSize: 11 },
  roomTabTextOn: { color: colors.brandPrimary },
  gate: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center", justifyContent: "flex-start" },
  gateTitle: { color: colors.error, fontSize: 28, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm, width: "100%", alignItems: "center" },
  gateBtnAlt: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong, marginTop: spacing.md },
  gateBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
});
