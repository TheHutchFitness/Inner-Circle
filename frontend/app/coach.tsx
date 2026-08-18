import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

const SUGGESTIONS = [
  "Build me a 4-day push/pull/legs split",
  "How much protein should I eat to gain muscle?",
  "My bench is stuck — how do I break the plateau?",
  "Best warm-up before heavy squats?",
];

export default function Coach() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const scrollEnd = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);

  useEffect(() => {
    if (!token) return;
    (async () => {
      try { setMessages(await apiFetch(token, "/api/coach/messages")); } catch {}
      setLoaded(true);
      scrollEnd();
    })();
  }, [token]);

  const send = async (preset?: string) => {
    const body = (preset ?? text).trim();
    if (!body || sending) return;
    setText("");
    const optimistic = { msg_id: `tmp_${Date.now()}`, role: "user", text: body };
    setMessages((m) => [...m, optimistic]);
    setSending(true);
    scrollEnd();
    try {
      const reply = await apiFetch(token, "/api/coach/messages", { method: "POST", body: JSON.stringify({ text: body }) });
      setMessages((m) => [...m, reply]);
    } catch (e: any) {
      setMessages((m) => [...m, { msg_id: `err_${Date.now()}`, role: "assistant", text: "⚠️ " + (e?.message || "Coach is unavailable right now — try again.") }]);
    }
    setSending(false);
    scrollEnd();
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()} hitSlop={10}><Text style={styles.back}>←</Text></Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>AI COACH</Text>
          <Text style={styles.sub}>Powered by GPT-5.4 · training & nutrition</Text>
        </View>
        <View style={styles.online} />
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.lg }}>
        {loaded && messages.length === 0 && (
          <View style={styles.welcome}>
            <Text style={styles.welcomeIcon}>🧠</Text>
            <Text style={styles.welcomeTitle}>ASK YOUR COACH</Text>
            <Text style={styles.welcomeBody}>Training splits, nutrition, plateaus, recovery — get straight answers. Try:</Text>
            {SUGGESTIONS.map((s) => (
              <Pressable key={s} testID={`coach-suggest-${s.slice(0,6)}`} onPress={() => send(s)} style={styles.suggest}>
                <Text style={styles.suggestText}>{s}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {messages.map((m) => (
          <View key={m.msg_id} testID={`coach-msg-${m.role}`} style={[styles.bubbleRow, m.role === "user" ? styles.rowRight : styles.rowLeft]}>
            <View style={[styles.bubble, m.role === "user" ? styles.userBubble : styles.coachBubble]}>
              {m.role === "assistant" && <Text style={styles.coachTag}>COACH</Text>}
              <Text style={m.role === "user" ? styles.userText : styles.coachText}>{m.text}</Text>
            </View>
          </View>
        ))}

        {sending && (
          <View style={[styles.bubbleRow, styles.rowLeft]}>
            <View style={[styles.bubble, styles.coachBubble, styles.typing]}>
              <ActivityIndicator size="small" color={colors.brandPrimary} />
              <Text style={styles.typingText}>Coach is thinking…</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <View style={[styles.inputRow, { paddingBottom: spacing.md + insets.bottom }]}>
        <TextInput
          testID="coach-input"
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Ask your coach…"
          placeholderTextColor={colors.textDim}
          multiline
          onSubmitEditing={() => send()}
        />
        <Pressable testID="coach-send" onPress={() => send()} disabled={sending || !text.trim()} style={[styles.sendBtn, (sending || !text.trim()) && { opacity: 0.5 }]}>
          <Text style={styles.sendText}>SEND</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface2 },
  back: { color: colors.brandPrimary, fontSize: 26, fontWeight: "800" },
  title: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 3 },
  sub: { color: colors.textDim, fontSize: 11, letterSpacing: 1, marginTop: 2 },
  online: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.success },
  welcome: { alignItems: "center", paddingVertical: spacing.xl },
  welcomeIcon: { fontSize: 44 },
  welcomeTitle: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm },
  welcomeBody: { color: colors.textMid, textAlign: "center", marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 20 },
  suggest: { alignSelf: "stretch", padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2, marginBottom: spacing.sm },
  suggestText: { color: colors.brandPrimary, fontWeight: "700", letterSpacing: 1 },
  bubbleRow: { marginBottom: spacing.md, flexDirection: "row" },
  rowRight: { justifyContent: "flex-end" },
  rowLeft: { justifyContent: "flex-start" },
  bubble: { maxWidth: "86%", padding: spacing.md, borderRadius: radius.md },
  userBubble: { backgroundColor: colors.brandPrimary, borderBottomRightRadius: 4 },
  coachBubble: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderStrong, borderBottomLeftRadius: 4 },
  coachTag: { color: colors.brandPrimary, fontSize: 9, letterSpacing: 2, fontWeight: "900", marginBottom: 4 },
  userText: { color: "#001122", fontWeight: "600", lineHeight: 21 },
  coachText: { color: colors.text, lineHeight: 22 },
  typing: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  typingText: { color: colors.textDim, letterSpacing: 1 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.brandPrimary, backgroundColor: colors.surface2 },
  input: { flex: 1, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingTop: 12, paddingBottom: 12, maxHeight: 120, borderWidth: 1, borderColor: colors.border },
  sendBtn: { backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.lg, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
});
