import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator, RefreshControl } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function Notifications() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useAuth();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const rows = await apiFetch(token, "/api/notifications");
      setItems(rows || []);
      await apiFetch(token, "/api/notifications/mark-read", { method: "POST" });
    } catch {}
    setLoading(false);
    setRefreshing(false);
  }, [token]);

  useEffect(() => { load(); }, [load]);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable testID="notif-back" onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.back}>← BACK</Text>
        </Pressable>
        <Text style={styles.title}>🔔 NOTIFICATIONS</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.xl }} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: spacing.lg, paddingBottom: 60 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.brandPrimary} />}
        >
          {items.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyGlyph}>🔔</Text>
              <Text style={styles.emptyText}>No notifications yet.</Text>
              <Text style={styles.emptySub}>Leave critiques in The Judge, Form &amp; PR rooms — when members like them, you&apos;ll hear about it here.</Text>
            </View>
          ) : (
            items.map((n) => (
              <View key={n.notif_id} style={[styles.card, !n.read && styles.cardUnread]} testID={`notif-${n.notif_id}`}>
                <Text style={styles.cardText}>{n.text}</Text>
                <Text style={styles.cardTime}>{timeAgo(n.created_at)}</Text>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 13 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 15 },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.sm },
  cardUnread: { borderColor: colors.warning, backgroundColor: "rgba(255,176,32,0.08)" },
  cardText: { color: colors.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
  cardTime: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 6 },
  empty: { alignItems: "center", marginTop: spacing.xl * 2, paddingHorizontal: spacing.lg },
  emptyGlyph: { fontSize: 40, marginBottom: spacing.md },
  emptyText: { color: colors.text, fontSize: 16, fontWeight: "900" },
  emptySub: { color: colors.textMid, fontSize: 13, textAlign: "center", marginTop: spacing.sm, lineHeight: 19 },
});
