export const colors = {
  surface: "#050508",
  surface2: "#12141A",
  surface3: "#1A1D26",
  text: "#FFFFFF",
  textDim: "#A0A5B5",
  textMid: "#C3C8D8",
  brand: "#0055FF",
  brandPrimary: "#00E5FF",
  brandTertiary: "#002A55",
  success: "#39FF14",
  warning: "#FFEA00",
  error: "#FF003C",
  border: "#1A1D26",
  borderStrong: "#0055FF",
  enhanced: false,
};

// ---------- "The Enhanced" red-takeover palette ----------
// Applied app-wide (in place) once an athlete crosses over. warning (gold) is
// intentionally preserved for Founding-Backer semantics (crimson + gold look).
export const ENHANCED_OVERRIDES = {
  surface: "#0A0203",
  surface2: "#170709",
  surface3: "#241014",
  text: "#FFFFFF",
  textDim: "#C98A90",
  textMid: "#E4AEB4",
  brand: "#B00020",
  brandPrimary: "#FF2A3C",
  brandTertiary: "#3A0009",
  success: "#FF6A3D",
  warning: "#FFEA00",
  error: "#FF003C",
  border: "#2A1015",
  borderStrong: "#FF2A3C",
  enhanced: true,
};

// Mutate the live palette in place so already-imported modules pick up red on
// the next full app boot (paired with a persisted flag + reload).
export function applyEnhancedPalette() {
  Object.assign(colors, ENHANCED_OVERRIDES);
}
export function isEnhancedPalette() {
  return colors.enhanced === true;
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 4, md: 8, lg: 12, pill: 999 };

export const AVATARS: { id: string; label: string; emoji: string; url?: string }[] = [
  { id: "avatar_white", label: "White", emoji: "🧑" },
  { id: "avatar_black", label: "Black", emoji: "🧑🏿" },
  { id: "avatar_asian", label: "Asian", emoji: "🧑🏻" },
  { id: "avatar_native", label: "Native", emoji: "🧑🏽" },
  { id: "avatar_indian", label: "Indian", emoji: "🧑🏾" },
];

export function avatarFor(id: string) {
  return AVATARS.find((a) => a.id === id) || AVATARS[0];
}

// ---- Hair colour options (applied to the base avatar) ----
export const HAIR_COLORS: { id: string; label: string; swatch: string }[] = [
  { id: "black", label: "Black", swatch: "#1A1A1E" },
  { id: "brown", label: "Brown", swatch: "#6B4226" },
  { id: "blonde", label: "Blonde", swatch: "#E6C56A" },
  { id: "red", label: "Red", swatch: "#B5432A" },
  { id: "white", label: "White", swatch: "#E8E8EC" },
];
const DEFAULT_HAIR: Record<string, string> = {
  avatar_white: "brown", avatar_black: "black", avatar_asian: "black",
  avatar_native: "black", avatar_indian: "black",
};

// AI-generated full-body stylized base avatars, keyed by `${race}_${hair}` (male)
export const AVATAR_IMAGES: Record<string, any> = {
  white_black: require("@/assets/images/av_white_black.png"),
  white_brown: require("@/assets/images/av_white_brown.png"),
  white_blonde: require("@/assets/images/av_white_blonde.png"),
  white_red: require("@/assets/images/av_white_red.png"),
  white_white: require("@/assets/images/av_white_white.png"),
  black_black: require("@/assets/images/av_black_black.png"),
  black_brown: require("@/assets/images/av_black_brown.png"),
  black_blonde: require("@/assets/images/av_black_blonde.png"),
  black_red: require("@/assets/images/av_black_red.png"),
  black_white: require("@/assets/images/av_black_white.png"),
  asian_black: require("@/assets/images/av_asian_black.png"),
  asian_brown: require("@/assets/images/av_asian_brown.png"),
  asian_blonde: require("@/assets/images/av_asian_blonde.png"),
  asian_red: require("@/assets/images/av_asian_red.png"),
  asian_white: require("@/assets/images/av_asian_white.png"),
  native_black: require("@/assets/images/av_native_black.png"),
  native_brown: require("@/assets/images/av_native_brown.png"),
  native_blonde: require("@/assets/images/av_native_blonde.png"),
  native_red: require("@/assets/images/av_native_red.png"),
  native_white: require("@/assets/images/av_native_white.png"),
  indian_black: require("@/assets/images/av_indian_black.png"),
  indian_brown: require("@/assets/images/av_indian_brown.png"),
  indian_blonde: require("@/assets/images/av_indian_blonde.png"),
  indian_red: require("@/assets/images/av_indian_red.png"),
  indian_white: require("@/assets/images/av_indian_white.png"),
};

