import React from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useRouter } from "expo-router";

const ORDER = ["index", "workout", "leaderboard", "quests", "community", "profile"];
const PATHS: Record<string, string> = {
  index: "/(tabs)",
  workout: "/(tabs)/workout",
  leaderboard: "/(tabs)/leaderboard",
  quests: "/(tabs)/quests",
  community: "/(tabs)/community",
  profile: "/(tabs)/profile",
};

// Wraps a tab screen and lets the user swipe left/right to move between tabs.
// Horizontal-only activation so vertical scrolling keeps working.
export function SwipeTabs({ current, children }: { current: string; children: React.ReactNode }) {
  const router = useRouter();

  const go = (dir: number) => {
    const i = ORDER.indexOf(current);
    const n = i + dir;
    if (n < 0 || n >= ORDER.length) return;
    router.navigate(PATHS[ORDER[n]] as any);
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-24, 24])
    .failOffsetY([-18, 18])
    .onEnd((e) => {
      if (e.translationX <= -55 && Math.abs(e.velocityX) > 120) runOnJS(go)(1);
      else if (e.translationX >= 55 && Math.abs(e.velocityX) > 120) runOnJS(go)(-1);
      else if (e.translationX <= -90) runOnJS(go)(1);
      else if (e.translationX >= 90) runOnJS(go)(-1);
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={{ flex: 1 }}>{children}</View>
    </GestureDetector>
  );
}
