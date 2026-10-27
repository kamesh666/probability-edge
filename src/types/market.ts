/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type Instrument = 'NIFTY' | 'BANKNIFTY';
export type Timeframe = '1m' | '5m' | '15m';
export type MarketDataMode = 'LIVE' | 'REPLAY';

export interface LiveMarketQuote {
  symbol: Instrument;
  ltp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  prevClose: number;
  change: number;
  changePct: number;
  volume: number;
  timestamp: number;
  istTime: string;
  isMarketOpen: boolean;
  marketStatus: 'OPEN' | 'CLOSED' | 'PRE-MARKET' | 'POST-MARKET';
  source: 'NSE_LIVE' | 'ANGEL_ONE' | 'SIMULATED';
  lastUpdated: string;
}

export interface Candle {
  timestamp: string; // ISO string or 'YYYY-MM-DD HH:mm:ss'
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type MarketRegime = 
  | 'TREND_UP' 
  | 'TREND_DOWN' 
  | 'RANGE' 
  | 'HIGH_VOLATILITY' 
  | 'TRANSITION' 
  | 'NO_TRADE';

export type StructureEventType = 
  | 'SWING_HIGH' 
  | 'SWING_LOW' 
  | 'HH' // Higher High
  | 'HL' // Higher Low
  | 'LH' // Lower High
  | 'LL' // Lower Low
  | 'BOS_BULL' // Break of Structure (Bullish)
  | 'BOS_BEAR' // Break of Structure (Bearish)
  | 'CHOCH_BULL' // Change of Character (Bullish Reversal)
  | 'CHOCH_BEAR'; // Change of Character (Bearish Reversal)

export interface StructureEvent {
  id: string;
  type: StructureEventType;
  price: number;
  detectionTime: number; // When the swing was formed
  confirmationTime: number; // When the pivot was causally confirmed (closed candles later)
  timeframe: Timeframe;
  index: number; // Candle index in series
  brokenSwingPrice?: number;
  description: string;
}

export interface SRLevel {
  id: string;
  price: number;
  type: 'SUPPORT' | 'RESISTANCE';
  strength: number; // 1 to 5 touch count
  lastTouchTime: number;
  touches: number;
}

export interface RangeBoundary {
  high: number;
  low: number;
  midpoint: number;
  detectedAt: number;
  widthPoints: number;
  isCompressed: boolean;
}

export type OptionType = 'CE' | 'PE';

export interface OptionGreeks {
  delta: number;
  gamma: number;
  theta: number; // Daily theta decay in ₹
  vega: number;  // Price change per 1% IV
  iv: number;    // Implied volatility (e.g. 14.5%)
}

export interface OptionContract {
  symbol: string;
  underlying: Instrument;
  strike: number;
  optionType: OptionType;
  expiry: string;
  lotSize: number;
  ltp: number; // Last Traded Price
  bid: number;
  ask: number;
  spread: number;
  volume: number;
  openInterest: number;
  greeks: OptionGreeks;
  moneyness: 'ITM' | 'ATM' | 'OTM';
}

export type StrategyId = 
  | 'STRATEGY_A' // 1m comparative divergence breakout
  | 'STRATEGY_B' // 1m range-bound failed-breakout reversal
  | 'STRATEGY_C' // 5m trend-pullback continuation
  | 'STRATEGY_D' // 5m trend-reversal setup
  | 'STRATEGY_E'; // BTST research module

export type SignalDirection = 'CALL_CANDIDATE' | 'PUT_CANDIDATE' | 'NO_TRADE';
export type SignalStatus = 'OBSERVATION' | 'CANDIDATE' | 'CONFIRMED' | 'RISK_REJECTED' | 'EXECUTED';

export interface TradeSignal {
  id: string;
  strategyId: StrategyId;
  strategyName: string;
  underlying: Instrument;
  direction: SignalDirection;
  status: SignalStatus;
  timeframe: Timeframe;
  candleTimestamp: string;
  candleTime: number;
  spotPrice: number;
  recommendedContract: OptionContract;
  proposedEntryPremium: number;
  proposedStopPremium: number;
  proposedTargetPremium: number;
  proposedStopSpot: number;
  proposedTargetSpot: number;
  rewardToRiskRatio: number;
  calculatedLots: number;
  calculatedQuantity: number;
  score: number; // 0 to 100 explainable composite score
  calibratedProbability?: number; // Historical frequency if calibrated
  isCalibrated: boolean;
  regime: MarketRegime;
  featureScores: Record<string, number>;
  reasons: string[];
  rejectionReason?: string;
  auditTrail: string[];
}

export interface RiskConfig {
  accountEquity: number;
  riskPerTradePct: number; // e.g. 0.5%
  dailyLossLimitPct: number; // e.g. 2.0%
  maxTradesPerDay: number; // e.g. 3
  minRewardToRisk: number; // e.g. 1.5
  consecutiveLossCooldownTrades: number; // e.g. 2
  slippagePct: number; // e.g. 0.3%
  brokeragePerOrder: number; // ₹20 flat
  sttTurnoverPct: number; // 0.1% on sell side
  exchangeTxnChargePct: number; // 0.05%
  gstPct: number; // 18% on charges
  stampDutyPct: number; // 0.003% on buy
}

export interface AccountRiskState {
  initialEquity: number;
  currentEquity: number;
  todayRealizedPnL: number;
  todayUnrealizedPnL: number;
  tradesExecutedToday: number;
  consecutiveLosses: number;
  isDailyLossLimitBreached: boolean;
  isMaxTradesReached: boolean;
  isInCooldown: boolean;
  tradingAllowed: boolean;
  lockoutReason?: string;
}

export interface PaperOrder {
  id: string;
  signalId: string;
  symbol: string;
  underlying: Instrument;
  strike: number;
  optionType: OptionType;
  direction: 'BUY' | 'SELL';
  lots: number;
  quantity: number;
  orderType: 'MARKET' | 'LIMIT';
  requestedPrice: number;
  executedPrice?: number;
  stopLossPrice: number;
  targetPrice: number;
  status: 'PENDING' | 'FILLED' | 'REJECTED' | 'CANCELLED';
  submittedAt: number;
  executedAt?: number;
  rejectionReason?: string;
  estimatedCharges: number;
}

export interface PaperPosition {
  id: string;
  orderId: string;
  signalId: string;
  strategyId: StrategyId;
  strategyName: string;
  symbol: string;
  underlying: Instrument;
  strike: number;
  optionType: OptionType;
  lots: number;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLossPrice: number;
  targetPrice: number;
  initialRisk: number;
  unrealizedPnL: number;
  unrealizedPnLPct: number;
  entryTime: number;
  status: 'OPEN' | 'CLOSED';
}

export interface TradeRecord {
  id: string;
  positionId: string;
  strategyId: StrategyId;
  strategyName: string;
  symbol: string;
  underlying: Instrument;
  strike: number;
  optionType: OptionType;
  lots: number;
  quantity: number;
  entryPrice: number;
  exitPrice: number;
  entryTime: number;
  exitTime: number;
  exitReason: 'TARGET_HIT' | 'STOP_LOSS_HIT' | 'MANUAL_SQUARE_OFF' | 'SESSION_CLOSE' | 'TRAILING_STOP';
  grossPnL: number;
  brokerageAndTaxes: number;
  netPnL: number;
  roiPct: number;
  holdingTimeMinutes: number;
  regime: MarketRegime;
  rationale: string;
  userNotes?: string;
}

export interface BacktestConfig {
  underlying: Instrument;
  startDate: string;
  endDate: string;
  enabledStrategies: StrategyId[];
  riskPerTradePct: number;
  slippagePct: number;
  includeCharges: boolean;
  initialCapital: number;
}

export interface BacktestMetrics {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  grossPnL: number;
  totalCharges: number;
  netPnL: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgTradePnL: number;
  expectancy: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  sharpeRatio: number;
  maxConsecutiveWins: number;
  maxConsecutiveLosses: number;
  equityCurve: { time: number; equity: number }[];
  drawdownCurve: { time: number; drawdownPct: number }[];
  strategyBreakdown: Record<StrategyId, { trades: number; netPnL: number; winRate: number }>;
  regimeBreakdown: Record<MarketRegime, { trades: number; netPnL: number; winRate: number }>;
}
