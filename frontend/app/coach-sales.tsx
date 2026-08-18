import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Platform, TextInput } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, avatarFor } from "@/src/lib/theme";

const money = (n: number) => `$${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  const d = new Date(Number(y), Number(mo) - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
};

export default function CoachSales() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [data, setData] = useState<any>(null);
  const [buyers, setBuyers] = useState<any[]>([]);
  const [buyerQuery, setBuyerQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    Promise.all([
      apiFetch(token, "/api/coach/sales").then(setData),
      apiFetch(token, "/api/coach/buyers").then((r) => setBuyers(r.buyers || [])).catch(() => {}),
    ])
      .catch((e: any) => setErr(e?.message || "Coach access only"))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.eyebrow}>▚ COACH · REVENUE //</Text>
        <Text style={styles.h1}>SALES RECAP</Text>

        {loading ? (
          <ActivityIndicator color={colors.warning} style={{ marginTop: spacing.xl }} />
        ) : err ? (
          <Text style={styles.err}>{err}</Text>
        ) : (
          <>
            <LinearGradient colors={["#3A2E00", colors.surface2]} style={styles.hero}>
              <Text style={styles.heroLabel}>TOTAL REVENUE</Text>
              <Text style={styles.heroBig}>{money(data.total_revenue)}</Text>
              <Text style={styles.heroSub}>{data.total_orders} order{data.total_orders === 1 ? "" : "s"} all-time</Text>
            </LinearGradient>

            <View style={styles.prodRow}>
              <View style={styles.prodCard}>
                <Text style={styles.prodName}>CUSTOM PROGRAM</Text>
                <Text style={styles.prodCount}>{data.by_product.custom_program.count}</Text>
                <Text style={styles.prodRev}>{money(data.by_product.custom_program.revenue)}</Text>
              </View>
              <View style={styles.prodCard}>
                <Text style={styles.prodName}>FOUNDER BACKER</Text>
                <Text style={styles.prodCount}>{data.by_product.backer.count}</Text>
                <Text style={styles.prodRev}>{money(data.by_product.backer.revenue)}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>BY MONTH</Text>
            {data.by_month.length === 0 ? (
              <Text style={styles.empty}>No sales yet. Orders will appear here as they come in.</Text>
            ) : (
              data.by_month.map((m: any) => (
                <View key={m.month} testID={`sales-${m.month}`} style={styles.monthCard}>
                  <View style={styles.monthTop}>
                    <Text style={styles.monthName}>{monthLabel(m.month)}</Text>
                    <Text style={styles.monthRev}>{money(m.revenue)}</Text>
                  </View>
                  <View style={styles.monthMetaRow}>
                    <Text style={styles.monthMeta}>{m.orders} order{m.orders === 1 ? "" : "s"}</Text>
                    <Text style={styles.monthBreak}>
                      {m.custom_program} program{m.custom_program === 1 ? "" : "s"} · {m.backer} backer{m.backer === 1 ? "" : "s"}
                    </Text>
                  </View>
                </View>
              ))
            )}

            <Text style={styles.sectionTitle}>CUSTOM PROGRAM BUYERS</Text>
            {buyers.length === 0 ? (
              <Text style={styles.empty}>No Custom Program buyers yet.</Text>
            ) : (
              <>
                <TextInput
                  testID="buyer-search"
                  value={buyerQuery}
                  onChangeText={setBuyerQuery}
                  placeholder="🔍 Search buyers by name…"
                  placeholderTextColor={colors.textDim}
                  style={styles.search}
                  autoCapitalize="none"
                />
                {(() => {
                  const q = buyerQuery.trim().toLowerCase();
                  const filtered = q ? buyers.filter((b) => (b.display_name || "").toLowerCase().includes(q)) : buyers;
                  if (filtered.length === 0) return <Text style={styles.empty}>No buyers match “{buyerQuery}”.</Text>;
                  return filtered.map((b, i) => (
                    <View key={b.order_number || i} testID={`buyer-${i}`} style={styles.buyerCard}>
                      <Text style={styles.buyerEmoji}>{avatarFor(b.avatar_id).emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.buyerName}>{b.display_name}</Text>
                        <Text style={styles.buyerOrder}>{b.order_number} · {b.has_intake ? (b.intake_status || "submitted").toUpperCase() : "NO INTAKE YET"}</Text>
                      </View>
                      {b.has_intake && (
                        <Pressable testID={`buyer-intake-${i}`} onPress={() => router.push("/coach-programs")} style={styles.intakeBtn}>
                          <Text style={styles.intakeBtnText}>VIEW INTAKE</Text>
                        </Pressable>
                      )}
                    </View>
                  ));
                })()}
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { color: colors.warning, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.warning, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.lg },
  err: { color: colors.error, marginTop: spacing.xl, textAlign: "center" },
  hero: { padding: spacing.xl, borderRadius: radius.md, borderWidth: 1, borderColor: colors.warning, alignItems: "center" },
  heroLabel: { color: colors.warning, letterSpacing: 3, fontWeight: "900", fontSize: 11 },
  heroBig: { color: colors.text, fontSize: 40, fontWeight: "900", letterSpacing: 1, marginTop: 6 },
  heroSub: { color: colors.textMid, marginTop: 4, fontSize: 12, letterSpacing: 1 },
  prodRow: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  prodCard: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.lg, alignItems: "center" },
  prodName: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800", textAlign: "center" },
  prodCount: { color: colors.text, fontSize: 26, fontWeight: "900", marginTop: 6 },
  prodRev: { color: colors.warning, fontWeight: "900", marginTop: 2, fontSize: 13 },
  sectionTitle: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 13, marginTop: spacing.xl, marginBottom: spacing.md },
  empty: { color: colors.textDim, textAlign: "center", marginTop: spacing.md },
  monthCard: { backgroundColor: colors.surface2, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.warning, padding: spacing.md, marginBottom: spacing.sm },
  monthTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  monthName: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  monthRev: { color: colors.warning, fontWeight: "900", fontSize: 16 },
  monthMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 4 },
  monthMeta: { color: colors.textMid, fontSize: 12 },
  monthBreak: { color: colors.textDim, fontSize: 11 },
  buyerCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  search: { color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, marginBottom: spacing.md, minHeight: 44 },
  buyerEmoji: { fontSize: 26 },
  buyerName: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  buyerOrder: { color: colors.textDim, fontSize: 11, marginTop: 2, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  intakeBtn: { borderWidth: 1, borderColor: colors.warning, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 8 },
  intakeBtnText: { color: colors.warning, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
});
