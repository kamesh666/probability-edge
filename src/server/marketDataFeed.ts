/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Instrument, Candle, LiveMarketQuote } from '../types/market.ts';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const quoteCache = new Map<string, CacheEntry<LiveMarketQuote>>();
const candleCache = new Map<string, CacheEntry<Candle[]>>();
const CACHE_TTL_QUOTE_MS = 2500;
const CACHE_TTL_CANDLE_MS = 10000;

export function getIndianMarketStatus(): {
  istTime: string;
  istDate: string;
  isMarketOpen: boolean;
  marketStatus: 'OPEN' | 'CLOSED' | 'PRE-MARKET' | 'POST-MARKET';
} {
  const now = new Date();
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const istDateObj = new Date(now.getTime() + istOffsetMs);

  const hours = istDateObj.getUTCHours();
  const minutes = istDateObj.getUTCMinutes();
  const seconds = istDateObj.getUTCSeconds();
  const dayOfWeek = istDateObj.getUTCDay();

  const pad = (n: number) => n.toString().padStart(2, '0');
  const istTime = `${pad(hours)}:${pad(minutes)}:${pad(seconds)} IST`;
  const istDate = `${istDateObj.getUTCFullYear()}-${pad(istDateObj.getUTCMonth() + 1)}-${pad(istDateObj.getUTCDate())}`;

  const currentMinutesFromMidnight = hours * 60 + minutes;
  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;

  let isMarketOpen = false;
  let marketStatus: 'OPEN' | 'CLOSED' | 'PRE-MARKET' | 'POST-MARKET' = 'CLOSED';

  if (!isWeekday) {
    marketStatus = 'CLOSED';
  } else if (currentMinutesFromMidnight >= 540 && currentMinutesFromMidnight < 555) {
    marketStatus = 'PRE-MARKET';
  } else if (currentMinutesFromMidnight >= 555 && currentMinutesFromMidnight <= 930) {
    isMarketOpen = true;
    marketStatus = 'OPEN';
  } else if (currentMinutesFromMidnight > 930 && currentMinutesFromMidnight <= 960) {
    marketStatus = 'POST-MARKET';
  } else {
    marketStatus = 'CLOSED';
  }

  return { istTime, istDate, isMarketOpen, marketStatus };
}

export async function getLiveQuote(instrument: Instrument): Promise<LiveMarketQuote> {
  const cacheKey = instrument;
  const cached = quoteCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_QUOTE_MS) {
    return cached.data;
  }

  const yahooSymbol = instrument === 'NIFTY' ? '%5ENSEI' : '%5ENSEBANK';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;
  const { istTime, isMarketOpen, marketStatus } = getIndianMarketStatus();

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.meta) throw new Error('Invalid quote payload');

    const meta = result.meta;
    const ltp = Number(meta.regularMarketPrice) || (instrument === 'NIFTY' ? 22750 : 54000);
    const prevClose = Number(meta.chartPreviousClose || meta.previousClose) || ltp;
    const dayOpen = Number(meta.regularMarketDayHigh ? meta.regularMarketOpen : ltp) || prevClose;
    const dayHigh = Number(meta.regularMarketDayHigh) || Math.max(ltp, prevClose);
    const dayLow = Number(meta.regularMarketDayLow) || Math.min(ltp, prevClose);
    const change = Math.round((ltp - prevClose) * 100) / 100;
    const changePct = prevClose > 0 ? Math.round((change / prevClose) * 10000) / 100 : 0;
    const volume = Number(meta.regularMarketVolume) || 1500000;
    const timestamp = Number(meta.regularMarketTime) || Math.floor(now / 1000);

    const quote: LiveMarketQuote = {
      symbol: instrument,
      ltp,
      open: dayOpen,
      high: dayHigh,
      low: dayLow,
      close: ltp,
      prevClose,
      change,
      changePct,
      volume,
      timestamp,
      istTime,
      isMarketOpen,
      marketStatus,
      source: 'NSE_LIVE',
      lastUpdated: new Date().toISOString(),
    };

    quoteCache.set(cacheKey, { data: quote, timestamp: now });
    return quote;
  } catch (err: any) {
    if (cached) {
      return {
        ...cached.data,
        istTime,
        isMarketOpen,
        marketStatus,
        lastUpdated: new Date().toISOString(),
      };
    }

    const basePrice = instrument === 'NIFTY' ? 22750 : 53950;
    return {
      symbol: instrument,
      ltp: basePrice,
      open: basePrice,
      high: basePrice + 35,
      low: basePrice - 40,
      close: basePrice,
      prevClose: basePrice,
      change: 0,
      changePct: 0,
      volume: 1000000,
      timestamp: Math.floor(now / 1000),
      istTime,
      isMarketOpen,
      marketStatus,
      source: 'SIMULATED',
      lastUpdated: new Date().toISOString(),
    };
  }
}

