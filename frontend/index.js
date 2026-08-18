// Custom entry. IMPORTANT: expo-router/entry must be imported synchronously so
// the native root component registers during initial bundle eval (Expo Go throws
// "main has not been registered" otherwise). Web applies the persisted red palette
// synchronously inside theme.ts at import time; native applies it best-effort below.
import { applyEnhancedPalette } from "./src/lib/theme";
import { loadEnhancedFlag } from "./src/lib/enhancedTheme";
import "expo-router/entry";

loadEnhancedFlag()
  .then((on) => { if (on) applyEnhancedPalette(); })
  .catch(() => {});
