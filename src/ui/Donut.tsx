import React from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import type { AnalysisSlice } from '../lib/types';
import { colors } from '../theme';

const TAU = Math.PI * 2;

function polar(cx: number, cy: number, radius: number, angle: number) {
  return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
}

/** טבעת בין שתי זוויות. ציר ה-Y ב-SVG יורד, ולכן sweep=1 הוא עם כיוון השעון. */
function ringSegment(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  from: number,
  to: number,
): string {
  const largeArc = to - from > Math.PI ? 1 : 0;
  const o1 = polar(cx, cy, outer, from);
  const o2 = polar(cx, cy, outer, to);
  const i2 = polar(cx, cy, inner, to);
  const i1 = polar(cx, cy, inner, from);

  return [
    `M ${o1.x} ${o1.y}`,
    `A ${outer} ${outer} 0 ${largeArc} 1 ${o2.x} ${o2.y}`,
    `L ${i2.x} ${i2.y}`,
    `A ${inner} ${inner} 0 ${largeArc} 0 ${i1.x} ${i1.y}`,
    'Z',
  ].join(' ');
}

/**
 * גרף דונאט. מצויר ידנית ב-react-native-svg כדי שיעבוד זהה בוובי ובנייטיב
 * ובלי תלות בספריית גרפים שמניחה מספר קבוע של פרוסות.
 */
export function Donut({
  slices,
  size = 200,
  thickness = 34,
  accessibilityLabel,
  children,
}: {
  slices: AnalysisSlice[];
  size?: number;
  thickness?: number;
  accessibilityLabel: string;
  /** תוכן במרכז הטבעת (סכום כולל וכדומה) */
  children?: React.ReactNode;
}) {
  const total = slices.reduce((sum, s) => sum + s.amount, 0);
  const cx = size / 2;
  const cy = size / 2;
  const outer = size / 2;
  const inner = Math.max(0, outer - thickness);
  const start = -Math.PI / 2;

  let angle = start;
  const paths = slices.map((slice) => {
    const sweep = total > 0 ? (slice.amount / total) * TAU : 0;
    const d = ringSegment(cx, cy, outer, inner, angle, angle + sweep);
    angle += sweep;
    return { key: slice.key, color: slice.color, d };
  });

  // פרוסה יחידה שווה 360°, וקשת של 360° מתנוונת לנקודה — מציירים טבעת מלאה.
  const single = slices.length === 1;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: 'absolute' }}>
        <G>
          {single ? (
            <Circle
              cx={cx}
              cy={cy}
              r={(outer + inner) / 2}
              stroke={slices[0].color}
              strokeWidth={thickness}
              fill="none"
            />
          ) : (
            paths.map((p) => (
              <Path key={p.key} d={p.d} fill={p.color} stroke={colors.surface} strokeWidth={1.5} />
            ))
          )}
        </G>
      </Svg>
      <View style={{ alignItems: 'center', justifyContent: 'center', maxWidth: inner * 1.6 }}>{children}</View>
    </View>
  );
}
