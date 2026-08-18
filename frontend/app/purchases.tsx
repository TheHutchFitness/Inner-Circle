import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

export default function Purchases() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await apiFetch(token, "/api/purchases");
      setRows(r.purchases || []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { if (token) load(); /* eslint-disable-next-line */ }, [token]);

  const resend = async (entitlement: string, id: string) => {
    setResendingId(id); setMsg(null);
    try {
      const r = await apiFetch(token, "/api/receipt/resend", {
        method: "POST", body: JSON.stringify({ entitlement }),
      });
      setMsg(`Receipt sent to ${r.sent_to}`);
    } catch (e: any) { setMsg(e?.message || "Couldn't send — try again"); }
    setResendingId(null);
  };

  const fmt = (d?: string) =>
    d ? new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>▚ RECORDS //</Text>
        <Text style={styles.h1}>MY PURCHASES</Text>
        <Text style={styles.helper}>Your one-time orders and receipts.</Text>

        {loading ? (
          <ActivityIndicator color={colors.warning} style={{ marginTop: spacing.xl }} />
        ) : rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.empty}>No purchases yet.</Text>
            <Text style={styles.emptySub}>Your Custom Program and Backer orders will show up here.</Text>
          </View>
        ) : (
          rows.map((p, i) => (
            <View key={p.order_number || i} testID={`purchase-${i}`} style={styles.card}>
              <View style={styles.cardTop}>
                <Text style={styles.orderNum}>{p.order_number || "—"}</Text>
                <Text style={styles.paid}>PAID</Text>
              </View>
              <Text style={styles.product}>{p.product}</Text>
              <View style={styles.metaRow}>
                <Text style={styles.meta}>{fmt(p.purchased_at)}</Text>
                <Text style={styles.amount}>{p.amount}</Text>
              </View>
              <Pressable
                testID={`resend-${i}`}
                onPress={() => resend(p.entitlement, p.order_number || String(i))}
                disabled={resendingId === (p.order_number || String(i))}
                style={styles.resendBtn}
              >
                {resendingId === (p.order_number || String(i))
                  ? <ActivityIndicator color={colors.warning} />
                  : <Text style={styles.resendText}>✉ EMAIL ME THIS RECEIPT</Text>}
              </Pressable>
            </View>
          ))
        )}

        {!!msg && <Text testID="purchases-msg" style={styles.msg}>{msg}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.warning, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.warning, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  helper: { color: colors.textMid, marginTop: 4, marginBottom: spacing.lg },
  emptyBox: { marginTop: spacing.xl, alignItems: "center" },
  empty: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  emptySub: { color: colors.textDim, marginTop: 6, textAlign: "center", lineHeight: 18 },
  card: { padding: spacing.lg, borderRadius: radius.md, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.warning, marginBottom: spacing.md },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  orderNum: { color: colors.warning, fontWeight: "900", letterSpacing: 1, fontSize: 14, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  paid: { color: "#002200", backgroundColor: colors.success, fontSize: 9, fontWeight: "900", letterSpacing: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.sm, overflow: "hidden" },
  product: { color: colors.text, fontWeight: "800", fontSize: 16, marginTop: spacing.sm },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },
  meta: { color: colors.textDim, fontSize: 12 },
  amount: { color: colors.text, fontWeight: "900", fontSize: 15 },
  resendBtn: { marginTop: spacing.md, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, paddingVertical: spacing.sm, alignItems: "center", minHeight: 44, justifyContent: "center" },
  resendText: { color: colors.warning, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  msg: { color: colors.success, textAlign: "center", marginTop: spacing.md, letterSpacing: 1 },
});
