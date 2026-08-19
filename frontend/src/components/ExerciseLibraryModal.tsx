import { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, Modal, ScrollView, Pressable, TextInput, ActivityIndicator, Share, Platform } from "react-native";
import { Image } from "expo-image";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { MuscleMap } from "@/src/components/MuscleMap";

type Ex = { name: string; category: string; desc?: string };

const REP_RANGES: Record<string, { label: string; range: string }[]> = {
  Chest: [{ label: "STRENGTH", range: "4-6" }, { label: "HYPERTROPHY", range: "8-12" }],
  Back: [{ label: "STRENGTH", range: "4-6" }, { label: "HYPERTROPHY", range: "8-12" }],
  Legs: [{ label: "STRENGTH", range: "4-6" }, { label: "HYPERTROPHY", range: "8-12" }],
  Shoulders: [{ label: "STRENGTH", range: "5-8" }, { label: "HYPERTROPHY", range: "10-15" }],
  Arms: [{ label: "HYPERTROPHY", range: "8-12" }, { label: "PUMP", range: "12-15" }],
  Core: [{ label: "ENDURANCE", range: "12-20" }],
  Olympic: [{ label: "POWER", range: "2-5" }],
  Powerlifting: [{ label: "STRENGTH", range: "1-5" }, { label: "VOLUME", range: "5-8" }],
  Strongman: [{ label: "POWER", range: "3-6" }, { label: "CARRY", range: "20-50m" }],
  Calisthenics: [{ label: "STRENGTH", range: "3-8" }, { label: "SKILL/HOLD", range: "10-30s" }],
  CrossFit: [{ label: "CONDITIONING", range: "10-20" }, { label: "POWER", range: "3-6" }],
};
const repRanges = (cat?: string) => REP_RANGES[cat || ""] || [{ label: "HYPERTROPHY", range: "8-12" }];

// Instant, reliable form cues shown for every exercise (no network / no AI needed).
const FORM_CUES: Record<string, string[]> = {
  Chest: ["Set your shoulder blades back and down, feet planted.", "Lower under control to your chest for a full stretch.", "Drive up explosively and squeeze the chest at the top.", "Keep wrists stacked over your elbows."],
  Back: ["Brace your core and keep a neutral spine.", "Initiate the pull with your back, not your arms.", "Pull elbows toward your hips and squeeze the shoulder blades.", "Control the negative — no swinging."],
  Shoulders: ["Brace hard and keep ribs down.", "Press or raise in a smooth, controlled arc.", "Stop just short of locking out to keep tension.", "Lower slowly — don't let gravity win."],
  Arms: ["Pin your elbows in place and stay strict.", "Squeeze hard at peak contraction.", "Lower slowly for 2-3 seconds each rep.", "Avoid using momentum or body english."],
  Core: ["Exhale and brace as you contract.", "Move slowly and feel every rep.", "Keep your lower back safe and supported.", "Hold the peak for a full second."],
  Legs: ["Set your stance and brace your core.", "Drive through your whole foot.", "Hit full depth with control.", "Explode up and lock out the rep."],
  Olympic: ["Start tight with the bar close to your body.", "Extend explosively through hips and knees.", "Pull yourself under fast and catch solid.", "Stabilize before you stand or reset."],
  Powerlifting: ["Set your brace and full-body tension before you move.", "Own the eccentric — stay tight in the bottom.", "Drive with intent and finish every rep.", "Reset your setup between reps for consistency."],
  Strongman: ["Get a secure grip and brace your whole body.", "Use your legs and hips to move the load.", "Keep the implement close and your back flat.", "Breathe and stay braced through carries."],
  Calisthenics: ["Own your full bodyweight — move slow and controlled.", "Keep a tight hollow body and squeezed glutes.", "Full range of motion beats extra reps.", "Build to harder progressions over time."],
  CrossFit: ["Nail the movement standard before adding speed.", "Pace your reps to keep good form under fatigue.", "Breathe rhythmically — don't hold your breath.", "Scale the load/reps to move consistently."],
};
const formCues = (e?: Ex | null) => {
  if (!e) return [];
  const base = FORM_CUES[e.category] || ["Set up with a stable, braced position.", "Move under control through a full range.", "Squeeze at the peak of each rep.", "Lower slowly and keep tension."];
  return e.desc ? [e.desc, ...base] : base;
};

