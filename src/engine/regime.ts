/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, MarketRegime, StructureEvent } from '../types/market.ts';
import { calculateEMA, calculateATR, calculateVWAP } from './indicators.ts';

export interface RegimeAnalysis {
  regime: MarketRegime;
  confidence: number; // 0 to 1
  atrValue: number;
  normalizedVolatility: number;
  trendSlope: number;
  vwapDistancePct: number;
  reasons: string[];
}

/**
 * Classifies the current market state into:
 * TREND_UP, TREND_DOWN, RANGE, HIGH_VOLATILITY, TRANSITION, NO_TRADE
 */
export function classifyMarketRegime(
  candles: Candle[], 
  events: StructureEvent[]
): RegimeAnalysis {
  const reasons: string[] = [];

  if (candles.length < 30) {
    return {
      regime: 'NO_TRADE',
      confidence: 0,
      atrValue: 0,
      normalizedVolatility: 0,
      trendSlope: 0,
      vwapDistancePct: 0,
      reasons: ['Insufficient candle history (< 30 bars)'],
    };
  }

  const lastCandle = candles[candles.length - 1];
  const ema20 = calculateEMA(candles, 20);
  const ema50 = calculateEMA(candles, 50);
  const atr = calculateATR(candles, 14);
  const vwap = calculateVWAP(candles);

  const currentEMA20 = ema20[ema20.length - 1] ?? lastCandle.close;
  const currentEMA50 = ema50[ema50.length - 1] ?? lastCandle.close;
  const currentATR = atr[atr.length - 1] ?? 15;
  const currentVWAP = vwap[vwap.length - 1] ?? lastCandle.close;

  // Normalized volatility (ATR as % of close price)
  const normalizedVol = (currentATR / lastCandle.close) * 100;

  // Distance from VWAP in %
  const vwapDist = ((lastCandle.close - currentVWAP) / currentVWAP) * 100;

  // Check EMA relationship & slope
  const emaGap = currentEMA20 - currentEMA50;
  const emaSlope = emaGap / currentEMA50;

  // Recent structure bias
  const recentEvents = events.slice(-5);
  const bullEvents = recentEvents.filter(e => e.type === 'BOS_BULL' || e.type === 'CHOCH_BULL').length;
  const bearEvents = recentEvents.filter(e => e.type === 'BOS_BEAR' || e.type === 'CHOCH_BEAR').length;

  // 1. High Volatility Check (Extreme ATR spike)
  if (normalizedVol > 0.8) { // >0.8% intraday ATR is abnormal for NIFTY/BANKNIFTY
    reasons.push(`Normalized volatility elevated (${normalizedVol.toFixed(2)}%)`);
    return {
      regime: 'HIGH_VOLATILITY',
      confidence: 0.85,
      atrValue: currentATR,
      normalizedVolatility: normalizedVol,
      trendSlope: emaSlope,
      vwapDistancePct: vwapDist,
      reasons,
    };
  }

  // 2. Trend Up Check
  if (
    lastCandle.close > currentEMA20 &&
    currentEMA20 > currentEMA50 &&
    lastCandle.close > currentVWAP &&
    bullEvents >= bearEvents
  ) {
    reasons.push('Price > EMA20 > EMA50');
    reasons.push('Price above intraday VWAP');
    if (bullEvents > 0) reasons.push('Recent bullish structural breaks (BOS/CHoCH)');
    
    return {
      regime: 'TREND_UP',
      confidence: 0.88,
      atrValue: currentATR,
      normalizedVolatility: normalizedVol,
      trendSlope: emaSlope,
      vwapDistancePct: vwapDist,
      reasons,
    };
  }

  // 3. Trend Down Check
  if (
    lastCandle.close < currentEMA20 &&
    currentEMA20 < currentEMA50 &&
    lastCandle.close < currentVWAP &&
    bearEvents >= bullEvents
  ) {
    reasons.push('Price < EMA20 < EMA50');
    reasons.push('Price below intraday VWAP');
    if (bearEvents > 0) reasons.push('Recent bearish structural breaks (BOS/CHoCH)');

    return {
      regime: 'TREND_DOWN',
      confidence: 0.88,
      atrValue: currentATR,
      normalizedVolatility: normalizedVol,
      trendSlope: emaSlope,
      vwapDistancePct: vwapDist,
      reasons,
    };
  }

  // 4. Range / Consolidation Check
  // EMA20 and EMA50 are entangled or flat, price oscillating near VWAP
  if (Math.abs(emaGap) < currentATR * 0.4 && Math.abs(vwapDist) < 0.25) {
    reasons.push('EMA20 and EMA50 converging within compressed range');
    reasons.push('Oscillating within VWAP threshold');
    return {
      regime: 'RANGE',
      confidence: 0.78,
      atrValue: currentATR,
      normalizedVolatility: normalizedVol,
      trendSlope: emaSlope,
      vwapDistancePct: vwapDist,
      reasons,
    };
  }

  // 5. Transition State (Structure conflicting with EMAs)
  reasons.push('Mixed structural signals or EMA divergence');
  return {
    regime: 'TRANSITION',
    confidence: 0.55,
    atrValue: currentATR,
    normalizedVolatility: normalizedVol,
    trendSlope: emaSlope,
    vwapDistancePct: vwapDist,
    reasons,
  };
}
