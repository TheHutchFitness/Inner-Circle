import { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, ScrollView, TextInput, ActivityIndicator } from "react-native";
import { Calendar } from "react-native-calendars";
import { useAuth, apiFetch } from "@/src/lib/auth";
import { colors, spacing, radius } from "@/src/lib/theme";

function buildSlots(): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  for (let h = 6; h <= 20; h++) {
    for (const m of [0, 30]) {
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const ampm = h < 12 ? "AM" : "PM";
      const h12 = h % 12 === 0 ? 12 : h % 12;
      out.push({ value, label: `${h12}:${String(m).padStart(2, "0")} ${ampm}` });
    }
  }
  return out;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BookingModal({ visible, onClose, onBooked }: { visible: boolean; onClose: () => void; onBooked?: () => void }) {
  const { token } = useAuth();
  const slots = useMemo(buildSlots, []);
  const [date, setDate] = useState<string>("");
  const [time, setTime] = useState<string>("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = () => { setDate(""); setTime(""); setNote(""); setErr(null); };
  const close = () => { reset(); onClose(); };

  const submit = async () => {
    if (!date) { setErr("Pick a date"); return; }
    if (!time) { setErr("Pick a time slot"); return; }
    setBusy(true); setErr(null);
    try {
      await apiFetch(token, "/api/inperson/booking/request", {
        method: "POST",
        body: JSON.stringify({ date, time, note: note.trim(), tz_offset_minutes: new Date().getTimezoneOffset() }),
      });
      setBusy(false);
      reset();
      onBooked?.();
      onClose();
    } catch (e: any) {
      setBusy(false);
      setErr(e?.message || "Could not send request");
    }
  };

  const marked = date ? { [date]: { selected: true, selectedColor: colors.brandPrimary } } : {};

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.headRow}>
            <Text style={styles.title}>REQUEST A SESSION</Text>
            <Pressable testID="booking-close" onPress={close}><Text style={styles.close}>✕</Text></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: spacing.lg }}>
            <Calendar
              testID="booking-calendar"
              minDate={todayStr()}
              onDayPress={(d: any) => { setDate(d.dateString); setErr(null); }}
              markedDates={marked}
              theme={{
                calendarBackground: colors.surface2,
                dayTextColor: colors.text,
                monthTextColor: colors.text,
                textSectionTitleColor: colors.textDim,
                todayTextColor: colors.brandPrimary,
                selectedDayBackgroundColor: colors.brandPrimary,
                selectedDayTextColor: "#001122",
                arrowColor: colors.brandPrimary,
                textDisabledColor: colors.textDim,
              }}
              style={styles.calendar}
            />

            <Text style={styles.label}>TIME SLOT</Text>
            <View style={styles.slotWrap}>
              {slots.map((s) => (
                <Pressable key={s.value} testID={`slot-${s.value}`} onPress={() => { setTime(s.value); setErr(null); }} style={[styles.slot, time === s.value && styles.slotOn]}>
                  <Text style={[styles.slotText, time === s.value && styles.slotTextOn]}>{s.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>NOTE (OPTIONAL)</Text>
            <TextInput
              testID="booking-note"
              value={note}
              onChangeText={setNote}
              placeholder="e.g. focus on squat technique"
              placeholderTextColor={colors.textDim}
              style={styles.noteInput}
              multiline
            />

            {err && <Text style={styles.err}>{err}</Text>}

            <Pressable testID="booking-submit" onPress={submit} disabled={busy} style={styles.submitBtn}>
              {busy ? <ActivityIndicator color="#001122" /> : <Text style={styles.submitText}>SEND REQUEST TO COACH</Text>}
            </Pressable>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  sheet: { maxHeight: "92%", backgroundColor: colors.surface, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.lg, borderTopWidth: 1, borderColor: colors.borderStrong },
  headRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md },
  title: { color: colors.brandPrimary, fontSize: 16, fontWeight: "900", letterSpacing: 2 },
  close: { color: colors.textDim, fontSize: 20, fontWeight: "900", paddingHorizontal: 8 },
  calendar: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  label: { color: colors.textMid, fontSize: 11, fontWeight: "900", letterSpacing: 2, marginTop: spacing.lg, marginBottom: spacing.sm },
  slotWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  slot: { paddingHorizontal: spacing.md, paddingVertical: 9, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2 },
  slotOn: { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary },
  slotText: { color: colors.textDim, fontSize: 12, fontWeight: "800" },
  slotTextOn: { color: colors.brandPrimary },
  noteInput: { backgroundColor: colors.surface2, color: colors.text, borderRadius: radius.sm, padding: spacing.md, borderWidth: 1, borderColor: colors.border, minHeight: 60, textAlignVertical: "top" },
  err: { color: colors.error, marginTop: spacing.md, textAlign: "center" },
  submitBtn: { marginTop: spacing.lg, backgroundColor: colors.brandPrimary, paddingVertical: 15, alignItems: "center", borderRadius: radius.sm },
  submitText: { color: "#001122", fontWeight: "900", letterSpacing: 2, fontSize: 14 },
});
