/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AccountRiskState, Candle, Instrument, MarketRegime, PaperPosition, SRLevel, StructureEvent, Timeframe, TradeSignal } from '../../types/market.ts';
import { CandlestickChart } from '../CandlestickChart.tsx';
import { ShieldCheck, TrendingUp, TrendingDown, Activity, AlertCircle, ArrowUpRight, ArrowDownRight, CheckCircle2 } from 'lucide-react';

interface OverviewViewProps {
  candles: Candle[];
  timeframe: Timeframe;
  onTimeframeChange: (tf: Timeframe) => void;
  structureEvents: StructureEvent[];
  srLevels: SRLevel[];
  regime: MarketRegime;
  instrument: Instrument;
  account: AccountRiskState;
  positions: PaperPosition[];
  signals: TradeSignal[];
  onApproveSignal: (sig: TradeSignal) => void;
  onSquareOff: (posId: string) => void;
  onNavigateToTab: (tab: any) => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  candles,
  timeframe,
  onTimeframeChange,
  structureEvents,
  srLevels,
  regime,
  instrument,
  account,
  positions,
  signals,
  onApproveSignal,
  onSquareOff,
  onNavigateToTab,
}) => {
  const currentSpot = candles.length > 0 ? candles[candles.length - 1].close : 0;
  const prevSpot = candles.length > 1 ? candles[candles.length - 2].close : currentSpot;
  const spotChange = currentSpot - prevSpot;
  const spotChangePct = prevSpot > 0 ? (spotChange / prevSpot) * 100 : 0;
  const isSpotUp = spotChange >= 0;

  const totalPnL = account.todayRealizedPnL + account.todayUnrealizedPnL;
  const isProfit = totalPnL >= 0;

  const confirmedSignals = signals.filter(s => s.status === 'CONFIRMED');

  return (
    <div className="space-y-6">
      {/* 4 Top KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Account Equity & Day PnL */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Paper Capital & Day P&L</span>
            <ShieldCheck className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="text-xl font-bold font-mono text-white">
            ₹{account.currentEquity.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-mono tabular-nums">
            <span className={isProfit ? 'text-emerald-400 font-semibold' : 'text-rose-400 font-semibold'}>
              {isProfit ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
            </span>
            <span className="text-slate-500">
              ({account.initialEquity > 0 ? ((totalPnL / account.initialEquity) * 100).toFixed(2) : 0}%)
            </span>
          </div>
        </div>

        {/* Card 2: Underlying Spot */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>{instrument} Spot Index</span>
            {isSpotUp ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-rose-400" />}
          </div>
          <div className="text-xl font-bold font-mono text-white">
            {currentSpot.toFixed(2)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-xs font-mono tabular-nums">
            <span className={isSpotUp ? 'text-emerald-400' : 'text-rose-400'}>
              {isSpotUp ? '+' : ''}{spotChange.toFixed(2)} ({isSpotUp ? '+' : ''}{spotChangePct.toFixed(2)}%)
            </span>
          </div>
        </div>

        {/* Card 3: Market Regime */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Market Regime</span>
            <Activity className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-lg font-bold font-mono text-white">
            {regime}
          </div>
          <div className="text-xs text-slate-500 mt-2">
            Multi-timeframe structure alignment active
          </div>
        </div>

        {/* Card 4: Daily Risk Budget */}
        <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span>Risk Budget Radar</span>
            <AlertCircle className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-lg font-bold font-mono text-white">
            {account.tradesExecutedToday} / 3 Trades
          </div>
          <div className="flex items-center gap-2 mt-2 text-xs font-mono">
            <span className={account.tradingAllowed ? 'text-emerald-400' : 'text-rose-400'}>
              {account.tradingAllowed ? 'Active' : 'Locked'}
            </span>
            <span className="text-slate-500">· Max Loss: 2%</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Chart + Signals & Positions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Candlestick Chart */}
        <div className="lg:col-span-2 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">
              {instrument} Intraday Price & Market Structure
            </h2>
            <button
              onClick={() => onNavigateToTab('monitor')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              Expand Full Monitor &rarr;
            </button>
          </div>
          <CandlestickChart
            candles={candles}
            timeframe={timeframe}
            onTimeframeChange={onTimeframeChange}
            structureEvents={structureEvents}
            srLevels={srLevels}
            height={460}
          />
        </div>

        {/* Right Col: Live Scanner Signals & Active Positions */}
        <div className="space-y-6">
          {/* Confirmed Signals Widget */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-300">
                Confirmed Strategy Signals ({confirmedSignals.length})
              </h3>
              <button
                onClick={() => onNavigateToTab('scanner')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
              >
                View Scanner
              </button>
            </div>

            {confirmedSignals.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                No active confirmed signals on current candle. Scanning 5 strategies...
              </div>
            ) : (
              <div className="space-y-3">
                {confirmedSignals.slice(0, 3).map(sig => {
                  const isCall = sig.direction === 'CALL_CANDIDATE';
                  return (
                    <div
                      key={sig.id}
                      className="p-3 bg-[#0B0F17] border border-slate-800 rounded flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">
                          {sig.strategyName}
                        </span>
                        <span className={`text-[11px] font-mono font-bold ${isCall ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isCall ? 'CALL BUY' : 'PUT BUY'}
                        </span>
                      </div>

                      <div className="text-xs font-mono text-slate-400 flex items-center justify-between">
                        <span>{sig.recommendedContract.symbol}</span>
                        <span className="text-white">LTP: ₹{sig.proposedEntryPremium}</span>
                      </div>

                      <div className="flex items-center justify-between text-[11px] font-mono text-slate-500">
                        <span>SL: ₹{sig.proposedStopPremium} · TGT: ₹{sig.proposedTargetPremium}</span>
                        <span className="text-indigo-400 font-semibold">R:R {sig.rewardToRiskRatio}</span>
                      </div>

                      <button
                        onClick={() => onApproveSignal(sig)}
                        disabled={!account.tradingAllowed}
                        className="w-full mt-1 py-1 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors"
                      >
                        1-Click Approve Paper Order
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Active Positions Widget */}
          <div className="bg-[#111827] border border-slate-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-slate-300">
                Active Paper Positions ({positions.length})
              </h3>
              <button
                onClick={() => onNavigateToTab('paper')}
                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium"
              >
                Trading Desk
              </button>
            </div>

            {positions.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                No open positions. Use the Scanner to approve a paper trade.
              </div>
            ) : (
              <div className="space-y-3">
                {positions.map(pos => {
                  const isPosProfit = pos.unrealizedPnL >= 0;
                  return (
                    <div
                      key={pos.id}
                      className="p-3 bg-[#0B0F17] border border-slate-800 rounded flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white">{pos.symbol}</span>
                        <span className={`text-xs font-mono font-bold ${isPosProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {isPosProfit ? '+' : ''}₹{pos.unrealizedPnL.toFixed(1)} ({isPosProfit ? '+' : ''}{pos.unrealizedPnLPct.toFixed(1)}%)
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs font-mono text-slate-400">
                        <span>Qty: {pos.quantity} ({pos.lots} lots)</span>
                        <span>Avg: ₹{pos.entryPrice} · LTP: ₹{pos.currentPrice}</span>
                      </div>

                      <button
                        onClick={() => onSquareOff(pos.id)}
                        className="w-full py-1 text-xs font-semibold text-rose-400 bg-rose-950/50 hover:bg-rose-900 border border-rose-800 rounded transition-colors"
                      >
                        Square Off Position
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
