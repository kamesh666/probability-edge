/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Candle, Instrument, Timeframe, LiveMarketQuote } from '../types/market.ts';

export interface AngelOneCredentials {
  apiKey: string;
  clientCode: string;
  mpin: string;
  totpSecret: string;
  jwtToken?: string;
  feedToken?: string;
  isConnected: boolean;
  isMockMode: boolean;
  lastConnectedAt?: string;
}

/**
 * Resamples 1-minute candles into higher timeframes (5m, 15m)
 */
export function resampleCandles(candles1m: Candle[], targetTf: '5m' | '15m'): Candle[] {
  const intervalMinutes = targetTf === '5m' ? 5 : 15;
  const intervalSeconds = intervalMinutes * 60;
  const resampled: Candle[] = [];

  let currentBucket: Candle[] = [];
  let currentBucketStart = 0;

  for (const c of candles1m) {
    const bucketStart = Math.floor(c.time / intervalSeconds) * intervalSeconds;

    if (bucketStart !== currentBucketStart) {
      if (currentBucket.length > 0) {
        resampled.push({
          timestamp: currentBucket[0].timestamp,
          time: currentBucketStart,
          open: currentBucket[0].open,
          high: Math.max(...currentBucket.map(b => b.high)),
          low: Math.min(...currentBucket.map(b => b.low)),
          close: currentBucket[currentBucket.length - 1].close,
          volume: currentBucket.reduce((sum, b) => sum + b.volume, 0),
        });
      }
      currentBucket = [c];
      currentBucketStart = bucketStart;
    } else {
      currentBucket.push(c);
    }
  }

  // Final bucket
  if (currentBucket.length > 0) {
    resampled.push({
      timestamp: currentBucket[0].timestamp,
      time: currentBucketStart,
      open: currentBucket[0].open,
      high: Math.max(...currentBucket.map(b => b.high)),
      low: Math.min(...currentBucket.map(b => b.low)),
      close: currentBucket[currentBucket.length - 1].close,
      volume: currentBucket.reduce((sum, b) => sum + b.volume, 0),
    });
  }

  return resampled;
}

/**
 * Generates realistic deterministic intraday NIFTY 50 and BANKNIFTY dataset
 */
export function generateSyntheticIntradayData(
  underlying: Instrument,
  days: number = 3,
  seed: number = 42
): Candle[] {
  const candles: Candle[] = [];
  let basePrice = underlying === 'NIFTY' ? 24780 : 51950;
  const baseATR = underlying === 'NIFTY' ? 14 : 45;

  let s = seed;
  const pseudoRandom = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };

  const now = new Date();
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  for (let d = 0; d < days; d++) {
    const dayDate = new Date(startDate.getTime() + d * 24 * 60 * 60 * 1000);
    if (dayDate.getDay() === 0 || dayDate.getDay() === 6) continue;

    const overnightGapPct = (pseudoRandom() - 0.48) * 0.008;
    basePrice = Math.round((basePrice * (1 + overnightGapPct)) * 10) / 10;
    let currentPrice = basePrice;

    const sessionStart = new Date(Date.UTC(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate(), 3, 45, 0));
    let trendFactor = (pseudoRandom() - 0.5) * 0.4;

    for (let m = 0; m < 375; m++) {
      const candleTime = Math.floor(sessionStart.getTime() / 1000) + m * 60;
      const timeStr = new Date(candleTime * 1000).toISOString().replace('T', ' ').substring(0, 19);

      let volatilityMultiplier = 1.0;
      if (m < 45) volatilityMultiplier = 2.0;
      else if (m >= 120 && m <= 180) volatilityMultiplier = 0.6;
      else if (m > 240 && m < 340) volatilityMultiplier = 1.4;
      else if (m >= 340) volatilityMultiplier = 1.1;

      const noise = (pseudoRandom() - 0.495) * baseATR * volatilityMultiplier * 0.35;
      const drift = trendFactor * (baseATR / 30);
      const delta = noise + drift;

      const open = Math.round(currentPrice * 10) / 10;
      const close = Math.round((open + delta) * 10) / 10;
      const highWick = pseudoRandom() * baseATR * 0.25 * volatilityMultiplier;
      const lowWick = pseudoRandom() * baseATR * 0.25 * volatilityMultiplier;
      const high = Math.round(Math.max(open, close, Math.max(open, close) + highWick) * 10) / 10;
      const low = Math.round(Math.min(open, close, Math.min(open, close) - lowWick) * 10) / 10;

      const volumeBase = underlying === 'NIFTY' ? 45000 : 25000;
      const volume = Math.floor(volumeBase * volatilityMultiplier * (0.6 + pseudoRandom() * 0.8));

      candles.push({
        timestamp: timeStr,
        time: candleTime,
        open,
        high,
        low,
        close,
        volume,
      });

      currentPrice = close;
    }
  }

  return candles;
}

