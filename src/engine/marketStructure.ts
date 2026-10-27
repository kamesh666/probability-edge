/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, StructureEvent, Timeframe, SRLevel, RangeBoundary } from '../types/market.ts';

export interface SwingPoint {
  index: number;
  time: number;
  price: number;
  type: 'HIGH' | 'LOW';
  confirmedAtIndex: number;
  confirmedAtTime: number;
  classification?: 'HH' | 'HL' | 'LH' | 'LL';
}

/**
 * Detects swing highs and lows causally.
 * For a swing high at index i with leftBars=L and rightBars=R:
 * candles[i].high must be greater than left L candles AND right R candles.
 * CRITICAL: This swing cannot be confirmed until index i + R has CLOSED.
 * Therefore, confirmedAtIndex = i + R, confirmedAtTime = candles[i+R].time.
 */
export function detectSwings(
  candles: Candle[], 
  timeframe: Timeframe,
  leftBars: number = 3, 
  rightBars: number = 3
): { swings: SwingPoint[]; events: StructureEvent[] } {
  const swings: SwingPoint[] = [];
  const events: StructureEvent[] = [];

  if (candles.length < leftBars + rightBars + 1) {
    return { swings, events };
  }

  // Iterate up to candles.length - rightBars
  for (let i = leftBars; i < candles.length - rightBars; i++) {
    const current = candles[i];
    let isHigh = true;
    let isLow = true;

    // Check left bars
    for (let j = 1; j <= leftBars; j++) {
      if (candles[i - j].high >= current.high) isHigh = false;
      if (candles[i - j].low <= current.low) isLow = false;
    }

    // Check right bars
    for (let j = 1; j <= rightBars; j++) {
      if (candles[i + j].high > current.high) isHigh = false;
      if (candles[i + j].low < current.low) isLow = false;
    }

    const confirmationIdx = i + rightBars;
    const confirmationTime = candles[confirmationIdx].time;

    if (isHigh) {
      swings.push({
        index: i,
        time: current.time,
        price: current.high,
        type: 'HIGH',
        confirmedAtIndex: confirmationIdx,
        confirmedAtTime: confirmationTime,
      });
    } else if (isLow) {
      swings.push({
        index: i,
        time: current.time,
        price: current.low,
        type: 'LOW',
        confirmedAtIndex: confirmationIdx,
        confirmedAtTime: confirmationTime,
      });
    }
  }

  // Classify Swings into HH, HL, LH, LL
  let lastHigh: SwingPoint | null = null;
  let lastLow: SwingPoint | null = null;

  for (let k = 0; k < swings.length; k++) {
    const sw = swings[k];
    if (sw.type === 'HIGH') {
      if (lastHigh === null) {
        sw.classification = 'HH';
      } else {
        sw.classification = sw.price > lastHigh.price ? 'HH' : 'LH';
      }
      lastHigh = sw;

      events.push({
        id: `swing_high_${sw.time}`,
        type: sw.classification === 'HH' ? 'HH' : 'LH',
        price: sw.price,
        detectionTime: sw.time,
        confirmationTime: sw.confirmedAtTime,
        timeframe,
        index: sw.index,
        description: `${sw.classification} swing high at ${sw.price.toFixed(2)} (confirmed at candle ${sw.confirmedAtIndex})`,
      });
    } else {
      if (lastLow === null) {
        sw.classification = 'HL';
      } else {
        sw.classification = sw.price < lastLow.price ? 'LL' : 'HL';
      }
      lastLow = sw;

      events.push({
        id: `swing_low_${sw.time}`,
        type: sw.classification === 'LL' ? 'LL' : 'HL',
        price: sw.price,
        detectionTime: sw.time,
        confirmationTime: sw.confirmedAtTime,
        timeframe,
        index: sw.index,
        description: `${sw.classification} swing low at ${sw.price.toFixed(2)} (confirmed at candle ${sw.confirmedAtIndex})`,
      });
    }
  }

  return { swings, events };
}

/**
 * Detects Break of Structure (BOS) and Change of Character (CHoCH)
 * causally at each candle close.
 */