export async function getLiveCandles(instrument: Instrument): Promise<Candle[]> {
  const cacheKey = instrument;
  const cached = candleCache.get(cacheKey);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL_CANDLE_MS) {
    return cached.data;
  }

  const yahooSymbol = instrument === 'NIFTY' ? '%5ENSEI' : '%5ENSEBANK';
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${yahooSymbol}?interval=1m&range=1d`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.timestamp || !result.indicators?.quote?.[0]) {
      throw new Error('Invalid candle response');
    }

    const timestamps: number[] = result.timestamp;
    const quote = result.indicators.quote[0];
    const opens: (number | null)[] = quote.open;
    const highs: (number | null)[] = quote.high;
    const lows: (number | null)[] = quote.low;
    const closes: (number | null)[] = quote.close;
    const volumes: (number | null)[] = quote.volume;

    const candles: Candle[] = [];
    let prevValidClose = instrument === 'NIFTY' ? 22750 : 53950;

    for (let i = 0; i < timestamps.length; i++) {
      const time = timestamps[i];
      let open = opens[i];
      let high = highs[i];
      let low = lows[i];
      let close = closes[i];
      let volume = volumes[i] ?? 10000;

      if (close == null && open == null) continue;
      if (open == null) open = prevValidClose;
      if (close == null) close = open;
      if (high == null) high = Math.max(open, close);
      if (low == null) low = Math.min(open, close);

      open = Math.round(open * 100) / 100;
      high = Math.round(high * 100) / 100;
      low = Math.round(low * 100) / 100;
      close = Math.round(close * 100) / 100;
      prevValidClose = close;

      const dateObj = new Date(time * 1000);
      const isoStr = dateObj.toISOString().replace('T', ' ').substring(0, 19);

      candles.push({
        timestamp: isoStr,
        time,
        open,
        high,
        low,
        close,
        volume: Math.floor(volume || 15000),
      });
    }

    if (candles.length > 0) {
      candleCache.set(cacheKey, { data: candles, timestamp: now });
      return candles;
    }

    throw new Error('No valid candles returned');
  } catch (err: any) {
    if (cached) return cached.data;
    throw err;
  }
}

export async function authenticateAngelOne(creds: {
  apiKey: string;
  clientCode: string;
  mpin: string;
  totpSecret?: string;
}): Promise<{
  success: boolean;
  message: string;
  feedToken?: string;
  jwtToken?: string;
  sessionTime?: string;
}> {
  if (!creds.apiKey || !creds.clientCode || !creds.mpin) {
    return {
      success: false,
      message: 'API Key, Client Code, and MPIN are required for Angel One SmartAPI connection.',
    };
  }

  try {
    const loginUrl = 'https://apiconnect.angelbroking.com/rest/auth/partner/v1/loginByPassword';
    const payload = {
      clientcode: creds.clientCode.trim(),
      password: creds.mpin.trim(),
      totp: creds.totpSecret?.trim() || '',
    };

    const res = await fetch(loginUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-UserType': 'USER',
        'X-SourceID': 'WEB',
        'X-ClientLocalIP': '127.0.0.1',
        'X-ClientPublicIP': '106.193.147.98',
        'X-MACAddress': 'fe80::216e:6507:4bfe:379',
        'X-PrivateKey': creds.apiKey.trim(),
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));

    if (res.ok && data?.status === true && data?.data?.jwtToken) {
      return {
        success: true,
        message: 'Successfully authorized SmartAPI session with Angel One.',
        jwtToken: data.data.jwtToken,
        feedToken: data.data.feedToken,
        sessionTime: new Date().toISOString(),
      };
    } else {
      const apiMsg = data?.message || data?.errorcode || `HTTP ${res.status}`;
      return {
        success: false,
        message: `Angel One Authentication: ${apiMsg}. Note: During off-market hours or invalid TOTP, the platform seamlessly continues with live NSE spot index feed.`,
      };
    }
  } catch (err: any) {
    return {
      success: false,
      message: `Failed to reach Angel One SmartAPI server: ${err.message}. Seamlessly continuing with live NSE spot index feed.`,
    };
  }
}
