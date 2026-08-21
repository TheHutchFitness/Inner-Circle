import { useEffect, useRef } from "react";
import { Alert, Platform } from "react-native";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/src/lib/auth";

const KEY = "loc_primer_done_v1";

// One-time, first-login location primer. Shows a short pre-permission explanation,
// then requests foreground location so the app can surface gyms near the athlete.
// Native only — on web the browser prompts inline when the Gym Map loads.
export function LocationPrimer() {
  const { user } = useAuth();
  const ran = useRef(false);

  useEffect(() => {
    if (!user || ran.current || Platform.OS === "web") return;
    ran.current = true;
    (async () => {
      try {
        if (await AsyncStorage.getItem(KEY)) return;
        const cur = await Location.getForegroundPermissionsAsync();
        if (cur.status !== "undetermined" || !cur.canAskAgain) {
          await AsyncStorage.setItem(KEY, "1");
          return;
        }
        Alert.alert(
          "Find gyms near you",
          "Allow location so The Inner Circle can show the gyms and training spots closest to you — and let you check in for XP.",
          [
            { text: "Not now", style: "cancel", onPress: () => { AsyncStorage.setItem(KEY, "1"); } },
            {
              text: "Allow",
              onPress: async () => {
                try { await Location.requestForegroundPermissionsAsync(); } catch {}
                await AsyncStorage.setItem(KEY, "1");
              },
            },
          ],
        );
      } catch {}
    })();
  }, [user]);

  return null;
}
