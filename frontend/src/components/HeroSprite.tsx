import { View } from "react-native";
import Svg, { Circle, Rect, Polygon, Path } from "react-native-svg";

// Generic stylized anime-hero sprite (no external assets).
export function HeroSprite({ size = 44, color = "#00E5FF", facing = 1 }: { size?: number; color?: string; facing?: 1 | -1 }) {
  return (
    <View style={{ width: size, height: size, transform: [{ scaleX: facing }] }}>
      <Svg width={size} height={size} viewBox="0 0 48 48">
        {/* cape */}
        <Path d="M16 18 L10 40 L20 34 Z" fill={color} opacity={0.35} />
        {/* body */}
        <Rect x={17} y={19} width={13} height={16} rx={4} fill="#12141A" stroke={color} strokeWidth={2} />
        {/* legs */}
        <Rect x={18} y={34} width={4} height={9} rx={2} fill="#12141A" stroke={color} strokeWidth={1.5} />
        <Rect x={25} y={34} width={4} height={9} rx={2} fill="#12141A" stroke={color} strokeWidth={1.5} />
        {/* head */}
        <Circle cx={23} cy={13} r={7} fill="#12141A" stroke={color} strokeWidth={2} />
        {/* spiky hair */}
        <Polygon points="16,10 20,3 22,9" fill={color} />
        <Polygon points="21,9 25,2 27,9" fill={color} />
        <Polygon points="26,9 30,4 30,11" fill={color} />
        {/* sword arm + blade */}
        <Rect x={30} y={12} width={3} height={20} rx={1.5} fill={color} transform="rotate(28 31 22)" />
        <Rect x={30} y={26} width={5} height={4} rx={1} fill="#12141A" stroke={color} strokeWidth={1} transform="rotate(28 32 28)" />
      </Svg>
    </View>
  );
}
