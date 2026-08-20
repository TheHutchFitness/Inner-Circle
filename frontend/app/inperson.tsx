import { useCallback, useEffect, useRef, useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, Pressable, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, Modal, Linking, Dimensions,
} from "react-native";
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing } from "react-native-reanimated";
import { Image } from "expo-image";
import { Calendar } from "react-native-calendars";
import Svg, { Polyline, Circle, Line as SvgLine } from "react-native-svg";
import { captureRef } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { PlayerAvatar } from "@/src/components/PlayerAvatar";
import { BookingModal } from "@/src/components/BookingModal";
import { setPendingWorkoutExact } from "@/src/lib/pendingWorkout";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

function streakTier(n: number) {
  if (n >= 12) return { style: { borderColor: "#FFD700", backgroundColor: "rgba(255,215,0,0.12)" }, textStyle: { color: "#FFD700" }, label: (x: number) => `🏆 ${x}-WEEK STREAK · LEGEND` };
  if (n >= 8) return { style: { borderColor: "#C0C7D1", backgroundColor: "rgba(192,199,209,0.12)" }, textStyle: { color: "#D6DCE6" }, label: (x: number) => `🥈 ${x}-WEEK STREAK · ELITE` };
  if (n >= 4) return { style: { borderColor: "#CD7F32", backgroundColor: "rgba(205,127,50,0.14)" }, textStyle: { color: "#E39A5C" }, label: (x: number) => `🥉 ${x}-WEEK STREAK · LOCKED IN` };
  return { style: {}, textStyle: {}, label: (x: number) => `🔥 ${x} WEEK CHECK-IN STREAK` };
}

const CONFETTI_COLORS = ["#00E5FF", "#FFD700", "#FF7A1A", "#00E5B4", "#FF4D6D", "#B388FF"];
function ConfettiPiece({ index }: { index: number }) {
  const p = useSharedValue(0);
  const { width, height } = Dimensions.get("window");
  const startX = Math.random() * width;
  const drift = (Math.random() - 0.5) * 100;
  const delay = Math.random() * 500;
  const size = 6 + Math.random() * 7;
  const rot = Math.random() * 360;
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  useEffect(() => {
    p.value = withDelay(delay, withTiming(1, { duration: 2600 + Math.random() * 900, easing: Easing.linear }));
  }, []);
  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: startX + drift * p.value },
      { translateY: -30 + (height + 80) * p.value },
      { rotate: `${rot + p.value * 540}deg` },
    ],
    opacity: 1 - Math.max(0, p.value - 0.85) * 6.5,
  }));
  return <Animated.View style={[{ position: "absolute", top: 0, left: 0, width: size, height: size * 0.5, backgroundColor: color, borderRadius: 1 }, style]} />;
}
function Confetti() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: 70 }).map((_, i) => <ConfettiPiece key={i} index={i} />)}
    </View>
  );
}

