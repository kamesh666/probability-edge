/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AccountRiskState, Instrument, PaperOrder, PaperPosition, RiskConfig, TradeRecord, TradeSignal } from '../types/market.ts';
import { calculatePositionSizing, DEFAULT_RISK_CONFIG, estimateTransactionCharges } from './riskManager.ts';

const STORAGE_KEYS = {
  POSITIONS: 'pe_paper_positions',
  ORDERS: 'pe_paper_orders',
  TRADES: 'pe_paper_trades',
  ACCOUNT: 'pe_paper_account',
};

// In-memory fallback if localStorage is blocked by iframe sandbox or security policy
const memoryStore: Record<string, string> = {};

function safeGetItem(key: string): string | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage.getItem(key);
    }
  } catch (e) {
    // blocked or security error
  }
  return memoryStore[key] || null;
}

function safeSetItem(key: string, value: string): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(key, value);
      return;
    }
  } catch (e) {
    // blocked or security error
  }
  memoryStore[key] = value;
}

export class PaperBroker {
  private config: RiskConfig;
  private account: AccountRiskState;
  private positions: PaperPosition[] = [];
  private orders: PaperOrder[] = [];
  private tradeHistory: TradeRecord[] = [];
  public onTradeClosed?: (trade: TradeRecord) => void;

  constructor(config: RiskConfig = DEFAULT_RISK_CONFIG, onTradeClosed?: (trade: TradeRecord) => void) {
    this.config = config;
    this.onTradeClosed = onTradeClosed;
    this.account = this.loadAccount();
    this.positions = this.loadPositions();
    this.orders = this.loadOrders();
    this.tradeHistory = this.loadTrades();
  }

  // --- Persistence Methods ---

