import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { colors, spacing, radius, avatarFor, RANK_COLORS } from "@/src/lib/theme";
import { useRouter } from "expo-router";

export default function Community() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { isSubscribed } = useSubscription();
  const router = useRouter();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const canChat = isSubscribed || user?.skool_verified;

  const load = async () => {
    if (!canChat) return;
    try {
      const rows = await apiFetch(token, "/api/chat/main/messages");
      setMessages(rows);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 50);
    } catch {}
  };

  useEffect(() => {
    if (!canChat) return;
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [token, canChat]);

  const send = async () => {
    if (!text.trim()) return;
    setSending(true);
    try {
      await apiFetch(token, `/api/chat/main/messages`, { method: "POST", body: JSON.stringify({ text: text.trim() }) });
      setText("");
      await load();
    } catch {}
    setSending(false);
  };

  if (!canChat) {
    return (
      <View style={[styles.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={styles.eyebrow}>ACCESS DENIED</Text>
        <Text style={styles.gateTitle}>CIRCLE LOCKED</Text>
        <Text style={styles.gateSub}>The community is exclusive to $5/mo premium members or verified Hutch's Inner Circle Skool members.</Text>
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
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1, backgroundColor: colors.surface }} keyboardVerticalOffset={80}>
      <View style={{ paddingTop: insets.top + spacing.md, paddingHorizontal: spacing.lg }}>
        <Text style={styles.eyebrow}>▚ THE CIRCLE //</Text>
        <Text style={styles.h1}>SOCIAL HUB</Text>
      </View>
      <ScrollView ref={scrollRef} style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 20 }}>
        {messages.map((m) => {
          const av = avatarFor(m.avatar_id);
          const mine = m.user_id === user?.user_id;
          return (
            <View key={m.message_id} style={[styles.msg, mine && styles.msgMine]}>
              <View style={styles.msgHead}>
                <Text style={styles.msgEmoji}>{av.emoji}</Text>
                <Text style={styles.msgName}>{m.display_name}</Text>
                <Text style={[styles.msgRank, { color: RANK_COLORS[m.rank] || colors.brandPrimary }]}>{m.rank?.toUpperCase()}</Text>
                {m.skool_verified && <Text style={styles.msgSkool}>✓</Text>}
              </View>
              <Text style={styles.msgText}>{m.text}</Text>
            </View>
          );
        })}
      </ScrollView>
      <View style={[styles.inputRow, { paddingBottom: insets.bottom + 70 }]}>
        <TextInput
          testID="chat-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Drop a PR, ask a question..."
          placeholderTextColor={colors.textDim}
        />
        <Pressable testID="chat-send" onPress={send} disabled={sending} style={styles.sendBtn}>
          <Text style={styles.sendText}>SEND</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md },
  gate: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center", justifyContent: "flex-start" },
  gateTitle: { color: colors.error, fontSize: 28, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm, width: "100%", alignItems: "center" },
  gateBtnAlt: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.borderStrong, marginTop: spacing.md },
  gateBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  msg: { padding: spacing.md, backgroundColor: colors.surface2, marginBottom: spacing.sm, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary },
  msgMine: { borderLeftColor: colors.warning, backgroundColor: colors.surface3 },
  msgHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  msgEmoji: { fontSize: 16 },
  msgName: { color: colors.text, fontWeight: "800", fontSize: 13 },
  msgRank: { fontSize: 9, letterSpacing: 2, fontWeight: "800" },
  msgSkool: { color: colors.success, fontWeight: "900" },
  msgText: { color: colors.textMid, lineHeight: 19 },
  inputRow: { flexDirection: "row", padding: spacing.md, gap: 8, backgroundColor: colors.surface2, borderTopWidth: 1, borderTopColor: colors.border },
  input: { flex: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  sendBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
});
