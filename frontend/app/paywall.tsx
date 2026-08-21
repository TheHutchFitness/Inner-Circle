import { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Modal } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useSubscription, rcEnabled } from "@/src/lib/revenuecat";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function Paywall() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { offerings, isSubscribed, isLoading, purchase, restore, isPurchasing, isRestoring, identityReady } = useSubscription();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const currentOffering = offerings?.current;
  const monthlyPkg =
    currentOffering?.monthly ||
    currentOffering?.availablePackages?.find(
      (p: any) => p.identifier === "$rc_monthly" || p.packageType === "MONTHLY"
    );
  const annualPkg =
    currentOffering?.annual ||
    currentOffering?.availablePackages?.find(
      (p: any) => p.identifier === "$rc_annual" || p.packageType === "ANNUAL"
    );

  const [plan, setPlan] = useState<"monthly" | "annual">("monthly");
  const pkg = plan === "annual" ? annualPkg : monthlyPkg;
  // The Circle sells at $9/mo and $90/yr. We show these set prices directly so the
  // paywall is always correct even while a store's cached offering lags; the actual
  // charge still comes from the real store product passed to purchasePackage().
  const MONTHLY_PRICE = "$9.00";
  const ANNUAL_PRICE = "$90.00";
  const price = plan === "annual" ? ANNUAL_PRICE : MONTHLY_PRICE;

  const monthlyAmount = 9;
  const annualAmount = 90;
  const savingsPct = monthlyAmount > 0 ? Math.max(0, Math.round((1 - annualAmount / (monthlyAmount * 12)) * 100)) : 0;
  const annualPerMonth = (annualAmount / 12).toFixed(2);

  const doPurchase = async () => {
    setConfirmOpen(false);
    if (!pkg) return;
    try {
      await purchase(pkg);
      setMsg("PREMIUM ACTIVATED · Welcome to The Circle.");
    } catch (e: any) {
      if (!String(e?.message || e).includes("userCancelled")) setMsg(e.message || "Purchase failed");
    }
  };

  const doRestore = async () => {
    try { await restore(); setMsg("Purchases restored."); }
    catch (e: any) { setMsg(e.message || "Restore failed"); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 40 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <LinearGradient colors={[colors.brandTertiary, colors.surface2]} style={styles.hero}>
          <Text style={styles.badge}>PREMIUM</Text>
          <Text style={styles.title}>UNLOCK THE CIRCLE</Text>
          <Text style={styles.subtitle}>The Judge · Athlete&apos;s Center · PR Room · Form Room · The Enhanced</Text>
        </LinearGradient>

        {[
          "The Judge — AI physique judging & feed",
          "Athlete's Center — AI custom program builder",
          "PR Room — coach breaks down your lifts",
          "Form Room — technique checks & fixes",
          "The Enhanced — protocol tracker room",
          "Premium ★ badge on your profile",
        ].map((b, i) => (
          <View key={i} style={styles.benefit}>
            <Text style={styles.check}>◆</Text>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}

        <View style={styles.planRow}>
          <Pressable testID="plan-monthly" onPress={() => setPlan("monthly")} style={[styles.planCard, plan === "monthly" && styles.planCardActive]}>
            <Text style={[styles.planLabel, plan === "monthly" && styles.planLabelActive]}>MONTHLY</Text>
            <Text style={styles.planPrice}>{MONTHLY_PRICE}</Text>
            <Text style={styles.planPer}>per month</Text>
          </Pressable>
          <Pressable testID="plan-annual" onPress={() => setPlan("annual")} style={[styles.planCard, plan === "annual" && styles.planCardActive]}>
            {savingsPct > 0 && <View style={styles.saveBadge}><Text style={styles.saveBadgeText}>SAVE {savingsPct}%</Text></View>}
            <Text style={[styles.planLabel, plan === "annual" && styles.planLabelActive]}>ANNUAL</Text>
            <Text style={styles.planPrice}>{ANNUAL_PRICE}</Text>
            <Text style={styles.planPer}>${annualPerMonth}/mo · billed yearly</Text>
          </Pressable>
        </View>
        {isLoading && <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.md }} />}

        {isSubscribed ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeText}>✓ PREMIUM ACTIVE</Text>
          </View>
        ) : !pkg ? (
          <View style={styles.errorCard}><Text style={styles.errorText}>Subscription options are unavailable right now. Please try again later.</Text></View>
        ) : (
          <Pressable
            testID="paywall-purchase"
            onPress={() => setConfirmOpen(true)}
            disabled={isPurchasing || !identityReady}
            style={[styles.primary, (!identityReady || isPurchasing) && { opacity: 0.6 }]}
          >
            {isPurchasing ? <ActivityIndicator color="#001122" /> : <Text style={styles.primaryText}>SUBSCRIBE — {price}</Text>}
          </Pressable>
        )}

        <Pressable testID="paywall-restore" onPress={doRestore} disabled={isRestoring} style={styles.restoreBtn}>
          <Text style={styles.restoreText}>{isRestoring ? "RESTORING..." : "RESTORE PURCHASES"}</Text>
        </Pressable>

        <Pressable testID="open-custom-program" onPress={() => router.push("/custom-program")} style={styles.customLink}>
          <Text style={styles.customLinkTitle}>★ WANT A 1-ON-1 CUSTOM PROGRAM?</Text>
          <Text style={styles.customLinkSub}>Human-written for your goals + instant Athlete&apos;s Center · $200 one-time</Text>
        </Pressable>

        {msg && <Text testID="paywall-msg" style={styles.msg}>{msg}</Text>}
        {!rcEnabled && <Text style={styles.simulated}>Simulated in web preview.</Text>}
        {__DEV__ && <Text style={styles.simulated}>Dev / Expo Go uses the RevenueCat Test Store.</Text>}
      </ScrollView>

      <Modal transparent visible={confirmOpen} animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CONFIRM PURCHASE</Text>
            <Text style={styles.modalBody}>{`Subscribe to The Circle Premium — ${plan === "annual" ? `${price}/yr` : `${price}/mo`}?`}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: spacing.lg }}>
              <Pressable onPress={() => setConfirmOpen(false)} style={[styles.modalBtn, { backgroundColor: colors.surface3 }]}><Text style={styles.modalBtnText}>CANCEL</Text></Pressable>
              <Pressable testID="confirm-purchase" onPress={doPurchase} style={[styles.modalBtn, { backgroundColor: colors.brandPrimary }]}><Text style={[styles.modalBtnText, { color: "#001122" }]}>CONFIRM</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  hero: { padding: spacing.xl, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", marginBottom: spacing.lg },
  badge: { color: colors.warning, letterSpacing: 5, fontWeight: "900" },
  title: { color: colors.text, fontSize: 26, fontWeight: "900", letterSpacing: 2, marginTop: spacing.sm },
  subtitle: { color: colors.textDim, marginTop: 4, textAlign: "center" },
  benefit: { flexDirection: "row", alignItems: "center", padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.brandPrimary },
  check: { color: colors.brandPrimary, fontSize: 16, marginRight: spacing.md },
  benefitText: { color: colors.text, flex: 1 },
  priceCard: { padding: spacing.xl, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", marginTop: spacing.lg },
  priceLabel: { color: colors.brandPrimary, letterSpacing: 4, fontWeight: "800" },
  priceBig: { color: colors.text, fontSize: 42, fontWeight: "900", marginTop: 4 },
  priceSub: { color: colors.textDim, marginTop: 4 },
  planRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  planCard: { flex: 1, padding: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: "center" },
  planCardActive: { borderColor: colors.brandPrimary, borderWidth: 2, backgroundColor: colors.brandTertiary },
  planLabel: { color: colors.textDim, letterSpacing: 3, fontWeight: "800", fontSize: 12 },
  planLabelActive: { color: colors.brandPrimary },
  planPrice: { color: colors.text, fontSize: 26, fontWeight: "900", marginTop: 6 },
  planPer: { color: colors.textDim, fontSize: 10, marginTop: 2, letterSpacing: 1, textAlign: "center" },
  saveBadge: { position: "absolute", top: -10, backgroundColor: colors.success, paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill },
  saveBadgeText: { color: "#002200", fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  primary: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  primaryText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  restoreBtn: { marginTop: spacing.md, alignItems: "center", padding: spacing.md },
  restoreText: { color: colors.textDim, letterSpacing: 2, fontWeight: "700" },
  customLink: { marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.06)", alignItems: "center" },
  customLinkTitle: { color: colors.warning, fontWeight: "900", letterSpacing: 2, fontSize: 13, textAlign: "center" },
  customLinkSub: { color: colors.textMid, fontSize: 11, marginTop: 6, letterSpacing: 1, textAlign: "center", lineHeight: 16 },
  activeCard: { marginTop: spacing.lg, padding: spacing.lg, alignItems: "center", backgroundColor: colors.success, borderRadius: radius.sm },
  activeText: { color: "#002200", fontWeight: "900", letterSpacing: 3 },
  errorCard: { marginTop: spacing.lg, padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error },
  errorText: { color: colors.error, textAlign: "center" },
  msg: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.md, letterSpacing: 2 },
  simulated: { color: colors.textDim, textAlign: "center", marginTop: spacing.sm, fontSize: 11, letterSpacing: 1 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", alignItems: "center", justifyContent: "center", padding: spacing.lg },
  modalCard: { width: "100%", padding: spacing.lg, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  modalTitle: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "800", textAlign: "center" },
  modalBody: { color: colors.text, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  modalBtn: { flex: 1, padding: spacing.md, alignItems: "center", borderRadius: radius.sm },
  modalBtnText: { color: colors.text, fontWeight: "900", letterSpacing: 2 },
});
