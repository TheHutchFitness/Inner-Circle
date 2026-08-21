import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch, ActivityIndicator, Platform, Alert } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius, applyEnhancedPalette } from "@/src/lib/theme";
import { persistEnhancedFlag, reloadApp } from "@/src/lib/enhancedTheme";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function Admin() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user, refresh } = useAuth();
  const [q, setQ] = useState("");
  const [enhancedOnly, setEnhancedOnly] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [badgeOpts, setBadgeOpts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [featured, setFeatured] = useState<any[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [gyms, setGyms] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [tab, setTab] = useState<"users" | "groups" | "gyms" | "cosmetics">("users");
  const [redOn, setRedOn] = useState(!!user?.enhanced);
  const [storeItems, setStoreItems] = useState<any[]>([]);
  const [nf, setNf] = useState<any>({ kind: "aura", name: "", description: "", rarity: "legendary", icon: "★", colors: "#7A5CFF,#00E5FF", motion: "pulse" });
  const [security, setSecurity] = useState<any>(null);

  const loadSecurity = async () => {
    try { setSecurity(await apiFetch(token, "/api/admin/security/logins")); } catch {}
  };

  const loadMembers = async (query = "", enhancedOnly = false) => {
    try {
      const r = await apiFetch(token, `/api/admin/members?q=${encodeURIComponent(query)}&enhanced_only=${enhancedOnly}`);
      setMembers(r.members || []); setBadgeOpts(r.badge_options || []);
    } catch (e: any) { setMsg(e?.message || "Load failed"); }
    setLoading(false);
  };
  const loadFeatured = async () => {
    try { setFeatured((await apiFetch(token, "/api/featured")).featured || []); } catch {}
  };
  useEffect(() => { if (token) { loadMembers(); loadFeatured(); loadStore(); loadGymDir(); loadChallenge(); loadSecurity(); loadClans(); } /* eslint-disable-line */ }, [token]);

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

  const [gymDir, setGymDir] = useState<any[]>([]);
  const [newGym, setNewGym] = useState("");
  const [editGym, setEditGym] = useState<Record<string, string>>({});
  const [mergeFrom, setMergeFrom] = useState<string | null>(null);
  const [gymAddr, setGymAddr] = useState<Record<string, string>>({});
  const [locBusy, setLocBusy] = useState<string | null>(null);
  const loadGymDir = async () => {
    try { setGymDir((await apiFetch(token, "/api/admin/gyms")).gyms || []); } catch {}
  };
  const addGymDir = async () => {
    if (!newGym.trim()) { flash("Gym name required"); return; }
    try { await apiFetch(token, "/api/admin/gyms", { method: "POST", body: JSON.stringify({ name: newGym.trim() }) }); setNewGym(""); await loadGymDir(); flash("Gym added ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const renameGymDir = async (g: any) => {
    const name = (editGym[g.id] ?? g.name).trim();
    if (!name) { flash("Name required"); return; }
    try { await apiFetch(token, `/api/admin/gyms/${g.id}`, { method: "PATCH", body: JSON.stringify({ name }) }); await loadGymDir(); flash("Renamed ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const deleteGymDir = async (g: any) => {
    try { await apiFetch(token, `/api/admin/gyms/${g.id}`, { method: "DELETE" }); await loadGymDir(); flash("Gym removed ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const mergeGymDir = async (src: any, dst: any) => {
    try {
      const r = await apiFetch(token, `/api/admin/gyms/${src.id}/merge`, { method: "POST", body: JSON.stringify({ into_id: dst.id }) });
      setMergeFrom(null); await loadGymDir(); flash(`Merged into ${r.into} · ${r.moved} moved ✓`);
    } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const setGymLocation = async (g: any, clear = false) => {
    const address = clear ? "" : (gymAddr[g.id] ?? g.address ?? "").trim();
    if (!clear && !address) { flash("Enter an address first"); return; }
    setLocBusy(g.id);
    try {
      await apiFetch(token, `/api/admin/gyms/${g.id}/location`, { method: "POST", body: JSON.stringify({ address }) });
      await loadGymDir(); flash(clear ? "Location cleared ✓" : "Pinned on map ✓");
    } catch (e: any) { flash(e?.message || "Failed"); }
    setLocBusy(null);
  };
  const toggleGymVerified = async (g: any) => {
    try { await apiFetch(token, `/api/admin/gyms/${g.id}/verify`, { method: "POST", body: JSON.stringify({ on: !g.verified }) }); await loadGymDir(); flash(g.verified ? "Unverified" : "Verified ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const toggleGymCoaching = async (g: any) => {
    try { await apiFetch(token, `/api/admin/gyms/${g.id}/coaching`, { method: "POST", body: JSON.stringify({ coaching_enabled: !g.coaching_enabled }) }); await loadGymDir(); flash(g.coaching_enabled ? "Coaching off" : "Coaching enabled ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const uploadGymLogo = async (g: any) => {
    try {
      const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
      let status = cur.status;
      if (status !== "granted") {
        if (!cur.canAskAgain) { flash("Enable photo access in Settings"); return; }
        status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
      }
      if (status !== "granted") { flash("Photo permission needed"); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(a.uri)).blob();
        form.append("file", blob, a.fileName || "logo.jpg");
      } else {
        form.append("file", { uri: a.uri, name: a.fileName || "logo.jpg", type: a.mimeType || "image/jpeg" } as any);
      }
      const r = await fetch(`${API}/api/admin/gyms/${g.id}/logo`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Upload failed"); }
      await loadGymDir(); flash("Logo set ✓");
    } catch (e: any) { flash(e?.message || "Upload failed"); }
  };

  // ---- Group (Clan) Challenge ----
  const [challenge, setChallenge] = useState<any>(null);
  const [chalTitle, setChalTitle] = useState("");
  // ---- Clan directory (admin moderation) ----
  const [clanDir, setClanDir] = useState<any[]>([]);
  const loadClans = async () => {
    try { setClanDir((await apiFetch(token, "/api/admin/groups")).groups || []); } catch {}
  };
  const doDeleteClan = async (c: any) => {
    try {
      await apiFetch(token, `/api/admin/groups/${c.id}`, { method: "DELETE" });
      setClanDir((list) => list.filter((x) => x.id !== c.id));
      flash(`Deleted “${c.name}” ✓`);
    } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const deleteClan = (c: any) => {
    const title = `Delete clan “${c.name}”?`;
    const body = "This removes the clan, its members' membership, and all its chat history. This cannot be undone.";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) doDeleteClan(c);
      return;
    }
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => doDeleteClan(c) },
    ]);
  };
  const loadChallenge = async () => {
    try { setChallenge(await apiFetch(token, "/api/group-challenge")); } catch {}
  };
  const startChallenge = async () => {
    try { await apiFetch(token, "/api/admin/group-challenge/start", { method: "POST", body: JSON.stringify({ title: chalTitle.trim(), days: 30 }) }); setChalTitle(""); await loadChallenge(); flash("Challenge started ✓"); }
    catch (e: any) { flash(e?.message || "Failed"); }
  };
  const finalizeChallenge = async () => {
    try { const r = await apiFetch(token, "/api/admin/group-challenge/finalize", { method: "POST" }); await loadChallenge(); flash(r.winner_name ? `Winner: ${r.winner_name} ✓` : "Ended — no winner"); }
    catch (e: any) { flash(e?.message || "Failed"); }
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
  const removeEnhanced = async (m: any) => {
    try { patchMember(await apiFetch(token, "/api/admin/enhanced-set", { method: "POST", body: JSON.stringify({ user_id: m.user_id, on: !m.enhanced }) })); flash(m.enhanced ? "Enhanced access + red theme removed ✓" : "Enhanced access granted ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const feature = async (m: any) => {
    const reason = (reasons[m.user_id] || "").trim();
    try { await apiFetch(token, "/api/admin/featured", { method: "POST", body: JSON.stringify({ user_id: m.user_id, reason }) }); flash("Featured ✓"); await loadFeatured(); } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const unfeature = async (uid: string) => {
    try { await apiFetch(token, `/api/admin/featured/${uid}`, { method: "DELETE" }); await loadFeatured(); } catch {}
  };
  const [uploadingSpot, setUploadingSpot] = useState<string | null>(null);
  const attachSpotlight = async (m: any, kind: "image" | "video") => {
    try {
      const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
      let status = cur.status;
      if (status !== "granted") {
        if (!cur.canAskAgain) { flash("Enable photo access in Settings"); return; }
        status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
      }
      if (status !== "granted") { flash("Media permission needed"); return; }
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: kind === "video" ? ["videos"] : ["images"], quality: 0.8, videoMaxDuration: 60 });
      if (res.canceled || !res.assets?.length) return;
      const a = res.assets[0];
      setUploadingSpot(m.user_id);
      const form = new FormData();
      form.append("user_id", m.user_id);
      form.append("reason", (reasons[m.user_id] || "").trim());
      const name = a.fileName || (kind === "video" ? "clip.mp4" : "photo.jpg");
      const type = a.mimeType || (kind === "video" ? "video/mp4" : "image/jpeg");
      if (Platform.OS === "web") {
        const blob = await (await fetch(a.uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri: a.uri, name, type } as any);
      }
      const r = await fetch(`${API}/api/admin/featured/media`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Upload failed"); }
      await loadFeatured(); flash(`${kind === "video" ? "Video" : "Photo"} added to spotlight ✓`);
    } catch (e: any) { flash(e?.message || "Upload failed"); }
    finally { setUploadingSpot(null); }
  };
  const clearSpotlightMedia = async (uid: string) => {
    try { await apiFetch(token, `/api/admin/featured/${uid}/media`, { method: "DELETE" }); await loadFeatured(); flash("Media removed ✓"); } catch (e: any) { flash(e?.message || "Failed"); }
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
  const doDelete = async (m: any) => {
    try {
      await apiFetch(token, `/api/admin/members/${m.user_id}/delete`, { method: "POST" });
      setMembers((list) => list.filter((x) => x.user_id !== m.user_id));
      flash("Member deleted ✓");
    } catch (e: any) { flash(e?.message || "Failed"); }
  };
  const deleteMember = (m: any) => {
    const title = `Permanently delete ${m.display_name}?`;
    const body = "This removes their account and all their data. This cannot be undone.";
    if (Platform.OS === "web") {
      if (typeof window !== "undefined" && window.confirm(`${title}\n\n${body}`)) doDelete(m);
      return;
    }
    Alert.alert(title, body, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => doDelete(m) },
    ]);
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

        <View style={st.tabBar}>
          {([["users", "👥 USERS"], ["groups", "🛡 CLANS"], ["gyms", "🏋 GYMS"], ["cosmetics", "🛒 COSMETICS"]] as const).map(([k, label]) => (
            <Pressable key={k} testID={`admin-tab-${k}`} onPress={() => setTab(k)} style={[st.tabBtn, tab === k && st.tabBtnOn]}>
              <Text style={[st.tabBtnText, tab === k && st.tabBtnTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>

        {tab === "groups" && (<>
        {/* Group (Clan) Challenge */}
        <Text style={st.section}>🏆 CLAN CHALLENGE</Text>
        <View style={st.card}>
          {challenge?.active ? (
            <>
              <Text style={st.cardTitle}>{challenge.active.title}</Text>
              <Text style={st.cardSub}>Running · {challenge.active.days_left} days left · winner gets +{challenge.active.reward_xp} clan XP + Champion badge for every member.</Text>
              {(challenge.standings || []).slice(0, 3).map((s: any, i: number) => (
                <Text key={s.id} style={st.chalStand}>{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"} {s.name} · +{s.gained} XP</Text>
              ))}
              <Pressable testID="finalize-challenge" onPress={finalizeChallenge} style={[st.annBtn, { backgroundColor: colors.warning }]}><Text style={[st.annBtnText, { color: "#221900" }]}>END & AWARD WINNER</Text></Pressable>
            </>
          ) : (
            <>
              <Text style={st.cardSub}>Start a monthly clan-vs-clan competition. The clan that earns the most XP over 30 days wins.</Text>
              {challenge?.last?.winner_name ? <Text style={st.chalStand}>Last winner: 🏆 {challenge.last.winner_name} ({challenge.last.title})</Text> : null}
              <TextInput testID="challenge-title" value={chalTitle} onChangeText={setChalTitle} placeholder="Challenge title (optional)" placeholderTextColor={colors.textDim} style={st.annInput2} />
              <Pressable testID="start-challenge" onPress={startChallenge} style={st.annBtn}><Text style={st.annBtnText}>+ START MONTHLY CHALLENGE</Text></Pressable>
            </>
          )}
        </View>

        {/* Clan directory — list + delete */}
        <Text style={st.section}>🛡 ALL CLANS ({clanDir.length})</Text>
        <Text style={st.dim}>Delete a clan to permanently remove it, its memberships and chat history.</Text>
        {clanDir.length === 0 ? (
          <Text style={st.dim}>No clans yet.</Text>
        ) : clanDir.map((c) => (
          <View key={c.id} style={st.clanRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>🛡 {c.name}</Text>
              <Text style={st.cardSub}>Lv {c.level} · {c.member_count} member{c.member_count === 1 ? "" : "s"} · led by {c.creator_name}</Text>
            </View>
            <Pressable testID={`clan-del-${c.id}`} onPress={() => deleteClan(c)} style={st.removeBtn}><Text style={st.removeText}>DELETE</Text></Pressable>
          </View>
        ))}

        </>)}

        {tab === "users" && (<>
        {/* Security / login audit */}
        <View style={st.secHeadRow}>
          <Text style={st.section}>🛡 SECURITY — LOGIN ATTEMPTS</Text>
          <Pressable testID="sec-refresh" onPress={loadSecurity} hitSlop={8}><Text style={st.secRefresh}>↻ REFRESH</Text></Pressable>
        </View>
        <View style={st.card}>
          {!security ? (
            <Text style={st.cardSub}>Loading…</Text>
          ) : (
            <>
              <View style={st.secStatsRow}>
                <View style={st.secStat}><Text style={[st.secNum, security.total_1h > 30 && { color: colors.error }]}>{security.total_1h}</Text><Text style={st.secLbl}>FAILED · 1H</Text></View>
                <View style={st.secStat}><Text style={st.secNum}>{security.total_24h}</Text><Text style={st.secLbl}>FAILED · 24H</Text></View>
                <View style={st.secStat}><Text style={[st.secNum, security.locked_accounts > 0 && { color: colors.warning }]}>{security.locked_accounts}</Text><Text style={st.secLbl}>LOCKED NOW</Text></View>
              </View>
              {security.total_1h > 30 && <Text style={st.secWarn}>⚠ Elevated failed-login volume in the last hour — possible attack.</Text>}
              {security.top_ips?.length > 0 && (
                <>
                  <Text style={st.secSub}>TOP SOURCE IPs (24H)</Text>
                  {security.top_ips.map((t: any, i: number) => (
                    <View key={i} style={st.secRow}><Text style={st.secIp}>{t.ip}</Text><Text style={st.secCount}>{t.count}</Text></View>
                  ))}
                </>
              )}
              <Text style={st.secSub}>RECENT ATTEMPTS</Text>
              {(security.recent || []).length === 0 ? <Text style={st.cardSub}>No failed logins recorded 🎉</Text> :
                security.recent.slice(0, 12).map((r: any, i: number) => (
                  <View key={i} style={st.secRow}>
                    <Text style={st.secWho} numberOfLines={1}>{r.email_masked}</Text>
                    <Text style={st.secMeta}>{r.ip} · {new Date(r.at).toLocaleTimeString()}</Text>
                  </View>
                ))}
            </>
          )}
        </View>

        </>)}

        {tab === "cosmetics" && (<>
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

        </>)}

        {tab === "gyms" && (<>
        {/* Gym directory moderation */}
        <Text style={st.section}>🏋 GYM DIRECTORY ({gymDir.length})</Text>
        <Text style={st.dim}>Edit or remove fake gyms. Removing one clears it from all members who picked it.</Text>
        <View style={st.searchRow}>
          <TextInput testID="new-gym-input" value={newGym} onChangeText={setNewGym} placeholder="Add a gym name…" placeholderTextColor={colors.textDim} style={st.searchInput} autoCapitalize="words" />
          <Pressable testID="add-gym" onPress={addGymDir} style={st.featBtn}><Text style={st.featBtnText}>ADD</Text></Pressable>
        </View>
        {gymDir.map((g) => (
          <View key={g.id} style={st.gymCard}>
            <View style={st.gymTopRow}>
              <Pressable testID={`gym-logo-${g.id}`} onPress={() => uploadGymLogo(g)} style={st.gymLogoBtn}>
                {g.logo_media_id ? (
                  <Image source={{ uri: `${API}/api/chat/media/${g.logo_media_id}?token=${token}` }} style={st.gymLogoImg} contentFit="cover" />
                ) : (
                  <Text style={st.gymLogoPlus}>＋{"\n"}LOGO</Text>
                )}
              </Pressable>
              <TextInput
                testID={`gym-name-${g.id}`}
                value={editGym[g.id] ?? g.name}
                onChangeText={(t) => setEditGym((s) => ({ ...s, [g.id]: t }))}
                style={[st.searchInput, { flex: 1 }]}
                autoCapitalize="words"
              />
              <Text style={st.gymMembers}>{g.members}👤</Text>
            </View>
            <View style={st.tagRow}>
              <Pressable testID={`gym-verify-${g.id}`} onPress={() => toggleGymVerified(g)} style={[st.tag, g.verified && st.tagOn]}>
                <Text style={[st.tagText, g.verified && st.tagTextOn]}>{g.verified ? "✓ VERIFIED" : "VERIFY"}</Text>
              </Pressable>
              <Pressable testID={`gym-coaching-${g.id}`} onPress={() => toggleGymCoaching(g)} style={[st.tag, g.coaching_enabled && st.tagOn]}>
                <Text style={[st.tagText, g.coaching_enabled && st.tagTextOn]}>{g.coaching_enabled ? "🏋 COACHING" : "COACHING"}</Text>
              </Pressable>
              <Pressable testID={`gym-merge-${g.id}`} onPress={() => setMergeFrom(mergeFrom === g.id ? null : g.id)} style={[st.tag, mergeFrom === g.id && st.tagOn]}>
                <Text style={[st.tagText, mergeFrom === g.id && st.tagTextOn]}>⇄ MERGE</Text>
              </Pressable>
              <Pressable testID={`gym-save-${g.id}`} onPress={() => renameGymDir(g)} style={st.featBtn}><Text style={st.featBtnText}>SAVE</Text></Pressable>
              <Pressable testID={`gym-del-${g.id}`} onPress={() => deleteGymDir(g)} style={st.removeBtn}><Text style={st.removeText}>✕</Text></Pressable>
            </View>
            {/* Map location (geocoded from an address) */}
            <View style={st.locRow}>
              <TextInput
                testID={`gym-addr-${g.id}`}
                value={gymAddr[g.id] ?? g.address ?? ""}
                onChangeText={(t) => setGymAddr((s) => ({ ...s, [g.id]: t }))}
                placeholder="Address, city, country…"
                placeholderTextColor={colors.textDim}
                style={[st.searchInput, { flex: 1 }]}
              />
              <Pressable testID={`gym-loc-${g.id}`} onPress={() => setGymLocation(g)} disabled={locBusy === g.id} style={st.featBtn}>
                {locBusy === g.id ? <ActivityIndicator color="#001122" /> : <Text style={st.featBtnText}>📍 PIN</Text>}
              </Pressable>
            </View>
            {g.lat != null && g.lng != null && (
              <View style={st.locSet}>
                <Text style={st.locSetText} numberOfLines={1}>🗺 On map: {g.address || `${g.lat.toFixed(3)}, ${g.lng.toFixed(3)}`}</Text>
                <Pressable testID={`gym-loc-clear-${g.id}`} onPress={() => setGymLocation(g, true)}><Text style={st.locClear}>clear</Text></Pressable>
              </View>
            )}
            {mergeFrom === g.id && (
              <View style={st.mergeBox}>
                <Text style={st.mergeHint}>Merge “{g.name}” into… (moves all {g.members} members, then deletes it)</Text>
                {gymDir.filter((o) => o.id !== g.id).length === 0 ? (
                  <Text style={st.dim}>No other gyms to merge into.</Text>
                ) : gymDir.filter((o) => o.id !== g.id).map((o) => (
                  <Pressable key={o.id} testID={`merge-into-${g.id}-${o.id}`} onPress={() => mergeGymDir(g, o)} style={st.mergeOpt}>
                    <Text style={st.mergeOptText}>→ {o.name}{o.verified ? " ✓" : ""} · {o.members}👤</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))}

        </>)}

        {tab === "users" && (<>
        {/* Featured members */}
        <Text style={st.section}>★ HOME SPOTLIGHT ({featured.length})</Text>
        {featured.length === 0 ? (
          <Text style={st.dim}>No featured members yet. Feature someone below.</Text>
        ) : featured.map((f) => (
          <View key={f.user_id} style={st.featRow}>
            <View style={{ flex: 1 }}>
              <Text style={st.name}>{f.display_name}{f.media_id ? (f.media_type === "video" ? "  🎬" : "  🖼") : ""}</Text>
              <Text style={st.reason} numberOfLines={2}>{f.reason || "—"}</Text>
              {f.media_id && (
                <Pressable testID={`spot-clear-media-${f.user_id}`} onPress={() => clearSpotlightMedia(f.user_id)}><Text style={st.spotClear}>✕ remove {f.media_type || "media"}</Text></Pressable>
              )}
            </View>
            <Pressable testID={`unfeature-${f.user_id}`} onPress={() => unfeature(f.user_id)} style={st.removeBtn}><Text style={st.removeText}>REMOVE</Text></Pressable>
          </View>
        ))}

        {/* Member management */}
        <Text style={st.section}>MEMBERS</Text>
        <View style={st.searchRow}>
          <TextInput testID="admin-search" value={q} onChangeText={setQ} onSubmitEditing={() => loadMembers(q, enhancedOnly)} placeholder="Search by name…" placeholderTextColor={colors.textDim} style={st.search} autoCapitalize="none" />
          <Pressable testID="admin-search-btn" onPress={() => loadMembers(q, enhancedOnly)} style={st.searchBtn}><Text style={st.searchBtnText}>GO</Text></Pressable>
        </View>
        <Pressable
          testID="admin-filter-enhanced"
          onPress={() => { const next = !enhancedOnly; setEnhancedOnly(next); setLoading(true); loadMembers(q, next); }}
          style={[st.filterChip, enhancedOnly && st.tagDanger]}
        >
          <Text style={[st.tagText, enhancedOnly && st.tagDangerText]}>{enhancedOnly ? "☣ SHOWING ENHANCED ONLY · TAP TO CLEAR" : "☣ FILTER: ENHANCED USERS ONLY"}</Text>
        </Pressable>

        {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: spacing.lg }} /> : members.length === 0 ? (
          <Text style={st.dim}>No members found.</Text>
        ) : members.map((m) => (
          <View key={m.user_id} testID={`admin-member-${m.user_id}`} style={st.mCard}>
            <Text style={st.mName}>{m.display_name} <Text style={st.mRank}>· {(m.rank || "").toUpperCase()} LV{m.level}</Text></Text>
            <View style={st.tagRow}>
              <Pressable onPress={() => toggleSkool(m)} style={[st.tag, m.skool_verified && st.tagOn]}><Text style={[st.tagText, m.skool_verified && st.tagTextOn]}>✓ SKOOL</Text></Pressable>
              <Pressable onPress={() => toggleFounder(m)} style={[st.tag, m.founder_grant && st.tagOn]}><Text style={[st.tagText, m.founder_grant && st.tagTextOn]}>★ FOUNDER</Text></Pressable>
              <Pressable
                testID={`enhanced-remove-${m.user_id}`}
                onPress={() => removeEnhanced(m)}
                style={[st.tag, m.enhanced && st.tagDanger]}
              >
                <Text style={[st.tagText, m.enhanced && st.tagDangerText]}>{m.enhanced ? "☣ REMOVE ENHANCED" : "☣ GRANT ENHANCED"}</Text>
              </Pressable>
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
            <View style={st.tagRow}>
              <Pressable testID={`spot-photo-${m.user_id}`} onPress={() => attachSpotlight(m, "image")} disabled={uploadingSpot === m.user_id} style={st.tag}>
                <Text style={st.tagText}>{uploadingSpot === m.user_id ? "…" : "🖼 ADD PHOTO"}</Text>
              </Pressable>
              <Pressable testID={`spot-video-${m.user_id}`} onPress={() => attachSpotlight(m, "video")} disabled={uploadingSpot === m.user_id} style={st.tag}>
                <Text style={st.tagText}>{uploadingSpot === m.user_id ? "…" : "🎬 ADD VIDEO"}</Text>
              </Pressable>
            </View>

            <Text style={st.miniLabel}>DANGER ZONE</Text>
            <Pressable testID={`delete-member-${m.user_id}`} onPress={() => deleteMember(m)} style={st.deleteBtn}>
              <Text style={st.deleteBtnText}>🗑 DELETE MEMBER PERMANENTLY</Text>
            </Pressable>
          </View>
        ))}
        </>)}
        {msg && <Text style={st.msg}>{msg}</Text>}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.surface },
  searchInput: { flex: 1, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
  tabBar: { flexDirection: "row", gap: 6, marginBottom: spacing.lg, flexWrap: "wrap" },
  tabBtn: { flex: 1, minWidth: 72, paddingVertical: 11, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  tabBtnOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  tabBtnText: { color: colors.textDim, fontWeight: "900", fontSize: 10, letterSpacing: 0.5 },
  tabBtnTextOn: { color: colors.brandPrimary },
  clanRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  deleteBtn: { marginTop: 4, paddingVertical: 11, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error, backgroundColor: "rgba(255,45,85,0.1)" },
  deleteBtnText: { color: colors.error, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
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
  secHeadRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  secRefresh: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  secStatsRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  secStat: { flex: 1, alignItems: "center", backgroundColor: colors.surface3, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm },
  secNum: { color: colors.text, fontSize: 22, fontWeight: "900", fontVariant: ["tabular-nums"] },
  secLbl: { color: colors.textDim, fontSize: 9, fontWeight: "800", letterSpacing: 1, marginTop: 2 },
  secWarn: { color: colors.error, fontSize: 12, fontWeight: "700", marginBottom: spacing.sm },
  secSub: { color: colors.textMid, fontSize: 10, fontWeight: "900", letterSpacing: 2, marginTop: spacing.sm, marginBottom: 4 },
  secRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  secIp: { color: colors.text, fontSize: 12, fontFamily: undefined },
  secCount: { color: colors.brandPrimary, fontSize: 12, fontWeight: "900" },
  secWho: { color: colors.text, fontSize: 12, flex: 1 },
  secMeta: { color: colors.textDim, fontSize: 10 },
  dim: { color: colors.textDim, fontSize: 12, marginBottom: spacing.md },
  featRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.md, backgroundColor: "rgba(255,234,0,0.06)", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, marginBottom: spacing.sm },
  name: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  reason: { color: colors.warning, fontSize: 12, marginTop: 2 },
  removeBtn: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.error },
  removeText: { color: colors.error, fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  searchRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  filterChip: { alignSelf: "flex-start", paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3, marginBottom: spacing.md },
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
  tagDanger: { borderColor: "#FF2A3C", backgroundColor: "rgba(255,42,60,0.14)" },
  tagDangerText: { color: "#FF2A3C" },
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
  spotClear: { color: colors.error, fontSize: 11, fontWeight: "800", letterSpacing: 0.5, marginTop: 4 },
  featBtn: { paddingHorizontal: 14, justifyContent: "center", borderRadius: radius.sm, backgroundColor: colors.warning },
  featBtnText: { color: "#221900", fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  gymMembers: { color: colors.textDim, fontSize: 11, fontWeight: "800", alignSelf: "center", minWidth: 34, textAlign: "center" },
  gymCard: { padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, marginBottom: spacing.sm },
  mergeBox: { marginTop: spacing.sm, padding: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.surface3 },
  locRow: { flexDirection: "row", gap: spacing.sm, alignItems: "center", marginTop: spacing.sm },
  locSet: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm, marginTop: 6 },
  locSetText: { color: colors.textMid, fontSize: 11, flex: 1 },
  locClear: { color: colors.error, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  mergeHint: { color: colors.textMid, fontSize: 11, marginBottom: spacing.sm, lineHeight: 16 },
  mergeOpt: { paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2, marginBottom: 6 },
  mergeOptText: { color: colors.text, fontSize: 13, fontWeight: "700" },
  gymTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  gymLogoBtn: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  gymLogoImg: { width: "100%", height: "100%" },
  gymLogoPlus: { color: colors.brandPrimary, fontSize: 8, fontWeight: "900", textAlign: "center", letterSpacing: 0.5 },
  chalStand: { color: colors.text, fontSize: 12, fontWeight: "700", marginTop: 4 },
  msg: { color: colors.success, textAlign: "center", marginTop: spacing.md, fontWeight: "700" },
});