// Female base avatars, keyed by `${race}_${hair}`
export const AVATAR_IMAGES_F: Record<string, any> = {
  white_black: require("@/assets/images/av_white_black_f.png"),
  white_brown: require("@/assets/images/av_white_brown_f.png"),
  white_blonde: require("@/assets/images/av_white_blonde_f.png"),
  white_red: require("@/assets/images/av_white_red_f.png"),
  white_white: require("@/assets/images/av_white_white_f.png"),
  black_black: require("@/assets/images/av_black_black_f.png"),
  black_brown: require("@/assets/images/av_black_brown_f.png"),
  black_blonde: require("@/assets/images/av_black_blonde_f.png"),
  black_red: require("@/assets/images/av_black_red_f.png"),
  black_white: require("@/assets/images/av_black_white_f.png"),
  asian_black: require("@/assets/images/av_asian_black_f.png"),
  asian_brown: require("@/assets/images/av_asian_brown_f.png"),
  asian_blonde: require("@/assets/images/av_asian_blonde_f.png"),
  asian_red: require("@/assets/images/av_asian_red_f.png"),
  asian_white: require("@/assets/images/av_asian_white_f.png"),
  native_black: require("@/assets/images/av_native_black_f.png"),
  native_brown: require("@/assets/images/av_native_brown_f.png"),
  native_blonde: require("@/assets/images/av_native_blonde_f.png"),
  native_red: require("@/assets/images/av_native_red_f.png"),
  native_white: require("@/assets/images/av_native_white_f.png"),
  indian_black: require("@/assets/images/av_indian_black_f.png"),
  indian_brown: require("@/assets/images/av_indian_brown_f.png"),
  indian_blonde: require("@/assets/images/av_indian_blonde_f.png"),
  indian_red: require("@/assets/images/av_indian_red_f.png"),
  indian_white: require("@/assets/images/av_indian_white_f.png"),
};

export function defaultHair(id?: string) {
  return DEFAULT_HAIR[id || ""] || "black";
}

export function avatarImage(id?: string, sex?: string, hair?: string) {
  const race = (id || "avatar_white").replace("avatar_", "");
  const h = hair || defaultHair(id);
  const key = `${race}_${h}`;
  const map = sex === "female" ? AVATAR_IMAGES_F : AVATAR_IMAGES;
  return map[key] || map[`${race}_${defaultHair(id)}`] || AVATAR_IMAGES[key] || null;
}

export function hasAvatarArt(id?: string) {
  return avatarImage(id) != null;
}

// ---- Full-body equippable SKINS (swap the whole avatar) ----
export const SKIN_IMAGES: Record<string, any> = {
  skin_dragonknight: require("@/assets/images/skins/skin_dragonknight.png"),
  skin_dbz: require("@/assets/images/skins/skin_dbz.png"),
  skin_mecha: require("@/assets/images/skins/skin_mecha.png"),
  skin_cod: require("@/assets/images/skins/skin_cod.png"),
  skin_halo: require("@/assets/images/skins/skin_halo.png"),
  skin_viking: require("@/assets/images/skins/skin_viking.png"),
  skin_mercy: require("@/assets/images/skins/skin_mercy.png"),
  skin_wsm: require("@/assets/images/skins/skin_wsm.png"),
  skin_mk: require("@/assets/images/skins/skin_mk.png"),
  skin_aot: require("@/assets/images/skins/skin_aot.png"),
  skin_anime: require("@/assets/images/skins/skin_anime.png"),
  skin_knight: require("@/assets/images/skins/skin_knight.png"),
  skin_cyber: require("@/assets/images/skins/skin_cyber.png"),
  skin_space: require("@/assets/images/skins/skin_space.png"),
  skin_ancient: require("@/assets/images/skins/skin_ancient.png"),
  skin_monk: require("@/assets/images/skins/skin_monk.png"),
  skin_arcade: require("@/assets/images/skins/skin_arcade.png"),
  skin_shadow: require("@/assets/images/skins/skin_shadow.png"),
  skin_flame: require("@/assets/images/skins/skin_flame.png"),
  skin_frost: require("@/assets/images/skins/skin_frost.png"),
  skin_celestial: require("@/assets/images/skins/skin_celestial.png"),
};

// ---- Equippable WEAPONS (rendered as a prop beside the avatar) ----
export const WEAPON_IMAGES: Record<string, any> = {
  w_sword: require("@/assets/images/weapons/w_sword.png"),
  w_bo: require("@/assets/images/weapons/w_bo.png"),
  w_daggers: require("@/assets/images/weapons/w_daggers.png"),
  w_bow: require("@/assets/images/weapons/w_bow.png"),
  w_katana: require("@/assets/images/weapons/w_katana.png"),
  w_plasma: require("@/assets/images/weapons/w_plasma.png"),
  w_axe: require("@/assets/images/weapons/w_axe.png"),
  w_glaive: require("@/assets/images/weapons/w_glaive.png"),
  w_shadowblade: require("@/assets/images/weapons/w_shadowblade.png"),
  w_soulscythe: require("@/assets/images/weapons/w_soulscythe.png"),
  w_stormspear: require("@/assets/images/weapons/w_stormspear.png"),
};