  private loadAccount(): AccountRiskState {
    const raw = safeGetItem(STORAGE_KEYS.ACCOUNT);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        // Fallback
      }
    }
    return {
      initialEquity: this.config.accountEquity,
      currentEquity: this.config.accountEquity,
      todayRealizedPnL: 0,
      todayUnrealizedPnL: 0,
      tradesExecutedToday: 0,
      consecutiveLosses: 0,
      isDailyLossLimitBreached: false,
      isMaxTradesReached: false,
      isInCooldown: false,
      tradingAllowed: true,
    };
  }

  private saveAccount() {
    safeSetItem(STORAGE_KEYS.ACCOUNT, JSON.stringify(this.account));
  }

  private loadPositions(): PaperPosition[] {
    const raw = safeGetItem(STORAGE_KEYS.POSITIONS);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return [];
  }

  private savePositions() {
    safeSetItem(STORAGE_KEYS.POSITIONS, JSON.stringify(this.positions));
  }

  private loadOrders(): PaperOrder[] {
    const raw = safeGetItem(STORAGE_KEYS.ORDERS);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return [];
  }

  private saveOrders() {
    safeSetItem(STORAGE_KEYS.ORDERS, JSON.stringify(this.orders));
  }

  private loadTrades(): TradeRecord[] {
    const raw = safeGetItem(STORAGE_KEYS.TRADES);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) {}
    }
    return [];
  }

  private saveTrades() {
    safeSetItem(STORAGE_KEYS.TRADES, JSON.stringify(this.tradeHistory));
  }

  // --- Getters ---

  public getAccountState(): AccountRiskState {
    return { ...this.account };
  }

  public getPositions(): PaperPosition[] {
    return [...this.positions];
  }

  public getOrders(): PaperOrder[] {
    return [...this.orders];
  }

  public getTradeHistory(): TradeRecord[] {
    return [...this.tradeHistory];
  }

  // --- Order Execution ---

  public placeOrderFromSignal(signal: TradeSignal, executionTimestamp: number): { success: boolean; message: string; order?: PaperOrder } {
    const sizing = calculatePositionSizing(signal, this.account, this.config);

    if (!sizing.isApproved) {
      const reason = sizing.rejectionReasons.join('; ');
      return { success: false, message: `Risk Check Failed: ${reason}` };
    }

    const orderId = `ORD_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const contract = signal.recommendedContract;

    const slippageMultiplier = 1 + (this.config.slippagePct / 100);
    const executedPrice = Math.round((contract.ask * slippageMultiplier) * 10) / 10;
    const entryCharges = estimateTransactionCharges(executedPrice, sizing.quantity, this.config);

    const order: PaperOrder = {
      id: orderId,
      signalId: signal.id,
      symbol: contract.symbol,
      underlying: signal.underlying,
      strike: contract.strike,
      optionType: contract.optionType,
      direction: 'BUY',
      lots: sizing.lots,
      quantity: sizing.quantity,
      orderType: 'MARKET',
      requestedPrice: contract.ask,
      executedPrice,
      stopLossPrice: signal.proposedStopPremium,
      targetPrice: signal.proposedTargetPremium,
      status: 'FILLED',
      submittedAt: executionTimestamp,
      executedAt: executionTimestamp,
      estimatedCharges: entryCharges,
    };

    const initialRisk = (executedPrice - signal.proposedStopPremium) * sizing.quantity;

    const position: PaperPosition = {
      id: `POS_${orderId}`,
      orderId,
      signalId: signal.id,
      strategyId: signal.strategyId,
      strategyName: signal.strategyName,
      symbol: contract.symbol,
      underlying: signal.underlying,
      strike: contract.strike,
      optionType: contract.optionType,
      lots: sizing.lots,
      quantity: sizing.quantity,
      entryPrice: executedPrice,
      currentPrice: executedPrice,
      stopLossPrice: signal.proposedStopPremium,
      targetPrice: signal.proposedTargetPremium,
      initialRisk,
      unrealizedPnL: 0,
      unrealizedPnLPct: 0,
      entryTime: executionTimestamp,
      status: 'OPEN',
    };

    this.orders.unshift(order);
    this.positions.unshift(position);

    this.account.tradesExecutedToday += 1;
    this.account.currentEquity -= entryCharges;

    if (this.account.tradesExecutedToday >= this.config.maxTradesPerDay) {
      this.account.isMaxTradesReached = true;
      this.account.tradingAllowed = false;
      this.account.lockoutReason = 'Max daily trades limit reached';
    }

    this.saveOrders();
    this.savePositions();
    this.saveAccount();

    return {
      success: true,
      message: `Paper Order Filled: ${sizing.quantity} qty ${contract.symbol} @ ₹${executedPrice}`,
      order,
    };
  }

  public updatePositionsMarkToMarket(currentSpotPrice: number, timestamp: number) {
    let totalUnrealized = 0;
    const remainingPositions: PaperPosition[] = [];

    for (const pos of this.positions) {
      const delta = pos.optionType === 'CE' ? 0.5 : -0.5;
      const spotChange = currentSpotPrice - (pos.underlying === 'NIFTY' ? 24800 : 52000);
      const estLTP = Math.max(0.5, Math.round((pos.entryPrice + spotChange * delta * 0.2) * 10) / 10);
      
      pos.currentPrice = estLTP;
      pos.unrealizedPnL = (pos.currentPrice - pos.entryPrice) * pos.quantity;
      pos.unrealizedPnLPct = pos.entryPrice > 0 ? ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100 : 0;

      if (pos.currentPrice <= pos.stopLossPrice) {
        this.closePosition(pos, pos.stopLossPrice, timestamp, 'STOP_LOSS_HIT');
        continue;
      }

      if (pos.currentPrice >= pos.targetPrice) {
        this.closePosition(pos, pos.targetPrice, timestamp, 'TARGET_HIT');
        continue;
      }

      totalUnrealized += pos.unrealizedPnL;
      remainingPositions.push(pos);
    }

    this.positions = remainingPositions;
    this.account.todayUnrealizedPnL = Math.round(totalUnrealized * 100) / 100;
    this.savePositions();
    this.saveAccount();
  }

  public closePosition(
    pos: PaperPosition, 
    exitPrice: number, 
    exitTimestamp: number, 
    reason: TradeRecord['exitReason']
  ) {
    const grossPnL = (exitPrice - pos.entryPrice) * pos.quantity;
    const exitCharges = estimateTransactionCharges(exitPrice, pos.quantity, this.config);
    const entryCharges = estimateTransactionCharges(pos.entryPrice, pos.quantity, this.config);
    const totalCharges = entryCharges + exitCharges;
    const netPnL = grossPnL - totalCharges;

    const holdingMinutes = Math.max(1, Math.round((exitTimestamp - pos.entryTime) / 60));

    const trade: TradeRecord = {
      id: `TRD_${pos.id}_${Date.now()}`,
      positionId: pos.id,
      strategyId: pos.strategyId,
      strategyName: pos.strategyName,
      symbol: pos.symbol,
      underlying: pos.underlying,
      strike: pos.strike,
      optionType: pos.optionType,
      lots: pos.lots,
      quantity: pos.quantity,
      entryPrice: pos.entryPrice,
      exitPrice,
      entryTime: pos.entryTime,
      exitTime: exitTimestamp,
      exitReason: reason,
      grossPnL: Math.round(grossPnL * 100) / 100,
      brokerageAndTaxes: Math.round(totalCharges * 100) / 100,
      netPnL: Math.round(netPnL * 100) / 100,
      roiPct: pos.entryPrice > 0 ? Math.round(((exitPrice - pos.entryPrice) / pos.entryPrice) * 10000) / 100 : 0,
      holdingTimeMinutes: holdingMinutes,
      regime: 'TREND_UP',
      rationale: `Executed exit on ${reason} trigger. Target was ₹${pos.targetPrice}, Stop was ₹${pos.stopLossPrice}`,
    };

    this.tradeHistory.unshift(trade);
    this.account.todayRealizedPnL += netPnL;
    this.account.currentEquity += netPnL;

    if (netPnL < 0) {
      this.account.consecutiveLosses += 1;
    } else {
      this.account.consecutiveLosses = 0;
    }

    const maxDailyLoss = this.account.initialEquity * (this.config.dailyLossLimitPct / 100);
    if (this.account.todayRealizedPnL <= -maxDailyLoss) {
      this.account.isDailyLossLimitBreached = true;
      this.account.tradingAllowed = false;
      this.account.lockoutReason = `Daily loss limit of 2% (₹${maxDailyLoss}) reached. Trading halted.`;
    }

    this.positions = this.positions.filter(p => p.id !== pos.id);
    this.saveTrades();
    this.savePositions();
    this.saveAccount();

    if (this.onTradeClosed) {
      try {
        this.onTradeClosed(trade);
      } catch (err) {
        console.error('Error in onTradeClosed callback:', err);
      }
    }
  }

  public mergeHistoricalTrades(loadedTrades: TradeRecord[]) {
    if (!loadedTrades || loadedTrades.length === 0) return;
    const existingIds = new Set(this.tradeHistory.map(t => t.id));
    const newTrades = loadedTrades.filter(t => !existingIds.has(t.id));
    if (newTrades.length > 0) {
      this.tradeHistory = [...this.tradeHistory, ...newTrades];
      this.saveTrades();
    }
  }

  public manualSquareOff(positionId: string, currentLTP: number, timestamp: number) {
    const pos = this.positions.find(p => p.id === positionId);
    if (pos) {
      this.closePosition(pos, currentLTP, timestamp, 'MANUAL_SQUARE_OFF');
    }
  }

  public emergencySquareOffAll(timestamp: number) {
    for (const pos of [...this.positions]) {
      this.closePosition(pos, pos.currentPrice, timestamp, 'MANUAL_SQUARE_OFF');
    }
  }

  public updateStopLoss(positionId: string, newStop: number) {
    const pos = this.positions.find(p => p.id === positionId);
    if (pos) {
      pos.stopLossPrice = newStop;
      this.savePositions();
    }
  }

  public resetAccount() {
    this.account = {
      initialEquity: this.config.accountEquity,
      currentEquity: this.config.accountEquity,
      todayRealizedPnL: 0,
      todayUnrealizedPnL: 0,
      tradesExecutedToday: 0,
      consecutiveLosses: 0,
      isDailyLossLimitBreached: false,
      isMaxTradesReached: false,
      isInCooldown: false,
      tradingAllowed: true,
    };
    this.positions = [];
    this.orders = [];
    this.tradeHistory = [];
    this.saveAccount();
    this.savePositions();
    this.saveOrders();
    this.saveTrades();
  }
}
