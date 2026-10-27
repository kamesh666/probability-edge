/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { TradeRecord } from '../types/market.ts';
import { AngelOneCredentials } from './marketDataService.ts';
import { auth } from '../lib/firebase.ts';

const API_BASE = '/api';

const NOT_SIGNED_IN = 'Not signed in';

/**
 * Builds request headers with a fresh Firebase ID token for the signed-in user.
 * Returns null when nobody is signed in. getIdToken() refreshes expired tokens.
 */
async function getAuthHeaders(): Promise<Record<string, string> | null> {
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${idToken}`,
  };
}

/**
 * Persist a completed paper/simulated trade to Cloud SQL.
 */
export async function syncTradeToCloudSql(
  trade: TradeRecord
): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) return { success: false, error: NOT_SIGNED_IN };

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
      headers,
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
export async function fetchTradesFromCloudSql(): Promise<{ success: boolean; trades?: TradeRecord[]; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) return { success: false, error: NOT_SIGNED_IN };

    const res = await fetch(`${API_BASE}/trades`, {
      headers,
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
  notes: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) return { success: false, error: NOT_SIGNED_IN };

    const res = await fetch(`${API_BASE}/trades/${encodeURIComponent(tradeId)}/notes`, {
      method: 'PATCH',
      headers,
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
  creds: AngelOneCredentials
): Promise<{ success: boolean; error?: string }> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) return { success: false, error: NOT_SIGNED_IN };

    const res = await fetch(`${API_BASE}/angel-one`, {
      method: 'POST',
      headers,
      // Blank secret fields are left out so the server keeps the saved value.
      body: JSON.stringify({
        apiKey: creds.apiKey || undefined,
        clientCode: creds.clientCode,
        mpin: creds.mpin || undefined,
        totpSecret: creds.totpSecret || undefined,
        isMockMode: creds.isMockMode,
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

export interface SavedAngelOneSecrets {
  apiKey: boolean;
  mpin: boolean;
  totpSecret: boolean;
}

/**
 * Load saved Angel One configuration from Cloud SQL.
 */
export async function fetchAngelOneConfigFromCloudSql(): Promise<{
  success: boolean;
  config?: Partial<AngelOneCredentials>;
  saved?: SavedAngelOneSecrets;
  error?: string;
}> {
  try {
    const headers = await getAuthHeaders();
    if (!headers) return { success: false, error: NOT_SIGNED_IN };

    const res = await fetch(`${API_BASE}/angel-one`, {
      headers,
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}` };
    }

    const data = await res.json();
    if (!data) return { success: true };

    // The server never returns secrets, only whether each one is saved.
    return {
      success: true,
      config: {
        apiKey: '',
        clientCode: data.clientCode || '',
        mpin: '',
        totpSecret: '',
        isMockMode: data.isMockMode ?? true,
        isConnected: Boolean(data.hasActiveSession),
        lastConnectedAt: data.lastConnectedAt ? new Date(data.lastConnectedAt).toLocaleTimeString() : undefined,
      },
      saved: {
        apiKey: Boolean(data.hasApiKey),
        mpin: Boolean(data.hasMpin),
        totpSecret: Boolean(data.hasTotpSecret),
      },
    };
  } catch (err: any) {
    return { success: false, error: err?.message };
  }
}
