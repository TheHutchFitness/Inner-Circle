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
  const [gyms, setGyms] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [redOn, setRedOn] = useState(!!user?.enhanced);
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [nf, setNf] = useState<any>({ kind: "aura", name: "", description: "", rarity: "legendary", icon: "★", colors: "#7A5CFF,#00E5FF", motion: "pulse" });

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
  useEffect(() => { if (token) { loadMembers(); loadFeatured(); loadStore(); } /* eslint-disable-line */ }, [token]);

  const loadStore = async () => {
    try { setStoreItems((await apiFetch(token, "/api/admin/store")).items || []); } catch {}
  };
  const createDrop = async () => {
    if (!nf.name.trim()) { flash("Name required"); return; }
    try {
      await apiFetch(token, "/api/admin/store", { method: "POST", body: JSON.stringify({
        kind: nf.kind, name: nf.name.trim(), description: nf.description.trim(), rarity: nf.rarity,
        icon: nf.icon, motion: nf.motion, colors: nf.colors.split(",").map((c: string) => c.trim()).filter(Boolean),
      }) });
      flash("Drop created ✓"); setNf({ ...nf, name: "", description: "" }); await loadStore();
    } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const deleteDrop = async (id: string) => {
    try { await apiFetch(token, `/api/admin/store/${id}`, { method: "DELETE" }); await loadStore(); } catch {}
  };

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000); };

  const patchMember = (m: any) => setMembers((list) => list.map((x) => (x.user_id === m.user_id ? m : x)));

  const toggleInperson = async (m: any) => {
    try { patchMember(await apiFetch(token, "/api/admin/inperson", { method: "POST", body: JSON.stringify({ user_id: m.user_id, on: !m.inperson_client }) })); flash("Updated ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const saveGym = async (m: any) => {
    const gym = gyms[m.user_id] ?? m.inperson_gym ?? "";
    try { patchMember(await apiFetch(token, "/api/admin/inperson", { method: "POST", body: JSON.stringify({ user_id: m.user_id, gym }) })); flash("Gym saved ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };

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

        {/* Store drop creator */}
        <Text style={st.section}>🛒 STORE DROPS ({storeItems.length})</Text>
        <View style={st.card}>
          <Text style={st.cardSub}>Create this month's exclusive cosmetic ($1, current month, never returns).</Text>
          <View style={st.chipWrap}>
            {["avatar", "banner", "title", "badge", "background", "aura", "pet"].map((k) => (
              <Pressable key={k} onPress={() => setNf((s: any) => ({ ...s, kind: k }))} style={[st.miniChip, nf.kind === k && st.miniChipOn]}><Text style={[st.miniChipText, nf.kind === k && st.miniChipTextOn]}>{k}</Text></Pressable>
            ))}
          </View>
          <TextInput testID="drop-name" value={nf.name} onChangeText={(v) => setNf((s: any) => ({ ...s, name: v }))} placeholder="Name (e.g. Void Flame Aura)" placeholderTextColor={colors.textDim} style={st.annInput2} />
          <TextInput value={nf.description} onChangeText={(v) => setNf((s: any) => ({ ...s, description: v }))} placeholder="Description" placeholderTextColor={colors.textDim} style={st.annInput2} />
          <View style={st.chipWrap}>
            {["legendary", "mythic", "exalted", "eternal"].map((r) => (
              <Pressable key={r} onPress={() => setNf((s: any) => ({ ...s, rarity: r }))} style={[st.miniChip, nf.rarity === r && st.miniChipOn]}><Text style={[st.miniChipText, nf.rarity === r && st.miniChipTextOn]}>{r}</Text></Pressable>
            ))}
          </View>
          <View style={st.chipWrap}>
            {["pulse", "shimmer", "orbit", "flame", "none"].map((m) => (
              <Pressable key={m} onPress={() => setNf((s: any) => ({ ...s, motion: m }))} style={[st.miniChip, nf.motion === m && st.miniChipOn]}><Text style={[st.miniChipText, nf.motion === m && st.miniChipTextOn]}>{m}</Text></Pressable>
            ))}
          </View>
          <TextInput value={nf.colors} onChangeText={(v) => setNf((s: any) => ({ ...s, colors: v }))} placeholder="Colors (hex, comma-separated)" placeholderTextColor={colors.textDim} style={st.annInput2} autoCapitalize="none" />
          <TextInput value={nf.icon} onChangeText={(v) => setNf((s: any) => ({ ...s, icon: v }))} placeholder="Icon/emoji (e.g. 🔥 or ★)" placeholderTextColor={colors.textDim} style={st.annInput2} />
          <Pressable testID="create-drop" onPress={createDrop} style={st.annBtn}><Text style={st.annBtnText}>+ CREATE DROP (this month)</Text></Pressable>
        </View>
        {storeItems.map((it) => (
          <View key={it.item_id} style={st.featRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{it.name} <Text style={{ color: colors.textDim, fontSize: 11 }}>· {it.kind} · {it.drop_month}</Text></Text>
              <Text style={st.reason}>{it.rarity} · {it.motion}</Text>
            </View>
            <Pressable testID={`del-drop-${it.item_id}`} onPress={() => deleteDrop(it.item_id)} style={st.removeBtn}><Text style={st.removeText}>REMOVE</Text></Pressable>
          </View>
        ))}

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

            <Text style={st.miniLabel}>IN-PERSON CLIENT</Text>
            {m.inperson_request && !m.inperson_client && (
              <View style={st.reqBanner}>
                <Text style={st.reqBannerText}>⏳ REQUESTED IN-PERSON COACHING{m.inperson_gym ? ` · ${m.inperson_gym}` : ""}</Text>
              </View>
            )}
            <View style={st.tagRow}>
              <Pressable testID={`inperson-${m.user_id}`} onPress={() => toggleInperson(m)} style={[st.tag, m.inperson_client && st.tagOn]}>
                <Text style={[st.tagText, m.inperson_client && st.tagTextOn]}>🏋 {m.inperson_client ? "ENROLLED" : "ENROLL"}</Text>
              </Pressable>
            </View>
            {m.inperson_client && (
              <View style={st.featInput}>
                <TextInput
                  testID={`gym-${m.user_id}`}
                  value={gyms[m.user_id] ?? m.inperson_gym ?? ""}
                  onChangeText={(t) => setGyms((g) => ({ ...g, [m.user_id]: t }))}
                  placeholder="Gym they train at…" placeholderTextColor={colors.textDim} style={st.reasonInput}
                />
                <Pressable testID={`save-gym-${m.user_id}`} onPress={() => saveGym(m)} style={st.featBtn}><Text style={st.featBtnText}>SET GYM</Text></Pressable>
              </View>
            )}

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
  annInput2: { marginTop: spacing.sm, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: spacing.sm },
  miniChip: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  miniChipOn: { borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.14)" },
  miniChipText: { color: colors.textDim, fontSize: 11, fontWeight: "800" },
  miniChipTextOn: { color: colors.warning },
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
  reqBanner: { marginTop: 6, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(245,197,66,0.12)", borderRadius: radius.sm, paddingVertical: 6, paddingHorizontal: 8 },
  reqBannerText: { color: colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
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
