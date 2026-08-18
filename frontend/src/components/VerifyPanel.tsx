import { useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator } from "react-native";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

export function VerifyPanel({ onVerified }: { onVerified?: () => void }) {
  const { token, user, refresh } = useAuth();
  const [method, setMethod] = useState<"email" | "phone" | null>(null);
  const [stage, setStage] = useState<"idle" | "sent">("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [mockCode, setMockCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const emailDone = !!user?.email_verified;
  const phoneDone = !!user?.phone_verified;

  const pickMethod = (m: "email" | "phone") => {
    setMethod(m); setStage("idle"); setCode(""); setMockCode(null); setMsg(null);
  };

  const sendCode = async () => {
    if (busy) return;
    setBusy(true); setMsg(null);
    try {
      if (method === "email") {
        await apiFetch(token, "/api/verify/email/send", { method: "POST" });
        setMsg(`Code sent to ${user?.email} — check your inbox.`);
      } else {
        const r = await apiFetch(token, "/api/verify/phone/send", { method: "POST", body: JSON.stringify({ phone }) });
        if (r.mock && r.code) setMockCode(r.code);
      }
      setStage("sent");
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  const confirm = async () => {
    if (busy || code.trim().length < 6) return;
    setBusy(true); setMsg(null);
    try {
      await apiFetch(token, `/api/verify/${method}/confirm`, { method: "POST", body: JSON.stringify({ code: code.trim() }) });
      await refresh();
      setMsg(method === "email" ? "✓ Email verified — media sharing unlocked." : "✓ Phone verified — media sharing unlocked.");
      setMethod(null); setStage("idle"); setCode(""); setMockCode(null);
      onVerified?.();
    } catch (e: any) { setMsg(e.message); }
    setBusy(false);
  };

  return (
    <View>
      <View style={st.statusRow}>
        <View style={[st.statusChip, emailDone && st.statusDone]}>
          <Text style={[st.statusText, emailDone && st.statusTextDone]}>{emailDone ? "✓ EMAIL VERIFIED" : "EMAIL UNVERIFIED"}</Text>
        </View>
        <View style={[st.statusChip, phoneDone && st.statusDone]}>
          <Text style={[st.statusText, phoneDone && st.statusTextDone]}>{phoneDone ? "✓ PHONE VERIFIED" : "PHONE UNVERIFIED"}</Text>
        </View>
      </View>

      {!method && (
        <View style={st.methodRow}>
          {!emailDone && (
            <Pressable testID="verify-method-email" onPress={() => pickMethod("email")} style={st.methodBtn}>
              <Text style={st.methodText}>VERIFY EMAIL</Text>
            </Pressable>
          )}
          {!phoneDone && (
            <Pressable testID="verify-method-phone" onPress={() => pickMethod("phone")} style={st.methodBtn}>
              <Text style={st.methodText}>VERIFY PHONE</Text>
            </Pressable>
          )}
        </View>
      )}

      {method === "email" && stage === "idle" && (
        <View>
          <Text style={st.helper}>We&apos;ll send a 6-digit code to {user?.email}.</Text>
          <Pressable testID="verify-send" onPress={sendCode} style={st.primary} disabled={busy}>
            {busy ? <ActivityIndicator size="small" color="#001122" /> : <Text style={st.primaryText}>SEND CODE</Text>}
          </Pressable>
        </View>
      )}

      {method === "phone" && stage === "idle" && (
        <View>
          <Text style={st.helper}>Enter your phone number to receive a 6-digit code.</Text>
          <TextInput
            testID="verify-phone-input"
            value={phone}
            onChangeText={setPhone}
            placeholder="+1 555 123 4567"
            placeholderTextColor={colors.textDim}
            keyboardType="phone-pad"
            style={st.input}
          />
          <Pressable testID="verify-send" onPress={sendCode} style={st.primary} disabled={busy || phone.trim().length < 7}>
            {busy ? <ActivityIndicator size="small" color="#001122" /> : <Text style={st.primaryText}>SEND CODE</Text>}
          </Pressable>
        </View>
      )}

      {method && stage === "sent" && (
        <View>
          {mockCode && (
            <View style={st.mockBox}>
              <Text style={st.mockLabel}>DEV MODE — SMS NOT LIVE YET</Text>
              <Text style={st.mockCode}>{mockCode}</Text>
              <Text style={st.mockHint}>Real texts start once Twilio keys are added. Use this code for now.</Text>
            </View>
          )}
          <TextInput
            testID="verify-code-input"
            value={code}
            onChangeText={setCode}
            placeholder="Enter 6-digit code"
            placeholderTextColor={colors.textDim}
            keyboardType="number-pad"
            maxLength={6}
            style={st.input}
          />
          <Pressable testID="verify-confirm" onPress={confirm} style={st.primary} disabled={busy || code.trim().length < 6}>
            {busy ? <ActivityIndicator size="small" color="#001122" /> : <Text style={st.primaryText}>CONFIRM</Text>}
          </Pressable>
          <Pressable testID="verify-resend" onPress={sendCode} disabled={busy}>
            <Text style={st.link}>Resend code</Text>
          </Pressable>
        </View>
      )}

      {msg && <Text testID="verify-msg" style={st.msg}>{msg}</Text>}
    </View>
  );
}

const st = StyleSheet.create({
  statusRow: { flexDirection: "row", gap: 8, marginBottom: spacing.md },
  statusChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  statusDone: { borderColor: colors.success, backgroundColor: "rgba(52,211,153,0.08)" },
  statusText: { color: colors.textDim, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  statusTextDone: { color: colors.success },
  methodRow: { flexDirection: "row", gap: 8 },
  methodBtn: { flex: 1, borderWidth: 1, borderColor: colors.brandPrimary, paddingVertical: spacing.md, borderRadius: radius.sm, alignItems: "center", minHeight: 44, justifyContent: "center" },
  methodText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  helper: { color: colors.textDim, lineHeight: 19, marginBottom: spacing.sm },
  input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  primary: { backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, minHeight: 44, justifyContent: "center" },
  primaryText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  link: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.md, letterSpacing: 1, fontWeight: "700" },
  mockBox: { borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, padding: spacing.md, marginBottom: spacing.md, alignItems: "center", backgroundColor: "rgba(251,191,36,0.06)" },
  mockLabel: { color: colors.warning, fontSize: 10, fontWeight: "800", letterSpacing: 2 },
  mockCode: { color: colors.text, fontSize: 30, fontWeight: "900", letterSpacing: 8, marginVertical: 6 },
  mockHint: { color: colors.textDim, fontSize: 11, textAlign: "center" },
  msg: { color: colors.brandPrimary, marginTop: spacing.md, letterSpacing: 1 },
});
