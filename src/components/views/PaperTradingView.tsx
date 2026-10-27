/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AccountRiskState, PaperOrder, PaperPosition } from '../../types/market.ts';
import { AlertTriangle, RotateCcw, ShieldCheck, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';

interface PaperTradingViewProps {
  account: AccountRiskState;
  positions: PaperPosition[];
  orders: PaperOrder[];
  onSquareOffPosition: (positionId: string) => void;
  onEmergencySquareOffAll: () => void;
  onUpdateStopLoss: (positionId: string, newStop: number) => void;
  onResetAccount: () => void;
}

export const PaperTradingView: React.FC<PaperTradingViewProps> = ({
  account,
  positions,
  orders,
  onSquareOffPosition,
  onEmergencySquareOffAll,
  onUpdateStopLoss,
  onResetAccount,
}) => {
  const [editingStopId, setEditingStopId] = useState<string | null>(null);
  const [newStopValue, setNewStopValue] = useState<string>('');

  const totalPnL = account.todayRealizedPnL + account.todayUnrealizedPnL;
  const isProfit = totalPnL >= 0;

  const handleStartEditStop = (pos: PaperPosition) => {
    setEditingStopId(pos.id);
    setNewStopValue(pos.stopLossPrice.toString());
  };

  const handleSaveStop = (positionId: string) => {
    const val = parseFloat(newStopValue);
    if (!isNaN(val) && val > 0) {
      onUpdateStopLoss(positionId, val);
    }
    setEditingStopId(null);
  };

  const maxDailyLoss = account.initialEquity * 0.02; // 2%
  const dailyLossUsedPct = Math.min(100, Math.max(0, (Math.abs(Math.min(0, account.todayRealizedPnL)) / maxDailyLoss) * 100));

  return (
    <div className="space-y-6">
      {/* Risk & Equity Cockpit */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
          <div className="text-xs text-slate-400 font-mono">ACCOUNT EQUITY</div>
          <div className="text-xl font-bold font-mono text-white mt-1">
            ₹{account.currentEquity.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">Starting: ₹{account.initialEquity.toLocaleString()}</div>
        </div>

        <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
          <div className="text-xs text-slate-400 font-mono">TODAY UNREALIZED P&L</div>
          <div className={`text-xl font-bold font-mono mt-1 ${account.todayUnrealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {account.todayUnrealizedPnL >= 0 ? '+' : ''}₹{account.todayUnrealizedPnL.toFixed(1)}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">Mark-to-market open risk</div>
        </div>

        <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
          <div className="text-xs text-slate-400 font-mono">TODAY REALIZED P&L</div>
          <div className={`text-xl font-bold font-mono mt-1 ${account.todayRealizedPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
            {account.todayRealizedPnL >= 0 ? '+' : ''}₹{account.todayRealizedPnL.toFixed(1)}
          </div>
          <div className="text-xs text-slate-500 font-mono mt-1">Net after brokerage & STT</div>
        </div>

        <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
              <span>DAILY LOSS BREAKER</span>
              <span>{dailyLossUsedPct.toFixed(0)}% Used</span>
            </div>
            <div className="w-full bg-slate-800 h-2 rounded mt-2 overflow-hidden">
              <div
                className={`h-full rounded ${dailyLossUsedPct > 75 ? 'bg-rose-500' : 'bg-amber-500'}`}
                style={{ width: `${dailyLossUsedPct}%` }}
              />
            </div>
          </div>
          <div className="text-[11px] text-slate-500 font-mono mt-2">
            Max limit: -₹{maxDailyLoss.toLocaleString()} (2%)
          </div>
        </div>
      </div>

      {/* Action Strip: Emergency Square Off + Reset Balance */}
      <div className="flex items-center justify-between p-4 bg-[#111827] border border-slate-800 rounded-lg">
        <div className="flex items-center gap-2 text-xs font-mono">
          <ShieldCheck className="w-4 h-4 text-indigo-400" />
          <span className="text-white font-bold">Paper Execution Status:</span>
          <span className={account.tradingAllowed ? 'text-emerald-400' : 'text-rose-400 font-bold'}>
            {account.tradingAllowed ? 'TRADING PERMITTED' : `LOCKED (${account.lockoutReason})`}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {positions.length > 0 && (
            <button
              onClick={onEmergencySquareOffAll}
              className="px-3 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/70 hover:bg-rose-900 border border-rose-800 rounded transition-colors flex items-center gap-1.5"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Square Off All Positions</span>
            </button>
          )}

          <button
            onClick={onResetAccount}
            className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Paper Account</span>
          </button>
        </div>
      </div>

      {/* Open Positions Table */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Active Paper Positions ({positions.length})</h3>
          <span className="text-xs text-slate-400 font-mono">Strict Stop/Target Monitoring Active</span>
        </div>

        {positions.length === 0 ? (
          <div className="text-center py-10 text-xs text-slate-500">
            No active positions open. Use the Signal Scanner to execute a paper trade.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left whitespace-nowrap">
              <thead className="bg-[#0B0F17] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Contract</th>
                  <th className="py-2.5 px-3">Strategy</th>
                  <th className="py-2.5 px-3">Qty (Lots)</th>
                  <th className="py-2.5 px-3">Avg Price</th>
                  <th className="py-2.5 px-3">LTP</th>
                  <th className="py-2.5 px-3">Stop Loss</th>
                  <th className="py-2.5 px-3">Target</th>
                  <th className="py-2.5 px-3">Unrealized P&L</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {positions.map(pos => {
                  const isPosProfit = pos.unrealizedPnL >= 0;
                  const isEditingStop = editingStopId === pos.id;

                  return (
                    <tr key={pos.id} className="hover:bg-slate-800/30">
                      <td className="py-2.5 px-3 font-bold text-white">{pos.symbol}</td>
                      <td className="py-2.5 px-3 text-slate-400">{pos.strategyName}</td>
                      <td className="py-2.5 px-3 text-slate-300">{pos.quantity} ({pos.lots}L)</td>
                      <td className="py-2.5 px-3 text-slate-300">₹{pos.entryPrice}</td>
                      <td className="py-2.5 px-3 font-bold text-white">₹{pos.currentPrice}</td>
                      
                      {/* Stop Loss with trailing editor */}
                      <td className="py-2.5 px-3">
                        {isEditingStop ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              step="0.5"
                              value={newStopValue}
                              onChange={e => setNewStopValue(e.target.value)}
                              className="w-16 bg-[#0B0F17] border border-slate-700 px-1 py-0.5 rounded text-white text-xs"
                            />
                            <button
                              onClick={() => handleSaveStop(pos.id)}
                              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-bold"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => handleStartEditStop(pos)}
                            className="text-rose-400 hover:underline"
                            title="Click to modify trailing stop"
                          >
                            ₹{pos.stopLossPrice} (Edit)
                          </button>
                        )}
                      </td>

                      <td className="py-2.5 px-3 text-emerald-400">₹{pos.targetPrice}</td>
                      <td className={`py-2.5 px-3 font-bold ${isPosProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {isPosProfit ? '+' : ''}₹{pos.unrealizedPnL.toFixed(1)} ({isPosProfit ? '+' : ''}{pos.unrealizedPnLPct.toFixed(1)}%)
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <button
                          onClick={() => onSquareOffPosition(pos.id)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-rose-300 bg-rose-950/50 hover:bg-rose-900 border border-rose-800 rounded transition-colors"
                        >
                          Square Off
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Orders Book */}
      <div className="bg-[#111827] border border-slate-800 rounded-lg p-5 space-y-4">
        <h3 className="text-sm font-bold text-white">Paper Order Book ({orders.length})</h3>

        {orders.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            No orders submitted yet today.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono text-left whitespace-nowrap">
              <thead className="bg-[#0B0F17] text-slate-400 border-b border-slate-800">
                <tr>
                  <th className="py-2.5 px-3">Order ID</th>
                  <th className="py-2.5 px-3">Time</th>
                  <th className="py-2.5 px-3">Contract</th>
                  <th className="py-2.5 px-3">Action</th>
                  <th className="py-2.5 px-3">Quantity</th>
                  <th className="py-2.5 px-3">Exec Price</th>
                  <th className="py-2.5 px-3">Brokerage & Fees</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {orders.map(ord => (
                  <tr key={ord.id} className="hover:bg-slate-800/30">
                    <td className="py-2 px-3 text-slate-500">{ord.id}</td>
                    <td className="py-2 px-3 text-slate-400">
                      {new Date(ord.submittedAt * 1000).toLocaleTimeString()}
                    </td>
                    <td className="py-2 px-3 font-semibold text-white">{ord.symbol}</td>
                    <td className="py-2 px-3 text-emerald-400 font-bold">{ord.direction}</td>
                    <td className="py-2 px-3 text-slate-300">{ord.quantity} ({ord.lots}L)</td>
                    <td className="py-2 px-3 text-white">₹{ord.executedPrice}</td>
                    <td className="py-2 px-3 text-slate-400">₹{ord.estimatedCharges}</td>
                    <td className="py-2 px-3">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold">
                        {ord.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
