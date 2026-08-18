import { useEffect, useState } from "react";
import { View, StyleSheet, ViewStyle, Image as RNImage } from "react-native";
import { Image } from "expo-image";
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming, withDelay,
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
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, st]}>
      <RNImage source={NOISE} style={{ width: w, height: h + 12 }} resizeMode="repeat" />
    </Animated.View>
  );
}

type SliceProps = {
  source: any;
  w: number;
  h: number;
  top: number;
  band: number;
  tint: string;
  delay: number;
  shift: number;
};

function GlitchSlice({ source, w, h, top, band, tint, delay, shift }: SliceProps) {
  const tx = useSharedValue(0);
  const op = useSharedValue(0);

  useEffect(() => {
    tx.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-shift, { duration: 70 }),
          withTiming(shift * 0.7, { duration: 70 }),
          withTiming(0, { duration: 70 }),
          withTiming(0, { duration: 1400 + delay }),
        ),
        -1,
      ),
    );
    op.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0.85, { duration: 50 }),
          withTiming(0, { duration: 110 }),
          withTiming(0.6, { duration: 50 }),
          withTiming(0, { duration: 1500 + delay }),
        ),
        -1,
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [w, h]);

  const outer = useAnimatedStyle(() => ({ opacity: op.value }));
  const inner = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));

  return (
    <Animated.View style={[styles.slice, { top, height: band, width: w }, outer]}>
      <Animated.View style={[{ width: w, height: h, transform: [{ translateY: -top }] }, inner]}>
        <Image source={source} style={{ width: w, height: h }} contentFit="cover" />
      </Animated.View>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint, opacity: 0.22 }]} />
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
    <Animated.View pointerEvents="none" style={[styles.sweep, { width: w }, st]} />
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
          <GlitchSlice source={source} w={size.w} h={size.h} top={size.h * 0.18} band={Math.max(14, size.h * 0.07)} tint="#00E5FF" delay={0} shift={16} />
          <GlitchSlice source={source} w={size.w} h={size.h} top={size.h * 0.44} band={Math.max(10, size.h * 0.05)} tint="#FF003C" delay={140} shift={22} />
          <GlitchSlice source={source} w={size.w} h={size.h} top={size.h * 0.63} band={Math.max(12, size.h * 0.06)} tint="#00E5FF" delay={300} shift={13} />
          <GlitchSlice source={source} w={size.w} h={size.h} top={size.h * 0.8} band={Math.max(8, size.h * 0.04)} tint="#FF003C" delay={520} shift={26} />
          <ScanSweep w={size.w} h={size.h} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slice: { position: "absolute", left: 0, overflow: "hidden" },
  sweep: { position: "absolute", left: 0, height: 2, backgroundColor: "rgba(0,229,255,0.55)" },
});
