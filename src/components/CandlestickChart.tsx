/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { Candle, Timeframe, StructureEvent, SRLevel } from '../types/market.ts';
import { calculateEMA, calculateVWAP } from '../engine/indicators.ts';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface CandlestickChartProps {
  candles: Candle[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  structureEvents: StructureEvent[];
  srLevels: SRLevel[];
  height?: number;
}

export const CandlestickChart: React.FC<CandlestickChartProps> = ({
  candles = [],
  timeframe,
  onTimeframeChange,
  structureEvents = [],
  srLevels = [],
  height = 520,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleCount, setVisibleCount] = useState<number>(75);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number } | null>(null);

  // Overlay visibility toggles
  const [showEMA20, setShowEMA20] = useState(true);
  const [showEMA50, setShowEMA50] = useState(true);
  const [showVWAP, setShowVWAP] = useState(true);
  const [showSwings, setShowSwings] = useState(true);
  const [showBOS, setShowBOS] = useState(true);
  const [showSR, setShowSR] = useState(true);

  // Slice visible candles to the last visibleCount bars
  const visibleCandles = useMemo(() => {
    if (!candles || candles.length === 0) return [];
    return candles.slice(-visibleCount);
  }, [candles, visibleCount]);

  // Compute indicators over the full dataset then slice
  const fullEMA20 = useMemo(() => calculateEMA(candles, 20), [candles]);
  const fullEMA50 = useMemo(() => calculateEMA(candles, 50), [candles]);
  const fullVWAP = useMemo(() => calculateVWAP(candles), [candles]);

  const visibleEMA20 = useMemo(() => fullEMA20.slice(-visibleCount), [fullEMA20, visibleCount]);
  const visibleEMA50 = useMemo(() => fullEMA50.slice(-visibleCount), [fullEMA50, visibleCount]);
  const visibleVWAP = useMemo(() => fullVWAP.slice(-visibleCount), [fullVWAP, visibleCount]);

  // Dynamic price scaling
  const { minPrice, maxPrice, priceRange, maxVol } = useMemo(() => {
    if (visibleCandles.length === 0) {
      return { minPrice: 24700, maxPrice: 24900, priceRange: 200, maxVol: 1000 };
    }
    let min = Infinity;
    let max = -Infinity;
    let maxV = 0;

    for (const c of visibleCandles) {
      if (c.low < min) min = c.low;
      if (c.high > max) max = c.high;
      if (c.volume > maxV) maxV = c.volume;
    }

    const span = Math.max(10, max - min);
    return {
      minPrice: min - span * 0.08,
      maxPrice: max + span * 0.08,
      priceRange: Math.max(1, span * 1.16),
      maxVol: Math.max(1, maxV),
    };
  }, [visibleCandles]);

  // SVG dimensions
  const chartWidth = 960;
  const priceChartHeight = height * 0.76;
  const volChartHeight = height * 0.20;
  const paddingRight = 75;
  const plotWidth = chartWidth - paddingRight;

  const candleGap = visibleCandles.length > 0 ? plotWidth / visibleCandles.length : 10;
  const candleWidth = Math.max(2, candleGap * 0.72);

  const priceToY = (price: number) => {
    if (priceRange <= 0) return priceChartHeight / 2;
    return priceChartHeight - ((price - minPrice) / priceRange) * priceChartHeight;
  };

  const volToY = (vol: number) => {
    if (maxVol <= 0) return height;
    const norm = (vol / maxVol) * volChartHeight;
    return height - norm;
  };

  // Build Indicator Polyline points
  const ema20Points = useMemo(() => {
    return visibleEMA20
      .map((val, idx) => {
        if (val === null) return null;
        const x = idx * candleGap + candleGap / 2;
        const y = priceToY(val);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');
  }, [visibleEMA20, candleGap, minPrice, priceRange]);

  const ema50Points = useMemo(() => {
    return visibleEMA50
      .map((val, idx) => {
        if (val === null) return null;
        const x = idx * candleGap + candleGap / 2;
        const y = priceToY(val);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');
  }, [visibleEMA50, candleGap, minPrice, priceRange]);

  const vwapPoints = useMemo(() => {
    return visibleVWAP
      .map((val, idx) => {
        if (val === null) return null;
        const x = idx * candleGap + candleGap / 2;
        const y = priceToY(val);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .filter(Boolean)
      .join(' ');
  }, [visibleVWAP, candleGap, minPrice, priceRange]);

  // Filter structure events in visible window
  const visibleEvents = useMemo(() => {
    if (visibleCandles.length === 0) return [];
    const minTime = visibleCandles[0].time;
    const maxTime = visibleCandles[visibleCandles.length - 1].time;
    return structureEvents.filter(e => e.detectionTime >= minTime && e.detectionTime <= maxTime);
  }, [visibleCandles, structureEvents]);

  // Handle Mouse Hover / Crosshair
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x >= 0 && x <= plotWidth && visibleCandles.length > 0) {
      const idx = Math.min(visibleCandles.length - 1, Math.max(0, Math.floor(x / candleGap)));
      setHoverIndex(idx);
      setMousePos({ x, y });
    } else {
      setHoverIndex(null);
      setMousePos(null);
    }
  };

  const handleMouseLeave = () => {
    setHoverIndex(null);
    setMousePos(null);
  };

  const hoveredCandle = hoverIndex !== null && visibleCandles[hoverIndex]
    ? visibleCandles[hoverIndex]
    : visibleCandles.length > 0
      ? visibleCandles[visibleCandles.length - 1]
      : null;

  const hoveredVWAP = hoverIndex !== null && visibleVWAP[hoverIndex] !== undefined
    ? visibleVWAP[hoverIndex]
    : visibleVWAP.length > 0
      ? visibleVWAP[visibleVWAP.length - 1]
      : null;

  // Price axis grid lines
  const gridLevels = 6;
  const priceGrid = Array.from({ length: gridLevels }).map((_, i) => {
    const price = minPrice + (priceRange / (gridLevels - 1)) * i;
    return { price, y: priceToY(price) };
  });

  return (
    <div className="bg-[#0B0F17] border border-slate-800 rounded-lg overflow-hidden flex flex-col">
      {/* Chart Control Header */}
      <div className="flex flex-wrap items-center justify-between px-4 py-2 border-b border-slate-800 bg-[#0E1420] text-xs">
        <div className="flex items-center gap-3">
          {/* Timeframe Selector */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            {(['1m', '5m', '15m'] as Timeframe[]).map(tf => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={`px-2.5 py-0.5 text-xs font-semibold rounded transition-colors ${
                  timeframe === tf ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {tf}
              </button>
            ))}
          </div>

          <div className="h-3 w-[1px] bg-slate-800" />

          {/* Indicator Visibility Toggles */}
          <button
            onClick={() => setShowVWAP(!showVWAP)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
              showVWAP ? 'bg-purple-950/60 border-purple-800 text-purple-300' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            VWAP
          </button>
          <button
            onClick={() => setShowEMA20(!showEMA20)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
              showEMA20 ? 'bg-cyan-950/60 border-cyan-800 text-cyan-300' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            EMA 20
          </button>
          <button
            onClick={() => setShowEMA50(!showEMA50)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
              showEMA50 ? 'bg-amber-950/60 border-amber-800 text-amber-300' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            EMA 50
          </button>
          <button
            onClick={() => setShowSwings(!showSwings)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
              showSwings ? 'bg-indigo-950/60 border-indigo-800 text-indigo-300' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            Swings
          </button>
          <button
            onClick={() => setShowBOS(!showBOS)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
              showBOS ? 'bg-blue-950/60 border-blue-800 text-blue-300' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            BOS/CHoCH
          </button>
          <button
            onClick={() => setShowSR(!showSR)}
            className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
              showSR ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            S/R Zones
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setVisibleCount(c => Math.max(30, c - 20))}
            className="p-1 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setVisibleCount(c => Math.min(250, c + 25))}
            className="p-1 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setVisibleCount(75)}
            className="p-1 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* OHLCV Telemetry Crosshair Readout */}
      {hoveredCandle ? (
        <div className="flex flex-wrap items-center gap-4 px-4 py-1.5 bg-[#080C12] border-b border-slate-900 text-xs font-mono tabular-nums text-slate-400">
          <span className="text-slate-300">{hoveredCandle.timestamp}</span>
          <span>O: <span className="text-slate-200">{hoveredCandle.open.toFixed(2)}</span></span>
          <span>H: <span className="text-emerald-400">{hoveredCandle.high.toFixed(2)}</span></span>
          <span>L: <span className="text-rose-400">{hoveredCandle.low.toFixed(2)}</span></span>
          <span>C: <span className={hoveredCandle.close >= hoveredCandle.open ? 'text-emerald-400' : 'text-rose-400'}>{hoveredCandle.close.toFixed(2)}</span></span>
          <span>Vol: <span className="text-slate-300">{hoveredCandle.volume.toLocaleString()}</span></span>
          {hoveredVWAP && (
            <span className="text-purple-400">VWAP: {hoveredVWAP.toFixed(2)}</span>
          )}
        </div>
      ) : (
        <div className="px-4 py-1.5 bg-[#080C12] border-b border-slate-900 text-xs font-mono text-slate-500">
          Awaiting candle data stream...
        </div>
      )}

      {/* Main SVG Plot Canvas */}
      <div ref={containerRef} className="relative w-full overflow-hidden select-none bg-[#0B0F17]">
        {visibleCandles.length === 0 ? (
          <div className="py-24 text-center text-xs font-mono text-slate-500">
            No candle data available to display.
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${chartWidth} ${height}`}
            className="w-full h-auto block"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            <defs>
              <linearGradient id="supportGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="0.05" />
              </linearGradient>
              <linearGradient id="resistanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F43F5E" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#F43F5E" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Horizontal Grid & Price Scale */}
            {priceGrid.map((g, i) => (
              <g key={i}>
                <line
                  x1={0}
                  y1={g.y}
                  x2={plotWidth}
                  y2={g.y}
                  stroke="#1F2937"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                />
                <text
                  x={plotWidth + 8}
                  y={g.y + 4}
                  fill="#6B7280"
                  fontSize={10}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {g.price.toFixed(1)}
                </text>
              </g>
            ))}

            {/* Volume Separator */}
            <line
              x1={0}
              y1={priceChartHeight}
              x2={chartWidth}
              y2={priceChartHeight}
              stroke="#1F2937"
              strokeWidth={1}
            />
            <text
              x={plotWidth + 8}
              y={priceChartHeight + 14}
              fill="#4B5563"
              fontSize={9}
              fontFamily="JetBrains Mono, monospace"
            >
              VOL
            </text>

            {/* Dynamic Support & Resistance Zones */}
            {showSR && srLevels.map(sr => {
              const y = priceToY(sr.price);
              if (y < 0 || y > priceChartHeight) return null;
              const isRes = sr.type === 'RESISTANCE';

              return (
                <g key={sr.id}>
                  <rect
                    x={0}
                    y={y - 4}
                    width={plotWidth}
                    height={8}
                    fill={isRes ? 'url(#resistanceGrad)' : 'url(#supportGrad)'}
                  />
                  <line
                    x1={0}
                    y1={y}
                    x2={plotWidth}
                    y2={y}
                    stroke={isRes ? '#F43F5E' : '#10B981'}
                    strokeWidth={0.7}
                    strokeOpacity={0.6}
                  />
                  <text
                    x={8}
                    y={y - 6}
                    fill={isRes ? '#F87171' : '#34D399'}
                    fontSize={9}
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {isRes ? 'RES' : 'SUP'} {sr.price.toFixed(1)} ({sr.touches}T)
                  </text>
                </g>
              );
            })}

            {/* BOS and CHoCH Structure Break Lines */}
            {showBOS && structureEvents.map(evt => {
              if (evt.type !== 'BOS_BULL' && evt.type !== 'BOS_BEAR' && evt.type !== 'CHOCH_BULL' && evt.type !== 'CHOCH_BEAR') return null;
              const y = priceToY(evt.price);
              if (y < 0 || y > priceChartHeight) return null;

              const isChoch = evt.type.includes('CHOCH');
              const isBull = evt.type.includes('BULL');
              const color = isBull ? '#34D399' : '#FB7185';

              return (
                <g key={evt.id}>
                  <line
                    x1={0}
                    y1={y}
                    x2={plotWidth}
                    y2={y}
                    stroke={color}
                    strokeWidth={isChoch ? 1.5 : 1}
                    strokeDasharray={isChoch ? '4 2' : '2 2'}
                  />
                  <text
                    x={plotWidth - 85}
                    y={y - 4}
                    fill={color}
                    fontSize={9}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {isChoch ? (isBull ? 'CHOCH ▲' : 'CHOCH ▼') : (isBull ? 'BOS ▲' : 'BOS ▼')}
                  </text>
                </g>
              );
            })}

            {/* Volume Bars */}
            {visibleCandles.map((c, i) => {
              const x = i * candleGap + (candleGap - candleWidth) / 2;
              const y = volToY(c.volume);
              const barHeight = height - y;
              const isBull = c.close >= c.open;

              return (
                <rect
                  key={`vol_${i}`}
                  x={x}
                  y={y}
                  width={candleWidth}
                  height={barHeight}
                  fill={isBull ? '#065F46' : '#881337'}
                  opacity={0.6}
                />
              );
            })}

            {/* Candlesticks (Wick + Real Body) */}
            {visibleCandles.map((c, i) => {
              const centerX = i * candleGap + candleGap / 2;
              const x = i * candleGap + (candleGap - candleWidth) / 2;
              const isBull = c.close >= c.open;
              const color = isBull ? '#10B981' : '#F43F5E';

              const highY = priceToY(c.high);
              const lowY = priceToY(c.low);
              const openY = priceToY(c.open);
              const closeY = priceToY(c.close);

              const bodyY = Math.min(openY, closeY);
              const bodyHeight = Math.max(1.5, Math.abs(closeY - openY));

              return (
                <g key={`candle_${i}`}>
                  {/* Candle Wick */}
                  <line
                    x1={centerX}
                    y1={highY}
                    x2={centerX}
                    y2={lowY}
                    stroke={color}
                    strokeWidth={1}
                  />
                  {/* Candle Body */}
                  <rect
                    x={x}
                    y={bodyY}
                    width={candleWidth}
                    height={bodyHeight}
                    fill={isBull ? '#10B981' : '#F43F5E'}
                  />
                </g>
              );
            })}

            {/* Indicator Polylines */}
            {showVWAP && vwapPoints && (
              <polyline
                fill="none"
                stroke="#A855F7"
                strokeWidth={1.5}
                points={vwapPoints}
              />
            )}

            {showEMA20 && ema20Points && (
              <polyline
                fill="none"
                stroke="#06B6D4"
                strokeWidth={1.2}
                points={ema20Points}
              />
            )}

            {showEMA50 && ema50Points && (
              <polyline
                fill="none"
                stroke="#F59E0B"
                strokeWidth={1.2}
                points={ema50Points}
              />
            )}

            {/* Market Structure Swing Labels */}
            {showSwings && visibleEvents.map((evt, idx) => {
              if (evt.type !== 'HH' && evt.type !== 'HL' && evt.type !== 'LH' && evt.type !== 'LL') return null;

              const cIndex = visibleCandles.findIndex(c => c.time === evt.detectionTime);
              if (cIndex === -1) return null;

              const x = cIndex * candleGap + candleGap / 2;
              const isHigh = evt.type === 'HH' || evt.type === 'LH';
              const y = isHigh ? priceToY(evt.price) - 8 : priceToY(evt.price) + 14;
              const labelColor = isHigh ? '#FBBF24' : '#60A5FA';

              return (
                <g key={`swing_${idx}`}>
                  <circle cx={x} cy={priceToY(evt.price)} r={2.5} fill={labelColor} />
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    fill={labelColor}
                    fontSize={8}
                    fontWeight="bold"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {evt.type}
                  </text>
                </g>
              );
            })}

            {/* Crosshair Cursor Lines */}
            {mousePos && hoverIndex !== null && (
              <g pointerEvents="none">
                <line
                  x1={hoverIndex * candleGap + candleGap / 2}
                  y1={0}
                  x2={hoverIndex * candleGap + candleGap / 2}
                  y2={height}
                  stroke="#6366F1"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                />
                <line
                  x1={0}
                  y1={mousePos.y}
                  x2={plotWidth}
                  y2={mousePos.y}
                  stroke="#6366F1"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                />
                <rect
                  x={plotWidth + 2}
                  y={mousePos.y - 10}
                  width={70}
                  height={20}
                  fill="#4F46E5"
                  rx={2}
                />
                <text
                  x={plotWidth + 37}
                  y={mousePos.y + 4}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize={10}
                  fontWeight="bold"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {(maxPrice - (mousePos.y / priceChartHeight) * priceRange).toFixed(1)}
                </text>
              </g>
            )}
          </svg>
        )}
      </div>
    </div>
  );
};
