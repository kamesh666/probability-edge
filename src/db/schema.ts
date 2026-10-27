/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { relations } from 'drizzle-orm';
import { boolean, doublePrecision, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

// Users table authenticated via Firebase Auth
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Daily trade activity records
export const tradeRecords = pgTable('trade_records', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull(), // maps to users.uid
  tradeId: text('trade_id').notNull(),
  symbol: text('symbol').notNull(),
  underlying: text('underlying').notNull(),
  strategyName: text('strategy_name').notNull(),
  strike: doublePrecision('strike').notNull(),
  optionType: text('option_type').notNull(),
  lots: integer('lots').notNull(),
  quantity: integer('quantity').notNull(),
  entryPrice: doublePrecision('entry_price').notNull(),
  exitPrice: doublePrecision('exit_price').notNull(),
  grossPnL: doublePrecision('gross_pnl').notNull(),
  brokerageAndTaxes: doublePrecision('brokerage_and_taxes').notNull(),
  netPnL: doublePrecision('net_pnl').notNull(),
  roiPct: doublePrecision('roi_pct').notNull(),
  exitReason: text('exit_reason').notNull(),
  holdingTimeMinutes: integer('holding_time_minutes').notNull(),
  regime: text('regime').notNull(),
  rationale: text('rationale').notNull(),
  userNotes: text('user_notes'),
  entryTime: timestamp('entry_time').notNull(),
  exitTime: timestamp('exit_time').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// Angel One configuration and connection settings
export const angelOneConfigs = pgTable('angel_one_configs', {
  id: serial('id').primaryKey(),
  userId: text('user_id').notNull().unique(),
  apiKey: text('api_key'),
  clientCode: text('client_code'),
  mpin: text('mpin'),
  totpSecret: text('totp_secret'),
  feedToken: text('feed_token'),
  jwtToken: text('jwt_token'),
  isMockMode: boolean('is_mock_mode').default(true),
  lastConnectedAt: timestamp('last_connected_at'),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  trades: many(tradeRecords),
  angelConfig: one(angelOneConfigs, {
    fields: [users.uid],
    references: [angelOneConfigs.userId],
  }),
}));

export const tradeRecordsRelations = relations(tradeRecords, ({ one }) => ({
  user: one(users, {
    fields: [tradeRecords.userId],
    references: [users.uid],
  }),
}));
