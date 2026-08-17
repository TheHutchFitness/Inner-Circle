import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, avatarFor, RANK_COLORS } from "@/src/lib/theme";

export default function TheRoom() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const canRank = ["Elite","Freak"].includes(user?.rank || "");
  const canPremium = isSubscribed || user?.skool_verified;
  const canAccess = canRank && canPremium;

  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const scrollRef = useRef<ScrollView>(null);

  const load = async () => {
    try {
      const rows = await apiFetch(token, "/api/chat/the_room/messages");
      setMessages(rows);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
  };
  useEffect(() => {
    if (!canAccess) return;
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [canAccess]);

  const send = async () => {
    if (!text.trim()) return;
    try {
      await apiFetch(token, "/api/chat/the_room/messages", { method: "POST", body: JSON.stringify({ text: text.trim() }) });
      setText("");
      await load();
    } catch {}
  };

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
      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 20 }}>
        {messages.length === 0 && <Text style={{ color: colors.textDim, textAlign: "center", marginTop: 40 }}>Silence. Break it.</Text>}
        {messages.map((m) => {
          const av = avatarFor(m.avatar_id);
          return (
            <View key={m.message_id} style={styles.msg}>
              <View style={styles.msgHead}>
                <Text style={{ fontSize: 16 }}>{av.emoji}</Text>
                <Text style={styles.msgName}>{m.display_name}</Text>
                <Text style={[styles.msgRank, { color: RANK_COLORS[m.rank] }]}>{m.rank}</Text>
              </View>
              <Text style={styles.msgText}>{m.text}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + spacing.md }]}>
        <TextInput testID="room-input" style={styles.input} value={text} onChangeText={setText} placeholder="Speak..." placeholderTextColor={colors.textDim} />
        <Pressable testID="room-send" onPress={send} style={styles.sendBtn}><Text style={styles.sendText}>SEND</Text></Pressable>
      </View>
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
  msg: { padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.error, backgroundColor: colors.surface2, marginBottom: spacing.sm, borderRadius: radius.sm },
  msgHead: { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 4 },
  msgName: { color: colors.text, fontWeight: "800" },
  msgRank: { fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  msgText: { color: colors.textMid, lineHeight: 19 },
  inputRow: { flexDirection: "row", padding: spacing.md, gap: 8, backgroundColor: colors.surface2, borderTopWidth: 1, borderTopColor: colors.error },
  input: { flex: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  sendBtn: { backgroundColor: colors.error, paddingHorizontal: spacing.lg, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  sendText: { color: colors.text, fontWeight: "900", letterSpacing: 2 },
});
