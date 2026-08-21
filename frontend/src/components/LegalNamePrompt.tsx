import { useState } from "react";
import { View, Text, StyleSheet, Modal, TextInput, Platform, KeyboardAvoidingView } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { NeonButton } from "@/src/components/NeonButton";
import { colors, spacing, radius } from "@/src/lib/theme";

// Prompts members who registered before the full-legal-name requirement to add
// it. Blocking (no dismiss) so we backfill everyone on their next login.
export function LegalNamePrompt() {
  const { token, user, refresh } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const needs = !!user && !user.is_admin && !(user.full_name && String(user.full_name).trim());
  if (!needs) return null;

  const save = async () => {
    if (name.trim().length < 2) { setErr("Please enter your full legal name"); return; }
    setBusy(true); setErr(null);
    try {
      await apiFetch(token, "/api/profile/full-name", { method: "POST", body: JSON.stringify({ full_name: name.trim() }) });
      await refresh?.();
    } catch (e: any) { setErr(e?.message || "Could not save"); }
    setBusy(false);
  };

  return (
    <Modal visible transparent animationType="fade">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.eyebrow}>ONE QUICK THING</Text>
          <Text style={styles.title}>ADD YOUR FULL LEGAL NAME</Text>
          <Text style={styles.sub}>We now ask every member for their full legal name (used for coaching & verification). Please add yours to continue.</Text>
          <TextInput
            testID="legal-name-input"
            value={name}
            onChangeText={setName}
            placeholder="Full Legal Name"
            placeholderTextColor={colors.textDim}
            style={styles.input}
            autoCapitalize="words"
            autoFocus
          />
          {err && <Text style={styles.err}>{err}</Text>}
          <NeonButton testID="legal-name-save" label={busy ? "SAVING…" : "SAVE & CONTINUE"} loading={busy} onPress={save} style={{ marginTop: spacing.md }} />
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 420, backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.brandPrimary, padding: spacing.lg },
  eyebrow: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 11 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 20, marginTop: 4 },
  sub: { color: colors.textDim, fontSize: 13, lineHeight: 19, marginTop: spacing.sm, marginBottom: spacing.md },
  input: { backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 13, borderWidth: 1, borderColor: colors.border, fontSize: 15 },
  err: { color: colors.error, fontSize: 12, fontWeight: "700", marginTop: spacing.sm },
});