export function detectBOSandCHoCH(
  candles: Candle[], 
  swings: SwingPoint[], 
  timeframe: Timeframe
): StructureEvent[] {
  const structureEvents: StructureEvent[] = [];
  if (candles.length < 5 || swings.length < 2) return structureEvents;

  let currentTrend: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  let activeHigh: SwingPoint | null = null;
  let activeLow: SwingPoint | null = null;

  // Process candles chronologically
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];

    // Swings that became confirmed on or before candle index i
    const availableSwings = swings.filter(s => s.confirmedAtIndex <= i);
    const highs = availableSwings.filter(s => s.type === 'HIGH');
    const lows = availableSwings.filter(s => s.type === 'LOW');

    const latestHigh = highs.length > 0 ? highs[highs.length - 1] : null;
    const latestLow = lows.length > 0 ? lows[lows.length - 1] : null;

    if (!activeHigh && latestHigh) activeHigh = latestHigh;
    if (!activeLow && latestLow) activeLow = latestLow;

    // Check Bullish Break: candle closes above active swing high
    if (activeHigh && c.close > activeHigh.price && i > activeHigh.confirmedAtIndex) {
      const isReversal = currentTrend === 'BEARISH';
      const eventType = isReversal ? 'CHOCH_BULL' : 'BOS_BULL';
      
      structureEvents.push({
        id: `${eventType}_${c.time}`,
        type: eventType,
        price: c.close,
        detectionTime: c.time,
        confirmationTime: c.time,
        timeframe,
        index: i,
        brokenSwingPrice: activeHigh.price,
        description: `${isReversal ? 'Change of Character (Bullish)' : 'Break of Structure (Bullish)'} above ${activeHigh.price.toFixed(2)}`,
      });

      currentTrend = 'BULLISH';
      // Advance active high to next unviolated high
      const unviolatedHighs = highs.filter(h => h.price > c.close);
      activeHigh = unviolatedHighs.length > 0 ? unviolatedHighs[0] : null;
    }

    // Check Bearish Break: candle closes below active swing low
    if (activeLow && c.close < activeLow.price && i > activeLow.confirmedAtIndex) {
      const isReversal = currentTrend === 'BULLISH';
      const eventType = isReversal ? 'CHOCH_BEAR' : 'BOS_BEAR';

      structureEvents.push({
        id: `${eventType}_${c.time}`,
        type: eventType,
        price: c.close,
        detectionTime: c.time,
        confirmationTime: c.time,
        timeframe,
        index: i,
        brokenSwingPrice: activeLow.price,
        description: `${isReversal ? 'Change of Character (Bearish)' : 'Break of Structure (Bearish)'} below ${activeLow.price.toFixed(2)}`,
      });

      currentTrend = 'BEARISH';
      // Advance active low to next unviolated low
      const unviolatedLows = lows.filter(l => l.price < c.close);
      activeLow = unviolatedLows.length > 0 ? unviolatedLows[0] : null;
    }
  }

  return structureEvents;
}

/**
 * Clusters swing levels into Dynamic Support & Resistance Zones
 */
export function computeSupportResistanceLevels(
  swings: SwingPoint[], 
  clusterTolerancePts: number = 25
): SRLevel[] {
  const levels: SRLevel[] = [];

  const highs = swings.filter(s => s.type === 'HIGH');
  const lows = swings.filter(s => s.type === 'LOW');

  // Resistance clustering
  const clusteredHighs: { price: number; touches: number; lastTime: number }[] = [];
  for (const h of highs) {
    const existing = clusteredHighs.find(c => Math.abs(c.price - h.price) <= clusterTolerancePts);
    if (existing) {
      existing.touches += 1;
      existing.price = (existing.price * (existing.touches - 1) + h.price) / existing.touches;
      existing.lastTime = Math.max(existing.lastTime, h.time);
    } else {
      clusteredHighs.push({ price: h.price, touches: 1, lastTime: h.time });
    }
  }

  for (const cl of clusteredHighs) {
    levels.push({
      id: `res_${Math.round(cl.price)}`,
      price: Math.round(cl.price * 100) / 100,
      type: 'RESISTANCE',
      strength: Math.min(5, cl.touches),
      lastTouchTime: cl.lastTime,
      touches: cl.touches,
    });
  }

  // Support clustering
  const clusteredLows: { price: number; touches: number; lastTime: number }[] = [];
  for (const l of lows) {
    const existing = clusteredLows.find(c => Math.abs(c.price - l.price) <= clusterTolerancePts);
    if (existing) {
      existing.touches += 1;
      existing.price = (existing.price * (existing.touches - 1) + l.price) / existing.touches;
      existing.lastTime = Math.max(existing.lastTime, l.time);
    } else {
      clusteredLows.push({ price: l.price, touches: 1, lastTime: l.time });
    }
  }

  for (const cl of clusteredLows) {
    levels.push({
      id: `sup_${Math.round(cl.price)}`,
      price: Math.round(cl.price * 100) / 100,
      type: 'SUPPORT',
      strength: Math.min(5, cl.touches),
      lastTouchTime: cl.lastTime,
      touches: cl.touches,
    });
  }

  return levels.sort((a, b) => b.touches - a.touches);
}

/**
 * Calculates Range Boundaries for Range-bound strategies
 */
export function detectRangeBoundaries(
  candles: Candle[], 
  lookback: number = 30
): RangeBoundary | null {
  if (candles.length < lookback) return null;

  const subset = candles.slice(-lookback);
  let highest = -Infinity;
  let lowest = Infinity;

  for (const c of subset) {
    if (c.high > highest) highest = c.high;
    if (c.low < lowest) lowest = c.low;
  }

  const width = highest - lowest;
  const midpoint = (highest + lowest) / 2;

  // Measure volatility compression
  const avgRange = subset.reduce((acc, c) => acc + (c.high - c.low), 0) / lookback;
  const isCompressed = avgRange < (width / lookback) * 1.5;

  return {
    high: highest,
    low: lowest,
    midpoint,
    detectedAt: subset[subset.length - 1].time,
    widthPoints: width,
    isCompressed,
  };
}