export function ExerciseLibraryModal({
  visible, onClose, onAdd, token,
}: { visible: boolean; onClose: () => void; onAdd: (names: string[]) => void; token: string | null }) {
  const [library, setLibrary] = useState<Ex[]>([]);
  const [custom, setCustom] = useState<Ex[]>([]);
  const [recent, setRecent] = useState<{ name: string; count: number }[]>([]);
  const [favourites, setFavourites] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [sel, setSel] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // demo detail sheet
  const [detail, setDetail] = useState<Ex | null>(null);
  const [demoUri, setDemoUri] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await apiFetch(token, "/api/exercises");
      setLibrary(r.library || []); setCustom(r.custom || []); setRecent(r.recent || []); setFavourites(r.favourites || []);
    } catch {}
    setLoading(false);
  };
  useEffect(() => { if (visible) { setSel([]); setQ(""); setCat("All"); setNewName(""); setNewDesc(""); load(); } }, [visible]);

  const all = useMemo(() => [...custom, ...library], [library, custom]);

  // Category chips in library order, plus Custom when present
  const categories = useMemo(() => {
    const seen: string[] = [];
    for (const e of library) if (!seen.includes(e.category)) seen.push(e.category);
    const list = ["All", ...seen];
    if (custom.length) list.push("Custom");
    return list;
  }, [library, custom]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all.filter((e) =>
      (cat === "All" || e.category === cat) &&
      (!term || e.name.toLowerCase().includes(term))
    );
  }, [all, q, cat]);

  const recentExercises = useMemo(() => {
    const byName = new Map(all.map((e) => [e.name, e]));
    return recent.map((r) => byName.get(r.name) || { name: r.name, category: "Recent" });
  }, [recent, all]);

  const favExercises = useMemo(() => {
    const byName = new Map(all.map((e) => [e.name, e]));
    return favourites.map((n) => byName.get(n) || { name: n, category: "Favourite" });
  }, [favourites, all]);

  const toggleFav = async (name: string) => {
    const on = !favourites.includes(name);
    setFavourites((f) => (on ? [...f, name] : f.filter((x) => x !== name)));
    try { await apiFetch(token, "/api/exercises/favourite", { method: "POST", body: JSON.stringify({ name, on }) }); } catch {}
  };

  // Grouped list; when browsing All with no search, surface Favourites then Recent first
  const groups = useMemo(() => {
    const out: [string, Ex[]][] = [];
    if (cat === "All" && !q.trim()) {
      if (favExercises.length) out.push(["★ Favourites", favExercises]);
      if (recentExercises.length) out.push(["Recent", recentExercises]);
    }
    const g: Record<string, Ex[]> = {};
    for (const e of filtered) { (g[e.category] = g[e.category] || []).push(e); }
    for (const k of Object.keys(g)) out.push([k, g[k]]);
    return out;
  }, [filtered, recentExercises, favExercises, cat, q]);

  const toggle = (name: string) => setSel((s) => (s.includes(name) ? s.filter((x) => x !== name) : [...s, name]));

  const createCustom = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const r = await apiFetch(token, "/api/exercises/custom", { method: "POST", body: JSON.stringify({ name, desc: newDesc.trim() }) });
      setCustom(r.custom || []);
      setSel((s) => (s.includes(name) ? s : [...s, name]));
      setNewName(""); setNewDesc("");
    } catch {}
    setCreating(false);
  };

  const openDemo = async (e: Ex) => {
    setDetail(e); setDemoUri(null);
    // Instant sheet (cues + muscle map). Fetch a cached illustration in the background if one exists.
    try {
      const r = await apiFetch(token, `/api/exercises/demo?name=${encodeURIComponent(e.name)}`);
      if (r?.media_id) setDemoUri(`${process.env.EXPO_PUBLIC_BACKEND_URL}/api/chat/media/${r.media_id}?token=${token}`);
    } catch {}
  };

  const confirm = () => { if (sel.length) onAdd(sel); onClose(); };

  const shareDemo = async () => {
    if (!detail) return;
    const text = `${detail.name} (${detail.category})\n\n${detail.desc || ""}\n\n— shared from Hutch's Inner Circle`;
    try {
      if (Platform.OS !== "web" && demoUri && (await Sharing.isAvailableAsync())) {
        const safe = detail.name.replace(/[^a-z0-9]/gi, "_");
        const fileUri = `${FileSystem.cacheDirectory}${safe}.png`;
        const dl = await FileSystem.downloadAsync(demoUri, fileUri);
        await Sharing.shareAsync(dl.uri, { mimeType: "image/png", dialogTitle: detail.name });
        return;
      }
    } catch {}
    Share.share({ message: text }).catch(() => {});
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.head}>
            <Text style={styles.title}>EXERCISE LIBRARY</Text>
            <Pressable testID="lib-close" onPress={onClose}><Text style={styles.close}>✕</Text></Pressable>
          </View>

          <TextInput
            testID="lib-search"
            value={q}
            onChangeText={setQ}
            placeholder="Search exercises..."
            placeholderTextColor={colors.textDim}
            style={styles.search}
            autoCapitalize="none"
          />

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
            {categories.map((c) => (
              <Pressable key={c} testID={`lib-cat-${c}`} onPress={() => setCat(c)} style={[styles.chip, cat === c && styles.chipOn]}>
                <Text style={[styles.chipText, cat === c && styles.chipTextOn]}>{c.toUpperCase()}</Text>
              </Pressable>
            ))}
          </ScrollView>

          <View style={styles.createRow}>
            <View style={{ flex: 1, gap: 6 }}>
              <TextInput
                testID="lib-new-name"
                value={newName}
                onChangeText={setNewName}
                placeholder="Add your own exercise"
                placeholderTextColor={colors.textDim}
                style={styles.createInput}
              />
              <TextInput
                testID="lib-new-desc"
                value={newDesc}
                onChangeText={setNewDesc}
                placeholder="Your own note / cue (optional)"
                placeholderTextColor={colors.textDim}
                style={styles.createInput}
              />
            </View>
            <Pressable testID="lib-create" onPress={createCustom} disabled={creating || !newName.trim()} style={[styles.createBtn, !newName.trim() && { opacity: 0.5 }]}>
              <Text style={styles.createBtnText}>{creating ? "..." : "+ ADD"}</Text>
            </Pressable>
          </View>

          {loading ? (
            <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 30 }} />
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: spacing.md }}>
              {groups.length === 0 && <Text style={styles.empty}>No matches. Add it as a custom exercise above.</Text>}
              {groups.map(([label, items]) => (
                <View key={label}>
                  <Text style={styles.cat}>{label.toUpperCase()}</Text>
                  {items.map((e) => {
                    const on = sel.includes(e.name);
                    return (
                      <Pressable testID={`lib-ex-${e.name}`} key={`${label}-${e.name}`} onPress={() => toggle(e.name)} style={[styles.row, on && styles.rowOn]}>
                        <View style={{ flex: 1, paddingRight: spacing.sm }}>
                          <Text style={[styles.rowName, on && styles.rowNameOn]}>{e.name}</Text>
                          {!!e.desc && <Text style={styles.rowDesc}>{e.desc}</Text>}
                        </View>
                        <Pressable testID={`lib-fav-${e.name}`} onPress={() => toggleFav(e.name)} hitSlop={8} style={styles.infoBtn}>
                          <Text style={[styles.starText, favourites.includes(e.name) && styles.starOn]}>{favourites.includes(e.name) ? "\u2605" : "\u2606"}</Text>
                        </Pressable>
                        <Pressable testID={`lib-info-${e.name}`} onPress={() => openDemo(e)} hitSlop={8} style={styles.infoBtn}>
                          <Text style={styles.infoText}>{"\u24D8"}</Text>
                        </Pressable>
                        <View style={[styles.check, on && styles.checkOn]}>{on && <Text style={styles.checkMark}>✓</Text>}</View>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          )}

          <Pressable testID="lib-confirm" onPress={confirm} style={[styles.confirmBtn, !sel.length && { opacity: 0.5 }]} disabled={!sel.length}>
            <Text style={styles.confirmText}>ADD {sel.length > 0 ? `${sel.length} ` : ""}EXERCISE{sel.length === 1 ? "" : "S"}</Text>
          </Pressable>
        </View>
      </View>

      {/* Exercise demo / detail sheet */}
      <Modal visible={!!detail} transparent animationType="fade" onRequestClose={() => setDetail(null)}>
        <Pressable style={styles.detailWrap} onPress={() => setDetail(null)}>
          <Pressable style={styles.detailCard} onPress={() => {}}>
            <View style={styles.head}>
              <Text style={styles.detailTitle}>{detail?.name}</Text>
              <Pressable testID="demo-close" onPress={() => setDetail(null)}><Text style={styles.close}>✕</Text></Pressable>
            </View>
            {!!detail?.category && <Text style={styles.detailCat}>{detail.category.toUpperCase()}</Text>}
            <View style={styles.tagRow}>
              {repRanges(detail?.category).map((t) => (
                <View key={t.label} style={styles.tag}>
                  <Text style={styles.tagLabel}>{t.label}</Text>
                  <Text style={styles.tagRange}>{t.range} reps</Text>
                </View>
              ))}
            </View>
            {demoUri ? (
              <View style={styles.demoBox}>
                <Image source={{ uri: demoUri }} style={styles.demoImg} contentFit="cover" transition={200} />
              </View>
            ) : null}
            <Text style={styles.cuesLabel}>HOW TO PERFORM</Text>
            {formCues(detail).map((c, i) => (
              <View key={i} style={styles.cueRow}>
                <Text style={styles.cueNum}>{i + 1}</Text>
                <Text style={styles.cueText}>{c}</Text>
              </View>
            ))}
            <MuscleMap category={detail?.category} />
            <View style={styles.actionRow}>
              <Pressable testID="demo-share" onPress={shareDemo} style={[styles.smallBtn, { flex: 1 }]}>
                <Text style={styles.smallBtnText}>{"\u2934 SHARE"}</Text>
              </Pressable>
            </View>
            <Pressable
              testID="demo-add"
              onPress={() => { if (detail) { setSel((s) => (s.includes(detail.name) ? s : [...s, detail.name])); setDetail(null); } }}
              style={styles.detailAdd}
            >
              <Text style={styles.detailAddText}>+ ADD TO WORKOUT</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  sheet: { height: "88%", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing.md },
  title: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "900", fontSize: 15 },
  close: { color: colors.textDim, fontSize: 22, paddingHorizontal: 6 },
  search: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 15, marginBottom: spacing.sm },
  chipScroll: { flexGrow: 0, marginBottom: spacing.sm },
  chipRow: { gap: spacing.sm, paddingRight: spacing.lg },
  chip: { paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, justifyContent: "center", backgroundColor: colors.surface2 },
  chipOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  chipText: { color: colors.textDim, fontWeight: "800", letterSpacing: 1, fontSize: 11 },
  chipTextOn: { color: colors.brandPrimary },
  createRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md, alignItems: "stretch" },
  createInput: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14 },
  createBtn: { justifyContent: "center", paddingHorizontal: spacing.md, backgroundColor: colors.brandTertiary, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary },
  createBtnText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 1 },
  empty: { color: colors.textDim, textAlign: "center", marginVertical: spacing.lg },
  cat: { color: colors.textDim, letterSpacing: 3, fontWeight: "800", fontSize: 11, marginTop: spacing.md, marginBottom: 6 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: spacing.md, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: 6 },
  rowOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  rowName: { color: colors.text, fontWeight: "600" },
  rowNameOn: { color: colors.brandPrimary, fontWeight: "800" },
  rowDesc: { color: colors.textDim, fontSize: 11, lineHeight: 15, marginTop: 3 },
  infoBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center", marginRight: 6 },
  infoText: { color: colors.brandPrimary, fontSize: 18, fontWeight: "700" },
  starText: { color: colors.textDim, fontSize: 18, fontWeight: "700" },
  starOn: { color: colors.warning },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  checkMark: { color: "#001122", fontWeight: "900" },
  confirmBtn: { backgroundColor: colors.brandPrimary, paddingVertical: 16, alignItems: "center", borderRadius: radius.sm, marginTop: spacing.sm },
  confirmText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  detailWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.88)", justifyContent: "center", padding: spacing.lg },
  detailCard: { backgroundColor: colors.surface2, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  detailTitle: { color: colors.text, fontWeight: "900", fontSize: 18, flex: 1, paddingRight: spacing.sm },
  detailCat: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", fontSize: 10, marginBottom: spacing.sm },
  tagRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.sm },
  tag: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.surface3, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 5 },
  tagLabel: { color: colors.brandPrimary, fontWeight: "900", fontSize: 9, letterSpacing: 1 },
  tagRange: { color: colors.textMid, fontWeight: "700", fontSize: 11 },
  demoBox: { height: 200, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginBottom: spacing.sm },
  demoCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: spacing.sm, padding: spacing.lg },
  demoHint: { color: colors.textDim, fontSize: 12, textAlign: "center" },
  demoImg: { width: "100%", height: "100%" },
  cuesLabel: { color: colors.brandPrimary, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: spacing.sm, marginBottom: spacing.sm },
  cueRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, marginBottom: spacing.sm },
  cueNum: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.brandTertiary, color: colors.brandPrimary, fontWeight: "900", fontSize: 11, textAlign: "center", lineHeight: 20, overflow: "hidden" },
  cueText: { flex: 1, color: colors.textMid, fontSize: 13, lineHeight: 19 },
  actionRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md },
  smallBtn: { flex: 1, borderWidth: 1, borderColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 9, alignItems: "center" },
  smallBtnText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 11, letterSpacing: 1 },
  detailDesc: { color: colors.textMid, fontSize: 13, lineHeight: 19, marginBottom: spacing.md },
  detailAdd: { backgroundColor: colors.brandPrimary, paddingVertical: 14, alignItems: "center", borderRadius: radius.sm },
  detailAddText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
});
