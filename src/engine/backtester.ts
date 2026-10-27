/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BacktestConfig, BacktestMetrics, Candle, Instrument, MarketRegime, StrategyId } from '../types/market.ts';
import { detectSwings, detectBOSandCHoCH, computeSupportResistanceLevels, detectRangeBoundaries } from './marketStructure.ts';
import { classifyMarketRegime } from './regime.ts';
import { generateOptionChain } from './optionsGreeks.ts';
import { evaluateAllStrategies } from './strategies.ts';
import { estimateTransactionCharges } from './riskManager.ts';

export function runBacktest(
  candles1m: Candle[],
  candles5m: Candle[],
  candles15m: Candle[],
  config: BacktestConfig
): BacktestMetrics {
  const lotSize = config.underlying === 'NIFTY' ? 25 : 15;
  let currentEquity = config.initialCapital;
  let peakEquity = currentEquity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;

  const trades: {
    strategyId: StrategyId;
    regime: MarketRegime;
    entryTime: number;
    exitTime: number;
    grossPnL: number;
    charges: number;
    netPnL: number;
    isWin: boolean;
  }[] = [];

  const equityCurve: { time: number; equity: number }[] = [
    { time: candles1m[0]?.time ?? 0, equity: currentEquity },
  ];
  const drawdownCurve: { time: number; drawdownPct: number }[] = [
    { time: candles1m[0]?.time ?? 0, drawdownPct: 0 },
  ];

  const strategyBreakdown: Record<StrategyId, { trades: number; netPnL: number; winRate: number; wins: number }> = {
    STRATEGY_A: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    STRATEGY_B: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    STRATEGY_C: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    STRATEGY_D: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    STRATEGY_E: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
  };

  const regimeBreakdown: Record<MarketRegime, { trades: number; netPnL: number; winRate: number; wins: number }> = {
    TREND_UP: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    TREND_DOWN: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    RANGE: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    HIGH_VOLATILITY: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    TRANSITION: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
    NO_TRADE: { trades: 0, netPnL: 0, winRate: 0, wins: 0 },
  };

  // Step through 1m candles sequentially (starting after warm-up 60 candles)
  const minWarmup = 60;
  let activeTrade: {
    signalId: string;
    strategyId: StrategyId;
    regime: MarketRegime;
    entryIndex: number;
    entryTime: number;
    entryPremium: number;
    stopPremium: number;
    targetPremium: number;
    stopSpot: number;
    targetSpot: number;
    direction: 'CALL' | 'PUT';
    lots: number;
    quantity: number;
  } | null = null;

  for (let i = minWarmup; i < candles1m.length; i++) {
    const historical1m = candles1m.slice(0, i + 1);
    const currentCandle = candles1m[i];
    const spot = currentCandle.close;

    // Synchronize 5m and 15m without future-leaking candles
    const historical5m = candles5m.filter(c => c.time <= currentCandle.time);
    const historical15m = candles15m.filter(c => c.time <= currentCandle.time);

    // 1. If in an active trade, check stop or target on current candle
    if (activeTrade) {
      const isCall = activeTrade.direction === 'CALL';
      let exited = false;
      let exitPremium = 0;
      let isWin = false;

      // Conservative assumption: if both stop and target levels are crossed, STOP loss executes first
      const stopHit = isCall ? currentCandle.low <= activeTrade.stopSpot : currentCandle.high >= activeTrade.stopSpot;
      const targetHit = isCall ? currentCandle.high >= activeTrade.targetSpot : currentCandle.low <= activeTrade.targetSpot;

      if (stopHit) {
        exitPremium = activeTrade.stopPremium * (1 - config.slippagePct / 100);
        exited = true;
        isWin = false;
      } else if (targetHit) {
        exitPremium = activeTrade.targetPremium * (1 - config.slippagePct / 100);
        exited = true;
        isWin = true;
      } else if (i - activeTrade.entryIndex >= 30) {
        // Max holding period timeout (30 bars)
        const delta = isCall ? 0.5 : -0.5;
        const spotChange = spot - (isCall ? activeTrade.stopSpot : activeTrade.targetSpot);
        exitPremium = Math.max(1, activeTrade.entryPremium + spotChange * delta * 0.15);
        exited = true;
        isWin = exitPremium > activeTrade.entryPremium;
      }

      if (exited) {
        const grossPnL = (exitPremium - activeTrade.entryPremium) * activeTrade.quantity;
        const entryCharges = config.includeCharges ? estimateTransactionCharges(activeTrade.entryPremium, activeTrade.quantity) : 0;
        const exitCharges = config.includeCharges ? estimateTransactionCharges(exitPremium, activeTrade.quantity) : 0;
        const totalCharges = entryCharges + exitCharges;
        const netPnL = grossPnL - totalCharges;

        currentEquity += netPnL;
        if (currentEquity > peakEquity) peakEquity = currentEquity;
        const dd = peakEquity - currentEquity;
        const ddPct = (dd / peakEquity) * 100;
        if (dd > maxDrawdown) maxDrawdown = dd;
        if (ddPct > maxDrawdownPct) maxDrawdownPct = ddPct;

        trades.push({
          strategyId: activeTrade.strategyId,
          regime: activeTrade.regime,
          entryTime: activeTrade.entryTime,
          exitTime: currentCandle.time,
          grossPnL,
          charges: totalCharges,
          netPnL,
          isWin,
        });

        // Update breakdown
        const strat = strategyBreakdown[activeTrade.strategyId];
        strat.trades += 1;
        strat.netPnL += netPnL;
        if (isWin) strat.wins += 1;
        strat.winRate = Math.round((strat.wins / strat.trades) * 100);

        const reg = regimeBreakdown[activeTrade.regime];
        reg.trades += 1;
        reg.netPnL += netPnL;
        if (isWin) reg.wins += 1;
        reg.winRate = Math.round((reg.wins / reg.trades) * 100);

        equityCurve.push({ time: currentCandle.time, equity: Math.round(currentEquity) });
        drawdownCurve.push({ time: currentCandle.time, drawdownPct: Math.round(ddPct * 10) / 10 });

        activeTrade = null;
      }
      continue;
    }

    // 2. Scan for candidate signals on completed candles
    const { swings: swings1m, events: events1m } = detectSwings(historical1m, '1m', 3, 3);
    const { swings: swings5m } = detectSwings(historical5m, '5m', 2, 2);
    const bosEvents = detectBOSandCHoCH(historical1m, swings1m, '1m');
    const srLevels = computeSupportResistanceLevels(swings1m);
    const rangeBoundaries = detectRangeBoundaries(historical1m, 30);
    const { regime } = classifyMarketRegime(historical1m, [...events1m, ...bosEvents]);

    const optionChain = generateOptionChain(config.underlying, spot);

    const signals = evaluateAllStrategies({
      underlying: config.underlying,
      candles1m: historical1m,
      candles5m: historical5m,
      candles15m: historical15m,
      swings1m,
      swings5m,
      structureEvents: [...events1m, ...bosEvents],
      srLevels,
      rangeBoundaries,
      regime,
      optionChain,
    });

    // Check if any confirmed signal belongs to enabled strategies
    const eligibleSignal = signals.find(s => s.status === 'CONFIRMED' && config.enabledStrategies.includes(s.strategyId));

    if (eligibleSignal) {
      // Calculate position size based on risk
      const permittedRisk = currentEquity * (config.riskPerTradePct / 100);
      const riskPerLot = Math.max(1, (eligibleSignal.proposedEntryPremium - eligibleSignal.proposedStopPremium) * lotSize);
      const lots = Math.max(1, Math.floor(permittedRisk / riskPerLot));
      const quantity = lots * lotSize;

      // Enter next candle open (simulated with slippage)
      const entryPremium = eligibleSignal.proposedEntryPremium * (1 + config.slippagePct / 100);

      activeTrade = {
        signalId: eligibleSignal.id,
        strategyId: eligibleSignal.strategyId,
        regime,
        entryIndex: i,
        entryTime: currentCandle.time,
        entryPremium,
        stopPremium: eligibleSignal.proposedStopPremium,
        targetPremium: eligibleSignal.proposedTargetPremium,
        stopSpot: eligibleSignal.proposedStopSpot,
        targetSpot: eligibleSignal.proposedTargetSpot,
        direction: eligibleSignal.direction === 'CALL_CANDIDATE' ? 'CALL' : 'PUT',
        lots,
        quantity,
      };
    }
  }

  // Calculate summary metrics
  const totalTrades = trades.length;
  const winningTrades = trades.filter(t => t.isWin).length;
  const losingTrades = totalTrades - winningTrades;
  const winRate = totalTrades > 0 ? Math.round((winningTrades / totalTrades) * 100) : 0;

  const grossPnL = Math.round(trades.reduce((acc, t) => acc + t.grossPnL, 0));
  const totalCharges = Math.round(trades.reduce((acc, t) => acc + t.charges, 0));
  const netPnL = Math.round(trades.reduce((acc, t) => acc + t.netPnL, 0));

  const winSum = trades.filter(t => t.isWin).reduce((acc, t) => acc + t.netPnL, 0);
  const lossSum = Math.abs(trades.filter(t => !t.isWin).reduce((acc, t) => acc + t.netPnL, 0));
  const profitFactor = lossSum > 0 ? Math.round((winSum / lossSum) * 100) / 100 : winSum > 0 ? 99 : 0;

  const avgWin = winningTrades > 0 ? Math.round(winSum / winningTrades) : 0;
  const avgLoss = losingTrades > 0 ? Math.round(lossSum / losingTrades) : 0;
  const avgTradePnL = totalTrades > 0 ? Math.round(netPnL / totalTrades) : 0;

  // Expectancy = (Win% * AvgWin) - (Loss% * AvgLoss)
  const expectancy = totalTrades > 0 
    ? Math.round(((winRate / 100) * avgWin - ((100 - winRate) / 100) * avgLoss) * 10) / 10 
    : 0;

  // Streak calculations
  let maxConsecutiveWins = 0;
  let maxConsecutiveLosses = 0;
  let curWins = 0;
  let curLosses = 0;

  for (const t of trades) {
    if (t.isWin) {
      curWins++;
      curLosses = 0;
      if (curWins > maxConsecutiveWins) maxConsecutiveWins = curWins;
    } else {
      curLosses++;
      curWins = 0;
      if (curLosses > maxConsecutiveLosses) maxConsecutiveLosses = curLosses;
    }
  }

  // Simplified Annualized Sharpe Ratio approximation
  const returns = trades.map(t => t.netPnL / config.initialCapital);
  const avgReturn = returns.length > 0 ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const stdDev = returns.length > 1 
    ? Math.sqrt(returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / (returns.length - 1)) 
    : 0.01;
  const sharpeRatio = stdDev > 0 ? Math.round((avgReturn / stdDev) * Math.sqrt(252) * 100) / 100 : 0;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    grossPnL,
    totalCharges,
    netPnL,
    profitFactor,
    avgWin,
    avgLoss,
    avgTradePnL,
    expectancy,
    maxDrawdown: Math.round(maxDrawdown),
    maxDrawdownPct: Math.round(maxDrawdownPct * 10) / 10,
    sharpeRatio,
    maxConsecutiveWins,
    maxConsecutiveLosses,
    equityCurve,
    drawdownCurve,
    strategyBreakdown,
    regimeBreakdown,
  };
}
