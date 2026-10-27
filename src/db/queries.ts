/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { eq, desc } from 'drizzle-orm';
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
 * Updates journal notes for a specific trade.
 */
export async function updateTradeRecordNotes(userId: string, tradeId: string, notes: string) {
  try {
    const updated = await db
      .update(tradeRecords)
      .set({ userNotes: notes })
      .where(eq(tradeRecords.tradeId, tradeId))
      .returning();
    return updated[0] || null;
  } catch (error) {
    console.error('Error updating trade notes:', error);
    throw new Error('Failed to update trade journal note', { cause: error });
  }
}

/**
 * Upserts Angel One SmartAPI configuration for a user.
 */
export async function upsertAngelOneConfig(userId: string, config: AngelOneConfigInput) {
  try {
    const lastConn = config.lastConnectedAt
      ? config.lastConnectedAt instanceof Date
        ? config.lastConnectedAt
        : new Date(config.lastConnectedAt)
      : null;

    const result = await db
      .insert(angelOneConfigs)
      .values({
        userId,
        apiKey: config.apiKey ?? null,
        clientCode: config.clientCode ?? null,
        mpin: config.mpin ?? null,
        totpSecret: config.totpSecret ?? null,
        feedToken: config.feedToken ?? null,
        jwtToken: config.jwtToken ?? null,
        isMockMode: config.isMockMode ?? true,
        lastConnectedAt: lastConn,
      })
      .onConflictDoUpdate({
        target: angelOneConfigs.userId,
        set: {
          apiKey: config.apiKey ?? null,
          clientCode: config.clientCode ?? null,
          mpin: config.mpin ?? null,
          totpSecret: config.totpSecret ?? null,
          feedToken: config.feedToken ?? null,
          jwtToken: config.jwtToken ?? null,
          isMockMode: config.isMockMode ?? true,
          lastConnectedAt: lastConn,
          updatedAt: new Date(),
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Error saving Angel One config:', error);
    throw new Error('Failed to save Angel One settings in database', { cause: error });
  }
}

/**
 * Retrieves Angel One SmartAPI configuration for a user.
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
