/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle } from '../types/market.ts';

/**
 * Calculates Simple Moving Average
 */
export function calculateSMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return result;

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  result[period - 1] = sum / period;

  for (let i = period; i < candles.length; i++) {
    sum += candles[i].close - candles[i - period].close;
    result[i] = sum / period;
  }

  return result;
}

/**
 * Calculates Exponential Moving Average
 */
export function calculateEMA(candles: Candle[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length < period) return result;

  // First value is SMA
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += candles[i].close;
  }
  const multiplier = 2 / (period + 1);
  let previousEMA = sum / period;
  result[period - 1] = previousEMA;

  for (let i = period; i < candles.length; i++) {
    const currentEMA = (candles[i].close - previousEMA) * multiplier + previousEMA;
    result[i] = currentEMA;
    previousEMA = currentEMA;
  }

  return result;
}

/**
 * Calculates Intraday VWAP (resets at start of each trading session 09:15)
 */
export function calculateVWAP(candles: Candle[]): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length === 0) return result;

  let cumTypicalVolume = 0;
  let cumVolume = 0;
  let currentSessionDate = '';

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const candleDate = new Date(c.time * 1000).toISOString().split('T')[0];

    // Reset cumulatives on new day/session
    if (candleDate !== currentSessionDate) {
      currentSessionDate = candleDate;
      cumTypicalVolume = 0;
      cumVolume = 0;
    }

    const typicalPrice = (c.high + c.low + c.close) / 3;
    const vol = c.volume > 0 ? c.volume : 1; // Prevent div by 0

    cumTypicalVolume += typicalPrice * vol;
    cumVolume += vol;

    result[i] = cumTypicalVolume / cumVolume;
  }

  return result;
}

/**
 * Calculates Average True Range (ATR)
 */
export function calculateATR(candles: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return result;

  const trueRanges: number[] = [candles[0].high - candles[0].low];

  for (let i = 1; i < candles.length; i++) {
    const current = candles[i];
    const prev = candles[i - 1];
    const tr1 = current.high - current.low;
    const tr2 = Math.abs(current.high - prev.close);
    const tr3 = Math.abs(current.low - prev.close);
    trueRanges.push(Math.max(tr1, tr2, tr3));
  }

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += trueRanges[i];
  }
  let prevATR = sum / period;
  result[period - 1] = prevATR;

  for (let i = period; i < candles.length; i++) {
    // Wilder's smoothing
    prevATR = (prevATR * (period - 1) + trueRanges[i]) / period;
    result[i] = prevATR;
  }

  return result;
}

/**
 * Calculates Relative Strength Index (RSI)
 */
export function calculateRSI(candles: Candle[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = new Array(candles.length).fill(null);
  if (candles.length <= period) return result;

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  result[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + avgGain / avgLoss));

  for (let i = period + 1; i < candles.length; i++) {
    const diff = candles[i].close - candles[i - 1].close;
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    if (avgLoss === 0) {
      result[i] = 100;
    } else {
      const rs = avgGain / avgLoss;
      result[i] = 100 - (100 / (1 + rs));
    }
  }

  return result;
}

/**
 * Calculates Bollinger Bands (Period: 20, StdDev: 2)
 */
export function calculateBollingerBands(
  candles: Candle[], 
  period: number = 20, 
  stdDevMultiplier: number = 2
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calculateSMA(candles, period);
  const upper: (number | null)[] = new Array(candles.length).fill(null);
  const lower: (number | null)[] = new Array(candles.length).fill(null);

  for (let i = period - 1; i < candles.length; i++) {
    const m = middle[i];
    if (m === null) continue;

    let varianceSum = 0;
    for (let j = i - period + 1; j <= i; j++) {
      varianceSum += Math.pow(candles[j].close - m, 2);
    }
    const stdDev = Math.sqrt(varianceSum / period);
    upper[i] = m + stdDevMultiplier * stdDev;
    lower[i] = m - stdDevMultiplier * stdDev;
  }

  return { upper, middle, lower };
}
