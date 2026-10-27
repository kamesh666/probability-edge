/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { and, eq, desc } from 'drizzle-orm';
import { db } from './index.ts';
import { users, tradeRecords, angelOneConfigs } from './schema.ts';

export interface InsertTradeInput {
  tradeId: string;
  symbol: string;
  underlying: string;
  strategyName: string;
  strike: number;
  optionType: string;
  lots: number;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  grossPnL: number;
  brokerageAndTaxes: number;
  netPnL: number;
  roiPct: number;
  exitReason: string;
  holdingTimeMinutes: number;
  regime: string;
  rationale: string;
  userNotes?: string | null;
  entryTime: Date | string;
  exitTime: Date | string;
}

export interface AngelOneConfigInput {
  apiKey?: string;
  clientCode?: string;
  mpin?: string;
  totpSecret?: string;
  feedToken?: string;
  jwtToken?: string;
  isMockMode?: boolean;
  lastConnectedAt?: Date | string | null;
}

/**
 * Ensures user profile exists in PostgreSQL.
 */
export async function getOrCreateUser(uid: string, email: string) {
  try {
    const existing = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (existing.length > 0) {
      return existing[0];
    }
    const inserted = await db
      .insert(users)
      .values({ uid, email })
      .onConflictDoUpdate({
        target: users.uid,
        set: { email },
      })
      .returning();
    return inserted[0];
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw new Error('Database operation failed in user profile sync', { cause: error });
  }
}

/**
 * Inserts a daily paper/simulated trade record into Cloud SQL.
 */
export async function insertTradeRecord(userId: string, input: InsertTradeInput) {
  try {
    const entryDate = input.entryTime instanceof Date ? input.entryTime : new Date(input.entryTime);
    const exitDate = input.exitTime instanceof Date ? input.exitTime : new Date(input.exitTime);

    const result = await db
      .insert(tradeRecords)
      .values({
        userId,
        tradeId: input.tradeId,
        symbol: input.symbol,
        underlying: input.underlying,
        strategyName: input.strategyName,
        strike: input.strike,
        optionType: input.optionType,
        lots: input.lots,
        quantity: input.quantity,
        entryPrice: input.entryPrice,
        exitPrice: input.exitPrice,
        grossPnL: input.grossPnL,
        brokerageAndTaxes: input.brokerageAndTaxes,
        netPnL: input.netPnL,
        roiPct: input.roiPct,
        exitReason: input.exitReason,
        holdingTimeMinutes: input.holdingTimeMinutes,
        regime: input.regime,
        rationale: input.rationale,
        userNotes: input.userNotes ?? null,
        entryTime: entryDate,
        exitTime: exitDate,
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Error inserting trade record:', error);
    throw new Error('Failed to record trade in database', { cause: error });
  }
}

/**
 * Retrieves daily trade history for a user, ordered by exit time descending.
 */
export async function getTradeRecordsByUser(userId: string, limit = 200) {
  try {
    return await db
      .select()
      .from(tradeRecords)
      .where(eq(tradeRecords.userId, userId))
      .orderBy(desc(tradeRecords.exitTime))
      .limit(limit);
  } catch (error) {
    console.error('Error fetching trade records:', error);
    throw new Error('Failed to retrieve trades from database', { cause: error });
  }
}

/**
 * Updates journal notes for a trade owned by the given user.
 * Returns null when no trade with that id belongs to the user.
 */
export async function updateTradeRecordNotes(userId: string, tradeId: string, notes: string) {
  try {
    const updated = await db
      .update(tradeRecords)
      .set({ userNotes: notes })
      .where(and(eq(tradeRecords.userId, userId), eq(tradeRecords.tradeId, tradeId)))
      .returning();
    return updated[0] || null;
  } catch (error) {
    console.error('Error updating trade notes:', error);
    throw new Error('Failed to update trade journal note', { cause: error });
  }
}

/**
 * Safe view of a stored Angel One config: secrets are never included,
 * only whether each one has been saved.
 */
export interface AngelOneConfigSummary {
  clientCode: string | null;
  isMockMode: boolean;
  lastConnectedAt: Date | null;
  updatedAt: Date | null;
  hasApiKey: boolean;
  hasMpin: boolean;
  hasTotpSecret: boolean;
  hasActiveSession: boolean;
}

export function toAngelOneConfigSummary(
  row: typeof angelOneConfigs.$inferSelect | null | undefined
): AngelOneConfigSummary | null {
  if (!row) return null;
  return {
    clientCode: row.clientCode,
    isMockMode: row.isMockMode ?? true,
    lastConnectedAt: row.lastConnectedAt,
    updatedAt: row.updatedAt,
    hasApiKey: Boolean(row.apiKey),
    hasMpin: Boolean(row.mpin),
    hasTotpSecret: Boolean(row.totpSecret),
    hasActiveSession: Boolean(row.jwtToken),
  };
}

/**
 * Upserts Angel One SmartAPI configuration for a user.
 * Only fields that are present in `config` are written, so a blank secret
 * field in the settings form does not erase a secret saved earlier.
 * Pass an empty string to clear a secret explicitly.
 */
export async function upsertAngelOneConfig(userId: string, config: AngelOneConfigInput) {
  try {
    const fields: Partial<typeof angelOneConfigs.$inferInsert> = {};
    const setText = (key: 'apiKey' | 'clientCode' | 'mpin' | 'totpSecret' | 'feedToken' | 'jwtToken') => {
      const value = config[key];
      if (typeof value === 'string') fields[key] = value.trim() === '' ? null : value.trim();
    };
    setText('apiKey');
    setText('clientCode');
    setText('mpin');
    setText('totpSecret');
    setText('feedToken');
    setText('jwtToken');
    if (typeof config.isMockMode === 'boolean') fields.isMockMode = config.isMockMode;
    if (config.lastConnectedAt !== undefined) {
      fields.lastConnectedAt = config.lastConnectedAt
        ? config.lastConnectedAt instanceof Date
          ? config.lastConnectedAt
          : new Date(config.lastConnectedAt)
        : null;
    }

    const result = await db
      .insert(angelOneConfigs)
      .values({ userId, ...fields })
      .onConflictDoUpdate({
        target: angelOneConfigs.userId,
        set: { ...fields, updatedAt: new Date() },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Error saving Angel One config:', error);
    throw new Error('Failed to save Angel One settings in database', { cause: error });
  }
}

/**
 * Retrieves the full Angel One SmartAPI configuration (including secrets) for a user.
 * Server-side use only: never send this row to the client.
 */
export async function getAngelOneConfigByUser(userId: string) {
  try {
    const records = await db
      .select()
      .from(angelOneConfigs)
      .where(eq(angelOneConfigs.userId, userId))
      .limit(1);

    return records[0] || null;
  } catch (error) {
    console.error('Error retrieving Angel One config:', error);
    throw new Error('Failed to retrieve Angel One configuration', { cause: error });
  }
}
