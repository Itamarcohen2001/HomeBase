import React, { useState } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Line, Text as SvgText, Circle, G } from 'react-native-svg';
import { colors } from '../theme';

export interface LineChartPoint {
  label: string;
  value: number;
}

export function LineChart({
  data,
  height = 220,
  color = colors.primary,
}: {
  data: LineChartPoint[];
  height?: number;
  color?: string;
}) {
  const [width, setWidth] = useState(0);

  if (data.length === 0) {
    return <View style={{ height, width: '100%' }} />;
  }

  // Handle single point by faking a straight line across the graph
  const points = data.length === 1 ? [data[0], data[0]] : data;

  const actualMinVal = Math.min(...points.map((p) => p.value));
  const minVal = Math.min(0, actualMinVal);
  const maxVal = Math.max(...points.map((p) => p.value));

  // Logical jumps for Y axis
  const minShekels = minVal / 100;
  const maxShekels = maxVal / 100;
  const rangeShekels = maxShekels - minShekels;

  let stepShekels = 1000;
  if (rangeShekels > 0) {
    const roughStep = rangeShekels / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
    const normalized = roughStep / mag;
    let nice = 1;
    if (normalized >= 5) nice = 5;
    else if (normalized >= 2) nice = 2;
    stepShekels = nice * mag;
  }

  // Ensure we have some padding around the actual min/max
  const minTickShekels = Math.floor(minShekels / stepShekels) * stepShekels;
  const maxTickShekels = Math.ceil(maxShekels / stepShekels) * stepShekels;

  const yTicks = [];
  for (let s = minTickShekels; s <= maxTickShekels; s += stepShekels) {
    yTicks.push(s * 100); // back to agorot
  }

  // Just in case of 0 range
  if (yTicks.length === 1) {
    yTicks.push(yTicks[0] + stepShekels * 100);
    yTicks.unshift(yTicks[0] - stepShekels * 100);
  }

  const actualMinTarget = yTicks[0];
  const actualMaxTarget = yTicks[yTicks.length - 1];
  const actualRange = actualMaxTarget - actualMinTarget;

  // Chart area dimensions
  const paddingLeft = 55; // Space for Y axis labels
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 30; // Space for X axis labels
  const chartWidth = Math.max(0, width - paddingLeft - paddingRight);
  const chartHeight = Math.max(0, height - paddingTop - paddingBottom);

  // Normalization helper
  const getY = (val: number) => {
    if (actualRange === 0) return paddingTop + chartHeight / 2;
    return paddingTop + chartHeight - ((val - actualMinTarget) / actualRange) * chartHeight;
  };
  const getX = (index: number) => {
    if (points.length <= 1 || chartWidth === 0) return paddingLeft;
    return paddingLeft + (index / (points.length - 1)) * chartWidth;
  };

  const pathD = points
    .map((p, index) => {
      const x = getX(index);
      const y = getY(p.value);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  // Gradient polygon
  const areaD = `${pathD} L ${paddingLeft + chartWidth} ${paddingTop + chartHeight} L ${paddingLeft} ${paddingTop + chartHeight} Z`;

  // Format Y label (e.g. 10000000 agorot -> 100K ₪)
  const formatYLabel = (agorot: number) => {
    const shekels = Math.round(agorot / 100);
    if (Math.abs(shekels) >= 1000000) return `${(shekels / 1000000).toFixed(1)}M ₪`;
    if (Math.abs(shekels) >= 1000) return `${(shekels / 1000).toFixed(0)}K ₪`;
    return `${shekels} ₪`;
  };

  // Format X label (e.g. "2026-08-04" -> "08/26")
  const formatXLabel = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      return `${parts[1]}/${parts[0].slice(-2)}`;
    }
    return dateStr;
  };

  return (
    <View
      style={{ height, width: '100%', overflow: 'hidden' }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          <Defs>
            <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity="0.25" />
              <Stop offset="1" stopColor={color} stopOpacity="0.0" />
            </LinearGradient>
          </Defs>

          {/* Grid lines & Y labels */}
          {yTicks.map((val, i) => {
            const y = getY(val);
            return (
              <G key={`y-${i}`}>
                <Line
                  x1={paddingLeft}
                  y1={y}
                  x2={width - paddingRight}
                  y2={y}
                  stroke={colors.border}
                  strokeWidth={1}
                  strokeDasharray="4 4"
                />
                <SvgText
                  x={paddingLeft - 10}
                  y={y + 4}
                  fill={colors.textMuted}
                  fontSize={11}
                  textAnchor="end"
                >
                  {formatYLabel(val)}
                </SvgText>
              </G>
            );
          })}

          {/* X labels & points */}
          {points.map((p, i) => {
            const x = getX(i);

            // Adjust anchor for first and last labels
            let anchor: 'start' | 'middle' | 'end' = 'middle';
            if (i === 0) {
              anchor = 'start';
            } else if (i === points.length - 1) {
              anchor = 'end';
            }

            return (
              <G key={`p-${i}`}>
                {/* Tick mark */}
                <Line
                  x1={x}
                  y1={paddingTop + chartHeight}
                  x2={x}
                  y2={paddingTop + chartHeight + 4}
                  stroke={colors.border}
                  strokeWidth={1}
                />
                <SvgText
                  x={x}
                  y={paddingTop + chartHeight + 16}
                  fill={colors.textMuted}
                  fontSize={11}
                  textAnchor={anchor}
                >
                  {formatXLabel(p.label)}
                </SvgText>

                {/* Point dot */}
                <Circle
                  cx={x}
                  cy={getY(p.value)}
                  r={3.5}
                  fill={colors.surface}
                  stroke={color}
                  strokeWidth={2}
                />
              </G>
            );
          })}

          <Path d={areaD} fill="url(#grad)" />
          <Path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />
        </Svg>
      )}
    </View>
  );
}
