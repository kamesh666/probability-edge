/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface EquityCurveChartProps {
  points: { time: number; equity: number }[];
  baseline: number;
  height?: number;
}

/**
 * Lightweight SVG equity curve with a dashed starting-capital baseline.
 */
export const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ points, baseline, height = 180 }) => {
  if (points.length < 2) {
    return (
      <div className="flex items-center justify-center text-xs font-mono text-slate-500" style={{ height }}>
        Not enough closed trades to draw an equity curve yet.
      </div>
    );
  }

  const width = 800;
  const pad = 8;
  const values = points.map(p => p.equity).concat(baseline);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / range) * (height - pad * 2);

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.equity).toFixed(1)}`).join(' ');
  const last = points[points.length - 1].equity;
  const stroke = last >= baseline ? '#34d399' : '#fb7185';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img" aria-label="Equity curve">
      <line x1={pad} x2={width - pad} y1={y(baseline)} y2={y(baseline)} stroke="#475569" strokeDasharray="4 4" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      <path d={path} fill="none" stroke={stroke} strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
};

export function formatInr(value: number, digits = 0): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${Math.abs(value).toLocaleString('en-IN', { maximumFractionDigits: digits, minimumFractionDigits: digits })}`;
}
