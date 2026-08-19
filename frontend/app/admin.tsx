import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch, ActivityIndicator, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, applyEnhancedPalette } from "@/src/lib/theme";
import { persistEnhancedFlag, reloadApp } from "@/src/lib/enhancedTheme";

export default function Admin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const [q, setQ] = useState("");
  const [members, setMembers] = useState<any[]>([]);
  const [badgeOpts, setBadgeOpts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<any[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [redOn, setRedOn] = useState(!!user?.enhanced);

  const loadMembers = async (query = "") => {
    try {
      const r = await apiFetch(token, `/api/admin/members?q=${encodeURIComponent(query)}`);
      setMembers(r.members || []); setBadgeOpts(r.badge_options || []);
    } catch (e: any) { setMsg(e?.message || "Load failed"); }
    setLoading(false);
  };
  const loadFeatured = async () => {
    try { setFeatured((await apiFetch(token, "/api/featured")).featured || []); } catch {}
  };
  useEffect(() => { if (token) { loadMembers(); loadFeatured(); } /* eslint-disable-line */ }, [token]);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000); };

  const patchMember = (m: any) => setMembers((list) => list.map((x) => (x.user_id === m.user_id ? m : x)));

  const toggleBadge = async (m: any, badge: string) => {
    const has = (m.badges || []).includes(badge);
    try { patchMember(await apiFetch(token, "/api/admin/grant-badge", { method: "POST", body: JSON.stringify({ user_id: m.user_id, badge, on: !has }) })); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const toggleSkool = async (m: any) => {
    try { patchMember(await apiFetch(token, "/api/admin/verify-member", { method: "POST", body: JSON.stringify({ user_id: m.user_id, skool_verified: !m.skool_verified }) })); flash("Updated ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const toggleFounder = async (m: any) => {
    try { patchMember(await apiFetch(token, "/api/admin/founder", { method: "POST", body: JSON.stringify({ user_id: m.user_id, on: !m.founder_grant }) })); flash("Updated ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const feature = async (m: any) => {
    const reason = (reasons[m.user_id] || "").trim();
    try { await apiFetch(token, "/api/admin/featured", { method: "POST", body: JSON.stringify({ user_id: m.user_id, reason }) }); flash("Featured ✓"); await loadFeatured(); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const unfeature = async (uid: string) => {
    try { await apiFetch(token, `/api/admin/featured/${uid}`, { method: "DELETE" }); await loadFeatured(); } catch {}
  };

  const setRank = async (m: any, direction: "up" | "down") => {
    try { patchMember(await apiFetch(token, "/api/admin/set-rank", { method: "POST", body: JSON.stringify({ user_id: m.user_id, direction }) })); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const ban = async (m: any, scope: "chat" | "all", minutes: number) => {
    try { patchMember(await apiFetch(token, "/api/admin/ban", { method: "POST", body: JSON.stringify({ user_id: m.user_id, scope, minutes }) })); flash(`${scope === "chat" ? "Muted" : "Banned"} ✓`); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const unban = async (m: any) => {
    try { patchMember(await apiFetch(token, "/api/admin/unban", { method: "POST", body: JSON.stringify({ user_id: m.user_id }) })); flash("Unbanned ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };

  const toggleRed = async (on: boolean) => {
    setRedOn(on);
    try {
      await apiFetch(token, "/api/admin/enhanced-theme", { method: "POST", body: JSON.stringify({ on }) });
      await persistEnhancedFlag(on);
      if (on) applyEnhancedPalette();
      await refresh();
      if (Platform.OS === "web") setTimeout(() => reloadApp(), 400);
    } catch (e: any) { flash(e?.message || "Failed"); setRedOn(!on); }
  };

  if (!user?.is_admin) {
    return (
      <View style={[st.wrap, { paddingTop: insets.top + spacing.xl, alignItems: "center" }]}>
        <Text style={st.locked}>ADMIN ONLY</Text>
        <Pressable onPress={() => router.back()} style={st.backBtn}><Text style={st.backText}>← BACK</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={st.wrap}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={st.back}>← BACK</Text></Pressable>
        <Text style={st.eyebrow}>▚ CONTROL DECK //</Text>
        <Text style={st.h1}>ADMIN PANEL</Text>

        {/* Enhanced theme toggle */}
        <View style={st.card}>
          <View style={st.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={st.cardTitle}>ENHANCED RED THEME</Text>
              <Text style={st.cardSub}>Flip the app-wide crimson takeover on/off for your account.</Text>
            </View>
            <Switch testID="admin-red-toggle" value={redOn} onValueChange={toggleRed} trackColor={{ true: "#FF2A3C", false: colors.border }} />
          </View>
        </View>

        {/* Featured members */}
        <Text style={st.section}>★ HOME SPOTLIGHT ({featured.length})</Text>
        {featured.length === 0 ? (
          <Text style={st.dim}>No featured members yet. Feature someone below.</Text>
        ) : featured.map((f) => (
          <View key={f.user_id} style={st.featRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{f.display_name}</Text>
              <Text style={st.reason} numberOfLines={2}>{f.reason || "—"}</Text>
            </View>
            <Pressable testID={`unfeature-${f.user_id}`} onPress={() => unfeature(f.user_id)} style={st.removeBtn}><Text style={st.removeText}>REMOVE</Text></Pressable>
          </View>
        ))}

        {/* Member management */}
        <Text style={st.section}>MEMBERS</Text>
        <View style={st.searchRow}>
          <TextInput testID="admin-search" value={q} onChangeText={setQ} onSubmitEditing={() => loadMembers(q)} placeholder="Search by name…" placeholderTextColor={colors.textDim} style={st.search} autoCapitalize="none" />
          <Pressable testID="admin-search-btn" onPress={() => loadMembers(q)} style={st.searchBtn}><Text style={st.searchBtnText}>GO</Text></Pressable>
        </View>

        {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.lg }} /> : members.length === 0 ? (
          <Text style={st.dim}>No members found.</Text>
        ) : members.map((m) => (
          <View key={m.user_id} testID={`admin-member-${m.user_id}`} style={st.mCard}>
            <Text style={st.mName}>{m.display_name} <Text style={st.mRank}>· {(m.rank || "").toUpperCase()} LV{m.level}</Text></Text>
            <View style={st.tagRow}>
              <Pressable onPress={() => toggleSkool(m)} style={[st.tag, m.skool_verified && st.tagOn]}><Text style={[st.tagText, m.skool_verified && st.tagTextOn]}>✓ SKOOL</Text></Pressable>
              <Pressable onPress={() => toggleFounder(m)} style={[st.tag, m.founder_grant && st.tagOn]}><Text style={[st.tagText, m.founder_grant && st.tagTextOn]}>★ FOUNDER</Text></Pressable>
            </View>

            <Text style={st.miniLabel}>RANK</Text>
            <View style={st.tagRow}>
              <Pressable testID={`derank-${m.user_id}`} onPress={() => setRank(m, "down")} style={st.rankBtn}><Text style={st.rankBtnText}>▼ DE-RANK</Text></Pressable>
              <Pressable testID={`uprank-${m.user_id}`} onPress={() => setRank(m, "up")} style={st.rankBtn}><Text style={st.rankBtnText}>▲ UP-RANK</Text></Pressable>
            </View>

            <Text style={st.miniLabel}>SUSPENSION</Text>
            {m.ban_active ? (
              <View style={st.tagRow}>
                <View style={st.bannedPill}><Text style={st.bannedText}>⛔ {(m.ban_scope || "all").toUpperCase()} · till {new Date(m.ban_until).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</Text></View>
                <Pressable testID={`unban-${m.user_id}`} onPress={() => unban(m)} style={st.unbanBtn}><Text style={st.unbanText}>UNBAN</Text></Pressable>
              </View>
            ) : (
              <View style={st.tagRow}>
                <Pressable testID={`mute-${m.user_id}`} onPress={() => ban(m, "chat", 1440)} style={st.banBtn}><Text style={st.banBtnText}>MUTE CHAT 24h</Text></Pressable>
                <Pressable testID={`ban-${m.user_id}`} onPress={() => ban(m, "all", 1440)} style={[st.banBtn, st.banHard]}><Text style={[st.banBtnText, { color: colors.error }]}>BAN ALL 24h</Text></Pressable>
              </View>
            )}

            <Text style={st.miniLabel}>BADGES (tap to grant/revoke)</Text>
            <View style={st.badgeWrap}>
              {badgeOpts.map((b) => {
                const on = (m.badges || []).includes(b);
                return <Pressable key={b} onPress={() => toggleBadge(m, b)} style={[st.badge, on && st.badgeOn]}><Text style={[st.badgeText, on && st.badgeTextOn]}>{b}</Text></Pressable>;
              })}
            </View>
            <View style={st.featInput}>
              <TextInput value={reasons[m.user_id] || ""} onChangeText={(t) => setReasons((r) => ({ ...r, [m.user_id]: t }))} placeholder="Reason to feature on Home…" placeholderTextColor={colors.textDim} style={st.reasonInput} />
              <Pressable testID={`feature-${m.user_id}`} onPress={() => feature(m)} style={st.featBtn}><Text style={st.featBtnText}>★ FEATURE</Text></Pressable>
            </View>
          </View>
        ))}
        {msg && <Text style={st.msg}>{msg}</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  locked: { color: colors.error, fontWeight: "900", letterSpacing: 3, fontSize: 20 },
  backBtn: { marginTop: spacing.lg, padding: spacing.md, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm },
  backText: { color: colors.textDim, fontWeight: "800", letterSpacing: 2 },
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  h1: { color: colors.text, fontSize: 24, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: spacing.md },
  card: { padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, marginBottom: spacing.lg },
  rowBetween: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  cardTitle: { color: colors.text, fontWeight: "900", letterSpacing: 1, fontSize: 14 },
  cardSub: { color: colors.textDim, fontSize: 12, marginTop: 4, lineHeight: 17 },
  annInput: { marginTop: spacing.md, minHeight: 72, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14, textAlignVertical: "top" },
  annBtn: { marginTop: spacing.sm, paddingVertical: 12, alignItems: "center", borderRadius: radius.sm, backgroundColor: colors.brandPrimary },
  annBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 1.5, fontSize: 12 },
  section: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "900", fontSize: 12, marginTop: spacing.md, marginBottom: spacing.sm },
  dim: { color: colors.textDim, fontSize: 12, marginBottom: spacing.md },
  featRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: "rgba(255,234,0,0.06)", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, marginBottom: spacing.sm },
  name: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  reason: { color: colors.warning, fontSize: 12, marginTop: 2 },
  removeBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error },
  removeText: { color: colors.error, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  searchRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  search: { flex: 1, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border },
  searchBtn: { paddingHorizontal: 18, justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.brandPrimary },
  searchBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 1 },
  mCard: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, marginBottom: spacing.md },
  mName: { color: colors.text, fontWeight: "900", fontSize: 15 },
  mRank: { color: colors.textDim, fontWeight: "700", fontSize: 11 },
  tagRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm },
  tag: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  tagOn: { borderColor: colors.success, backgroundColor: "rgba(57,255,20,0.12)" },
  tagText: { color: colors.textDim, fontWeight: "800", fontSize: 11 },
  tagTextOn: { color: colors.success },
  rankBtn: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.08)" },
  rankBtnText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  banBtn: { flex: 1, paddingVertical: 9, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.08)" },
  banBtnText: { color: colors.warning, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  banHard: { borderColor: colors.error, backgroundColor: "rgba(255,59,48,0.08)" },
  bannedPill: { flex: 1, paddingVertical: 9, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error, backgroundColor: "rgba(255,59,48,0.1)", justifyContent: "center" },
  bannedText: { color: colors.error, fontWeight: "800", fontSize: 10 },
  unbanBtn: { paddingVertical: 9, paddingHorizontal: 16, borderRadius: radius.sm, backgroundColor: colors.success, justifyContent: "center" },
  unbanText: { color: "#00220A", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  miniLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1.5, fontWeight: "800", marginTop: spacing.md },
  badgeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 },
  badge: { paddingVertical: 5, paddingHorizontal: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  badgeOn: { borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.14)" },
  badgeText: { color: colors.textDim, fontSize: 10, fontWeight: "700" },
  badgeTextOn: { color: colors.warning, fontWeight: "900" },
  featInput: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md },
  reasonInput: { flex: 1, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, fontSize: 13 },
  featBtn: { paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.warning },
  featBtnText: { color: "#221900", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  msg: { color: colors.success, textAlign: "center", marginTop: spacing.md, fontWeight: "700" },
});
