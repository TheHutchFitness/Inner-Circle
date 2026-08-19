import { useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, Modal, Platform,
  Alert, Linking, ActivityIndicator, KeyboardAvoidingView, Share,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import Svg, { Polyline, Circle, Line as SvgLine } from "react-native-svg";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { useSubscription } from "@/src/lib/revenuecat";
import { VerifyPanel } from "@/src/components/VerifyPanel";
import { MemberSheet } from "@/src/components/MemberSheet";
import { colors, spacing, radius, RANK_COLORS, avatarFor } from "@/src/lib/theme";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;
const CATEGORIES: [string, string][] = [
  ["Symmetry", "symmetry"], ["Conditioning", "conditioning"], ["Size", "size"], ["Posing", "posing"],
];

function scoreColor(v: number) {
  if (v >= 8) return colors.success;
  if (v >= 6) return colors.brandPrimary;
  if (v >= 4) return colors.warning;
  return colors.error;
}

function Critique({ c }: { c: any }) {
  if (!c) {
    return <Text style={st.pending}>The Judge couldn&apos;t score this one — try a clearer, well-lit physique photo.</Text>;
  }
  return (
    <View style={st.critique}>
      <View style={st.overallRow}>
        <Text style={st.overallLabel}>THE JUDGE&apos;S SCORE</Text>
        <Text style={[st.overall, { color: scoreColor(c.overall) }]}>{c.overall.toFixed(1)}<Text style={st.outOf}>/10</Text></Text>
      </View>
      {CATEGORIES.map(([label, key]) => {
        const v = c[key] ?? 0;
        return (
          <View key={key} style={st.catRow}>
            <Text style={st.catLabel}>{label.toUpperCase()}</Text>
            <View style={st.catBar}><View style={[st.catFill, { width: `${(v / 10) * 100}%`, backgroundColor: scoreColor(v) }]} /></View>
            <Text style={[st.catVal, { color: scoreColor(v) }]}>{v.toFixed(1)}</Text>
          </View>
        );
      })}
      {!!c.notes && <Text style={st.notes}>&ldquo;{c.notes}&rdquo;</Text>}
    </View>
  );
}

function JudgeHistory({ hist, mediaUrl }: { hist: any; mediaUrl: (id: string) => string }) {
  if (!hist || hist.count === 0) {
    return <Text style={st.empty}>No scored submissions yet. Submit a physique to start your history.</Text>;
  }
  const pts: any[] = hist.history;
  const W = 300, H = 120, pad = 14;
  const n = pts.length;
  const xFor = (i: number) => n <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (n - 1);
  const yFor = (v: number) => H - pad - (v / 10) * (H - pad * 2);
  const poly = pts.map((p, i) => `${xFor(i)},${yFor(p.overall)}`).join(" ");
  const latest = pts[n - 1]?.overall ?? 0;
  const first = pts[0]?.overall ?? 0;
  const trend = latest - first;
  return (
    <View>
      <View style={st.histStats}>
        <View style={st.histStat}><Text style={st.histStatVal}>{hist.best.toFixed(1)}</Text><Text style={st.histStatLabel}>BEST</Text></View>
        <View style={st.histStat}><Text style={st.histStatVal}>{latest.toFixed(1)}</Text><Text style={st.histStatLabel}>LATEST</Text></View>
        <View style={st.histStat}>
          <Text style={[st.histStatVal, { color: trend >= 0 ? colors.success : colors.error }]}>{trend >= 0 ? "▲" : "▼"}{Math.abs(trend).toFixed(1)}</Text>
          <Text style={st.histStatLabel}>TREND</Text>
        </View>
        <View style={st.histStat}><Text style={st.histStatVal}>{hist.count}</Text><Text style={st.histStatLabel}>JUDGED</Text></View>
      </View>
      <View style={st.trendWrap}>
        <Text style={st.trendTitle}>OVERALL SCORE OVER TIME</Text>
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {[0, 5, 10].map((g) => (
            <SvgLine key={g} x1={pad} y1={yFor(g)} x2={W - pad} y2={yFor(g)} stroke="#1E2430" strokeWidth={1} />
          ))}
          {n > 1 && <Polyline points={poly} fill="none" stroke={colors.brandPrimary} strokeWidth={2.5} />}
          {pts.map((p, i) => (
            <Circle key={i} cx={xFor(i)} cy={yFor(p.overall)} r={3.5} fill={colors.warning} />
          ))}
        </Svg>
      </View>
      {[...pts].reverse().map((p) => (
        <View key={p.submission_id} testID={`hist-${p.submission_id}`} style={st.histRow}>
          <Image source={{ uri: mediaUrl(p.media_id) }} style={st.histThumb} contentFit="cover" />
          <View style={{ flex: 1 }}>
            <Text style={st.histDate}>{new Date(p.created_at).toLocaleDateString()}</Text>
            <Text style={st.histCats}>S {p.symmetry.toFixed(0)} · C {p.conditioning.toFixed(0)} · Sz {p.size.toFixed(0)} · P {p.posing.toFixed(0)}</Text>
          </View>
          <Text style={[st.histScore, { color: scoreColor(p.overall) }]}>{p.overall.toFixed(1)}</Text>
        </View>
      ))}
    </View>
  );
}

export default function Judge() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const { isSubscribed } = useSubscription();

  const canJudge = isSubscribed || user?.skool_verified || user?.all_rooms_access || user?.is_founder || user?.is_admin;
  const isVerified = !!(user?.email_verified || user?.phone_verified);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const [feed, setFeed] = useState<any[]>([]);
  const [board, setBoard] = useState<any[]>([]);
  const [hist, setHist] = useState<any>(null);
  const [view, setView] = useState<"feed" | "board" | "mine">("feed");
  const [pending, setPending] = useState<any>(null);
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [active, setActive] = useState<any>(null); // submission open in comments modal
  const [comments, setComments] = useState<any[]>([]);
  const [commentText, setCommentText] = useState("");
  const [posting, setPosting] = useState(false);
  const [memberId, setMemberId] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const load = async () => { try { setFeed(await apiFetch(token, "/api/judge/feed")); } catch {} };
  const loadBoard = async () => { try { setBoard(await apiFetch(token, "/api/judge/leaderboard")); } catch {} };
  const loadHist = async () => { try { setHist(await apiFetch(token, "/api/judge/my-history")); } catch {} };
  useEffect(() => { if (canJudge) { load(); loadBoard(); loadHist(); } /* eslint-disable-next-line */ }, [canJudge]);

  const mediaUrl = (id: string) => `${API}/api/chat/media/${id}?token=${token}`;

  const ensurePermission = async (source: "camera" | "gallery") => {
    if (Platform.OS === "web") return true;
    const get = source === "camera" ? ImagePicker.getCameraPermissionsAsync : ImagePicker.getMediaLibraryPermissionsAsync;
    const req = source === "camera" ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    let perm = await get();
    if (perm.granted) return true;
    if (perm.canAskAgain) {
      perm = await req();
      if (perm.granted) return true;
      if (perm.canAskAgain) return false;
    }
    Alert.alert(
      source === "camera" ? "Camera access needed" : "Photos access needed",
      source === "camera" ? "Enable camera access in Settings to shoot your physique." : "Enable photo access in Settings to submit from your gallery.",
      [{ text: "Cancel", style: "cancel" }, { text: "Open Settings", onPress: () => Linking.openSettings() }]
    );
    return false;
  };

  const pick = async (source: "camera" | "gallery") => {
    setErr(null);
    if (!isVerified) { setVerifyOpen(true); return; }
    if (!(await ensurePermission(source))) return;
    const opts: any = { mediaTypes: ["images"], quality: 0.7 };
    let res;
    try {
      res = source === "camera" ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    } catch {
      setErr(source === "camera" ? "Camera unavailable here — try the gallery." : "Could not open gallery.");
      return;
    }
    if (res.canceled || !res.assets?.length) return;
    setPending(res.assets[0]);
  };

  const submit = async () => {
    if (!pending || submitting) return;
    setSubmitting(true); setErr(null);
    try {
      const name = pending.fileName || "physique.jpg";
      const type = pending.mimeType || "image/jpeg";
      const form = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(pending.uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri: pending.uri, name, type } as any);
      }
      if (caption.trim()) form.append("caption", caption.trim());
      const r = await fetch(`${API}/api/judge/submit`, {
        method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
      });
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Submission failed"); }
      setPending(null); setCaption("");
      await load();
      await loadBoard();
      await loadHist();
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: true }), 60);
    } catch (e: any) { setErr(e.message); }
    setSubmitting(false);
  };

  const openComments = async (sub: any) => {
    setActive(sub); setComments([]); setCommentText("");
    try { setComments(await apiFetch(token, `/api/judge/${sub.submission_id}/comments`)); } catch {}
  };

  const postComment = async () => {
    if (!commentText.trim() || posting || !active) return;
    setPosting(true);
    try {
      await apiFetch(token, `/api/judge/${active.submission_id}/comments`, {
        method: "POST", body: JSON.stringify({ text: commentText.trim() }),
      });
      setCommentText("");
      setComments(await apiFetch(token, `/api/judge/${active.submission_id}/comments`));
      setFeed((f) => f.map((s) => s.submission_id === active.submission_id ? { ...s, comment_count: (s.comment_count || 0) + 1 } : s));
    } catch {}
    setPosting(false);
  };

  const deleteComment = async (c: any) => {
    if (!active) return;
    setComments((list) => list.filter((x) => x.comment_id !== c.comment_id));
    setFeed((f) => f.map((s) => s.submission_id === active.submission_id ? { ...s, comment_count: Math.max(0, (s.comment_count || 1) - 1) } : s));
    try {
      await apiFetch(token, `/api/judge/${active.submission_id}/comments/${c.comment_id}`, { method: "DELETE" });
    } catch {}
  };
  if (!canJudge) {
    return (
      <View style={[st.gate, { paddingTop: insets.top + spacing.xl }]}>
        <Text style={st.eyebrow}>MEMBERS ONLY</Text>
        <Text style={st.gateTitle}>THE JUDGE IS LOCKED</Text>
        <Text style={st.gateSub}>Physique judging is for verified Skool members or $5/mo premium athletes.</Text>
        <Pressable testID="judge-paywall" onPress={() => router.push("/paywall")} style={st.gateBtn}>
          <Text style={st.gateBtnText}>UNLOCK PREMIUM</Text>
        </Pressable>
        <Pressable onPress={() => router.back()} style={{ marginTop: spacing.lg }}><Text style={st.backDim}>BACK</Text></Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ScrollView ref={scrollRef} contentContainerStyle={{ paddingTop: insets.top + spacing.md, padding: spacing.lg, paddingBottom: 60 }}>
        <Pressable onPress={() => router.back()}><Text style={st.back}>← BACK</Text></Pressable>
        <Text style={st.eyebrow}>▚ POSING DAIS //</Text>
        <Text style={st.h1}>THE JUDGE</Text>
        <Text style={st.helper}>Submit your physique. Get scored by the AI head judge. Members critique too.</Text>

        {!isVerified && (
          <Pressable testID="judge-verify-nudge" onPress={() => setVerifyOpen(true)} style={st.nudge}>
            <Text style={st.nudgeText}>🔒 Verify your email or phone to unlock uploads</Text>
            <Text style={st.nudgeCta}>VERIFY ›</Text>
          </Pressable>
        )}

        <View style={st.submitCard}>
          <Text style={st.submitTitle}>STEP ON STAGE</Text>
          {pending ? (
            <>
              <Image source={{ uri: pending.uri }} style={st.preview} contentFit="cover" />
              <TextInput
                testID="judge-caption" value={caption} onChangeText={setCaption}
                placeholder="Add context (pose, weeks out)…" placeholderTextColor={colors.textDim} style={st.captionInput}
              />
              <View style={{ flexDirection: "row", gap: spacing.sm }}>
                <Pressable testID="judge-clear" onPress={() => setPending(null)} style={[st.btn, st.btnGhost]}>
                  <Text style={st.btnGhostText}>REMOVE</Text>
                </Pressable>
                <Pressable testID="judge-submit" onPress={submit} disabled={submitting} style={[st.btn, st.btnPrimary, { flex: 1 }]}>
                  {submitting ? <ActivityIndicator color="#001122" /> : <Text style={st.btnPrimaryText}>SUBMIT TO THE JUDGE</Text>}
                </Pressable>
              </View>
              {submitting && <Text style={st.judging}>The Judge is deliberating…</Text>}
            </>
          ) : (
            <View style={{ flexDirection: "row", gap: spacing.sm }}>
              <Pressable testID="judge-camera" onPress={() => pick("camera")} style={[st.btn, st.btnGhost, { flex: 1 }]}>
                <Text style={st.btnGhostText}>📷 CAMERA</Text>
              </Pressable>
              <Pressable testID="judge-gallery" onPress={() => pick("gallery")} style={[st.btn, st.btnGhost, { flex: 1 }]}>
                <Text style={st.btnGhostText}>🖼️ GALLERY</Text>
              </Pressable>
            </View>
          )}
          {err && <Text style={st.err}>{err}</Text>}
        </View>

        <View style={st.viewToggle}>
          <Pressable testID="judge-view-feed" onPress={() => setView("feed")} style={[st.viewBtn, view === "feed" && st.viewBtnActive]}>
            <Text style={[st.viewBtnText, view === "feed" && st.viewBtnTextActive]}>LINEUP</Text>
          </Pressable>
          <Pressable testID="judge-view-board" onPress={() => { setView("board"); loadBoard(); }} style={[st.viewBtn, view === "board" && st.viewBtnActive]}>
            <Text style={[st.viewBtnText, view === "board" && st.viewBtnTextActive]}>🏆 TOP</Text>
          </Pressable>
          <Pressable testID="judge-view-mine" onPress={() => { setView("mine"); loadHist(); }} style={[st.viewBtn, view === "mine" && st.viewBtnActive]}>
            <Text style={[st.viewBtnText, view === "mine" && st.viewBtnTextActive]}>MY SCORES</Text>
          </Pressable>
        </View>

        {view === "mine" ? (
          <JudgeHistory hist={hist} mediaUrl={mediaUrl} />
        ) : view === "board" ? (
          board.length === 0 ? (
            <Text style={st.empty}>No scored physiques this week yet. Submit one to top the board.</Text>
          ) : (
            board.map((b) => {
              const rc = RANK_COLORS[b.rank] || colors.brandPrimary;
              const medal = b.rank_pos === 1 ? "🥇" : b.rank_pos === 2 ? "🥈" : b.rank_pos === 3 ? "🥉" : `#${b.rank_pos}`;
              return (
                <View key={b.submission_id} testID={`judge-board-${b.rank_pos}`} style={st.boardRow}>
                  <Text style={st.boardPos}>{medal}</Text>
                  <Image source={{ uri: mediaUrl(b.media_id) }} style={st.boardThumb} contentFit="cover" />
                  <View style={{ flex: 1 }}>
                    <Pressable onPress={() => b.user_id && setMemberId(b.user_id)} hitSlop={6}>
                      <Text style={[st.boardName, b.founder_backer && { color: colors.warning }]}>{b.display_name} {b.founder_backer ? "★" : ""}</Text>
                    </Pressable>
                    <Text style={[st.cardRank, { color: rc }]}>{b.rank?.toUpperCase()}</Text>
                  </View>
                  <Text style={[st.boardScore, { color: scoreColor(b.overall) }]}>{b.overall.toFixed(1)}</Text>
                </View>
              );
            })
          )
        ) : feed.length === 0 ? (
          <Text style={st.empty}>No physiques on stage yet. Be the first to be judged.</Text>
        ) : (
          feed.map((s) => {
            const rc = RANK_COLORS[s.rank] || colors.brandPrimary;
            return (
              <View key={s.submission_id} testID={`judge-sub-${s.submission_id}`} style={st.card}>
                <View style={st.cardHead}>
                  <Text style={st.cardEmoji}>{avatarFor(s.avatar_id).emoji}</Text>
                  <Pressable onPress={() => s.user_id && setMemberId(s.user_id)} hitSlop={6}>
                    <Text style={[st.cardName, s.founder_backer && { color: colors.warning }]}>{s.display_name} {s.founder_backer ? <Text style={{ color: colors.warning }}>★</Text> : null}</Text>
                  </Pressable>
                  <Text style={[st.cardRank, { color: rc }]}>{s.rank?.toUpperCase()}</Text>
                </View>
                <Image source={{ uri: mediaUrl(s.media_id) }} style={st.subImage} contentFit="cover" transition={150} />
                {!!s.caption && <Text style={st.caption}>{s.caption}</Text>}
                <Critique c={s.critique} />
                <View style={{ flexDirection: "row", gap: spacing.sm }}>
                  <Pressable testID={`judge-comments-${s.submission_id}`} onPress={() => openComments(s)} style={[st.commentBtn, { flex: 1 }]}>
                    <Text style={st.commentBtnText}>💬 CRITIQUES ({s.comment_count || 0})</Text>
                  </Pressable>
                  {s.critique && s.critique.overall > 0 && (
                    <Pressable
                      testID={`judge-share-${s.submission_id}`}
                      onPress={() => Share.share({
                        message: `${s.display_name} scored ${s.critique.overall.toFixed(1)}/10 on The Judge 🏆\n` +
                          `Symmetry ${s.critique.symmetry} · Conditioning ${s.critique.conditioning} · Size ${s.critique.size} · Posing ${s.critique.posing}\n` +
                          `— Hutch's Inner Circle`,
                      }).catch(() => {})}
                      style={[st.commentBtn, { paddingHorizontal: spacing.lg }]}
                    >
                      <Text style={st.commentBtnText}>↗ SHARE</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <Modal visible={!!active} transparent animationType="slide" onRequestClose={() => setActive(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={st.modalWrap}>
          <View style={[st.modalCard, { paddingBottom: spacing.md + insets.bottom }]}>
            <View style={st.modalHead}>
              <Text style={st.modalTitle}>MEMBER CRITIQUES</Text>
              <Pressable testID="judge-modal-close" onPress={() => setActive(null)} hitSlop={10}><Text style={st.modalX}>✕</Text></Pressable>
            </View>
            <ScrollView style={{ maxHeight: 340 }}>
              {comments.length === 0 ? (
                <Text style={st.empty}>No critiques yet. Drop the first one.</Text>
              ) : comments.map((c) => (
                <View key={c.comment_id} style={st.comment}>
                  <View style={st.commentHead}>
                    <Text style={st.cardEmoji}>{avatarFor(c.avatar_id).emoji}</Text>
                    <Pressable onPress={() => c.user_id && setMemberId(c.user_id)} hitSlop={6}>
                      <Text style={[st.commentName, c.founder_backer && { color: colors.warning }]}>{c.display_name} {c.founder_backer ? <Text style={{ color: colors.warning }}>★</Text> : null}</Text>
                    </Pressable>
                    <Text style={[st.cardRank, { color: RANK_COLORS[c.rank] || colors.brandPrimary }]}>{c.rank?.toUpperCase()}</Text>
                    {(user?.is_admin || c.user_id === user?.user_id) && (
                      <Pressable testID={`del-comment-${c.comment_id}`} onPress={() => deleteComment(c)} hitSlop={8} style={st.delComment}>
                        <Text style={st.delCommentText}>✕</Text>
                      </Pressable>
                    )}
                  </View>
                  <Text style={st.commentText}>{c.text}</Text>
                </View>
              ))}
            </ScrollView>
            <View style={st.commentInputRow}>
              <TextInput
                testID="judge-comment-input" value={commentText} onChangeText={setCommentText}
                placeholder="Give your critique…" placeholderTextColor={colors.textDim} style={st.commentInput}
              />
              <Pressable testID="judge-comment-post" onPress={postComment} disabled={posting} style={st.commentSend}>
                {posting ? <ActivityIndicator size="small" color="#001122" /> : <Text style={st.commentSendText}>POST</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={verifyOpen} transparent animationType="slide" onRequestClose={() => setVerifyOpen(false)}>
        <View style={st.modalWrap}>
          <View style={[st.modalCard, { paddingBottom: spacing.md + insets.bottom }]}>
            <Text style={st.modalTitle}>VERIFY TO SUBMIT</Text>
            <Text style={st.verifySub}>Submitting a physique to The Judge is locked until you verify your email or phone. Takes under a minute.</Text>
            <VerifyPanel onVerified={() => setVerifyOpen(false)} />
            <Pressable testID="judge-verify-close" onPress={() => setVerifyOpen(false)} style={st.commentBtn}>
              <Text style={st.commentBtnText}>CLOSE</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <MemberSheet userId={memberId} visible={!!memberId} onClose={() => setMemberId(null)} />
    </View>
  );
}

const st = StyleSheet.create({
  gate: { flex: 1, backgroundColor: colors.surface, padding: spacing.xl, alignItems: "center" },
  eyebrow: { color: colors.brandPrimary, letterSpacing: 4, fontSize: 11, fontWeight: "700" },
  gateTitle: { color: colors.error, fontSize: 26, fontWeight: "900", letterSpacing: 3, marginTop: spacing.sm, textAlign: "center" },
  gateSub: { color: colors.textDim, textAlign: "center", marginTop: spacing.md, lineHeight: 20 },
  gateBtn: { marginTop: spacing.xl, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm },
  gateBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  backDim: { color: colors.textDim, letterSpacing: 2, fontWeight: "800" },
  back: { color: colors.brandPrimary, letterSpacing: 2, fontWeight: "800", marginBottom: spacing.md },
  h1: { color: colors.text, fontSize: 22, fontWeight: "900", letterSpacing: 1, marginTop: 4 },
  helper: { color: colors.textMid, marginTop: 4, lineHeight: 18 },
  nudge: { marginTop: spacing.md, flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,234,0,0.06)" },
  nudgeText: { color: colors.warning, fontWeight: "700", fontSize: 12, flex: 1, letterSpacing: 0.5 },
  nudgeCta: { color: colors.warning, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  submitCard: { marginTop: spacing.lg, padding: spacing.lg, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  submitTitle: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "800", fontSize: 12, marginBottom: spacing.md },
  preview: { width: "100%", height: 260, borderRadius: radius.sm, backgroundColor: colors.surface3, marginBottom: spacing.md },
  captionInput: { backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  btn: { paddingVertical: 14, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, minHeight: 48 },
  btnGhost: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface3 },
  btnGhostText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2 },
  btnPrimary: { backgroundColor: colors.brandPrimary },
  btnPrimaryText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  judging: { color: colors.brandPrimary, textAlign: "center", marginTop: spacing.md, letterSpacing: 2 },
  err: { color: colors.error, marginTop: spacing.md, textAlign: "center" },
  section: { color: colors.text, fontSize: 14, letterSpacing: 4, fontWeight: "800", marginTop: spacing.xl, marginBottom: spacing.md },
  viewToggle: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl, marginBottom: spacing.md },
  viewBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  viewBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  viewBtnText: { color: colors.textDim, fontWeight: "800", letterSpacing: 1, fontSize: 12 },
  viewBtnTextActive: { color: colors.brandPrimary },
  boardRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  boardPos: { width: 34, textAlign: "center", fontSize: 16, fontWeight: "900", color: colors.text },
  boardThumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  boardName: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  boardScore: { fontSize: 22, fontWeight: "900" },
  histStats: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  histStat: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingVertical: spacing.sm, alignItems: "center" },
  histStatVal: { color: colors.text, fontSize: 18, fontWeight: "900" },
  histStatLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1, marginTop: 2, fontWeight: "700" },
  trendWrap: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.md },
  trendTitle: { color: colors.brandPrimary, letterSpacing: 2, fontSize: 10, fontWeight: "800", marginBottom: spacing.sm },
  histRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, padding: spacing.sm, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.sm },
  histThumb: { width: 46, height: 46, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  histDate: { color: colors.text, fontWeight: "800", letterSpacing: 1 },
  histCats: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  histScore: { fontSize: 22, fontWeight: "900" },
  empty: { color: colors.textDim, textAlign: "center", marginVertical: spacing.lg },
  card: { backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, marginBottom: spacing.lg },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginBottom: spacing.sm },
  cardEmoji: { fontSize: 18 },
  cardName: { color: colors.text, fontWeight: "800", letterSpacing: 1, flex: 1 },
  cardRank: { fontSize: 9, letterSpacing: 2, fontWeight: "800" },
  subImage: { width: "100%", height: 320, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  caption: { color: colors.textMid, marginTop: spacing.sm, lineHeight: 19 },
  critique: { marginTop: spacing.md, padding: spacing.md, backgroundColor: colors.surface3, borderRadius: radius.sm, borderLeftWidth: 3, borderLeftColor: colors.warning },
  overallRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  overallLabel: { color: colors.warning, letterSpacing: 2, fontSize: 10, fontWeight: "800" },
  overall: { fontSize: 30, fontWeight: "900" },
  outOf: { color: colors.textDim, fontSize: 14, fontWeight: "700" },
  catRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: 6 },
  catLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 1, fontWeight: "700", width: 92 },
  catBar: { flex: 1, height: 6, backgroundColor: colors.surface, borderRadius: 3, overflow: "hidden" },
  catFill: { height: "100%" },
  catVal: { width: 32, textAlign: "right", fontWeight: "900", fontSize: 12 },
  notes: { color: colors.text, marginTop: spacing.md, fontStyle: "italic", lineHeight: 20 },
  pending: { color: colors.textDim, marginTop: spacing.md, fontStyle: "italic", lineHeight: 19 },
  commentBtn: { marginTop: spacing.md, paddingVertical: 10, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3, minHeight: 44, justifyContent: "center" },
  commentBtnText: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2, fontSize: 12 },
  modalWrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.85)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface2, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, borderWidth: 1, borderColor: colors.borderStrong, padding: spacing.lg },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  modalTitle: { color: colors.text, fontWeight: "900", letterSpacing: 3, fontSize: 15 },
  verifySub: { color: colors.textDim, marginTop: spacing.sm, marginBottom: spacing.md, lineHeight: 19 },
  modalX: { color: colors.textDim, fontSize: 20, fontWeight: "900" },
  comment: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border },
  commentHead: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  delComment: { marginLeft: "auto", width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.error },
  delCommentText: { color: colors.error, fontSize: 12, fontWeight: "900", lineHeight: 14 },
  commentName: { color: colors.text, fontWeight: "800", fontSize: 13, flex: 1 },
  commentText: { color: colors.textMid, marginTop: 4, lineHeight: 19 },
  commentInputRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, alignItems: "center" },
  commentInput: { flex: 1, backgroundColor: colors.surface3, borderRadius: radius.sm, paddingHorizontal: spacing.md, color: colors.text, borderWidth: 1, borderColor: colors.border, minHeight: 44 },
  commentSend: { paddingHorizontal: spacing.lg, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, alignItems: "center", justifyContent: "center", minHeight: 44 },
  commentSendText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
});
