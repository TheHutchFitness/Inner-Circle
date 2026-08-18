import React from "react";
import { View, Text, StyleSheet, ViewStyle } from "react-native";
import { colors, spacing, radius } from "@/src/lib/theme";

// Corner-bracket "inventory slot / HUD panel" frame — evokes a game menu / Pip-Boy panel.
export function HudFrame({ children, style, color = colors.borderStrong, title }: { children: React.ReactNode; style?: ViewStyle; color?: string; title?: string }) {
  return (
    <View style={[styles.wrap, style]}>
      {title ? (
        <View style={styles.titleBar}>
          <Text style={[styles.titleText, { color }]}>{title}</Text>
        </View>
      ) : null}
      <View style={[styles.corner, styles.tl, { borderColor: color }]} />
      <View style={[styles.corner, styles.tr, { borderColor: color }]} />
      <View style={[styles.corner, styles.bl, { borderColor: color }]} />
      <View style={[styles.corner, styles.br, { borderColor: color }]} />
      {children}
    </View>
  );
}

// "> SECTION //" style HUD section header with a scan divider.
export function HudSectionHeader({ label, accent = colors.brandPrimary }: { label: string; accent?: string }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionChevron, { color: accent }]}>▚</Text>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={[styles.sectionLine, { backgroundColor: accent }]} />
      <Text style={[styles.sectionSlash, { color: accent }]}>{"//"}</Text>
    </View>
  );
}

const C = 14;
const styles = StyleSheet.create({
  wrap: { borderWidth: 1, borderColor: colors.border, backgroundColor: "rgba(18,20,26,0.72)", borderRadius: radius.sm, padding: spacing.lg },
  titleBar: { position: "absolute", top: -9, left: spacing.md, backgroundColor: colors.surface, paddingHorizontal: 6 },
  titleText: { fontSize: 10, letterSpacing: 3, fontWeight: "900" },
  corner: { position: "absolute", width: C, height: C },
  tl: { top: -1, left: -1, borderTopWidth: 2, borderLeftWidth: 2 },
  tr: { top: -1, right: -1, borderTopWidth: 2, borderRightWidth: 2 },
  bl: { bottom: -1, left: -1, borderBottomWidth: 2, borderLeftWidth: 2 },
  br: { bottom: -1, right: -1, borderBottomWidth: 2, borderRightWidth: 2 },
  section: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.xl, marginBottom: spacing.sm },
  sectionChevron: { fontSize: 12, fontWeight: "900" },
  sectionLabel: { color: colors.text, letterSpacing: 4, fontWeight: "900", fontSize: 13 },
  sectionLine: { flex: 1, height: 1, opacity: 0.5 },
  sectionSlash: { fontSize: 12, fontWeight: "900", letterSpacing: 1 },
});