export function skinImage(id?: string) {
  return SKIN_IMAGES[id || ""] || null;
}
export function weaponImage(id?: string) {
  return WEAPON_IMAGES[id || ""] || null;
}
// Resolve the body image for a person: equipped full-body skin overrides the base avatar.
export function bodyImage(person?: { equipped_skin?: string; avatar_id?: string; sex?: string; equipped_hair?: string } | null) {
  if (person?.equipped_skin && SKIN_IMAGES[person.equipped_skin]) return SKIN_IMAGES[person.equipped_skin];
  return avatarImage(person?.avatar_id, person?.sex, person?.equipped_hair);
}

// ---- Unified RARITY tiers (how rare / hard to get) ----
export const RARITY: Record<string, { label: string; color: string; glow: string; order: number }> = {
  common:    { label: "COMMON",    color: "#9AA5B1", glow: "#6B7482", order: 0 },
  rare:      { label: "RARE",      color: "#3B9DFF", glow: "#1E6FD0", order: 1 },
  epic:      { label: "EPIC",      color: "#C77DFF", glow: "#8B2FE0", order: 2 },
  legendary: { label: "LEGENDARY", color: "#FFD24A", glow: "#C9971A", order: 3 },
  mythic:    { label: "??????",    color: "#FF3B5C", glow: "#FF0055", order: 4 },
};
// Legacy rarity names mapped onto the 5-tier scale.
const RARITY_ALIAS: Record<string, string> = { exalted: "epic", eternal: "mythic", rare: "rare" };
export function rarityKey(r?: string): string {
  const k = (r || "common").toLowerCase();
  if (RARITY[k]) return k;
  return RARITY_ALIAS[k] || "common";
}
export function rarityColor(r?: string) { return RARITY[rarityKey(r)].color; }
export function rarityLabel(r?: string) { return RARITY[rarityKey(r)].label; }
export function rarityFromLevel(level?: number): string {
  const l = level || 1;
  if (l >= 999) return "mythic";
  if (l >= 18) return "legendary";
  if (l >= 10) return "epic";
  if (l >= 4) return "rare";
  return "common";
}


// Holographic card frames unlocked by rank (higher rank = fancier frame)
export const CARD_FRAMES: Record<string, { name: string; colors: [string, string, string]; border: string; glow: string }> = {
  Beginner:     { name: "STEEL FRAME",     colors: ["#2A2F3A", "#0A0C12", "#050508"], border: "#3A4152", glow: "#4A5568" },
  Intermediate: { name: "CYAN FRAME",      colors: ["#00E5FF55", "#0A0C12", "#050508"], border: "#00E5FF", glow: "#00E5FF" },
  Advanced:     { name: "COBALT FRAME",    colors: ["#0055FF66", "#0A0C12", "#050508"], border: "#0055FF", glow: "#0055FF" },
  Vanguard:     { name: "VANGUARD FRAME",  colors: ["#4C6FFF66", "#0A0C16", "#050508"], border: "#4C6FFF", glow: "#4C6FFF" },
  Warrior:      { name: "WARRIOR FRAME",   colors: ["#E08A2B66", "#140C04", "#050508"], border: "#E08A2B", glow: "#E08A2B" },
  Boss:         { name: "BOSS FRAME",      colors: ["#12B88666", "#04140C", "#050508"], border: "#12B886", glow: "#12B886" },
  Elite:        { name: "GILDED FRAME",    colors: ["#FFEA0066", "#0A0C12", "#050508"], border: "#FFEA00", glow: "#FFEA00" },
  Freak:        { name: "CRIMSON PRIME",   colors: ["#FF003C66", "#12040A", "#050508"], border: "#FF003C", glow: "#FF003C" },
};

// Rank ladder — each rank spans 10 app levels
export const RANK_ORDER = ["Beginner", "Intermediate", "Advanced", "Vanguard", "Warrior", "Boss", "Elite", "Freak"];
export function rankIndex(rank?: string) {
  const i = RANK_ORDER.indexOf(rank || "Beginner");
  return i < 0 ? 0 : i;
}

export function frameFor(rank?: string) {
  return CARD_FRAMES[rank || "Beginner"] || CARD_FRAMES.Beginner;
}