function MetricsChart({ data }: { data: any[] }) {
  const pts = (data || []).filter((d) => typeof d.weight === "number");
  if (pts.length < 2) return null;
  const W = 300, H = 84, PAD = 8;
  const ws = pts.map((p) => p.weight as number);
  const min = Math.min(...ws), max = Math.max(...ws);
  const span = max - min || 1;
  const xy = pts.map((p, i) => {
    const x = PAD + (i * (W - PAD * 2)) / (pts.length - 1);
    const y = PAD + (1 - ((p.weight as number) - min) / span) * (H - PAD * 2);
    return { x, y };
  });
  const poly = xy.map((p) => `${p.x},${p.y}`).join(" ");
  return (
    <View style={{ marginBottom: spacing.sm }}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        <SvgLine x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke={colors.border} strokeWidth={1} />
        <Polyline points={poly} fill="none" stroke={colors.brandPrimary} strokeWidth={2.5} strokeLinejoin="round" />
        {xy.map((p, i) => (<Circle key={i} cx={p.x} cy={p.y} r={3.5} fill={colors.brandPrimary} />))}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.chartAxis}>{min} lb</Text>
        <Text style={styles.chartAxis}>{max} lb</Text>
      </View>
    </View>
  );
}

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
  const [templates, setTemplates] = useState<any[]>([]);
  const [notesInput, setNotesInput] = useState("");
  const [goalInput, setGoalInput] = useState("");
  const [goalPct, setGoalPct] = useState(0);
  const [nudgeMsg, setNudgeMsg] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const celebratedRef = useRef(0);
  const shareCardRef = useRef(null);

  const shareStreak = async () => {
    try {
      const uri = await captureRef(shareCardRef, { format: "png", quality: 0.95 });
      const ok = await Sharing.isAvailableAsync().catch(() => false);
      if (ok) await Sharing.shareAsync(uri, { dialogTitle: "Share your streak" });
      else setErr("Sharing isn't available here — try on your phone.");
    } catch {
      setErr("Couldn't create the share image.");
    }
  };
  const [attOpen, setAttOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [bookings, setBookings] = useState<any[]>([]);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [rescheduleId, setRescheduleId] = useState<string | null>(null);
  const [apprNote, setApprNote] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);

  const mediaUrl = (id: string) => `${API}/api/chat/media/${id}?token=${token}`;

  const loadClients = useCallback(async () => {
    try { setClients(await apiFetch(token, "/api/inperson/clients")); } catch {}
  }, [token]);

  const nudgeAll = async () => {
    try {
      const r = await apiFetch(token, "/api/inperson/nudge", { method: "POST", body: JSON.stringify({}) });
      setNudgeMsg(`🔔 Nudged ${r.nudged} client${r.nudged === 1 ? "" : "s"}`);
      setTimeout(() => setNudgeMsg(null), 2500);
      await loadClients();
    } catch (e: any) { setNudgeMsg(e.message); }
  };

  const loadThread = useCallback(async (cid: string) => {
    try {
      const t = await apiFetch(token, `/api/inperson/thread/${cid}`);
      setThread(t);
      try {
        const q = isAdmin ? `?client_id=${cid}` : "";
        setBookings((await apiFetch(token, `/api/inperson/bookings${q}`)).bookings || []);
      } catch {}
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150);
    } catch (e: any) { setErr(e.message); }
  }, [token, isAdmin]);

  const decideBooking = async (id: string, action: "approve" | "decline" | "accept", note?: string) => {
    try {
      const opts: any = { method: "POST" };
      if (action === "approve") opts.body = JSON.stringify({ note: note || "" });
      await apiFetch(token, `/api/inperson/booking/${id}/${action}`, opts);
      if (selected) await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
  };

  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      if (isAdmin) await loadClients();
      if (selected) await loadThread(selected);
      setLoading(false);
    })();
  }, [isAdmin, token, selected]);

  // For a client, lock onto their own thread once auth has hydrated.
  useEffect(() => {
    if (!isAdmin && user?.user_id && !selected) setSelected(user.user_id);
  }, [isAdmin, user?.user_id]);

  // Light polling while a thread is open
  useFocusEffect(useCallback(() => {
    if (!selected) return;
    const iv = setInterval(() => loadThread(selected), 8000);
    return () => clearInterval(iv);
  }, [selected, loadThread]));

  const openClient = (cid: string) => {
    setSelected(cid);
    setThread(null);
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

  const openAssign = async () => {
    setAssignOpen(true);
    try { setTemplates(await apiFetch(token, "/api/inperson/templates")); } catch {}
  };
  const assignPayload = async (body: any) => {
    if (!selected) return;
    try {
      await apiFetch(token, `/api/inperson/thread/${selected}/assign`, { method: "POST", body: JSON.stringify(body) });
      setAssignOpen(false);
      await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
  };

  useEffect(() => { setSchedInput(nextSession); }, [nextSession, selected]);
  useEffect(() => { setNotesInput(thread?.coach_notes || ""); }, [thread?.coach_notes, selected]);
  useEffect(() => { setGoalInput(thread?.goal || ""); }, [thread?.goal, selected]);
  useEffect(() => { setGoalPct(thread?.goal_progress || 0); }, [thread?.goal_progress, selected]);

  // Celebrate a freshly-reached streak milestone with confetti (client, once)
  useEffect(() => {
    const ms = thread?.milestone_celebrate || 0;
    if (ms > 0 && celebratedRef.current !== ms) {
      celebratedRef.current = ms;
      setShowConfetti(true);
      apiFetch(token, "/api/inperson/milestone-seen", { method: "POST" }).catch(() => {});
      setTimeout(() => setShowConfetti(false), 3600);
    }
  }, [thread?.milestone_celebrate, token]);

  const saveGoalProgress = async (pct: number) => {
    if (!selected) return;
    const v = Math.max(0, Math.min(100, pct));
    setGoalPct(v);
    try { await apiFetch(token, `/api/inperson/thread/${selected}/notes`, { method: "POST", body: JSON.stringify({ goal_progress: v }) }); } catch (e: any) { setErr(e.message); }
  };

  const saveSchedule = async () => {
    if (!selected) return;
    try {
      await apiFetch(token, `/api/inperson/thread/${selected}/schedule`, {
        method: "POST", body: JSON.stringify({ next_session: schedInput.trim() }),
      });
      await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
  };

  const markAttendance = async (note: string) => {
    if (!selected) return;
    setAttOpen(false);
    try {
      await apiFetch(token, `/api/inperson/thread/${selected}/attendance`, { method: "POST", body: JSON.stringify({ note }) });
      await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
  };

  const saveNotes = async () => {
    if (!selected) return;
    try {
      await apiFetch(token, `/api/inperson/thread/${selected}/notes`, { method: "POST", body: JSON.stringify({ notes: notesInput, goal: goalInput }) });
      setNotesSaved(true);
      setTimeout(() => setNotesSaved(false), 1800);
      await loadThread(selected);
    } catch (e: any) { setErr(e.message); }
  };

  const submitCheckin = async (note: string, asset: any, metrics: any) => {
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
      await apiFetch(token, `/api/inperson/thread/${selected}/checkin`, { method: "POST", body: JSON.stringify({ text: note.trim(), media_id, metrics }) });
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
            {clients.some((c) => c.checkin_due) && (
              <Pressable testID="ip-nudge-all" onPress={nudgeAll} style={styles.nudgeBtn}>
                <Text style={styles.nudgeBtnText}>🔔 NUDGE {clients.filter((c) => c.checkin_due).length} OVERDUE CLIENT{clients.filter((c) => c.checkin_due).length === 1 ? "" : "S"}</Text>
              </Pressable>
            )}
            {nudgeMsg && <Text style={styles.nudgeMsg}>{nudgeMsg}</Text>}
            {clients.length === 0 ? (
              <Text style={styles.empty}>No in-person clients yet. Mark a member as an in-person client in the Admin Panel.</Text>
            ) : clients.map((c) => (
              <Pressable key={c.user_id} testID={`ip-client-${c.user_id}`} onPress={() => openClient(c.user_id)} style={styles.clientRow}>
                <PlayerAvatar person={c} token={token} size={44} />
                <View style={{ flex: 1, marginLeft: spacing.md }}>
                  <Text style={styles.clientName}>{c.display_name}</Text>
                  <Text style={styles.clientGym} numberOfLines={1}>
                    {c.inperson_gym ? `🏋 ${c.inperson_gym}` : "No gym set"}
                    {c.last_message ? `  ·  ${c.last_message.kind === "program" ? "📋 " : ""}${(c.last_message.text || "Attachment").slice(0, 22)}` : ""}
                  </Text>
                  <View style={styles.clientMetaRow}>
                    <Text style={styles.monthChip}>📅 {c.sessions_this_month || 0} this month</Text>
                    {(c.checkin_streak || 0) > 0 && <Text style={styles.streakMini}>🔥 {c.checkin_streak}w</Text>}
                    {c.checkin_due && <Text style={styles.dueChip}>⚠ CHECK-IN DUE</Text>}
                    {(c.pending_requests || 0) > 0 && <Text style={styles.reqChip}>📅 {c.pending_requests} REQUEST{c.pending_requests === 1 ? "" : "S"}</Text>}
                  </View>
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
          {showConfetti && <Confetti />}
          {!!thread.goal && (
            <View style={styles.goalBanner}>
              <Text style={styles.goalBannerText} numberOfLines={2}>🎯 GOAL · {thread.goal}</Text>
              <View style={styles.goalBarTrack}><View style={[styles.goalBarFill, { width: `${goalPct}%` }]} /></View>
              <View style={styles.goalPctRow}>
                {isAdmin && <Pressable testID="goal-minus" onPress={() => saveGoalProgress(goalPct - 5)} hitSlop={8} style={styles.goalStep}><Text style={styles.goalStepText}>−</Text></Pressable>}
                <Text style={styles.goalPctText}>{goalPct}% there</Text>
                {isAdmin && <Pressable testID="goal-plus" onPress={() => saveGoalProgress(goalPct + 5)} hitSlop={8} style={styles.goalStep}><Text style={styles.goalStepText}>+</Text></Pressable>}
              </View>
            </View>
          )}
          {/* SESSIONS — booking calendar + requests */}
          <View style={styles.sessionsBox}>
            <Text style={styles.photoLabel}>📅 SESSIONS</Text>
            <Calendar
              testID="ip-sessions-calendar"
              markedDates={bookings.filter((b) => b.status === "approved").reduce((acc: any, b: any) => { acc[b.date] = { marked: true, selected: true, selectedColor: colors.success }; return acc; }, {})}
              theme={{
                calendarBackground: colors.surface2, dayTextColor: colors.text, monthTextColor: colors.text,
                textSectionTitleColor: colors.textDim, todayTextColor: colors.brandPrimary,
                selectedDayBackgroundColor: colors.success, selectedDayTextColor: "#001a10",
                arrowColor: colors.brandPrimary, textDisabledColor: colors.textDim,
              }}
              style={styles.sessionsCal}
            />
            {!isAdmin && (
              <Pressable testID="ip-request-session" onPress={() => { setRescheduleId(null); setBookingOpen(true); }} style={styles.sessionReqBtn}>
                <Text style={styles.sessionReqText}>📅 REQUEST A SESSION</Text>
              </Pressable>
            )}
            {isAdmin && bookings.filter((b) => b.status === "pending").length > 0 && (
              <View style={{ marginTop: spacing.sm }}>
                <Text style={styles.pendingLabel}>PENDING REQUESTS</Text>
                {bookings.filter((b) => b.status === "pending").map((b) => (
                  <View key={b.id} style={styles.pendingCol}>
                    <View style={styles.pendingTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.pendingDate}>{b.date} · {b.time}</Text>
                        {!!b.note && <Text style={styles.pendingNote} numberOfLines={1}>{b.note}</Text>}
                      </View>
                      <Pressable testID={`ip-approve-${b.id}`} onPress={() => decideBooking(b.id, "approve", apprNote[b.id])} style={styles.apprBtn}><Text style={styles.apprText}>APPROVE</Text></Pressable>
                      <Pressable testID={`ip-decline-${b.id}`} onPress={() => decideBooking(b.id, "decline")} style={styles.declBtn}><Text style={styles.declText}>✕</Text></Pressable>
                    </View>
                    <TextInput
                      testID={`ip-approve-note-${b.id}`}
                      value={apprNote[b.id] || ""}
                      onChangeText={(t) => setApprNote((s) => ({ ...s, [b.id]: t }))}
                      placeholder="Optional note on approve (e.g. bring your belt)"
                      placeholderTextColor={colors.textDim}
                      style={styles.apprNoteInput}
                    />
                  </View>
                ))}
              </View>
            )}
            {/* Client's own pending requests / coach proposals */}
            {!isAdmin && bookings.filter((b) => b.status === "pending").length > 0 && (
              <View style={{ marginTop: spacing.sm }}>
                {bookings.filter((b) => b.status === "pending").map((b) => (
                  <View key={b.id} style={styles.pendingRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingDate}>{b.date} · {b.time}</Text>
                      <Text style={styles.pendingNote}>{b.proposed_by === "coach" ? "Coach proposed a new time" : "Awaiting coach approval"}</Text>
                    </View>
                    {b.proposed_by === "coach" && (
                      <Pressable testID={`ip-accept-${b.id}`} onPress={() => decideBooking(b.id, "accept")} style={styles.apprBtn}><Text style={styles.apprText}>ACCEPT</Text></Pressable>
                    )}
                  </View>
                ))}
              </View>
            )}
            {bookings.filter((b) => b.status === "approved").length > 0 && (
              <View style={{ marginTop: spacing.sm }}>
                {bookings.filter((b) => b.status === "approved").map((b) => (
                  <Pressable
                    key={b.id}
                    testID={`ip-booking-${b.id}`}
                    onPress={() => { setRescheduleId(b.id); setBookingOpen(true); }}
                    style={styles.apprvRow}
                  >
                    <Text style={styles.apprvText}>✓ CONFIRMED · {b.date} at {b.time}  ·  {isAdmin ? "tap to propose new time" : "tap to reschedule"}</Text>
                    {!!b.coach_note && <Text style={styles.coachNoteText}>📝 Coach: {b.coach_note}</Text>}
                  </Pressable>
                ))}
              </View>
            )}
          </View>
          {/* Next session + coaching context */}
          {(!!nextSession || isAdmin || (thread.checkin_streak || 0) > 0 || (thread.checkin_photos?.length || 0) > 0 || (thread.metrics_timeline?.length || 0) > 0 || (thread.attendance?.length || 0) > 0) && (
            <View style={styles.topPanel}>
              {(thread.checkin_streak || 0) > 0 && (
                <View style={[styles.streakChip, streakTier(thread.checkin_streak).style]}>
                  <Text style={[styles.streakText, streakTier(thread.checkin_streak).textStyle]}>{streakTier(thread.checkin_streak).label(thread.checkin_streak)}</Text>
                </View>
              )}

              {!isAdmin && (thread.checkin_streak || 0) > 0 && (
                <View style={styles.shareWrap}>
                  <View ref={shareCardRef} collapsable={false} style={styles.shareCard}>
                    <Text style={styles.shareBrand}>HUTCH'S INNER CIRCLE</Text>
                    <Text style={styles.shareStreakBig}>🔥 {thread.checkin_streak}</Text>
                    <Text style={styles.shareWeek}>WEEK CHECK-IN STREAK</Text>
                    <Text style={styles.shareTierLine}>{streakTier(thread.checkin_streak).label(thread.checkin_streak)}</Text>
                    {!!gym && <Text style={styles.shareGymLine}>📍 {gym}</Text>}
                    <Text style={styles.shareFooter}>Coached by @the9hutch</Text>
                  </View>
                  <Pressable testID="ip-share-streak" onPress={shareStreak} style={styles.shareBtn}><Text style={styles.shareBtnText}>📢 SHARE TO STORY</Text></Pressable>
                </View>
              )}
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
                <View style={styles.notesCard}>
                  <Text style={styles.notesLabel}>🔒 COACH NOTES · private (injuries, form cues){notesSaved ? "  · saved ✓" : ""}</Text>
                  <TextInput
                    testID="ip-goal-input" value={goalInput} onChangeText={setGoalInput}
                    placeholder="🎯 Top goal (shown to client, e.g. 315 bench by Q3)"
                    placeholderTextColor={colors.textDim}
                    style={styles.goalInput}
                  />
                  <TextInput
                    testID="ip-notes-input" value={notesInput} onChangeText={setNotesInput}
                    placeholder="Private notes: e.g. Right shoulder impingement — avoid overhead."
                    placeholderTextColor={colors.textDim} multiline
                    style={styles.notesInput}
                  />
                  <Pressable testID="ip-notes-save" onPress={saveNotes} style={styles.notesBtn}><Text style={styles.notesBtnText}>SAVE</Text></Pressable>
                </View>
              )}

              {/* Body-metrics timeline (both roles) */}
              {(thread.metrics_timeline?.length || 0) > 0 && (
                <View style={styles.metricsBox}>
                  <Text style={styles.photoLabel}>📈 BODY METRICS</Text>
                  <MetricsChart data={thread.metrics_timeline} />
                  {thread.metrics_timeline.map((m: any, i: number) => {
                    const prev = i > 0 ? thread.metrics_timeline[i - 1].weight : null;
                    const delta = (m.weight != null && prev != null) ? Math.round((m.weight - prev) * 10) / 10 : null;
                    return (
                      <View key={i} style={styles.recentRow}>
                        <Text style={styles.recentName}>{new Date(m.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                        <Text style={styles.recentMeta}>
                          {m.weight != null ? `${m.weight} lb` : "—"}
                          {delta != null && delta !== 0 ? `  (${delta > 0 ? "+" : ""}${delta})` : ""}
                          {m.waist != null ? `  · waist ${m.waist}"` : ""}
                          {m.arms != null ? `  · arms ${m.arms}"` : ""}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* Progress photos timeline (both roles) */}
              {(thread.checkin_photos?.length || 0) > 0 && (
                <View style={styles.photoStrip}>
                  <Text style={styles.photoLabel}>📸 PROGRESS PHOTOS · before → now</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    {thread.checkin_photos.map((p: any, i: number) => (
                      <Pressable key={p.media_id} testID={`ip-photo-${i}`} onPress={() => Linking.openURL(mediaUrl(p.media_id))} style={styles.photoItem}>
                        <Image source={{ uri: mediaUrl(p.media_id) }} style={styles.photoThumb} contentFit="cover" />
                        <Text style={styles.photoDate}>{new Date(p.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {isAdmin && (
                <View style={styles.attRow}>
                  <Text style={styles.attCount}>✅ {thread.attendance_count || 0} total · 📅 {thread.sessions_this_month || 0} this month</Text>
                  <Pressable testID="ip-mark-attendance" onPress={() => setAttOpen(true)} style={styles.attBtn}><Text style={styles.attBtnText}>MARK SESSION DONE</Text></Pressable>
                </View>
              )}

              {!isAdmin && thread.checkin_due && (
                <Pressable testID="ip-checkin-open" onPress={() => setCheckinOpen(true)} style={styles.checkinPrompt}>
                  <Text style={styles.checkinPromptText}>📝 LOG THIS WEEK'S CHECK-IN</Text>
                  <Text style={styles.checkinPromptSub}>How's training going? Add a note or progress photo →</Text>
                </Pressable>
              )}

              {isAdmin && (thread.attendance?.length || 0) > 0 && (
                <>
                  <Pressable testID="ip-log-toggle" onPress={() => setShowLog((s) => !s)} style={styles.statsToggle}>
                    <Text style={styles.statsToggleText}>📋 SESSION LOG ({thread.attendance.length}) {showLog ? "▲" : "▼"}</Text>
                  </Pressable>
                  {showLog && (
                    <View style={styles.statsBox}>
                      {thread.attendance.map((a: any, i: number) => (
                        <View key={i} style={styles.recentRow}>
                          <Text style={styles.recentName}>{new Date(a.date).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}</Text>
                          <Text style={styles.recentMeta}>{a.note || "Session completed"}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}

              {!isAdmin && (thread.attendance?.length || 0) > 0 && (
                <>
                  <Pressable testID="ip-history-toggle" onPress={() => setShowLog((s) => !s)} style={styles.statsToggle}>
                    <Text style={styles.statsToggleText}>📋 SESSION HISTORY · {thread.attendance_total || thread.attendance.length} TOTAL {showLog ? "▲" : "▼"}</Text>
                  </Pressable>
                  {showLog && (
                    <View style={styles.statsBox}>
                      {thread.attendance.map((a: any, i: number) => (
                        <View key={i} style={styles.histRow}>
                          <View style={styles.histNumWrap}><Text style={styles.histNum}>#{(thread.attendance_total || thread.attendance.length) - i}</Text></View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.recentName}>{new Date(a.date).toLocaleDateString(undefined, { weekday: "short", month: "long", day: "numeric", year: "numeric" })}</Text>
                            <Text style={styles.recentMeta}>{a.note || "Session completed ✓"}</Text>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </>
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
                if ((m.text || "").startsWith("🎉")) {
                  return (
                    <View key={m.id} style={styles.milestoneCard}>
                      <Text style={styles.milestoneText}>{m.text}</Text>
                    </View>
                  );
                }
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

          <View style={[styles.composerWrap, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            <View style={styles.composer}>
              {isAdmin && (
                <Pressable testID="ip-assign" onPress={openAssign} style={styles.iconBtn}><Text style={styles.iconText}>🏋</Text></Pressable>
              )}
              <Pressable testID="ip-attach-img" onPress={pickImage} style={styles.iconBtn}><Text style={styles.iconText}>🖼</Text></Pressable>
              <Pressable testID="ip-attach-file" onPress={pickDoc} style={styles.iconBtn}><Text style={styles.iconText}>📎</Text></Pressable>
              <TextInput
                testID="ip-input" value={text} onChangeText={setText}
                placeholder="Message…" placeholderTextColor={colors.textDim}
                style={styles.input} multiline
              />
              <Pressable testID="ip-send" onPress={send} disabled={sending} style={styles.sendCircle}>
                <Text style={styles.sendArrow}>{sending ? "…" : "➤"}</Text>
              </Pressable>
            </View>
          </View>
        </>
      )}

      {!isAdmin && (
        <CheckinModal visible={checkinOpen} onClose={() => setCheckinOpen(false)} onSubmit={submitCheckin} />
      )}

      {isAdmin && (
        <AttendanceModal visible={attOpen} onClose={() => setAttOpen(false)} onSubmit={markAttendance} />
      )}

      {isAdmin && (
        <AssignModal
          visible={assignOpen}
          onClose={() => setAssignOpen(false)}
          templates={templates}
          onAssignTemplate={(tpl) => assignPayload({ name: tpl.name, note: tpl.note, exercises: tpl.exercises })}
          onDeleteTemplate={async (id) => { try { await apiFetch(token, `/api/inperson/templates/${id}`, { method: "DELETE" }); setTemplates((t) => t.filter((x) => x.id !== id)); } catch {} }}
          onAssign={(name, planText, note, saveTpl) => assignPayload({ name, plan_text: planText, note, save_as_template: saveTpl })}
        />
      )}
      <BookingModal visible={bookingOpen} onClose={() => setBookingOpen(false)} onBooked={() => selected && loadThread(selected)} rescheduleId={rescheduleId} />
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

function AttendanceModal({ visible, onClose, onSubmit }: { visible: boolean; onClose: () => void; onSubmit: (note: string) => void }) {
  const [note, setNote] = useState("");
  useEffect(() => { if (visible) setNote(""); }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>MARK SESSION COMPLETE</Text>
          <Text style={styles.modalHint}>Add a focus/goal for this session to build the training log.</Text>
          <TextInput testID="ip-att-note" value={note} onChangeText={setNote} placeholder="e.g. Heavy squats — felt strong, add 5lb next week" placeholderTextColor={colors.textDim} style={[styles.mInput, { height: 90, textAlignVertical: "top" }]} multiline />
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable onPress={onClose} style={[styles.mBtn, styles.mCancel]}><Text style={styles.mCancelText}>CANCEL</Text></Pressable>
            <Pressable testID="ip-att-submit" onPress={() => onSubmit(note.trim())} style={[styles.mBtn, styles.mAssign]}><Text style={styles.mAssignText}>LOG SESSION</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function CheckinModal({ visible, onClose, onSubmit }: { visible: boolean; onClose: () => void; onSubmit: (note: string, asset: any, metrics: any) => void }) {
  const [note, setNote] = useState("");
  const [asset, setAsset] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [weight, setWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [arms, setArms] = useState("");
  useEffect(() => { if (visible) { setNote(""); setAsset(null); setBusy(false); setWeight(""); setWaist(""); setArms(""); } }, [visible]);
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
          <TextInput testID="ip-checkin-note" value={note} onChangeText={setNote} placeholder="This week I…" placeholderTextColor={colors.textDim} style={[styles.mInput, { height: 90, textAlignVertical: "top" }]} multiline />
          <Text style={styles.metricsRowLabel}>BODY METRICS (optional)</Text>
          <View style={styles.metricsInputRow}>
            <View style={styles.metricField}><TextInput testID="ip-checkin-weight" value={weight} onChangeText={(t) => setWeight(t.replace(/[^0-9.]/g, ""))} placeholder="0" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" style={styles.metricInput} /><Text style={styles.metricUnit}>lb</Text></View>
            <View style={styles.metricField}><TextInput testID="ip-checkin-waist" value={waist} onChangeText={(t) => setWaist(t.replace(/[^0-9.]/g, ""))} placeholder="0" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" style={styles.metricInput} /><Text style={styles.metricUnit}>waist"</Text></View>
            <View style={styles.metricField}><TextInput testID="ip-checkin-arms" value={arms} onChangeText={(t) => setArms(t.replace(/[^0-9.]/g, ""))} placeholder="0" placeholderTextColor={colors.textDim} keyboardType="decimal-pad" style={styles.metricInput} /><Text style={styles.metricUnit}>arms"</Text></View>
          </View>
          <Pressable testID="ip-checkin-photo" onPress={pick} style={styles.checkinPhotoBtn}>
            <Text style={styles.checkinPhotoText}>{asset ? "✓ Photo attached — tap to change" : "📷 Add a progress photo (optional)"}</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable onPress={onClose} style={[styles.mBtn, styles.mCancel]}><Text style={styles.mCancelText}>CANCEL</Text></Pressable>
            <Pressable testID="ip-checkin-submit" disabled={busy} onPress={() => { setBusy(true); onSubmit(note, asset, { weight, waist, arms }); }} style={[styles.mBtn, styles.mAssign]}><Text style={styles.mAssignText}>{busy ? "…" : "SUBMIT"}</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AssignModal({ visible, onClose, onAssign, templates, onAssignTemplate, onDeleteTemplate }: {
  visible: boolean; onClose: () => void;
  onAssign: (name: string, planText: string, note: string, saveTpl: boolean) => void;
  templates: any[]; onAssignTemplate: (tpl: any) => void; onDeleteTemplate: (id: string) => void;
}) {
  const [name, setName] = useState("");
  const [plan, setPlan] = useState("");
  const [note, setNote] = useState("");
  const [saveTpl, setSaveTpl] = useState(false);
  useEffect(() => { if (visible) { setName(""); setPlan(""); setNote(""); setSaveTpl(false); } }, [visible]);
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalBg}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>ASSIGN A WORKOUT</Text>
          {templates.length > 0 && (
            <>
              <Text style={styles.tplLabel}>SAVED TEMPLATES · tap to assign</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
                {templates.map((t) => (
                  <Pressable key={t.id} testID={`ip-tpl-${t.id}`} onPress={() => onAssignTemplate(t)} onLongPress={() => onDeleteTemplate(t.id)} style={styles.tplChip}>
                    <Text style={styles.tplChipText}>{t.name}</Text>
                    <Text style={styles.tplChipSub}>{t.exercises?.length || 0} exercises · hold to delete</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </>
          )}
          <Text style={styles.modalHint}>Or build one — one exercise per line: <Text style={{ color: colors.brandPrimary }}>Name  SETSxREPS @weight</Text>{"\n"}e.g. Back Squat 4x6 @225</Text>
          <TextInput testID="ip-assign-name" value={name} onChangeText={setName} placeholder="Workout name (e.g. Leg Day A)" placeholderTextColor={colors.textDim} style={styles.mInput} />
          <TextInput testID="ip-assign-plan" value={plan} onChangeText={setPlan} placeholder={"Back Squat 4x6 @225\nRomanian Deadlift 3x10 @185\nLeg Press 3x12"} placeholderTextColor={colors.textDim} style={[styles.mInput, { height: 110, textAlignVertical: "top" }]} multiline />
          <TextInput testID="ip-assign-note" value={note} onChangeText={setNote} placeholder="Note to client (optional)" placeholderTextColor={colors.textDim} style={styles.mInput} />
          <Pressable testID="ip-assign-savetpl" onPress={() => setSaveTpl((s) => !s)} style={styles.tplToggle}>
            <View style={[styles.checkbox, saveTpl && styles.checkboxOn]}>{saveTpl && <Text style={styles.checkboxTick}>✓</Text>}</View>
            <Text style={styles.tplToggleText}>💾 Save as a reusable template</Text>
          </Pressable>
          <View style={{ flexDirection: "row", gap: spacing.sm, marginTop: spacing.sm }}>
            <Pressable onPress={onClose} style={[styles.mBtn, styles.mCancel]}><Text style={styles.mCancelText}>CANCEL</Text></Pressable>
            <Pressable testID="ip-assign-submit" onPress={() => onAssign(name.trim() || "Custom Workout", plan, note.trim(), saveTpl)} style={[styles.mBtn, styles.mAssign]}><Text style={styles.mAssignText}>ASSIGN</Text></Pressable>
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
  clientMetaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  monthChip: { color: colors.textMid, fontSize: 10, fontWeight: "800" },
  dueChip: { color: colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.5, borderWidth: 1, borderColor: colors.warning, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: "rgba(255,214,0,0.08)" },
  reqChip: { color: colors.error, fontSize: 10, fontWeight: "900", letterSpacing: 0.5, borderWidth: 1, borderColor: colors.error, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2, backgroundColor: "rgba(255,60,80,0.1)" },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.error, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, marginRight: 6 },
  badgeText: { color: "#fff", fontWeight: "900", fontSize: 11 },
  chevron: { color: colors.textDim, fontSize: 22 },
  nudgeBtn: { padding: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.warning, backgroundColor: "rgba(255,214,0,0.08)", alignItems: "center", marginBottom: spacing.sm },
  nudgeBtnText: { color: colors.warning, fontWeight: "900", letterSpacing: 0.5, fontSize: 13 },
  nudgeMsg: { color: colors.success, textAlign: "center", fontWeight: "800", marginBottom: spacing.sm },
  goalBanner: { marginHorizontal: spacing.lg, marginTop: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.md, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.10)" },
  goalBannerText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 13, letterSpacing: 0.3 },
  goalBarTrack: { height: 8, borderRadius: 4, backgroundColor: colors.surface3, marginTop: 8, overflow: "hidden" },
  goalBarFill: { height: 8, borderRadius: 4, backgroundColor: colors.brandPrimary },
  goalPctRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.md, marginTop: 6 },
  goalStep: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface2 },
  goalStepText: { color: colors.brandPrimary, fontSize: 20, fontWeight: "900", marginTop: -2 },
  goalPctText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 12, minWidth: 70, textAlign: "center" },
  streakChip: { alignSelf: "flex-start", flexDirection: "row", paddingVertical: 5, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, borderColor: "#FF7A1A", backgroundColor: "rgba(255,122,26,0.10)", marginBottom: spacing.sm },
  streakText: { color: "#FF9A4A", fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
  streakMini: { color: "#FF9A4A", fontSize: 10, fontWeight: "900" },
  shareWrap: { marginBottom: spacing.sm, alignItems: "center" },
  shareCard: { width: "100%", borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.brandPrimary, backgroundColor: "#0A0E14", paddingVertical: spacing.lg, alignItems: "center", overflow: "hidden" },
  shareBrand: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2, fontSize: 12 },
  shareStreakBig: { color: "#FF9A4A", fontWeight: "900", fontSize: 52, marginTop: 4 },
  shareWeek: { color: colors.text, fontWeight: "900", letterSpacing: 2, fontSize: 13, marginTop: -4 },
  shareTierLine: { color: "#FFD700", fontWeight: "900", fontSize: 12, marginTop: 8, letterSpacing: 0.5 },
  shareGymLine: { color: colors.textMid, fontSize: 12, marginTop: 4, fontWeight: "700" },
  shareFooter: { color: colors.textDim, fontSize: 10, marginTop: 8, letterSpacing: 1 },
  shareBtn: { marginTop: spacing.sm, alignSelf: "stretch", paddingVertical: 11, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center" },
  shareBtnText: { color: "#04121a", fontWeight: "900", letterSpacing: 1 },
  milestoneCard: { alignSelf: "center", marginVertical: spacing.sm, paddingVertical: 10, paddingHorizontal: spacing.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: "#FFD700", backgroundColor: "rgba(255,215,0,0.12)" },
  milestoneText: { color: "#FFD700", fontWeight: "900", fontSize: 12, letterSpacing: 0.3, textAlign: "center" },
  chartAxis: { color: colors.textDim, fontSize: 9, fontWeight: "700" },
  goalInput: { color: colors.brandPrimary, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.brandPrimary, paddingHorizontal: spacing.md, paddingVertical: 8, marginTop: 6, fontSize: 13, fontWeight: "700" },
  metricsBox: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  metricsRowLabel: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: 4, marginBottom: 6 },
  metricsInputRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.sm },
  metricField: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 8 },
  metricInput: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "800", height: 42, textAlign: "center" },
  metricUnit: { color: colors.textDim, fontSize: 10, fontWeight: "700" },
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
  histRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border },
  histNumWrap: { minWidth: 34, height: 26, paddingHorizontal: 6, borderRadius: radius.sm, backgroundColor: colors.brandTertiary, borderWidth: 1, borderColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  histNum: { color: colors.brandPrimary, fontWeight: "900", fontSize: 11 },
  recentName: { color: colors.text, fontWeight: "700", fontSize: 13 },
  recentMeta: { color: colors.textDim, fontSize: 10, marginTop: 1 },
  systemMsg: { color: colors.textDim, fontSize: 11, fontWeight: "700", textAlign: "center", marginVertical: spacing.sm },
  attRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  notesCard: { marginTop: spacing.sm, padding: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(255,214,0,0.05)" },
  notesLabel: { color: colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
  notesInput: { color: colors.text, backgroundColor: colors.surface, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingTop: 8, paddingBottom: 8, minHeight: 60, marginTop: 6, fontSize: 13, textAlignVertical: "top" },
  notesBtn: { alignSelf: "flex-end", marginTop: 6, paddingVertical: 6, paddingHorizontal: spacing.md, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning },
  notesBtnText: { color: colors.warning, fontWeight: "900", fontSize: 11, letterSpacing: 0.5 },
  photoStrip: { marginTop: spacing.sm },
  photoLabel: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  sessionsBox: { marginHorizontal: spacing.lg, marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.surface2 },
  sessionsCal: { borderRadius: radius.sm, overflow: "hidden" },
  sessionReqBtn: { marginTop: spacing.md, backgroundColor: colors.brandPrimary, borderRadius: radius.sm, paddingVertical: 12, alignItems: "center" },
  sessionReqText: { color: "#001122", fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  pendingLabel: { color: colors.warning, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginBottom: 6 },
  pendingRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(245,197,66,0.08)", marginBottom: spacing.sm },
  pendingCol: { paddingVertical: 8, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.warning, backgroundColor: "rgba(245,197,66,0.08)", marginBottom: spacing.sm },
  pendingTopRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  apprNoteInput: { marginTop: 8, backgroundColor: colors.surface3, color: colors.text, borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, fontSize: 12 },
  coachNoteText: { color: colors.brandPrimary, fontSize: 11, marginTop: 4, fontWeight: "700" },
  pendingDate: { color: colors.text, fontWeight: "800", fontSize: 13 },
  pendingNote: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  apprBtn: { backgroundColor: colors.success, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 10 },
  apprText: { color: "#001a10", fontWeight: "900", fontSize: 10, letterSpacing: 1 },
  declBtn: { borderWidth: 1, borderColor: colors.error, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 10 },
  declText: { color: colors.error, fontWeight: "900", fontSize: 12 },
  apprvRow: { paddingVertical: 7, paddingHorizontal: spacing.sm, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.success, backgroundColor: "rgba(0,229,180,0.06)", marginBottom: 6 },
  apprvText: { color: colors.success, fontWeight: "800", fontSize: 12, letterSpacing: 0.5 },
  photoItem: { marginRight: 8, alignItems: "center" },
  photoThumb: { width: 88, height: 110, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  photoDate: { color: colors.textDim, fontSize: 9, marginTop: 3, fontWeight: "700" },
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
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 2, backgroundColor: colors.surface2, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 5 },
  composerWrap: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, backgroundColor: colors.surface },
  iconBtn: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 17 },
  iconText: { fontSize: 17 },
  input: { flex: 1, maxHeight: 110, color: colors.text, paddingHorizontal: 6, paddingTop: 8, paddingBottom: 8, fontSize: 15 },
  sendCircle: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendArrow: { color: "#04121a", fontSize: 15, fontWeight: "900" },
  sendBtn: { height: 44, paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.brandPrimary, alignItems: "center", justifyContent: "center" },
  sendText: { color: "#04121a", fontWeight: "900", letterSpacing: 1 },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalCard: { backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.brandPrimary },
  modalTitle: { color: colors.text, fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  modalHint: { color: colors.textDim, fontSize: 12, marginTop: 6, marginBottom: spacing.sm, lineHeight: 18 },
  tplLabel: { color: colors.textDim, fontSize: 10, fontWeight: "900", letterSpacing: 1, marginTop: spacing.sm, marginBottom: 6 },
  tplChip: { borderWidth: 1, borderColor: colors.brandPrimary, backgroundColor: "rgba(0,229,255,0.08)", borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12, marginRight: 8, minWidth: 130 },
  tplChipText: { color: colors.brandPrimary, fontWeight: "900", fontSize: 13 },
  tplChipSub: { color: colors.textDim, fontSize: 9, marginTop: 2 },
  tplToggle: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  checkbox: { width: 22, height: 22, borderRadius: 5, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  checkboxOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandPrimary },
  checkboxTick: { color: "#04121a", fontWeight: "900", fontSize: 14 },
  tplToggleText: { color: colors.textMid, fontWeight: "700", fontSize: 13 },
  mInput: { color: colors.text, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: 14, marginBottom: spacing.sm },
  mBtn: { flex: 1, paddingVertical: 12, borderRadius: radius.sm, alignItems: "center" },
  mCancel: { borderWidth: 1, borderColor: colors.border },
  mCancelText: { color: colors.textMid, fontWeight: "800", letterSpacing: 1 },
  mAssign: { backgroundColor: colors.brandPrimary },
  mAssignText: { color: "#04121a", fontWeight: "900", letterSpacing: 1 },
});
