/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccountRiskState, Instrument, RiskConfig, TradeSignal } from '../types/market.ts';

export const DEFAULT_RISK_CONFIG: RiskConfig = {
  accountEquity: 500000, // ₹5,00,000 initial paper trading capital
  riskPerTradePct: 0.5, // 0.5% of equity per trade = ₹2,500
  dailyLossLimitPct: 2.0, // 2% daily loss limit = ₹10,000
  maxTradesPerDay: 3, // Maximum 3 trades per day
  minRewardToRisk: 1.5, // Minimum R:R ratio
  consecutiveLossCooldownTrades: 2, // Cooldown after 2 consecutive losses
  slippagePct: 0.3, // 0.3% simulated slippage
  brokeragePerOrder: 20, // Flat ₹20 per trade
  sttTurnoverPct: 0.1, // 0.1% STT on sell side
  exchangeTxnChargePct: 0.05, // 0.05% exchange charges
  gstPct: 18, // 18% GST on brokerage + exchange
  stampDutyPct: 0.003, // 0.003% stamp duty
};

export interface PositionSizingResult {
  isApproved: boolean;
  permittedTradeRisk: number;
  riskPerUnit: number;
  lots: number;
  quantity: number;
  lotSize: number;
  totalCapitalRequired: number;
  estimatedCharges: number;
  rejectionReasons: string[];
}

/**
 * Calculates statutory Indian F&O brokerage, STT, exchange turnover fees, and GST
 */
export function estimateTransactionCharges(
  premium: number,
  quantity: number,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): number {
  const turnover = premium * quantity;
  const brokerage = config.brokeragePerOrder;
  const exchangeFees = turnover * (config.exchangeTxnChargePct / 100);
  const gst = (brokerage + exchangeFees) * (config.gstPct / 100);
  const stt = turnover * (config.sttTurnoverPct / 100);
  const stampDuty = turnover * (config.stampDutyPct / 100);

  return Math.round((brokerage + exchangeFees + gst + stt + stampDuty) * 100) / 100;
}

/**
 * Validates risk limits and sizes option position strictly according to:
 * risk_per_unit = (entry_premium - stop_premium) * lot_size
 * quantity = floor(permitted_trade_risk / (risk_per_unit + estimated_cost_per_lot)) * lot_size
 */
export function calculatePositionSizing(
  signal: TradeSignal,
  accountState: AccountRiskState,
  config: RiskConfig = DEFAULT_RISK_CONFIG
): PositionSizingResult {
  const rejectionReasons: string[] = [];

  // 1. Daily Loss Limit Check
  const maxPermittedDailyLoss = accountState.initialEquity * (config.dailyLossLimitPct / 100);
  if (accountState.todayRealizedPnL <= -maxPermittedDailyLoss) {
    rejectionReasons.push(`Daily loss limit breached (Loss: ₹${Math.abs(accountState.todayRealizedPnL).toFixed(2)} >= Limit: ₹${maxPermittedDailyLoss.toFixed(2)})`);
  }

  // 2. Maximum Entries Per Day Check
  if (accountState.tradesExecutedToday >= config.maxTradesPerDay) {
    rejectionReasons.push(`Maximum daily trade count reached (${accountState.tradesExecutedToday} / ${config.maxTradesPerDay})`);
  }

  // 3. Consecutive Losses Cooldown Check
  if (accountState.consecutiveLosses >= config.consecutiveLossCooldownTrades) {
    rejectionReasons.push(`Account in cooldown after ${accountState.consecutiveLosses} consecutive losses`);
  }

  // 4. Reward-to-Risk Check
  if (signal.rewardToRiskRatio < config.minRewardToRisk) {
    rejectionReasons.push(`Planned R:R (${signal.rewardToRiskRatio.toFixed(2)}) < Required Minimum (${config.minRewardToRisk})`);
  }

  // 5. Valid Stop and Target Check
  const entry = signal.proposedEntryPremium;
  const stop = signal.proposedStopPremium;
  const target = signal.proposedTargetPremium;

  if (stop >= entry) {
    rejectionReasons.push(`Invalid stop price: Stop (${stop}) must be below Entry (${entry}) for Long option purchase`);
  }
  if (target <= entry) {
    rejectionReasons.push(`Invalid target price: Target (${target}) must be above Entry (${entry}) for Long option purchase`);
  }

  const lotSize = signal.underlying === 'NIFTY' ? 25 : 15;
  const permittedTradeRisk = accountState.currentEquity * (config.riskPerTradePct / 100);
  const premiumRisk = Math.max(0.1, entry - stop);
  const riskPerLot = premiumRisk * lotSize;

  const estimatedCostPerLot = estimateTransactionCharges(entry, lotSize, config);
  const totalRiskPerLot = riskPerLot + estimatedCostPerLot;

  const calculatedLots = Math.floor(permittedTradeRisk / totalRiskPerLot);

  if (calculatedLots < 1) {
    rejectionReasons.push(`Permitted risk (₹${permittedTradeRisk.toFixed(2)}) is insufficient for minimum 1 lot risk (₹${totalRiskPerLot.toFixed(2)})`);
  }

  const finalLots = Math.max(0, calculatedLots);
  const finalQuantity = finalLots * lotSize;
  const totalCapitalRequired = entry * finalQuantity;
  const estimatedCharges = estimateTransactionCharges(entry, finalQuantity, config);

  if (totalCapitalRequired > accountState.currentEquity) {
    rejectionReasons.push(`Required capital (₹${totalCapitalRequired.toFixed(2)}) exceeds available equity (₹${accountState.currentEquity.toFixed(2)})`);
  }

  return {
    isApproved: rejectionReasons.length === 0,
    permittedTradeRisk,
    riskPerUnit: premiumRisk,
    lots: finalLots,
    quantity: finalQuantity,
    lotSize,
    totalCapitalRequired,
    estimatedCharges,
    rejectionReasons,
  };
}

/**
 * Validates whether an instrument lot size matches exchange contract master
 */
export function validateLotSize(underlying: Instrument, quantity: number): boolean {
  const lotSize = underlying === 'NIFTY' ? 25 : 15;
  return quantity > 0 && quantity % lotSize === 0;
}
