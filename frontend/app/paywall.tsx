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
  const pkg = currentOffering?.availablePackages[0];
  const price = pkg?.product.priceString || "$5.00";

  const doPurchase = async () => {
    setConfirmOpen(false);
    if (!pkg) return;
    try {
      await purchase(pkg);
      setMsg("PREMIUM ACTIVATED · Welcome to the Inner Circle.");
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
          <Text style={styles.subtitle}>All chatrooms · AI Coach · Premium Badges</Text>
        </LinearGradient>

        {[
          "Community chatroom access",
          "AI-assisted custom program builder",
          "The Room (Elite exclusive) access",
          "Premium ★ badge on your profile",
          "Priority PR verification",
        ].map((b, i) => (
          <View key={i} style={styles.benefit}>
            <Text style={styles.check}>◆</Text>
            <Text style={styles.benefitText}>{b}</Text>
          </View>
        ))}

        <View style={styles.priceCard}>
          {isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : (
            <>
              <Text style={styles.priceLabel}>MONTHLY</Text>
              <Text style={styles.priceBig}>{price}</Text>
              <Text style={styles.priceSub}>Cancel anytime</Text>
            </>
          )}
        </View>

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

        {msg && <Text testID="paywall-msg" style={styles.msg}>{msg}</Text>}
        {!rcEnabled && <Text style={styles.simulated}>Simulated in web preview.</Text>}
        {__DEV__ && <Text style={styles.simulated}>Dev / Expo Go uses the RevenueCat Test Store.</Text>}
      </ScrollView>

      <Modal transparent visible={confirmOpen} animationType="fade" onRequestClose={() => setConfirmOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>CONFIRM PURCHASE</Text>
            <Text style={styles.modalBody}>Subscribe to Hutch's Inner Circle Premium for {price}/mo?</Text>
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
  primary: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  primaryText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  restoreBtn: { marginTop: spacing.md, alignItems: "center", padding: spacing.md },
  restoreText: { color: colors.textDim, letterSpacing: 2, fontWeight: "700" },
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
