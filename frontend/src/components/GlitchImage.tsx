import { useEffect, useState } from "react";
import { View, StyleSheet, ViewStyle, Image as RNImage } from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
} from "react-native-reanimated";

const NOISE = require("@/assets/images/static_noise.png");

function StaticNoise({ w, h }: { w: number; h: number }) {
  const op = useSharedValue(0.12);
  const ty = useSharedValue(0);
  useEffect(() => {
    op.value = withRepeat(
      withSequence(
        withTiming(0.22, { duration: 90 }),
        withTiming(0.08, { duration: 90 }),
        withTiming(0.18, { duration: 90 }),
        withTiming(0.1, { duration: 90 }),
      ),
      -1,
    );
    ty.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 70 }),
        withTiming(5, { duration: 70 }),
        withTiming(0, { duration: 70 }),
      ),
      -1,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);
  const st = useAnimatedStyle(() => ({ opacity: op.value, transform: [{ translateY: ty.value }] }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }, st]}>
      <RNImage source={NOISE} style={{ width: w, height: h + 12 }} resizeMode="repeat" />
    </Animated.View>
  );
}

function ScanSweep({ w, h }: { w: number; h: number }) {
  const y = useSharedValue(-40);
  useEffect(() => {
    y.value = withRepeat(withTiming(h + 40, { duration: 2600 }), -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View style={[styles.sweep, { width: w, pointerEvents: "none" }, st]} />
  );
}

export function GlitchImage({ source, style }: { source: any; style?: ViewStyle }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View
      style={style}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="cover" />
      {size.h > 0 && (
        <>
          <StaticNoise w={size.w} h={size.h} />
          <ScanSweep w={size.w} h={size.h} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  sweep: { position: "absolute", left: 0, height: 2, backgroundColor: "rgba(0,229,255,0.55)" },
});
