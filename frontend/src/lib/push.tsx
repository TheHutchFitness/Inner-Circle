import { useEffect, useRef } from "react";
import { Platform, AppState, Alert, Linking } from "react-native";
import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/lib/auth";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

// 1. Foreground handler — module scope, before any component (web-guarded)
if (Platform.OS !== "web") {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

// 2. Android channel — module scope
if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.MAX,
    sound: "default",
  });
}

export async function registerForPush(userId: string) {
  if (Platform.OS === "web" || !userId) return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    const tokenResp = await Notifications.getDevicePushTokenAsync();
    await fetch(`${API}/api/register-push`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: userId, platform: Platform.OS, device_token: tokenResp.data }),
    });
  } catch {
    // non-blocking — push is best-effort and only works on a real build
  }
}

export function PushManager() {
  const { user } = useAuth();
  const router = useRouter();
  const uidRef = useRef<string | null>(null);

  // Register on login and every time the app returns to the foreground.
  useEffect(() => {
    if (Platform.OS === "web") return;
    uidRef.current = user?.user_id || null;
    if (user?.user_id) registerForPush(user.user_id);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active" && uidRef.current) registerForPush(uidRef.current);
    });
    return () => sub.remove();
  }, [user?.user_id]);

  // Tap handlers + denied-permission nudge
  useEffect(() => {
    if (Platform.OS === "web") return;

    const go = (data: any) => {
      const url = data?.deeplink || data?.action_url;
      if (!url) return;
      url.startsWith("http") ? Linking.openURL(url) : router.push(url);
    };

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      go(response.notification.request.content.data || {});
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) go(response.notification.request.content.data || {});
    });

    (async () => {
      const { status, canAskAgain } = await Notifications.getPermissionsAsync();
      if (status !== "denied" || canAskAgain) return;
      const lastNudge = await AsyncStorage.getItem("pushNudgeAt");
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (lastNudge && Date.now() - Number(lastNudge) <= oneWeek) return;
      Alert.alert(
        "Turn on session reminders",
        "Enable notifications to get reminders 24 hours and 1 hour before your booked training sessions.",
        [
          { text: "Later", style: "cancel", onPress: () => AsyncStorage.setItem("pushNudgeAt", String(Date.now())) },
          { text: "Open Settings", onPress: () => { AsyncStorage.setItem("pushNudgeAt", String(Date.now())); Linking.openSettings(); } },
        ]
      );
    })();

    return () => { tapSub.remove(); };
  }, []);

  return null;
}
