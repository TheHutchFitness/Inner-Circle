import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, Linking,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";
import { setPendingWorkoutExact } from "@/src/lib/pendingWorkout";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

export default function InPersonRoom() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, user } = useAuth();
  const isAdmin = !!user?.is_admin;

  const [clients, setClients] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(isAdmin ? null : (user?.user_id || null));
  const [thread, setThread] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<any>(null); // {uri,name,type,isImage}
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [schedInput, setSchedInput] = useState("");
  const [showStats, setShowStats] = useState(false);
  const [checkinOpen, setCheckinOpen] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const mediaUrl = (id: string) => `${API}/api/chat/media/${id}?token=${token}`;

  const loadClients = useCallback(async () => {
    try { setClients(await apiFetch(token, "/api/inperson/clients")); } catch {}
  }, [token]);

  const loadThread = useCallback(async (cid: string) => {
    try {
      const t = await apiFetch(token, `/api/inperson/thread/${cid}`);
      setThread(t);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e: any) { setErr(e.message); }
  }, [token]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      if (isAdmin) await loadClients();
      if (selected) await loadThread(selected);
      setLoading(false);
    })();
  }, [isAdmin]);

  // Light polling while a thread is open
  useFocusEffect(useCallback(() => {
    if (!selected) return;
    const iv = setInterval(() => loadThread(selected), 8000);
    return () => clearInterval(iv);
  }, [selected, loadThread]));

  const openClient = async (cid: string) => {
    setSelected(cid);
    setThread(null);
    setLoading(true);
    await loadThread(cid);
    setLoading(false);
  };

  const pickImage = async () => {
    setErr(null);
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = cur.status;
    if (status !== "granted") {
      if (!cur.canAskAgain) { setErr("Enable photo access in Settings to attach images."); return; }
      status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    }
    if (status !== "granted") { setErr("Photo permission needed to attach images."); return; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setPending({ uri: a.uri, name: a.fileName || "image.jpg", type: a.mimeType || "image/jpeg", isImage: true });
  };

  const pickDoc = async () => {
    setErr(null);
    const res = await DocumentPicker.getDocumentAsync({
      type: ["application/pdf", "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/vnd.ms-excel",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "text/plain", "text/csv", "image/*"],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    const isImage = (a.mimeType || "").startsWith("image/");
    setPending({ uri: a.uri, name: a.name || "file", type: a.mimeType || "application/octet-stream", isImage });
  };

  const send = async () => {
    if ((!text.trim() && !pending) || sending || !selected) return;
    setSending(true);
    setErr(null);
    try {
      let media_id: string | null = null;
      if (pending) {
        const form = new FormData();
        if (Platform.OS === "web") {
          const blob = await (await fetch(pending.uri)).blob();
          form.append("file", blob, pending.name);
        } else {
          form.append("file", { uri: pending.uri, name: pending.name, type: pending.type } as any);
        }
        const r = await fetch(`${API}/api/inperson/upload`, {
          method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form,
        });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Upload failed"); }
        media_id = (await r.json()).media_id;
      }
      await apiFetch(token, `/api/inperson/thread/${selected}/message`, {
        method: "POST", body: JSON.stringify({ text: text.trim(), media_id }),
      });
      setText(""); setPending(null);
      await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
    setSending(false);
  };

  const startProgram = async (prog: any) => {
    setPendingWorkoutExact({ name: prog.name, source: "coach", exercises: prog.exercises });
    try { await apiFetch(token, `/api/inperson/programs/${prog.id}/started`, { method: "POST" }); } catch {}
    router.push("/(tabs)/workout");
  };

  const gym = thread?.client?.inperson_gym || "";
  const nextSession = thread?.client?.next_session || "";
  const stats = thread?.client_stats;

  useEffect(() => { setSchedInput(nextSession); }, [nextSession, selected]);

  const saveSchedule = async () => {
    if (!selected) return;
    try {
      await apiFetch(token, `/api/inperson/thread/${selected}/schedule`, {
        method: "POST", body: JSON.stringify({ next_session: schedInput.trim() }),
      });
      await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
  };

  const markAttendance = async () => {
    if (!selected) return;
    try {
      await apiFetch(token, `/api/inperson/thread/${selected}/attendance`, { method: "POST", body: JSON.stringify({}) });
      await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
  };

  const submitCheckin = async (note: string, asset: any) => {
    if (!selected || (!note.trim() && !asset)) { setCheckinOpen(false); return; }
    setErr(null);
    try {
      let media_id: string | null = null;
      if (asset) {
        const form = new FormData();
        if (Platform.OS === "web") {
          const blob = await (await fetch(asset.uri)).blob();
          form.append("file", blob, asset.name || "photo.jpg");
        } else {
          form.append("file", { uri: asset.uri, name: asset.name || "photo.jpg", type: asset.type || "image/jpeg" } as any);
        }
        const r = await fetch(`${API}/api/inperson/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
        if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || "Upload failed"); }
        media_id = (await r.json()).media_id;
      }
      await apiFetch(token, `/api/inperson/thread/${selected}/checkin`, { method: "POST", body: JSON.stringify({ text: note.trim(), media_id }) });
      setCheckinOpen(false);
      await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
  };

  // ---------- ADMIN: client list ----------
  if (isAdmin && !selected) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <Header title="IN-PERSON CLIENTS" subtitle="Private coaching rooms" onBack={() => router.back()} />
        {loading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : (
          <ScrollView contentContainerStyle={{ padding: spacing.lg, paddingBottom: 120 }}>
            {clients.length === 0 ? (
              <Text style={styles.empty}>No in-person clients yet. Mark a member as an in-person client in the Admin Panel.</Text>
            ) : clients.map((c) => (
              <Pressable key={c.user_id} testID={`ip-client-${c.user_id}`} onPress={() => openClient(c.user_id)} style={styles.clientRow}>
                <PlayerAvatar person={c} token={token} size={44} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.clientName}>{c.display_name}</Text>
                  <Text style={styles.clientGym} numberOfLines={1}>
                    {c.inperson_gym ? `🏋 ${c.inperson_gym}` : "No gym set"}
                    {c.last_message ? `  ·  ${c.last_message.kind === "program" ? "📋 " : ""}${(c.last_message.text || "Attachment").slice(0, 26)}` : ""}
                  </Text>
                </View>
                {c.unread > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{c.unread}</Text></View>}
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    );
  }

  // ---------- THREAD (admin viewing a client, or client viewing own) ----------
  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.root, { paddingTop: insets.top }]}>
      {/* Gym watermark background */}
      {!!gym && (
        <View pointerEvents="none" style={styles.watermarkWrap}>
          <Text style={styles.watermark} numberOfLines={2}>{gym.toUpperCase()}</Text>
        </View>
      )}
      <Header
        title={isAdmin ? (thread?.client?.display_name || "CLIENT").toUpperCase() : "MY COACHING ROOM"}
        subtitle={gym ? `🏋 ${gym}` : (isAdmin ? "Private room" : "Chat directly with Coach Hutch")}
        onBack={() => (isAdmin ? (setSelected(null), setThread(null)) : router.back())}
      />

      {loading || !thread ? (
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
      ) : (
        <>
          {/* Next session + coaching context */}
          {(!!nextSession || isAdmin || (stats && (stats.recent?.length || 0) > 0)) && (
            <View style={styles.topPanel}>
              {isAdmin ? (
                <View style={styles.schedRow}>
                  <Text style={styles.schedIcon}>📅</Text>
                  <TextInput
                    testID="ip-sched-input" value={schedInput} onChangeText={setSchedInput}
                    placeholder="Next session (e.g. Sat 9:00 AM)" placeholderTextColor={colors.textDim}
                    style={styles.schedInput}
                  />
                  <Pressable testID="ip-sched-save" onPress={saveSchedule} style={styles.schedBtn}><Text style={styles.schedBtnText}>SET</Text></Pressable>
                </View>
              ) : !!nextSession && (
                <View style={styles.nextBanner}><Text style={styles.nextBannerText}>📅 NEXT SESSION · {nextSession}</Text></View>
              )}

              {isAdmin && (
                <View style={styles.attRow}>
                  <Text style={styles.attCount}>✅ {thread.attendance_count || 0} sessions logged</Text>
                  <Pressable testID="ip-mark-attendance" onPress={markAttendance} style={styles.attBtn}><Text style={styles.attBtnText}>MARK SESSION DONE</Text></Pressable>
                </View>
              )}

              {!isAdmin && thread.checkin_due && (
                <Pressable testID="ip-checkin-open" onPress={() => setCheckinOpen(true)} style={styles.checkinPrompt}>
                  <Text style={styles.checkinPromptText}>📝 LOG THIS WEEK'S CHECK-IN</Text>
                  <Text style={styles.checkinPromptSub}>How's training going? Add a note or progress photo →</Text>
                </Pressable>
              )}

              {isAdmin && stats && (
                <>
                  <Pressable testID="ip-stats-toggle" onPress={() => setShowStats((s) => !s)} style={styles.statsToggle}>
                    <Text style={styles.statsToggleText}>📊 CLIENT PROGRESS {showStats ? "▲" : "▼"}</Text>
                  </Pressable>
                  {showStats && (
                    <View style={styles.statsBox}>
                      <View style={styles.prRow}>
                        {[["BENCH", stats.prs?.bench], ["SQUAT", stats.prs?.squat], ["DEAD", stats.prs?.deadlift], ["OHP", stats.prs?.ohp]].map(([l, v]: any) => (
                          <View key={l} style={styles.prCell}><Text style={styles.prVal}>{v || 0}</Text><Text style={styles.prLbl}>{l}</Text></View>
                        ))}
                      </View>
                      <Text style={styles.statsMeta}>{stats.workouts_logged || 0} workouts · {stats.streak_days || 0}d streak</Text>
                      {(stats.recent || []).length === 0 ? (
                        <Text style={styles.statsEmpty}>No workouts logged yet.</Text>
                      ) : (stats.recent || []).map((w: any, i: number) => (
                        <View key={i} style={styles.recentRow}>
                          <Text style={styles.recentName} numberOfLines={1}>{w.pr ? "🏅 " : ""}{w.name}</Text>
                          <Text style={styles.recentMeta}>{w.sets} sets · {w.volume.toLocaleString()} lb · {new Date(w.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}
            </View>
          )}

          <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, paddingBottom: 20 }}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}>
            {thread.messages.length === 0 && (
              <Text style={styles.empty}>{isAdmin ? "Say hello to your client and share their plan." : "Your coach will message you here."}</Text>
            )}
            {thread.messages.map((m: any) => {
              const mine = m.sender_id === user?.user_id;
              if (m.kind === "system") {
                return <Text key={m.id} style={styles.systemMsg}>{m.text}</Text>;
              }
              if (m.kind === "checkin") {
                return (
                  <View key={m.id} style={styles.checkinCard}>
                    <Text style={styles.checkinEyebrow}>📝 WEEKLY CHECK-IN · {new Date(m.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                    {!!m.media_id && <Image source={{ uri: mediaUrl(m.media_id) }} style={styles.checkinImage} contentFit="cover" />}
                    {!!m.text && <Text style={styles.checkinText}>{m.text}</Text>}
                  </View>
                );
              }
              if (m.kind === "program") {
                const prog = (thread.programs || []).find((p: any) => p.id === m.program_id);
                return (
                  <View key={m.id} style={styles.progCard}>
                    <Text style={styles.progEyebrow}>📋 ASSIGNED WORKOUT</Text>
                    <Text style={styles.progName}>{prog?.name || m.text}</Text>
                    {!!prog?.note && <Text style={styles.progNote}>“{prog.note}”</Text>}
                    {!!prog?.exercises && (
                      <View style={{ marginTop: 6 }}>
                        {prog.exercises.slice(0, 6).map((ex: any, i: number) => (
                          <Text key={i} style={styles.progEx}>• {ex.name} — {ex.sets.length}×{ex.sets[0]?.reps ?? "?"}{ex.sets[0]?.weight_lb ? ` @ ${ex.sets[0].weight_lb}` : ""}</Text>
                        ))}
                      </View>
                    )}
                    {!isAdmin && prog && (
                      <Pressable testID={`ip-start-${prog.id}`} onPress={() => startProgram(prog)} style={styles.startBtn}>
                        <Text style={styles.startBtnText}>▶ START WORKOUT</Text>
                      </Pressable>
                    )}
                  </View>
                );
              }
              return (
                <View key={m.id} style={[styles.bubbleRow, mine ? styles.rowRight : styles.rowLeft]}>
                  <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                    {!!m.media_id && (m.media_type === "image"
                      ? <Image source={{ uri: mediaUrl(m.media_id) }} style={styles.msgImage} contentFit="cover" />
                      : <Pressable testID={`ip-file-${m.id}`} onPress={() => Linking.openURL(mediaUrl(m.media_id))} style={styles.fileChip}>
                          <Text style={styles.fileIcon}>📄</Text>
                          <Text style={styles.fileName} numberOfLines={1}>{m.file_name || "Download file"}</Text>
                        </Pressable>
                    )}
                    {!!m.text && <Text style={[styles.msgText, mine && { color: "#04121a" }]}>{m.text}</Text>}
                  </View>
                </View>
              );
            })}
          </ScrollView>

          {err && <Text style={styles.err}>{err}</Text>}
          {pending && (
            <View style={styles.pendingBar}>
              <Text style={styles.pendingText} numberOfLines={1}>{pending.isImage ? "🖼 " : "📄 "}{pending.name}</Text>
              <Pressable onPress={() => setPending(null)}><Text style={styles.pendingX}>✕</Text></Pressable>
            </View>
          )}

          <View style={[styles.composer, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            {isAdmin && (
              <Pressable testID="ip-assign" onPress={() => setAssignOpen(true)} style={styles.iconBtn}><Text style={styles.iconText}>🏋</Text></Pressable>
            )}
            <Pressable testID="ip-attach-img" onPress={pickImage} style={styles.iconBtn}><Text style={styles.iconText}>🖼</Text></Pressable>
            <Pressable testID="ip-attach-file" onPress={pickDoc} style={styles.iconBtn}><Text style={styles.iconText}>📎</Text></Pressable>
            <TextInput
              testID="ip-input" value={text} onChangeText={setText}
              placeholder="Message…" placeholderTextColor={colors.textDim}
              style={styles.input} multiline
            />
            <Pressable testID="ip-send" onPress={send} disabled={sending} style={styles.sendBtn}>
              <Text style={styles.sendText}>{sending ? "…" : "SEND"}</Text>
            </Pressable>
          </View>
        </>
      )}

      {!isAdmin && (
        <CheckinModal visible={checkinOpen} onClose={() => setCheckinOpen(false)} onSubmit={submitCheckin} />
      )}

      {isAdmin && (
        <AssignModal
          visible={assignOpen}
          onClose={() => setAssignOpen(false)}
          onAssign={async (name, planText, note) => {
            setAssignOpen(false);
            if (!selected) return;
            try {
              await apiFetch(token, `/api/inperson/thread/${selected}/assign`, {
                method: "POST", body: JSON.stringify({ name, plan_text: planText, note }),
              });
              await loadThread(selected);
            } catch (e: any) { setErr(e.message); }
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

function Header({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <View style={styles.header}>
      <Pressable testID="ip-back" onPress={onBack} hitSlop={10} style={styles.backBtn}><Text style={styles.backText}>‹</Text></Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.hTitle} numberOfLines={1}>{title}</Text>
        {!!subtitle && <Text style={styles.hSub} numberOfLines={1}>{subtitle}</Text>}
      </View>
    </View>
  );
}

function CheckinModal({ visible, onClose, onSubmit }: { visible: boolean; onClose: () => void; onSubmit: (note: string, asset: any) => void }) {
  const [note, setNote] = useState("");
  const [asset, setAsset] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (visible) { setNote(""); setAsset(null); setBusy(false); } }, [visible]);
  const pick = async () => {
    const cur = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = cur.status;
    if (status !== "granted") status = (await ImagePicker.requestMediaLibraryPermissionsAsync()).status;
    if (status !== "granted") return;
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    setAsset({ uri: a.uri, name: a.fileName || "photo.jpg", type: a.mimeType || "image/jpeg" });
  };
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>WEEKLY CHECK-IN</Text>
          <Text style={styles.modalHint}>Log how training, diet & recovery went this week for your coach.</Text>
          <TextInput testID="ip-checkin-note" value={note} onChangeText={setNote} placeholder="This week I…" placeholderTextColor={colors.textDim} style={[styles.mInput, { height: 110, textAlignVertical: "top" }]} multiline />
          <Pressable testID="ip-checkin-photo" onPress={pick} style={styles.checkinPhotoBtn}>
            <Text style={styles.checkinPhotoText}>{asset ? "✓ Photo attached — tap to change" : "📷 Add a progress photo (optional)"}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable onPress={onClose} style={[styles.mBtn, styles.mCancel]}><Text style={styles.mCancelText}>CANCEL</Text></Pressable>
            <Pressable testID="ip-checkin-submit" disabled={busy} onPress={() => { setBusy(true); onSubmit(note, asset); }} style={[styles.mBtn, styles.mAssign]}><Text style={styles.mAssignText}>{busy ? "…" : "SUBMIT"}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AssignModal({ visible, onClose, onAssign }: { visible: boolean; onClose: () => void; onAssign: (name: string, planText: string, note: string) => void }) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [note, setNote] = useState("");
  useEffect(() => { if (visible) { setName(""); setPlan(""); setNote(""); } }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>ASSIGN A WORKOUT</Text>
          <Text style={styles.modalHint}>One exercise per line: <Text style={{ color: colors.brandPrimary }}>Name  SETSxREPS @weight</Text>{"\n"}e.g. Back Squat 4x6 @225</Text>
          <TextInput testID="ip-assign-name" value={name} onChangeText={setName} placeholder="Workout name (e.g. Leg Day A)" placeholderTextColor={colors.textDim} style={styles.mInput} />
          <TextInput testID="ip-assign-plan" value={plan} onChangeText={setPlan} placeholder={"Back Squat 4x6 @225\nRomanian Deadlift 3x10 @185\nLeg Press 3x12"} placeholderTextColor={colors.textDim} style={[styles.mInput, { height: 120, textAlignVertical: "top" }]} multiline />
          <TextInput testID="ip-assign-note" value={note} onChangeText={setNote} placeholder="Note to client (optional)" placeholderTextColor={colors.textDim} style={styles.mInput} />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable onPress={onClose} style={[styles.mBtn, styles.mCancel]}><Text style={styles.mCancelText}>CANCEL</Text></Pressable>
            <Pressable testID="ip-assign-submit" onPress={() => onAssign(name.trim() || "Custom Workout", plan, note.trim())} style={[styles.mBtn, styles.mAssign]}><Text style={styles.mAssignText}>ASSIGN</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.surface },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  backText: { color: colors.brandPrimary, fontSize: 30, fontWeight: "900", marginTop: -4 },
  hTitle: { color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 1 },
  hSub: { color: colors.textMid, fontSize: 11, fontWeight: "700", marginTop: 1 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 40, paddingHorizontal: spacing.xl, lineHeight: 20 },
  clientRow: { flexDirection: "row", alignItems: "center", padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, marginBottom: spacing.sm },
  clientName: { color: colors.text, fontWeight: "800", fontSize: 15 },
  clientGym: { color: colors.textMid, fontSize: 11, marginTop: 2 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginRight: 6 },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  chevron: { color: colors.textDim, fontSize: 22 },
  watermarkWrap: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  watermark: { color: colors.brandPrimary, opacity: 0.05, fontSize: 54, fontWeight: "900", letterSpacing: 4, textAlign: "center", transform: [{ rotate: "-18deg" }] },
  topPanel: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border, paddingBottom: spacing.sm },
  schedRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  schedIcon: { fontSize: 16 },
  schedInput: { flex: 1, height: 38, color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, fontSize: 13 },
  schedBtn: { height: 38, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  schedBtnText: { color: "#04121a", fontWeight: "900", fontSize: 12 },
  nextBanner: { paddingVertical: 8, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.08)" },
  nextBannerText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 12, letterSpacing: 0.5, textAlign: "center" },
  statsToggle: { marginTop: spacing.sm, paddingVertical: 6, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  statsToggleText: { color: colors.textMid, fontWeight: "900", fontSize: 11, letterSpacing: 1 },
  statsBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  prRow: { flexDirection: "row", gap: spacing.sm },
  prCell: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.surface3 },
  prVal: { color: colors.text, fontWeight: "900", fontSize: 15, fontVariant: ["tabular-nums"] },
  prLbl: { color: colors.textDim, fontSize: 8, letterSpacing: 1, fontWeight: "800", marginTop: 1 },
  statsMeta: { color: colors.textMid, fontSize: 11, marginTop: 6, marginBottom: 2, fontWeight: "700" },
  statsEmpty: { color: colors.textDim, fontSize: 12, marginTop: 4 },
  recentRow: { paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: colors.border },
  recentName: { color: colors.text, fontWeight: "700", fontSize: 13 },
  recentMeta: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  systemMsg: { color: colors.textDim, fontSize: 11, fontWeight: "700", textAlign: "center", marginVertical: spacing.sm },
  attRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  attCount: { color: colors.success, fontWeight: "800", fontSize: 12 },
  attBtn: { paddingVertical: 7, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(0,229,180,0.1)" },
  attBtnText: { color: colors.success, fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
  checkinPrompt: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1.5, borderColor: colors.success, backgroundColor: "rgba(0,229,180,0.08)" },
  checkinPromptText: { color: colors.success, fontWeight: "900", fontSize: 13, letterSpacing: 0.5 },
  checkinPromptSub: { color: colors.textMid, fontSize: 11, marginTop: 2 },
  checkinCard: { alignSelf: "stretch", backgroundColor: "rgba(0,229,180,0.06)", borderWidth: 1.5, borderColor: colors.success, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  checkinEyebrow: { color: colors.success, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  checkinImage: { width: "100%", height: 200, borderRadius: radius.sm, marginTop: 6 },
  checkinText: { color: colors.text, fontSize: 14, lineHeight: 19, marginTop: 6 },
  checkinPhotoBtn: { paddingVertical: 12, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: "center" },
  checkinPhotoText: { color: colors.brandPrimary, fontWeight: "800", fontSize: 12 },
  bubbleRow: { marginBottom: spacing.sm, flexDirection: "row" },
  rowRight: { justifyContent: "flex-end" },
  rowLeft: { justifyContent: "flex-start" },
  bubble: { maxWidth: "82%", borderRadius: radius.md, padding: spacing.sm, borderWidth: 1 },
  bubbleMine: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  bubbleTheirs: { backgroundColor: colors.surface2, borderColor: colors.border },
  msgText: { color: colors.text, fontSize: 14, lineHeight: 19 },
  msgImage: { width: 200, height: 200, borderRadius: radius.sm, marginBottom: 4 },
  fileChip: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "rgba(0,0,0,0.25)", borderRadius: radius.sm, padding: 8, marginBottom: 4, maxWidth: 220 },
  fileIcon: { fontSize: 20 },
  fileName: { color: colors.text, fontWeight: "700", fontSize: 12, flex: 1, textDecorationLine: "underline" },
  progCard: { alignSelf: "stretch", backgroundColor: "rgba(0,229,255,0.06)", borderWidth: 1.5, borderColor: colors.brandPrimary, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
  progEyebrow: { color: colors.brandPrimary, fontSize: 10, fontWeight: "900", letterSpacing: 1 },
  progName: { color: colors.text, fontSize: 16, fontWeight: "900", marginTop: 2 },
  progNote: { color: colors.textMid, fontStyle: "italic", fontSize: 12, marginTop: 4 },
  progEx: { color: colors.textMid, fontSize: 12, marginTop: 2 },
  startBtn: { marginTop: spacing.sm, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 10, alignItems: "center" },
  startBtnText: { color: "#04121a", fontWeight: "900", letterSpacing: 1 },
  err: { color: colors.error, textAlign: "center", paddingHorizontal: spacing.lg, marginBottom: 4, fontSize: 12 },
  pendingBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingVertical: 6, backgroundColor: colors.surface2, borderTopWidth: 1, borderTopColor: colors.border },
  pendingText: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", flex: 1, marginRight: 8 },
  pendingX: { color: colors.error, fontSize: 16, fontWeight: "900" },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 6, paddingHorizontal: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface },
  iconBtn: { width: 40, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  iconText: { fontSize: 18 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 12, fontSize: 14 },
  sendBtn: { height: 44, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#04121a", fontWeight: "900", letterSpacing: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.brandPrimary },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  modalHint: { color: colors.textDim, fontSize: 12, marginTop: 6, marginBottom: spacing.sm, lineHeight: 18 },
  mInput: { color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, marginBottom: spacing.sm },
  mBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.sm, alignItems: "center" },
  mCancel: { borderWidth: 1, borderColor: colors.border },
  mCancelText: { color: colors.textMid, fontWeight: "800", letterSpacing: 1 },
  mAssign: { backgroundColor: colors.brandPrimary },
  mAssignText: { color: "#04121a", fontWeight: "900", letterSpacing: 1 },
});
