import { View, Text, StyleSheet } from "react-native";
import { Image } from "expo-image";
import { avatarImage, avatarFor, bodyImage, AURA_COLORS, EMBLEM_ICONS, colors, radius } from "@/src/lib/theme";

type P = {
  person: any;            // object with avatar_id, sex, photo_media_id, use_photo, loadout
  token?: string | null;  // needed to load the private photo url
  size?: number;
  showEmblem?: boolean;
  square?: boolean;       // square (profile portrait) vs rounded chip
};

/** Renders a member's avatar or uploaded photo with equipped aura glow, frame border and emblem badge. */
export function PlayerAvatar({ person, token, size = 40, showEmblem = true, square = false }: P) {
  const lo = person?.loadout || {};
  const aura = AURA_COLORS[lo.aura || "au_none"] || "";
  const emblem = EMBLEM_ICONS[lo.emblem || "em_none"] || "";
  const br = square ? radius.sm : size / 4;

  const usePhoto = person?.use_photo && person?.photo_media_id && token;
  const photoUri = usePhoto
    ? `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/chat/media/${person.photo_media_id}?token=${token}`
    : null;
  const art = !usePhoto ? bodyImage(person) : null;
  const geared = !usePhoto && !!person?.equipped_skin;
  const hasWeapon = !usePhoto && !!person?.equipped_weapon;
  const ringColor = geared ? "#FFD24A" : (aura || colors.borderStrong);

  return (
    <View style={{ width: size, height: size }}>
      <View
        style={[
          styles.frame,
          { width: size, height: size, borderRadius: br, borderColor: ringColor },
          (geared || !!aura) && { shadowColor: ringColor, shadowOpacity: 0.85, shadowRadius: size * 0.28, shadowOffset: { width: 0, height: 0 } },
        ]}
      >
        {photoUri ? (
          <Image source={{ uri: photoUri }} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : art ? (
          <Image source={art} style={{ width: "100%", height: "100%" }} contentFit="cover" />
        ) : (
          <Text style={{ fontSize: size * 0.5 }}>{avatarFor(person?.avatar_id).emoji}</Text>
        )}
      </View>
      {hasWeapon && (
        <View style={[styles.weaponBadge, { width: size * 0.4, height: size * 0.4, borderRadius: size * 0.2, top: -2, right: -2 }]}>
          <Text style={{ fontSize: size * 0.22 }}>⚔️</Text>
        </View>
      )}
      {showEmblem && !!emblem && (
        <View style={[styles.emblem, { width: size * 0.42, height: size * 0.42, borderRadius: size * 0.21, bottom: -2, right: -2 }]}>
          <Text style={{ fontSize: size * 0.24 }}>{emblem}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { overflow: "hidden", backgroundColor: colors.surface3, alignItems: "center", justifyContent: "center", borderWidth: 2 },
  emblem: { position: "absolute", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  weaponBadge: { position: "absolute", backgroundColor: "rgba(10,10,14,0.92)", borderWidth: 1, borderColor: "#FFD24A", alignItems: "center", justifyContent: "center" },
});
