/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Candle, Instrument, MarketRegime, SRLevel, StructureEvent, Timeframe } from '../../types/market.ts';
import { CandlestickChart } from '../CandlestickChart.tsx';
import { calculateATR, calculateRSI, calculateVWAP, calculateEMA } from '../../engine/indicators.ts';

interface MarketMonitorViewProps {
  candles: Candle[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  structureEvents: StructureEvent[];
  srLevels: SRLevel[];
  regime: MarketRegime;
  instrument: Instrument;
}

export const MarketMonitorView: React.FC<MarketMonitorViewProps> = ({
  candles,
  timeframe,
  onTimeframeChange,
  structureEvents,
  srLevels,
  regime,
  instrument,
}) => {
  const currentCandle = candles[candles.length - 1];
  const spot = currentCandle ? currentCandle.close : 0;

  // Compute live indicator values
  const rsiArr = calculateRSI(candles, 14);
  const currentRSI = rsiArr[rsiArr.length - 1] ?? 50;
  const atrArr = calculateATR(candles, 14);
  const currentATR = atrArr[atrArr.length - 1] ?? 15;
  const vwapArr = calculateVWAP(candles);
  const currentVWAP = vwapArr[vwapArr.length - 1] ?? spot;
  const ema20Arr = calculateEMA(candles, 20);
  const currentEMA20 = ema20Arr[ema20Arr.length - 1] ?? spot;
  const ema50Arr = calculateEMA(candles, 50);
  const currentEMA50 = ema50Arr[ema50Arr.length - 1] ?? spot;

  const vwapDist = currentVWAP > 0 ? ((spot - currentVWAP) / currentVWAP) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Indicator Quick Readout Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3 bg-[#111827] border border-slate-800 rounded">
          <div className="text-[11px] text-slate-500 font-mono">LTP SPOT</div>
          <div className="text-base font-bold font-mono text-white mt-0.5">{spot.toFixed(2)}</div>
        </div>
        <div className="p-3 bg-[#111827] border border-slate-800 rounded">
          <div className="text-[11px] text-slate-500 font-mono">INTRADAY VWAP</div>
          <div className="text-base font-bold font-mono text-purple-400 mt-0.5">{currentVWAP.toFixed(2)}</div>
        </div>
        <div className="p-3 bg-[#111827] border border-slate-800 rounded">
          <div className="text-[11px] text-slate-500 font-mono">VWAP SPREAD</div>
          <div className={`text-base font-bold font-mono mt-0.5 ${vwapDist >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {vwapDist >= 0 ? '+' : ''}{vwapDist.toFixed(2)}%
          </div>
        </div>
        <div className="p-3 bg-[#111827] border border-slate-800 rounded">
          <div className="text-[11px] text-slate-500 font-mono">RSI (14)</div>
          <div className={`text-base font-bold font-mono mt-0.5 ${currentRSI > 70 ? 'text-rose-400' : currentRSI < 30 ? 'text-emerald-400' : 'text-white'}`}>
            {currentRSI.toFixed(1)}
          </div>
        </div>
        <div className="p-3 bg-[#111827] border border-slate-800 rounded">
          <div className="text-[11px] text-slate-500 font-mono">ATR (14)</div>
          <div className="text-base font-bold font-mono text-amber-400 mt-0.5">{currentATR.toFixed(1)} pts</div>
        </div>
        <div className="p-3 bg-[#111827] border border-slate-800 rounded">
          <div className="text-[11px] text-slate-500 font-mono">EMA 20 / 50 GAP</div>
          <div className="text-base font-bold font-mono text-cyan-400 mt-0.5">
            {(currentEMA20 - currentEMA50).toFixed(1)} pts
          </div>
        </div>
      </div>

      {/* Main Grid: Chart + Structure Stream */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6">
        {/* Candlestick Chart (3 Cols) */}
        <div className="xl:col-span-3">
          <CandlestickChart
            candles={candles}
            timeframe={timeframe}
            onTimeframeChange={onTimeframeChange}
            structureEvents={structureEvents}
            srLevels={srLevels}
            height={560}
          />
        </div>

        {/* Market Structure Stream (1 Col) */}
        <div className="space-y-6">
          {/* Structure Events Panel */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
              <span>Causal Structure Events</span>
              <span className="text-[11px] font-mono text-indigo-400">{structureEvents.length} events</span>
            </h3>

            <div className="space-y-2 max-h-[250px] overflow-y-auto pr-1">
              {structureEvents.slice(-8).reverse().map(evt => {
                const isBull = evt.type.includes('BULL') || evt.type === 'HH' || evt.type === 'HL';
                const isChoch = evt.type.includes('CHOCH');

                return (
                  <div
                    key={evt.id}
                    className="p-2 bg-[#0B0F17] border border-slate-800 rounded text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`font-mono font-bold ${isChoch ? 'text-amber-400' : isBull ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {evt.type}
                      </span>
                      <span className="text-slate-400 font-mono tabular-nums">{evt.price.toFixed(2)}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {evt.description}
                    </div>
                    <div className="text-[10px] text-slate-600 font-mono">
                      Conf. candle: #{evt.index} · {new Date(evt.confirmationTime * 1000).toLocaleTimeString()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Support & Resistance Levels Table */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <h3 className="text-xs font-semibold text-slate-300 mb-3">
              Dynamic S/R Clusters
            </h3>

            <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
              {srLevels.slice(0, 6).map(sr => {
                const isRes = sr.type === 'RESISTANCE';
                const distPts = Math.abs(spot - sr.price);

                return (
                  <div
                    key={sr.id}
                    className="p-2 bg-[#0B0F17] border border-slate-800 rounded flex items-center justify-between text-xs font-mono"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] px-1 py-0.5 rounded font-bold ${isRes ? 'bg-rose-950/80 text-rose-300' : 'bg-emerald-950/80 text-emerald-300'}`}>
                        {sr.type}
                      </span>
                      <span className="text-white font-bold">{sr.price.toFixed(1)}</span>
                    </div>

                    <div className="text-[11px] text-slate-400">
                      {sr.touches} touches ({distPts.toFixed(1)} pts away)
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