/**
 * Validates and parses uploaded CSV files containing OHLCV records
 */
export function parseAndValidateCSV(csvText: string): { success: boolean; candles?: Candle[]; error?: string } {
  try {
    const lines = csvText.trim().split(/\r?\n/);
    if (lines.length < 2) {
      return { success: false, error: 'CSV file is empty or has only a header row.' };
    }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim());
    const timeIdx = header.findIndex(h => h.includes('time') || h.includes('date'));
    const openIdx = header.findIndex(h => h === 'open' || h === 'o');
    const highIdx = header.findIndex(h => h === 'high' || h === 'h');
    const lowIdx = header.findIndex(h => h === 'low' || h === 'l');
    const closeIdx = header.findIndex(h => h === 'close' || h === 'c');
    const volIdx = header.findIndex(h => h === 'volume' || h === 'vol' || h === 'v');

    if (openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
      return { success: false, error: 'Missing mandatory columns (open, high, low, close). Found: ' + header.join(', ') };
    }

    const candles: Candle[] = [];
    let lastTime = 0;

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',').map(p => p.trim());

      const rawTime = timeIdx !== -1 ? parts[timeIdx] : '';
      const parsedTime = Date.parse(rawTime);
      const timeInSec = isNaN(parsedTime) ? Math.floor(Date.now() / 1000) - (lines.length - i) * 60 : Math.floor(parsedTime / 1000);

      const open = parseFloat(parts[openIdx]);
      const high = parseFloat(parts[highIdx]);
      const low = parseFloat(parts[lowIdx]);
      const close = parseFloat(parts[closeIdx]);
      const volume = volIdx !== -1 ? parseFloat(parts[volIdx]) : 10000;

      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close)) {
        continue;
      }

      if (low > open || low > close || high < open || high < close) {
        return { success: false, error: `Invalid OHLC values at line ${i + 1}: High must be >= Open/Close, Low must be <= Open/Close.` };
      }

      const validTime = timeInSec > lastTime ? timeInSec : lastTime + 60;
      lastTime = validTime;

      candles.push({
        timestamp: new Date(validTime * 1000).toISOString().replace('T', ' ').substring(0, 19),
        time: validTime,
        open,
        high,
        low,
        close,
        volume: isNaN(volume) ? 10000 : volume,
      });
    }

    if (candles.length < 10) {
      return { success: false, error: 'CSV yielded fewer than 10 valid candles.' };
    }

    return { success: true, candles };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to parse CSV' };
  }
}

/**
 * Fetches real-time live market quote for NIFTY or BANKNIFTY from backend proxy
 */
export async function fetchLiveMarketQuote(instrument: Instrument): Promise<LiveMarketQuote | null> {
  try {
    const res = await fetch(`/api/market/quote?symbol=${instrument}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data: LiveMarketQuote = await res.json();
    return data;
  } catch (err) {
    console.warn(`Failed to fetch live quote for ${instrument}:`, err);
    return null;
  }
}

/**
 * Fetches real intraday 1m candles for today's session from backend proxy
 */
export async function fetchLiveMarketCandles(instrument: Instrument): Promise<Candle[] | null> {
  try {
    const res = await fetch(`/api/market/candles?symbol=${instrument}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.candles) && data.candles.length > 0) {
      return data.candles;
    }
    return null;
  } catch (err) {
    console.warn(`Failed to fetch live candles for ${instrument}:`, err);
    return null;
  }
}

/**
 * Fetches Indian Standard Time and NSE market open/closed status
 */
export async function fetchMarketSessionStatus(): Promise<{
  istTime: string;
  istDate: string;
  isMarketOpen: boolean;
  marketStatus: 'OPEN' | 'CLOSED' | 'PRE-MARKET' | 'POST-MARKET';
} | null> {
  try {
    const res = await fetch('/api/market/status');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('Failed to fetch market session status:', err);
    return null;
  }
}

/**
 * Initiates SmartAPI authentication handshake via backend proxy
 */
export async function authenticateSmartApiWithBackend(creds: Partial<AngelOneCredentials>): Promise<{
  success: boolean;
  message: string;
  jwtToken?: string;
  feedToken?: string;
  sessionTime?: string;
}> {
  try {
    const res = await fetch('/api/angel-one/authenticate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(creds),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Failed to communicate with Angel One proxy endpoint.',
    };
  }
}

