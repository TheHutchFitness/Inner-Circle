import { View, Text, StyleSheet, Pressable, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
import { useEffect, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, rankIndex } from "@/src/lib/theme";
import { useRouter, useLocalSearchParams } from "expo-router";
import { SwipeTabs } from "@/src/components/SwipeTabs";
import { ChatRoom } from "@/src/components/ChatRoom";
import { GroupsPanel } from "@/src/components/GroupsPanel";

export default function Community() {
  const insets = useSafeAreaInsets();
  const { user, token } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ group?: string }>();
  const lite = !!user?.lite_mode;
  const [room, setRoom] = useState<"main" | "gym" | "the_room" | "groups">(params.group ? "groups" : lite ? "groups" : "main");
  const [myGyms, setMyGyms] = useState<{ name: string; primary?: boolean }[]>([]);
  const [activeGym, setActiveGym] = useState<string>("");
  const [gymUnread, setGymUnread] = useState<Record<string, boolean>>({});
  const loadUnread = async () => {
    try { const r = await apiFetch(token, "/api/chat/unread-gyms"); setGymUnread(r.unread || {}); } catch {}
  };
  // Deep-link: if a ?group=<id> arrives while the Social tab is already mounted, switch to GROUPS.
  useEffect(() => {
    if (params.group) setRoom("groups");
  }, [params.group]);

  // Load the member's gyms (up to 5) so each gets its own chat room.
  useEffect(() => {
    (async () => {
      try {
        const r = await apiFetch(token, "/api/gyms/mine");
        const gs = (r.gyms || []) as { name: string; primary?: boolean }[];
        setMyGyms(gs);
        const primary = gs.find((g) => g.primary) || gs[0];
        setActiveGym((prev) => prev || primary?.name || "");
      } catch {}
    })();
  }, [token]);

  const hasGyms = myGyms.length > 0;

  // Unread dots: load on mount, poll while on the gym tab, refresh shortly after switching
  useEffect(() => { loadUnread(); }, [token]);
  useEffect(() => {
    if (room !== "gym") return;
    const t = setTimeout(loadUnread, 1600);
    const iv = setInterval(loadUnread, 8000);
    return () => { clearTimeout(t); clearInterval(iv); };
  }, [room, activeGym]);

  const canChat = true;
  // THE ROOM — Elite rank only (earned, no payment). Free once you reach Elite.
  const canRoomRank = rankIndex(user?.rank) >= 6 || user?.all_rooms_access;

  const Tab = ({ id, label }: { id: "main" | "gym" | "the_room" | "groups"; label: string }) => (
    <Pressable testID={`chat-room-${id}`} onPress={() => setRoom(id)} style={[styles.seg, room === id && styles.segOn]}>
      <Text style={[styles.segText, room === id && styles.segTextOn]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );

  return (
    <SwipeTabs current="community">
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }} keyboardVerticalOffset={0}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <View style={styles.headerRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>▚ THE CIRCLE</Text>
            <Text style={styles.h1}>{room === "groups" ? "CLANS" : room === "gym" ? "GYM CHAT" : room === "the_room" ? "THE ROOM" : "SOCIAL HUB"}</Text>
          </View>
        </View>
        <View style={styles.segment}>
          {!lite && <Tab id="main" label="ALL" />}
          {!lite && hasGyms && <Tab id="gym" label="GYMS" />}
          {!lite && <Tab id="the_room" label="THE ROOM" />}
          <Tab id="groups" label="CLANS" />
        </View>
        {/* Per-gym switcher — one chat room per gym you belong to (up to 5) */}
        {room === "gym" && hasGyms && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.gymBar} contentContainerStyle={styles.gymBarInner}>
            {myGyms.map((g) => {
              const on = g.name.toLowerCase() === activeGym.toLowerCase();
              return (
                <Pressable key={g.name} testID={`gym-chat-${g.name}`} onPress={() => setActiveGym(g.name)} style={[styles.gymChip, on && styles.gymChipOn]}>
                  <Text style={[styles.gymChipText, on && styles.gymChipTextOn]} numberOfLines={1}>{g.primary ? "★ " : ""}{g.name}</Text>
                  {!on && gymUnread[g.name.toLowerCase()] && <View style={styles.unreadDot} />}
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      {room === "groups" ? (
        <GroupsPanel />
      ) : room === "the_room" ? (
        !canRoomRank ? (
          <View style={[styles.gate, { paddingTop: spacing.xl }]}>
            <Text style={styles.lockGlyph}>🔒</Text>
            <Text style={[styles.eyebrow, { color: colors.error }]}>ELITE ONLY · RESTRICTED</Text>
            <Text style={styles.gateTitle}>THE ROOM</Text>
            <Text style={styles.gateSub}>This chamber is open to only a select few who&apos;ve reached <Text style={{ color: colors.text, fontWeight: "900" }}>Elite rank</Text>. Keep training and level up to unlock it — no membership needed.</Text>
          </View>
        ) : (
          <ChatRoom
            key="the_room"
            room="the_room"
            accent={colors.error}
            sendTextColor={colors.text}
            placeholder="Speak..."
            emptyText="Silence. Break it."
            highlightMine
          />
        )
      ) : !canChat ? (
        <View style={[styles.gate, { paddingTop: spacing.xl }]}>
          <Text style={styles.eyebrow}>ACCESS DENIED</Text>
          <Text style={styles.gateTitle}>CIRCLE LOCKED</Text>
          <Text style={styles.gateSub}>The chat is exclusive to $5/mo premium members or verified The Circle Skool members. Clans are open to everyone.</Text>
          <Pressable testID="gate-paywall" onPress={() => router.push("/paywall")} style={styles.gateBtn}>
            <Text style={styles.gateBtnText}>UNLOCK PREMIUM</Text>
          </Pressable>
        </View>
      ) : (
        <ChatRoom
          key={room === "gym" ? `gym:${activeGym}` : room}
          room={room}
          gymName={room === "gym" ? activeGym : undefined}
          accent={room === "gym" ? colors.success : colors.brandPrimary}
          sendTextColor={room === "gym" ? "#001a10" : "#001122"}
          placeholder={room === "gym" ? `Talk with your ${activeGym} crew...` : "Drop a PR, ask a question..."}
          highlightMine
        />
      )}
    </KeyboardAvoidingView>
    </SwipeTabs>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 10, fontWeight: "700" },
  header: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  headerRow: { flexDirection: "row", alignItems: "center" },
  enhancedBtn: { marginTop: spacing.sm, marginBottom: spacing.sm, borderWidth: 1, borderColor: "#FF2A3C", borderRadius: radius.sm, paddingVertical: 8, alignItems: "center", backgroundColor: "rgba(255,42,60,0.08)" },
  enhancedBtnText: { color: "#FF2A3C", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 2, marginBottom: spacing.md },
  segment: { flexDirection: "row", gap: 3, backgroundColor: colors.surface2, borderRadius: radius.pill, padding: 4 },
  gymBar: { marginTop: spacing.sm },
  gymBarInner: { gap: 6, paddingRight: spacing.md },
  gymChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, maxWidth: 160, flexDirection: "row", alignItems: "center" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.error, marginLeft: 6 },
  gymChipOn: { borderColor: colors.success, backgroundColor: "rgba(16,185,129,0.12)" },
  gymChipText: { color: colors.textDim, fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
  gymChipTextOn: { color: colors.success },
  seg: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radius.pill },
  segOn: { backgroundColor: colors.surface3 },
  segText: { color: colors.textDim, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  segTextOn: { color: colors.brandPrimary },
  gate: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center", justifyContent: "flex-start" },
  lockGlyph: { fontSize: 44, marginBottom: spacing.sm },
  gateTitle: { color: colors.error, fontSize: 28, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm, width: "100%", alignItems: "center" },
  gateBtnAlt: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong, marginTop: spacing.md },
  gateBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
});
