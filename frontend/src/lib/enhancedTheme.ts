import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { applyEnhancedPalette } from "./theme";

export const ENHANCED_FLAG = "hic_enhanced_theme";

// Persist (or clear) the red-theme flag so it survives app reloads.
export async function persistEnhancedFlag(on: boolean) {
  try {
    if (on) await AsyncStorage.setItem(ENHANCED_FLAG, "1");
    else await AsyncStorage.removeItem(ENHANCED_FLAG);
  } catch {}
  if (Platform.OS === "web") {
    try {
      // @ts-ignore
      if (on) window.localStorage.setItem(ENHANCED_FLAG, "1");
      // @ts-ignore
      else window.localStorage.removeItem(ENHANCED_FLAG);
    } catch {}
  }
}

export async function loadEnhancedFlag(): Promise<boolean> {
  try {
    const v = await AsyncStorage.getItem(ENHANCED_FLAG);
    if (v === "1") return true;
  } catch {}
  return false;
}

// Full app reload so every StyleSheet re-evaluates with the red palette.
export function reloadApp() {
  if (Platform.OS === "web") {
    try {
      // @ts-ignore
      window.location.reload();
    } catch {}
    return;
  }
  try {
    const { DevSettings } = require("react-native");
    if (DevSettings?.reload) {
      DevSettings.reload();
      return;
    }
  } catch {}
  try {
    const Updates = require("expo-updates");
    Updates.reloadAsync?.();
  } catch {}
}

// Applied at app boot (before route StyleSheets create) via the custom entry.
export async function bootstrapEnhancedPalette() {
  if (await loadEnhancedFlag()) applyEnhancedPalette();
}
