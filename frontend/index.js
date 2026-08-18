// Custom entry: apply the persisted "Enhanced" red palette BEFORE expo-router
// loads any route (route modules create their StyleSheets at import time, so the
// palette must be mutated first for the red takeover to apply app-wide).
import { bootstrapEnhancedPalette } from "./src/lib/enhancedTheme";

bootstrapEnhancedPalette()
  .catch(() => {})
  .finally(() => {
    require("expo-router/entry");
  });
