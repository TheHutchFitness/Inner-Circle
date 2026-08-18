import { useEffect, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator,
  TextInput, KeyboardAvoidingView, Platform, Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription, rcEnabled } from "@/src/lib/revenuecat";
import { colors, spacing, radius } from "@/src/lib/theme";

const BENEFITS = [
  "A complete program written personally by Coach Hutch — not AI",
  "Built 1-on-1 around your exact goals, injuries & schedule",
  "Instant, permanent Athlete's Center unlock",
  "Direct line to Coach for questions on your plan",
  "One-time payment · yours for life",
];

function findCustomPkg(offerings: any) {
  const cur = offerings?.current;
  if (!cur) return null;
  return (
    cur.lifetime ||
    cur.availablePackages?.find(
      (p: any) =>
        p.identifier === "custom_program" ||
        p.identifier === "$rc_lifetime" ||
        p.packageType === "LIFETIME" ||
        p.product?.identifier === "custom_program_lifetime"
    ) ||
    null
  );
}

export default function CustomProgram() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const { offerings, hasCustomProgram, purchase, isPurchasing, restore, isRestoring, identityReady } = useSubscription();

  const [view, setView] = useState<"offer" | "intake" | "confirm">("offer");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // intake form
  const [goals, setGoals] = useState("");
  const [experience, setExperience] = useState("");
  const [days, setDays] = useState("");
  const [schedule, setSchedule] = useState("");
  const [injuries, setInjuries] = useState("");
  const [contactMethod, setContactMethod] = useState<"email" | "phone">("email");
  const [contactValue, setContactValue] = useState("");
  const [notes, setNotes] = useState("");
  const [savedIntake, setSavedIntake] = useState<any>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const resendReceipt = async () => {
    setResending(true); setResendMsg(null);
    try {
      const r = await apiFetch(token, "/api/receipt/resend", {
        method: "POST", body: JSON.stringify({ entitlement: "custom_program" }),
      });
      setResendMsg(`Receipt sent to ${r.sent_to}`);
    } catch (e: any) { setResendMsg(e?.message || "Couldn't send — try again"); }
    setResending(false);
  };

  const pkg = findCustomPkg(offerings);
  const price = pkg?.product?.priceString || "$200.00";

  const loadStatus = async () => {
    try {
      const s = await apiFetch(token, "/api/custom-program");
      setReceipt(s.receipt || null);
      if (s.intake) { setSavedIntake(s.intake); setView("confirm"); }
      else if (s.purchased || hasCustomProgram) setView("intake");
      else setView("offer");
      // Mark a delivered program as seen so the Home "PROGRAM READY" badge clears
      if (s.intake?.program_media_id) {
        apiFetch(token, "/api/custom-program/alert/seen", { method: "POST" }).catch(() => {});
      }
    } catch { setView("offer"); }
    setLoading(false);
  };

  useEffect(() => {
    if (user?.email) setContactValue(user.email);
  }, [user?.email]);

  useEffect(() => {
    if (!token) return;
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // The server grants access only after RevenueCat confirms the purchase via its
  // webhook (server-side proof). That can lag a couple seconds, so retry briefly.
  const syncUnlock = async (attempts = 5): Promise<boolean> => {
    for (let i = 0; i < attempts; i++) {
      try {
        await apiFetch(token, "/api/custom-program/unlock", { method: "POST" });
        return true;
      } catch (e: any) {
        const m = String(e?.message || e).toLowerCase();
        if (!m.includes("not verified") && !m.includes("402")) throw e;
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
    return false;
  };

  const doPurchase = async () => {
    if (!pkg) { setMsg("This offer isn't available yet — please try again shortly."); return; }
    setMsg(null);
    try {
      await purchase(pkg);
      setMsg("Verifying your purchase…");
      const ok = await syncUnlock();
      await refresh();
      if (!ok) {
        setMsg("Purchase received — we're still confirming it with the store. Tap Restore in a moment to finish unlocking.");
      } else {
        setMsg(null);
      }
      setView("intake");
    } catch (e: any) {
      if (!String(e?.message || e).includes("userCancelled")) setMsg(e?.message || "Purchase failed");
    }
  };

  const doRestore = async () => {
    setMsg(null);
    try {
      await restore();
      const ok = await syncUnlock(3);
      await refresh();
      await loadStatus();
      setMsg(ok ? "Purchases restored." : "We're still confirming your purchase with the store — please try again shortly.");
    } catch (e: any) { setMsg(e?.message || "Restore failed"); }
  };

  const submitIntake = async () => {
    if (!goals.trim()) { setMsg("Tell Coach your goals to continue."); return; }
    setSubmitting(true); setMsg(null);
    try {
      const res = await apiFetch(token, "/api/custom-program/intake", {
        method: "POST",
        body: JSON.stringify({
          goals, experience, days_per_week: days, schedule, injuries,
          contact_method: contactMethod, contact_value: contactValue, notes,
        }),
      });
      setSavedIntake(res.request);
      setView("confirm");
    } catch (e: any) { setMsg(e?.message || "Could not submit"); }
    setSubmitting(false);
  };

  const Header = (
    <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
  );

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        {Header}

        {user?.all_rooms_access && (
          <>
            <Pressable testID="cp-coach-inbox" onPress={() => router.push("/coach-programs")} style={styles.coachBtn}>
              <Text style={styles.coachBtnText}>🛠 COACH INBOX — DELIVER PROGRAMS</Text>
            </Pressable>
            <Pressable testID="cp-coach-sales" onPress={() => router.push("/coach-sales")} style={styles.coachBtn}>
              <Text style={styles.coachBtnText}>📊 SALES RECAP — ORDERS & REVENUE</Text>
            </Pressable>
          </>
        )}

        <LinearGradient colors={["#3A2E00", colors.surface2]} style={styles.hero}>
          <Text style={styles.badge}>EXCLUSIVE · $200</Text>
          <Text style={styles.title}>1-ON-1 CUSTOM PROGRAM</Text>
          <Text style={styles.subtitle}>Hand-written for you by Coach Hutch. Not AI.</Text>
        </LinearGradient>

        {loading ? (
          <ActivityIndicator color={colors.warning} style={{ marginTop: spacing.xl }} />
        ) : view === "offer" ? (
          <>
            {BENEFITS.map((b, i) => (
              <View key={i} style={styles.benefit}>
                <Text style={styles.check}>★</Text>
                <Text style={styles.benefitText}>{b}</Text>
              </View>
            ))}

            <View style={styles.priceCard}>
              <Text style={styles.priceLabel}>ONE-TIME · LIFETIME</Text>
              <Text style={styles.priceBig}>{price}</Text>
              <Text style={styles.priceSub}>Includes permanent Athlete&apos;s Center access</Text>
            </View>

            <Pressable
              testID="cp-purchase"
              onPress={doPurchase}
              disabled={isPurchasing || !identityReady}
              style={[styles.primary, (!identityReady || isPurchasing) && { opacity: 0.6 }]}
            >
              {isPurchasing ? <ActivityIndicator color="#221900" /> : <Text style={styles.primaryText}>BUY NOW — {price}</Text>}
            </Pressable>

            <Pressable testID="cp-restore" onPress={doRestore} disabled={isRestoring} style={styles.restoreBtn}>
              <Text style={styles.restoreText}>{isRestoring ? "RESTORING..." : "RESTORE PURCHASE"}</Text>
            </Pressable>

            {!pkg && <Text style={styles.simulated}>Offer syncing… if this persists the product may still be setting up.</Text>}
            {!rcEnabled && <Text style={styles.simulated}>Simulated in web preview.</Text>}
          </>
        ) : view === "intake" ? (
          <>
            <View style={styles.unlockedBanner}>
              <Text style={styles.unlockedText}>✓ PAYMENT CONFIRMED · ATHLETE&apos;S CENTER UNLOCKED</Text>
            </View>
            {receipt && <ReceiptCard receipt={receipt} onResend={resendReceipt} resending={resending} resendMsg={resendMsg} />}
            <Text style={styles.formIntro}>Tell Coach Hutch everything he needs to build your program.</Text>

            <Field label="YOUR GOALS *">
              <TextInput testID="cp-goals" value={goals} onChangeText={setGoals} multiline
                placeholder="e.g. Add 50lb to my squat, lean down 15lb, compete in 6 months"
                placeholderTextColor={colors.textDim} style={[styles.input, styles.multiline]} />
            </Field>
            <Field label="TRAINING EXPERIENCE">
              <TextInput testID="cp-exp" value={experience} onChangeText={setExperience}
                placeholder="e.g. 3 years lifting, intermediate" placeholderTextColor={colors.textDim} style={styles.input} />
            </Field>
            <Field label="DAYS PER WEEK YOU CAN TRAIN">
              <TextInput testID="cp-days" value={days} onChangeText={setDays} keyboardType="numeric"
                placeholder="e.g. 4" placeholderTextColor={colors.textDim} style={styles.input} />
            </Field>
            <Field label="SCHEDULE / PREFERRED DAYS">
              <TextInput testID="cp-schedule" value={schedule} onChangeText={setSchedule}
                placeholder="e.g. Mon/Tue/Thu/Fri evenings" placeholderTextColor={colors.textDim} style={styles.input} />
            </Field>
            <Field label="INJURIES / LIMITATIONS">
              <TextInput testID="cp-injuries" value={injuries} onChangeText={setInjuries} multiline
                placeholder="Anything Coach should work around" placeholderTextColor={colors.textDim} style={[styles.input, styles.multiline]} />
            </Field>

            <Field label="HOW SHOULD COACH REACH YOU?">
              <View style={styles.toggleRow}>
                <Pressable testID="cp-contact-email" onPress={() => setContactMethod("email")} style={[styles.toggle, contactMethod === "email" && styles.toggleActive]}>
                  <Text style={[styles.toggleText, contactMethod === "email" && styles.toggleTextActive]}>EMAIL</Text>
                </Pressable>
                <Pressable testID="cp-contact-phone" onPress={() => setContactMethod("phone")} style={[styles.toggle, contactMethod === "phone" && styles.toggleActive]}>
                  <Text style={[styles.toggleText, contactMethod === "phone" && styles.toggleTextActive]}>PHONE</Text>
                </Pressable>
              </View>
              <TextInput testID="cp-contact-value" value={contactValue} onChangeText={setContactValue}
                keyboardType={contactMethod === "phone" ? "phone-pad" : "email-address"} autoCapitalize="none"
                placeholder={contactMethod === "phone" ? "Your phone number" : "Your email"} placeholderTextColor={colors.textDim} style={[styles.input, { marginTop: spacing.sm }]} />
            </Field>
            <Field label="ANYTHING ELSE">
              <TextInput testID="cp-notes" value={notes} onChangeText={setNotes} multiline
                placeholder="Optional" placeholderTextColor={colors.textDim} style={[styles.input, styles.multiline]} />
            </Field>

            <Pressable testID="cp-submit" onPress={submitIntake} disabled={submitting} style={styles.primary}>
              {submitting ? <ActivityIndicator color="#221900" /> : <Text style={styles.primaryText}>SUBMIT TO COACH</Text>}
            </Pressable>
          </>
        ) : (
          <>
            <View style={styles.confirmCard}>
              <Text style={styles.confirmMark}>✓</Text>
              <Text style={styles.confirmTitle}>YOU&apos;RE IN</Text>
              <Text style={styles.confirmBody}>
                Your 1-on-1 program is being written personally by Coach Hutch. He&apos;ll reach out via{" "}
                <Text style={{ color: colors.warning, fontWeight: "800" }}>
                  {savedIntake?.contact_method === "phone" ? "phone" : "email"}
                </Text>{" "}
                {savedIntake?.contact_value ? `(${savedIntake.contact_value})` : ""} once it&apos;s ready.
              </Text>
              {!!savedIntake?.goals && (
                <View style={styles.summaryBox}>
                  <Text style={styles.summaryLabel}>YOUR GOALS</Text>
                  <Text style={styles.summaryText}>{savedIntake.goals}</Text>
                </View>
              )}
            </View>

            {receipt && <ReceiptCard receipt={receipt} onResend={resendReceipt} resending={resending} resendMsg={resendMsg} />}

            {savedIntake?.program_media_id ? (
              <Pressable
                testID="cp-download"
                onPress={() => Linking.openURL(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/chat/media/${savedIntake.program_media_id}?token=${token}`)}
                style={styles.primary}
              >
                <Text style={styles.primaryText}>⬇ DOWNLOAD YOUR PROGRAM</Text>
              </Pressable>
            ) : (
              <View style={styles.awaitBox}>
                <Text style={styles.awaitText}>Coach is writing your program — you&apos;ll get it right here when it&apos;s ready.</Text>
              </View>
            )}

            <Pressable testID="cp-open-ac" onPress={() => router.push("/athletes-center")} style={styles.primary}>
              <Text style={styles.primaryText}>OPEN ATHLETE&apos;S CENTER</Text>
            </Pressable>
            <Pressable testID="cp-home" onPress={() => router.replace("/(tabs)")} style={styles.restoreBtn}>
              <Text style={styles.restoreText}>BACK TO HOME</Text>
            </Pressable>
          </>
        )}

        {msg && <Text testID="cp-msg" style={styles.msg}>{msg}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: any) {
  return (
    <View style={{ marginTop: spacing.md }}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function ReceiptCard({ receipt, onResend, resending, resendMsg }: { receipt: any; onResend?: () => void; resending?: boolean; resendMsg?: string | null }) {
  const date = receipt?.purchased_at
    ? new Date(receipt.purchased_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";
  return (
    <View style={styles.receipt}>
      <View style={styles.receiptTop}>
        <Text style={styles.receiptBrand}>HUTCH&apos;S INNER CIRCLE</Text>
        <Text style={styles.receiptPaid}>PAID</Text>
      </View>
      <Text style={styles.receiptTitle}>RECEIPT</Text>
      <View style={styles.receiptDivider} />
      <ReceiptRow k="ORDER #" v={receipt?.order_number || "—"} mono />
      <ReceiptRow k="ITEM" v={receipt?.product || "—"} />
      <ReceiptRow k="DATE" v={date} />
      <View style={styles.receiptDivider} />
      <ReceiptRow k="TOTAL" v={receipt?.amount || "—"} strong />
      <Text style={styles.receiptFoot}>One-time payment · yours for life. Keep this order number for your records.</Text>
      {onResend && (
        <Pressable testID="cp-resend-receipt" onPress={onResend} disabled={resending} style={styles.resendBtn}>
          {resending ? <ActivityIndicator color={colors.warning} /> : <Text style={styles.resendBtnText}>✉ EMAIL ME THIS RECEIPT</Text>}
        </Pressable>
      )}
      {!!resendMsg && <Text style={styles.resendMsg}>{resendMsg}</Text>}
    </View>
  );
}

function ReceiptRow({ k, v, mono, strong }: { k: string; v: string; mono?: boolean; strong?: boolean }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptKey}>{k}</Text>
      <Text style={[styles.receiptVal, mono && styles.receiptMono, strong && styles.receiptStrong]}>{v}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.warning, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  hero: { padding: spacing.xl, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, alignItems: "center", marginBottom: spacing.lg },
  badge: { color: colors.warning, letterSpacing: 4, fontWeight: "900", fontSize: 12 },
  title: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm, textAlign: "center" },
  subtitle: { color: colors.textMid, marginTop: 6, textAlign: "center" },
  benefit: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.warning },
  check: { color: colors.warning, fontSize: 15, marginRight: spacing.md },
  benefitText: { color: colors.text, flex: 1, lineHeight: 19 },
  priceCard: { padding: spacing.xl, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, alignItems: "center", marginTop: spacing.lg },
  priceLabel: { color: colors.warning, letterSpacing: 4, fontWeight: "800", fontSize: 11 },
  priceBig: { color: colors.text, fontSize: 44, fontWeight: "900", marginTop: 4 },
  priceSub: { color: colors.textDim, marginTop: 4, textAlign: "center" },
  primary: { marginTop: spacing.lg, backgroundColor: colors.warning, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  primaryText: { color: "#221900", fontWeight: "900", letterSpacing: 3 },
  restoreBtn: { marginTop: spacing.md, alignItems: "center", padding: spacing.md },
  restoreText: { color: colors.textDim, letterSpacing: 2, fontWeight: "700" },
  simulated: { color: colors.textDim, textAlign: "center", marginTop: spacing.sm, fontSize: 11, letterSpacing: 1 },
  msg: { color: colors.warning, textAlign: "center", marginTop: spacing.md, letterSpacing: 1 },
  unlockedBanner: { backgroundColor: colors.success, borderRadius: radius.sm, padding: spacing.md, alignItems: "center" },
  unlockedText: { color: "#002200", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  formIntro: { color: colors.textMid, marginTop: spacing.md, lineHeight: 20 },
  label: { color: colors.textDim, letterSpacing: 3, fontSize: 10, fontWeight: "700" },
  input: { marginTop: 4, backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  multiline: { minHeight: 70, textAlignVertical: "top" },
  toggleRow: { flexDirection: "row", gap: spacing.sm, marginTop: 4 },
  toggle: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  toggleActive: { borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.08)" },
  toggleText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  toggleTextActive: { color: colors.warning },
  confirmCard: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, padding: spacing.xl, alignItems: "center", marginTop: spacing.md },
  confirmMark: { color: colors.success, fontSize: 44, fontWeight: "900" },
  confirmTitle: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm },
  confirmBody: { color: colors.textMid, textAlign: "center", marginTop: spacing.md, lineHeight: 21 },
  summaryBox: { alignSelf: "stretch", marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surface3, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.warning },
  summaryLabel: { color: colors.warning, letterSpacing: 2, fontSize: 10, fontWeight: "800" },
  summaryText: { color: colors.text, marginTop: 4, lineHeight: 19 },
  awaitBox: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary },
  awaitText: { color: colors.textMid, lineHeight: 19 },
  coachBtn: { marginBottom: spacing.md, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary, alignItems: "center" },
  coachBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  receipt: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.warning },
  receiptTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  receiptBrand: { color: colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 2 },
  receiptPaid: { color: "#002200", backgroundColor: colors.success, fontSize: 9, fontWeight: "900", letterSpacing: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, overflow: "hidden" },
  receiptTitle: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 3, marginTop: 6 },
  receiptDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  receiptRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  receiptKey: { color: colors.textDim, fontSize: 11, letterSpacing: 2, fontWeight: "800" },
  receiptVal: { color: colors.text, fontSize: 13, fontWeight: "700", flexShrink: 1, textAlign: "right", marginLeft: spacing.md },
  receiptMono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace", letterSpacing: 1, color: colors.warning },
  receiptStrong: { color: colors.warning, fontSize: 16, fontWeight: "900" },
  receiptFoot: { color: colors.textDim, fontSize: 11, lineHeight: 16, marginTop: 4 },
  resendBtn: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: "center", minHeight: 44, justifyContent: "center" },
  resendBtnText: { color: colors.warning, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  resendMsg: { color: colors.success, fontSize: 12, marginTop: spacing.sm, textAlign: "center" },
});
