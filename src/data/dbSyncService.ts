/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TradeRecord } from '../types/market.ts';
import { AngelOneCredentials } from './marketDataService.ts';

const API_BASE = '/api';

function getAuthHeaders(idToken?: string, userId?: string): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (idToken) {
    headers['Authorization'] = `Bearer ${idToken}`;
  }
  if (userId) {
    headers['x-user-id'] = userId;
  }
  return headers;
}

/**
 * Persist a completed paper/simulated trade to Cloud SQL.
 */
export async function syncTradeToCloudSql(
  trade: TradeRecord,
  userId = 'default_trader',
  idToken?: string
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const payload = {
      tradeId: trade.id,
      symbol: trade.symbol,
      underlying: trade.underlying,
      strategyName: trade.strategyName,
      strike: trade.strike,
      optionType: trade.optionType,
      lots: trade.lots,
      quantity: trade.quantity,
      entryPrice: trade.entryPrice,
      exitPrice: trade.exitPrice,
      grossPnL: trade.grossPnL,
      brokerageAndTaxes: trade.brokerageAndTaxes,
      netPnL: trade.netPnL,
      roiPct: trade.roiPct,
      exitReason: trade.exitReason,
      holdingTimeMinutes: trade.holdingTimeMinutes,
      regime: trade.regime,
      rationale: trade.rationale,
      userNotes: trade.userNotes || null,
      entryTime: new Date(trade.entryTime * 1000).toISOString(),
      exitTime: new Date(trade.exitTime * 1000).toISOString(),
    };

    const res = await fetch(`${API_BASE}/trades`, {
      method: 'POST',
      headers: getAuthHeaders(idToken, userId),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      return { success: false, error: errJson.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return { success: true, data };
  } catch (err: any) {
    console.error('Failed to sync trade to Cloud SQL:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Fetch daily trades from Cloud SQL for the user.
 */
export async function fetchTradesFromCloudSql(
  userId = 'default_trader',
  idToken?: string
): Promise<{ success: boolean; trades?: TradeRecord[]; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/trades?userId=${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(idToken, userId),
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    const rows: any[] = await res.json();
    const mapped: TradeRecord[] = rows.map((r) => ({
      id: r.tradeId,
      positionId: r.tradeId,
      strategyId: r.strategyName,
      strategyName: r.strategyName,
      symbol: r.symbol,
      underlying: r.underlying,
      strike: r.strike,
      optionType: r.optionType,
      lots: r.lots,
      quantity: r.quantity,
      entryPrice: r.entryPrice,
      exitPrice: r.exitPrice,
      entryTime: Math.floor(new Date(r.entryTime).getTime() / 1000),
      exitTime: Math.floor(new Date(r.exitTime).getTime() / 1000),
      exitReason: r.exitReason,
      grossPnL: r.grossPnL,
      brokerageAndTaxes: r.brokerageAndTaxes,
      netPnL: r.netPnL,
      roiPct: r.roiPct,
      holdingTimeMinutes: r.holdingTimeMinutes,
      regime: r.regime,
      rationale: r.rationale,
      userNotes: r.userNotes || '',
    }));

    return { success: true, trades: mapped };
  } catch (err: any) {
    console.error('Failed to load trades from Cloud SQL:', err);
    return { success: false, error: err?.message || 'Network error' };
  }
}

/**
 * Update trade journal notes in Cloud SQL.
 */
export async function updateTradeNotesInCloudSql(
  tradeId: string,
  notes: string,
  userId = 'default_trader',
  idToken?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/trades/${encodeURIComponent(tradeId)}/notes`, {
      method: 'PATCH',
      headers: getAuthHeaders(idToken, userId),
      body: JSON.stringify({ notes }),
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Persist Angel One configuration to Cloud SQL.
 */
export async function saveAngelOneConfigToCloudSql(
  creds: AngelOneCredentials,
  userId = 'default_trader',
  idToken?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/angel-one`, {
      method: 'POST',
      headers: getAuthHeaders(idToken, userId),
      body: JSON.stringify({
        apiKey: creds.apiKey,
        clientCode: creds.clientCode,
        mpin: creds.mpin,
        totpSecret: creds.totpSecret,
        isMockMode: creds.isMockMode,
        lastConnectedAt: creds.isConnected ? new Date().toISOString() : null,
      }),
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}

/**
 * Load saved Angel One configuration from Cloud SQL.
 */
export async function fetchAngelOneConfigFromCloudSql(
  userId = 'default_trader',
  idToken?: string
): Promise<{ success: boolean; config?: Partial<AngelOneCredentials>; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/angel-one?userId=${encodeURIComponent(userId)}`, {
      headers: getAuthHeaders(idToken, userId),
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    if (!data) return { success: true };

    return {
      success: true,
      config: {
        apiKey: data.apiKey || '',
        clientCode: data.clientCode || '',
        mpin: data.mpin || '',
        totpSecret: data.totpSecret || '',
        isMockMode: data.isMockMode ?? true,
        isConnected: Boolean(data.apiKey && data.clientCode),
        lastConnectedAt: data.lastConnectedAt ? new Date(data.lastConnectedAt).toLocaleTimeString() : undefined,
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
