import React, { useState } from 'react';
import { Platform, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop, Line, Text as SvgText, Circle } from 'react-native-svg';
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

  const minTickShekels = Math.floor(minShekels / stepShekels) * stepShekels;
  const maxTickShekels = Math.ceil(maxShekels / stepShekels) * stepShekels;

  const yTicks: number[] = [];
  for (let s = minTickShekels; s <= maxTickShekels; s += stepShekels) {
    yTicks.push(s * 100);
  }

  if (yTicks.length === 1) {
    yTicks.push(yTicks[0] + stepShekels * 100);
    yTicks.unshift(yTicks[0] - stepShekels * 100);
  }

  const actualMinTarget = yTicks[0];
  const actualMaxTarget = yTicks[yTicks.length - 1];
  const actualRange = actualMaxTarget - actualMinTarget;

  const paddingLeft = 55;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 30;
  const chartWidth = Math.max(0, width - paddingLeft - paddingRight);
  const chartHeight = Math.max(0, height - paddingTop - paddingBottom);

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

  const areaD = `${pathD} L ${paddingLeft + chartWidth} ${paddingTop + chartHeight} L ${paddingLeft} ${paddingTop + chartHeight} Z`;

  const formatYLabel = (agorot: number) => {
    const shekels = Math.round(agorot / 100);
    if (Math.abs(shekels) >= 1000000) return `${(shekels / 1000000).toFixed(1)}M ₪`;
    if (Math.abs(shekels) >= 1000) return `${(shekels / 1000).toFixed(0)}K ₪`;
    return `${shekels} ₪`;
  };

  const formatXLabel = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
      return `${parts[1]}/${parts[0].slice(-2)}`;
    }
    return dateStr;
  };

  const shouldShowLabel = (i: number) =>
    i === 0 ||
    i === points.length - 1 ||
    (points.length > 5 ? i % Math.ceil(points.length / 5) === 0 : true);

  // ─── Web: use native browser SVG (react-native-svg has issues on web) ─────
  if (Platform.OS === 'web') {
    const gradId = 'lc-grad';
    return (
      <View
        style={{ height, width: '100%', overflow: 'hidden' }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 &&
          React.createElement(
            'svg',
            { width, height, viewBox: `0 0 ${width} ${height}`, style: { display: 'block' } },
            // defs
            React.createElement(
              'defs',
              null,
              React.createElement(
                'linearGradient',
                { id: gradId, x1: '0', y1: '0', x2: '0', y2: '1' },
                React.createElement('stop', { offset: '0', stopColor: color, stopOpacity: '0.25' }),
                React.createElement('stop', { offset: '1', stopColor: color, stopOpacity: '0' })
              )
            ),
            // Y grid lines + labels
            ...yTicks.flatMap((val, i) => {
              const y = getY(val);
              return [
                React.createElement('line', {
                  key: `yL-${i}`,
                  x1: paddingLeft, y1: y,
                  x2: width - paddingRight, y2: y,
                  stroke: colors.border, strokeWidth: 1, strokeDasharray: '4 4',
                }),
                React.createElement(
                  'text',
                  {
                    key: `yT-${i}`,
                    x: paddingLeft - 10, y: y + 4,
                    fill: colors.textMuted, fontSize: 11, textAnchor: 'end',
                  },
                  formatYLabel(val)
                ),
              ];
            }),
            // X tick marks + labels + dots
            ...points.flatMap((p, i) => {
              const x = getX(i);
              const anchor = i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
              const els: React.ReactElement[] = [];
              if (shouldShowLabel(i)) {
                els.push(
                  React.createElement('line', {
                    key: `pL-${i}`,
                    x1: x, y1: paddingTop + chartHeight,
                    x2: x, y2: paddingTop + chartHeight + 4,
                    stroke: colors.border, strokeWidth: 1,
                  }),
                  React.createElement(
                    'text',
                    {
                      key: `pT-${i}`,
                      x, y: paddingTop + chartHeight + 16,
                      fill: colors.textMuted, fontSize: 11, textAnchor: anchor,
                    },
                    formatXLabel(p.label)
                  )
                );
              }
              els.push(
                React.createElement('circle', {
                  key: `pC-${i}`,
                  cx: x, cy: getY(p.value),
                  r: 3.5, fill: colors.surface, stroke: color, strokeWidth: 2,
                })
              );
              return els;
            }),
            // Area fill (on top of grid, below dots handled by order)
            React.createElement('path', { key: 'area', d: areaD, fill: `url(#${gradId})` }),
            // Line stroke
            React.createElement('path', {
              key: 'line',
              d: pathD, fill: 'none',
              stroke: color, strokeWidth: 2.5,
              strokeLinejoin: 'round', strokeLinecap: 'round',
            }),
            // Dots again on top of fill
            ...points.map((p, i) =>
              React.createElement('circle', {
                key: `pCTop-${i}`,
                cx: getX(i), cy: getY(p.value),
                r: 3.5, fill: colors.surface, stroke: color, strokeWidth: 2,
              })
            )
          )}
      </View>
    );
  }

  // ─── Native: use react-native-svg ─────────────────────────────────────────
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

          {yTicks.flatMap((val, i) => {
            const y = getY(val);
            return [
              <Line
                key={`yL-${i}`}
                x1={paddingLeft} y1={y}
                x2={width - paddingRight} y2={y}
                stroke={colors.border} strokeWidth={1} strokeDasharray="4 4"
              />,
              <SvgText
                key={`yT-${i}`}
                x={paddingLeft - 10} y={y + 4}
                fill={colors.textMuted} fontSize={11} textAnchor="end"
              >
                {formatYLabel(val)}
              </SvgText>,
            ];
          })}

          {points.flatMap((p, i) => {
            const x = getX(i);
            const anchor: 'start' | 'middle' | 'end' =
              i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle';
            const els: React.ReactElement[] = [];
            if (shouldShowLabel(i)) {
              els.push(
                <Line
                  key={`pL-${i}`}
                  x1={x} y1={paddingTop + chartHeight}
                  x2={x} y2={paddingTop + chartHeight + 4}
                  stroke={colors.border} strokeWidth={1}
                />,
                <SvgText
                  key={`pT-${i}`}
                  x={x} y={paddingTop + chartHeight + 16}
                  fill={colors.textMuted} fontSize={11} textAnchor={anchor}
                >
                  {formatXLabel(p.label)}
                </SvgText>
              );
            }
            els.push(
              <Circle
                key={`pC-${i}`}
                cx={x} cy={getY(p.value)}
                r={3.5} fill={colors.surface} stroke={color} strokeWidth={2}
              />
            );
            return els;
          })}

          <Path d={areaD} fill="url(#grad)" />
          <Path d={pathD} fill="none" stroke={color} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

          {points.map((p, i) => (
            <Circle
              key={`pCTop-${i}`}
              cx={getX(i)} cy={getY(p.value)}
              r={3.5} fill={colors.surface} stroke={color} strokeWidth={2}
            />
          ))}
        </Svg>
      )}
    </View>
  );
}