export const CLASS_TIER_COLORS: Record<string, string> = {
  E: "#8A8F9E", D: "#A0A5B5", C: "#00E5FF", B: "#0055FF", A: "#FFEA00", S: "#FF003C",
};

export const RANK_COLORS: Record<string, string> = {
  Beginner: "#A0A5B5",
  Intermediate: "#00E5FF",
  Advanced: "#0055FF",
  Vanguard: "#4C6FFF",
  Warrior: "#E08A2B",
  Boss: "#12B886",
  Elite: "#FFEA00",
  Freak: "#FF003C",
};

export function fmtWeight(w: number) {
  return `${Math.round(w)} lb`;
}

export const BACKGROUNDS: Record<string, string[]> = {
  bg_default: ["#002A55", "#12141A"],
  bg_cyber: ["#001A33", "#003A5C"],
  bg_toxic: ["#0A2A00", "#12141A"],
  bg_inferno: ["#2A0010", "#12141A"],
  bg_vanguard: ["#0A2A66", "#050914"],
  bg_warrior: ["#3A1E00", "#140A00"],
  bg_boss: ["#052A1A", "#04120C"],
  bg_void: ["#1A0033", "#050508"],
  bg_freak: ["#330000", "#0A0000"],
};

export function bgColors(id?: string): [string, string] {
  const c = BACKGROUNDS[id || "bg_default"] || BACKGROUNDS.bg_default;
  return [c[0], c[1]];
}

// AI-generated anime hero / gym background art (one per tier)
export const BG_IMAGES: Record<string, any> = {
  bg_default: require("@/assets/images/bg_default.png"),
  bg_cyber: require("@/assets/images/bg_cyber.png"),
  bg_toxic: require("@/assets/images/bg_toxic.png"),
  bg_inferno: require("@/assets/images/bg_inferno.png"),
  bg_vanguard: require("@/assets/images/bg_vanguard.png"),
  bg_warrior: require("@/assets/images/bg_warrior.png"),
  bg_boss: require("@/assets/images/bg_boss.png"),
  bg_void: require("@/assets/images/bg_void.png"),
  bg_freak: require("@/assets/images/bg_freak.png"),
};

export function bgImage(id?: string, sex?: string) {
  if (sex === "female") return BG_IMAGES_F[id || "bg_default"] || BG_IMAGES[id || "bg_default"] || BG_IMAGES.bg_default;
  return BG_IMAGES[id || "bg_default"] || BG_IMAGES.bg_default;
}

// Female tier backgrounds (shown when account sex is female)
export const BG_IMAGES_F: Record<string, any> = {
  bg_default: require("@/assets/images/bg_default_f.png"),
  bg_cyber: require("@/assets/images/bg_cyber_f.png"),
  bg_toxic: require("@/assets/images/bg_toxic_f.png"),
  bg_inferno: require("@/assets/images/bg_inferno_f.png"),
  bg_vanguard: require("@/assets/images/bg_vanguard_f.png"),
  bg_warrior: require("@/assets/images/bg_warrior_f.png"),
  bg_boss: require("@/assets/images/bg_boss_f.png"),
  bg_void: require("@/assets/images/bg_void_f.png"),
  bg_freak: require("@/assets/images/bg_freak_f.png"),
};

// ---------- Cosmetics display maps (mirror backend COSMETICS) ----------
export const EMBLEM_ICONS: Record<string, string> = {
  em_none: "", em_flame: "🔥", em_bolt: "⚡", em_skull: "💀",
  em_dragon: "🐉", em_crown: "👑", em_star: "⭐",
};
export const AURA_COLORS: Record<string, string> = {
  au_none: "", au_blue: "#00E5FF", au_green: "#00E5B4",
  au_gold: "#FFD700", au_violet: "#B14CFF", au_red: "#FF3B5C",
};
export const TITLE_TEXT: Record<string, string> = {
  ti_none: "", ti_iron: "IRON WILL", ti_beast: "BEAST MODE", ti_quest: "QUEST MASTER",
  ti_slayer: "BOSS SLAYER", ti_boss: "BOSS KILLER", ti_legend: "LIVING LEGEND",
  ti_enhanced: "ENHANCED", ti_founder: "FOUNDER",
};
export function loadoutTitle(loadout?: any): string {
  return TITLE_TEXT[loadout?.title || "ti_none"] || "";
}

// Web only: apply the persisted red palette synchronously at module load so the
// react-native-web preview renders red before any StyleSheet is created.
try {
  // @ts-ignore - window/localStorage only exist on web
  if (typeof window !== "undefined" && window.localStorage && window.localStorage.getItem("hic_enhanced_theme") === "1") {
    applyEnhancedPalette();
  }
} catch {}
