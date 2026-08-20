import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Platform, Linking, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Location from "expo-location";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";
import { CardioMap } from "@/src/components/CardioMap";

function haversine(a: any, b: any) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180, la2 = (b.latitude * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export default function Cardio() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token, refresh } = useAuth();
  const [activity, setActivity] = useState<"run" | "bike">("run");
  const [unit, setUnit] = useState<"km" | "mi">("km");
  const [perm, setPerm] = useState<"unknown" | "granted" | "denied" | "blocked">("unknown");
  const [tracking, setTracking] = useState(false);
  const [route, setRoute] = useState<any[]>([]);
  const [distanceKm, setDistanceKm] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [elevation, setElevation] = useState(0);
  const [temp, setTemp] = useState<number | null>(null);
  const [region, setRegion] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [screen, setScreen] = useState<"gps" | "sprint">("gps");
  const [sprintType, setSprintType] = useState<"40yd" | "100m">("40yd");
  const [sprintRunning, setSprintRunning] = useState(false);
  const [sprintMs, setSprintMs] = useState(0);
  const [bests, setBests] = useState<Record<string, number>>({});
  const [sprintMsg, setSprintMsg] = useState<string | null>(null);
  const sprintStartRef = useRef(0);
  const subRef = useRef<any>(null);
  const lastRef = useRef<any>(null);
  const lastAlt = useRef<number | null>(null);

  useEffect(() => {
    (async () => { try { const r = await apiFetch(token, "/api/sprint/me"); setBests(r.sprints || {}); } catch {} })();
  }, [token]);

  useEffect(() => {
    if (!sprintRunning) return;
    const iv = setInterval(() => setSprintMs(Date.now() - sprintStartRef.current), 31);
    return () => clearInterval(iv);
  }, [sprintRunning]);

  const startSprint = () => { setSprintMsg(null); setSprintMs(0); sprintStartRef.current = Date.now(); setSprintRunning(true); };
  const stopSprint = async () => {
    setSprintRunning(false);
    const secs = Math.round(((Date.now() - sprintStartRef.current) / 1000) * 100) / 100;
    setSprintMs(secs * 1000);
    try {
      const res = await apiFetch(token, "/api/sprint/log", { method: "POST", body: JSON.stringify({ sprint_type: sprintType, seconds: secs }) });
      setBests((b) => ({ ...b, [sprintType]: res.best }));
      setSprintMsg(res.is_best ? `🔥 NEW BEST · ${secs.toFixed(2)}s · +40 XP` : `Logged ${secs.toFixed(2)}s · Best ${res.best?.toFixed(2)}s`);
      await refresh();
    } catch (e: any) { setSprintMsg(e.message); }
  };

  useEffect(() => {
    const iv = tracking ? setInterval(() => setElapsed((e) => e + 1), 1000) : null;
    return () => { if (iv) clearInterval(iv); };
  }, [tracking]);

  const ensurePermission = async () => {
    const cur = await Location.getForegroundPermissionsAsync();
    if (cur.status === "granted") { setPerm("granted"); return true; }
    if (cur.status === "denied" && !cur.canAskAgain) { setPerm("blocked"); return false; }
    const req = await Location.requestForegroundPermissionsAsync();
    if (req.status === "granted") { setPerm("granted"); return true; }
    setPerm(req.canAskAgain ? "denied" : "blocked");
    return false;
  };

  const fetchTemp = async (lat: number, lon: number) => {
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m`);
      const d = await r.json();
      if (d?.current?.temperature_2m != null) setTemp(d.current.temperature_2m);
    } catch {}
  };

  const start = async () => {
    const ok = await ensurePermission();
    if (!ok) return;
    setRoute([]); setDistanceKm(0); setElapsed(0); setElevation(0); lastRef.current = null; lastAlt.current = null;
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    setRegion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude, latitudeDelta: 0.005, longitudeDelta: 0.005 });
    fetchTemp(loc.coords.latitude, loc.coords.longitude);
    setTracking(true);
    subRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 5, timeInterval: 2000 },
      (l) => {
        const p = { latitude: l.coords.latitude, longitude: l.coords.longitude };
        setRoute((prev) => {
          if (lastRef.current) {
            const d = haversine(lastRef.current, p);
            if (d < 0.2) setDistanceKm((dist) => dist + d);
          }
          lastRef.current = p;
          return [...prev, p];
        });
        if (l.coords.altitude != null) {
          if (lastAlt.current != null && l.coords.altitude > lastAlt.current) {
            setElevation((e) => e + (l.coords.altitude! - lastAlt.current!));
          }
          lastAlt.current = l.coords.altitude;
        }
        setRegion((r: any) => r ? { ...r, latitude: p.latitude, longitude: p.longitude } : r);
      }
    );
  };

  const stop = async () => {
    if (subRef.current) { subRef.current.remove(); subRef.current = null; }
    setTracking(false);
  };

  const save = async () => {
    await stop();
    setSaving(true);
    try {
      const paceMinKm = distanceKm > 0 ? (elapsed / 60) / distanceKm : 0;
      const res = await apiFetch(token, "/api/cardio/log", {
        method: "POST",
        body: JSON.stringify({
          activity_type: activity,
          distance_km: distanceKm,
          duration_s: elapsed,
          elevation_gain_m: elevation,
          temperature_c: temp,
          avg_pace_min_km: paceMinKm,
          route: route.slice(0, 500),
        }),
      });
      await refresh();
      setMsg(`Saved! +${res.xp_gained} XP`);
      setRoute([]); setDistanceKm(0); setElapsed(0); setElevation(0);
    } catch (e: any) { setMsg(e.message); }
    setSaving(false);
  };

  const dist = unit === "km" ? distanceKm : distanceKm * 0.621371;
  const distUnit = unit === "km" ? "km" : "mi";
  const paceMin = distanceKm > 0 ? (elapsed / 60) / dist : 0;
  const paceStr = paceMin > 0 && paceMin < 99 ? `${Math.floor(paceMin)}:${String(Math.round((paceMin % 1) * 60)).padStart(2, "0")}` : "--:--";
  const speed = elapsed > 0 ? (dist / (elapsed / 3600)) : 0;
  const elev = unit === "km" ? `${Math.round(elevation)} m` : `${Math.round(elevation * 3.281)} ft`;
  const mm = String(Math.floor(elapsed / 60)).padStart(2, "0");
  const ss = String(elapsed % 60).padStart(2, "0");

  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable onPress={() => router.back()}><Text style={styles.back}>← BACK</Text></Pressable>
        <Text style={styles.title}>CARDIO</Text>
        <Pressable testID="unit-toggle" onPress={() => setUnit((u) => (u === "km" ? "mi" : "km"))} style={styles.unitBtn}>
          <Text style={styles.unitText}>{unit.toUpperCase()}</Text>
        </Pressable>
      </View>

      <View style={styles.screenRow}>
        <Pressable testID="cardio-mode-gps" onPress={() => setScreen("gps")} style={[styles.screenBtn, screen === "gps" && styles.screenBtnActive]}>
          <Text style={[styles.screenText, screen === "gps" && styles.screenTextActive]}>📍 GPS TRACK</Text>
        </Pressable>
        <Pressable testID="cardio-mode-sprint" onPress={() => setScreen("sprint")} style={[styles.screenBtn, screen === "sprint" && styles.screenBtnActive]}>
          <Text style={[styles.screenText, screen === "sprint" && styles.screenTextActive]}>⚡ SPRINT TEST</Text>
        </Pressable>
      </View>

      {screen === "sprint" ? (
        <View style={styles.sprintWrap}>
          <View style={styles.sprintTypeRow}>
            {(["40yd", "100m"] as const).map((t) => (
              <Pressable testID={`sprint-${t}`} key={t} onPress={() => !sprintRunning && setSprintType(t)} style={[styles.typeBtn, sprintType === t && styles.typeBtnActive]}>
                <Text style={[styles.typeText, sprintType === t && styles.typeTextActive]}>{t === "40yd" ? "40-YARD DASH" : "100M SPRINT"}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.timerBox}>
            <Text style={styles.timerLabel}>{sprintType === "40yd" ? "40-YARD DASH" : "100M SPRINT"}</Text>
            <Text testID="sprint-clock" style={styles.timerValue}>{(sprintMs / 1000).toFixed(2)}<Text style={styles.timerUnit}>s</Text></Text>
            <Text style={styles.timerBest}>BEST: {bests[sprintType] != null ? `${bests[sprintType].toFixed(2)}s` : "—"}</Text>
          </View>

          {sprintMsg && <Text testID="sprint-msg" style={styles.sprintMsg}>{sprintMsg}</Text>}

          {!sprintRunning ? (
            <Pressable testID="sprint-start" onPress={startSprint} style={styles.startBtn}><Text style={styles.startText}>START TIMER</Text></Pressable>
          ) : (
            <Pressable testID="sprint-stop" onPress={stopSprint} style={[styles.startBtn, { backgroundColor: colors.warning }]}><Text style={[styles.startText, { color: "#332200" }]}>STOP & LOG</Text></Pressable>
          )}

          <View style={styles.sprintBests}>
            <View style={styles.bestCard}><Text style={styles.bestLabel}>40-YARD</Text><Text style={styles.bestVal}>{bests["40yd"] != null ? `${bests["40yd"].toFixed(2)}s` : "—"}</Text></View>
            <View style={styles.bestCard}><Text style={styles.bestLabel}>100M</Text><Text style={styles.bestVal}>{bests["100m"] != null ? `${bests["100m"].toFixed(2)}s` : "—"}</Text></View>
          </View>
          <Text style={styles.sprintHint}>Tap START, run your sprint, tap STOP at the line. Best times boost your SPEED stat & earn +40 XP on a new record.</Text>
        </View>
      ) : Platform.OS === "web" ? (
        <View style={styles.webLock}>
          <Text style={styles.webLockIcon}>📱</Text>
          <Text style={styles.webLockTitle}>GPS TRACKING IS MOBILE-ONLY</Text>
          <Text style={styles.webLockText}>Live run & bike GPS tracking uses your phone&apos;s location and sensors, so it&apos;s only available in the mobile app. Open PowerUp Arena on your phone to record a route.</Text>
          <Text style={styles.webLockHint}>Tip: the Sprint Timer above works right here on the web.</Text>
        </View>
      ) : (
      <>
      <View style={styles.mapWrap}>
        {perm === "granted" && region ? (
          <CardioMap region={region} route={route} />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapIcon}>🛰️</Text>
            {perm === "blocked" ? (
              <>
                <Text style={styles.permText}>Location is blocked. Enable it in Settings to track your route.</Text>
                <Pressable testID="open-settings-loc" onPress={() => Linking.openSettings()} style={styles.permBtn}><Text style={styles.permBtnText}>OPEN SETTINGS</Text></Pressable>
              </>
            ) : (
              <Text style={styles.permText}>Start an activity to enable GPS tracking and your live map.</Text>
            )}
          </View>
        )}
      </View>

      <View style={styles.panel}>
        <View style={styles.typeRow}>
          {(["run", "bike"] as const).map((t) => (
            <Pressable testID={`type-${t}`} key={t} onPress={() => !tracking && setActivity(t)} style={[styles.typeBtn, activity === t && styles.typeBtnActive]}>
              <Text style={[styles.typeText, activity === t && styles.typeTextActive]}>{t === "run" ? "🏃 RUN" : "🚴 BIKE"}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.statsRow}>
          <Stat label={`DIST (${distUnit})`} value={dist.toFixed(2)} big />
          <Stat label="TIME" value={`${mm}:${ss}`} big />
          <Stat label={`PACE /${distUnit}`} value={paceStr} big />
        </View>
        <View style={styles.statsRow}>
          <Stat label={`SPEED ${distUnit}/h`} value={speed.toFixed(1)} />
          <Stat label="ELEV" value={elev} />
          <Stat label="TEMP" value={temp != null ? `${Math.round(unit === "km" ? temp : temp * 9 / 5 + 32)}°${unit === "km" ? "C" : "F"}` : "--"} />
        </View>

        {msg && <Text style={styles.msg}>{msg}</Text>}

        {!tracking ? (
          <Pressable testID="start-cardio" onPress={start} style={styles.startBtn}><Text style={styles.startText}>START {activity.toUpperCase()}</Text></Pressable>
        ) : (
          <View style={styles.controlRow}>
            <Pressable testID="stop-cardio" onPress={stop} style={[styles.ctrlBtn, { borderColor: colors.warning }]}><Text style={[styles.ctrlText, { color: colors.warning }]}>PAUSE</Text></Pressable>
            <Pressable testID="save-cardio" onPress={save} disabled={saving} style={[styles.ctrlBtn, { backgroundColor: colors.brandPrimary }]}><Text style={[styles.ctrlText, { color: "#001122" }]}>{saving ? "..." : "FINISH & SAVE"}</Text></Pressable>
          </View>
        )}
      </View>
      </>
      )}
    </View>
  );
}

function Stat({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, big && { fontSize: 26 }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  back: { color: colors.brandPrimary, fontWeight: "800", letterSpacing: 2 },
  title: { color: colors.text, fontWeight: "900", letterSpacing: 4, fontSize: 18 },
  unitBtn: { borderWidth: 1, borderColor: colors.borderStrong, paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.sm },
  unitText: { color: colors.brandPrimary, fontWeight: "900", letterSpacing: 2 },
  screenRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  screenBtn: { flex: 1, paddingVertical: spacing.sm, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  screenBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  screenText: { color: colors.textDim, fontWeight: "900", letterSpacing: 1, fontSize: 12 },
  screenTextActive: { color: colors.brandPrimary },
  sprintWrap: { flex: 1, padding: spacing.lg },
  sprintTypeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.lg },
  timerBox: { alignItems: "center", backgroundColor: colors.surface2, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong, paddingVertical: spacing.xl, marginBottom: spacing.lg },
  timerLabel: { color: colors.brandPrimary, letterSpacing: 3, fontWeight: "800", fontSize: 12 },
  timerValue: { color: colors.text, fontSize: 68, fontWeight: "900", fontVariant: ["tabular-nums"], marginTop: spacing.sm },
  timerUnit: { fontSize: 28, color: colors.textDim },
  timerBest: { color: colors.textDim, letterSpacing: 2, fontWeight: "700", marginTop: 4 },
  sprintMsg: { color: colors.brandPrimary, textAlign: "center", marginBottom: spacing.md, letterSpacing: 1, fontWeight: "800" },
  sprintBests: { flexDirection: "row", gap: spacing.md, marginTop: spacing.lg },
  bestCard: { flex: 1, backgroundColor: colors.surface2, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: spacing.md, alignItems: "center" },
  bestLabel: { color: colors.textDim, fontSize: 10, letterSpacing: 2, fontWeight: "800" },
  bestVal: { color: colors.text, fontSize: 22, fontWeight: "900", marginTop: 4, fontVariant: ["tabular-nums"] },
  sprintHint: { color: colors.textDim, fontSize: 11, lineHeight: 17, marginTop: spacing.lg, textAlign: "center", paddingHorizontal: spacing.md },
  mapWrap: { flex: 1, backgroundColor: colors.surface2, overflow: "hidden" },
  mapPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl },
  webLock: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing.xl, gap: spacing.md },
  webLockIcon: { fontSize: 60 },
  webLockTitle: { color: colors.text, fontSize: 18, fontWeight: "900", letterSpacing: 1, textAlign: "center" },
  webLockText: { color: colors.textMid, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 420 },
  webLockHint: { color: colors.brandPrimary, fontSize: 12, fontWeight: "700", textAlign: "center", marginTop: spacing.sm },
  mapIcon: { fontSize: 48, marginBottom: spacing.md },
  permText: { color: colors.textDim, textAlign: "center", lineHeight: 20 },
  permBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingHorizontal: spacing.xl, paddingVertical: spacing.md, borderRadius: radius.sm },
  permBtnText: { color: "#001122", fontWeight: "900", letterSpacing: 2 },
  panel: { backgroundColor: colors.surface2, borderTopWidth: 1, borderTopColor: colors.borderStrong, padding: spacing.lg, paddingBottom: spacing.xl },
  typeRow: { flexDirection: "row", gap: spacing.sm, marginBottom: spacing.md },
  typeBtn: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface3 },
  typeBtnActive: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  typeText: { color: colors.textDim, fontWeight: "900", letterSpacing: 2 },
  typeTextActive: { color: colors.brandPrimary },
  statsRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: spacing.md },
  stat: { flex: 1, alignItems: "center" },
  statValue: { color: colors.text, fontWeight: "900", fontSize: 18, fontVariant: ["tabular-nums"] },
  statLabel: { color: colors.textDim, fontSize: 9, letterSpacing: 1, fontWeight: "700", marginTop: 2 },
  msg: { color: colors.brandPrimary, textAlign: "center", marginBottom: spacing.sm, letterSpacing: 1 },
  startBtn: { backgroundColor: colors.brandPrimary, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm },
  startText: { color: "#001122", fontWeight: "900", letterSpacing: 3 },
  controlRow: { flexDirection: "row", gap: spacing.sm },
  ctrlBtn: { flex: 1, paddingVertical: spacing.md, alignItems: "center", borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
  ctrlText: { fontWeight: "900", letterSpacing: 2 },
});
