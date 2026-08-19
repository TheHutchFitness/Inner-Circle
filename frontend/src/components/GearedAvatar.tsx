import { View, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { bodyImage, weaponImage } from "@/src/lib/theme";

/**
 * Renders a member's full-body avatar (equipped skin overrides the base human avatar)
 * with an optional equipped weapon prop overlaid on top. Both layers share the same
 * container + contentFit so the weapon (drawn on the right side of its 1:1 frame) stays
 * aligned to the body.
 */
export function GearedAvatar({
  person,
  style,
  contentFit = "cover",
  showWeapon = true,
}: {
  person?: { equipped_skin?: string; equipped_weapon?: string; avatar_id?: string; sex?: string } | null;
  style?: any;
  contentFit?: "cover" | "contain";
  showWeapon?: boolean;
}) {
  const body = bodyImage(person);
  const weap = showWeapon ? weaponImage(person?.equipped_weapon) : null;
  if (!body) return null;
  return (
    <View style={style}>
      <Image source={body} style={StyleSheet.absoluteFill} contentFit={contentFit} />
      {weap && <Image source={weap} style={StyleSheet.absoluteFill} contentFit={contentFit} pointerEvents="none" />}
    </View>
  );
}
