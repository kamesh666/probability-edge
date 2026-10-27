/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AccountRiskState, TradeSignal } from '../../types/market.ts';
import { calculatePositionSizing, DEFAULT_RISK_CONFIG } from '../../engine/riskManager.ts';
import { ShieldCheck, ArrowRight, CheckCircle2, AlertCircle, X } from 'lucide-react';

interface SignalScannerViewProps {
  signals: TradeSignal[];
  account: AccountRiskState;
  onExecuteTrade: (signal: TradeSignal) => void;
}

export const SignalScannerView: React.FC<SignalScannerViewProps> = ({
  signals,
  account,
  onExecuteTrade,
}) => {
  const [filterDirection, setFilterDirection] = useState<'ALL' | 'CALL' | 'PUT'>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'CONFIRMED' | 'CANDIDATE'>('ALL');
  const [selectedSignal, setSelectedSignal] = useState<TradeSignal | null>(null);

  const filteredSignals = signals.filter(s => {
    if (filterDirection === 'CALL' && s.direction !== 'CALL_CANDIDATE') return false;
    if (filterDirection === 'PUT' && s.direction !== 'PUT_CANDIDATE') return false;
    if (filterStatus === 'CONFIRMED' && s.status !== 'CONFIRMED') return false;
    if (filterStatus === 'CANDIDATE' && s.status !== 'CANDIDATE') return false;
    return true;
  });

  const handleOpenModal = (sig: TradeSignal) => {
    setSelectedSignal(sig);
  };

  const handleConfirmOrder = () => {
    if (selectedSignal) {
      onExecuteTrade(selectedSignal);
      setSelectedSignal(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filter Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-[#111827] border border-slate-800 rounded-lg">
        <div>
          <h2 className="text-sm font-semibold text-white">Quantitative Signal Scanner</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time evaluation across Strategies A, B, C, D, and E on completed candles.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Direction Filter */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-xs">
            {(['ALL', 'CALL', 'PUT'] as const).map(dir => (
              <button
                key={dir}
                onClick={() => setFilterDirection(dir)}
                className={`px-3 py-1 font-medium rounded transition-colors ${
                  filterDirection === dir ? 'bg-slate-800 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {dir}
              </button>
            ))}
          </div>

          {/* Status Filter */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5 text-xs">
            {(['ALL', 'CONFIRMED', 'CANDIDATE'] as const).map(st => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 font-medium rounded transition-colors ${
                  filterStatus === st ? 'bg-indigo-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Signal Cards Grid */}
      {filteredSignals.length === 0 ? (
        <div className="p-12 text-center bg-[#111827] border border-slate-800 rounded-lg">
          <AlertCircle className="w-8 h-8 text-slate-500 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-300">No signals match current filter criteria</h3>
          <p className="text-xs text-slate-500 mt-1">
            As new candles close, strategy triggers will populate here automatically.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredSignals.map(sig => {
            const isCall = sig.direction === 'CALL_CANDIDATE';
            const sizing = calculatePositionSizing(sig, account, DEFAULT_RISK_CONFIG);

            return (
              <div
                key={sig.id}
                className="bg-[#111827] border border-slate-800 rounded-lg p-5 flex flex-col justify-between gap-4"
              >
                <div>
                  {/* Top Bar: Strategy & Direction */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">{sig.strategyName}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          sig.status === 'CONFIRMED' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {sig.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 font-mono mt-0.5">
                        {sig.underlying} · {sig.timeframe} · {sig.candleTimestamp}
                      </div>
                    </div>

                    <div className="text-right">
                      <span className={`text-xs font-mono font-bold px-2.5 py-1 rounded ${
                        isCall ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800' : 'bg-rose-950/80 text-rose-300 border border-rose-800'
                      }`}>
                        {isCall ? 'LONG CALL (CE)' : 'LONG PUT (PE)'}
                      </span>
                    </div>
                  </div>

                  {/* Pricing Matrix */}
                  <div className="grid grid-cols-4 gap-2 my-4 p-3 bg-[#0B0F17] border border-slate-800 rounded text-center">
                    <div>
                      <div className="text-[10px] text-slate-500 font-mono">ENTRY LTP</div>
                      <div className="text-sm font-bold font-mono text-white mt-0.5">₹{sig.proposedEntryPremium}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-mono">STOP LOSS</div>
                      <div className="text-sm font-bold font-mono text-rose-400 mt-0.5">₹{sig.proposedStopPremium}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-mono">TARGET</div>
                      <div className="text-sm font-bold font-mono text-emerald-400 mt-0.5">₹{sig.proposedTargetPremium}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 font-mono">R : R RATIO</div>
                      <div className="text-sm font-bold font-mono text-indigo-400 mt-0.5">1 : {sig.rewardToRiskRatio}</div>
                    </div>
                  </div>

                  {/* Contract & Greeks */}
                  <div className="text-xs font-mono flex items-center justify-between text-slate-400 mb-3">
                    <span>Contract: <strong className="text-white">{sig.recommendedContract.symbol}</strong></span>
                    <span>Delta: {sig.recommendedContract.greeks.delta} · IV: {sig.recommendedContract.greeks.iv}%</span>
                  </div>

                  {/* Feature Breakdown Score */}
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Rule-Based Score</span>
                      <span className="font-mono font-bold text-indigo-300">{sig.score} / 100</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded overflow-hidden">
                      <div
                        className="bg-indigo-500 h-full rounded"
                        style={{ width: `${sig.score}%` }}
                      />
                    </div>
                  </div>

                  {/* Reasons & Audit */}
                  <div className="space-y-1">
                    {sig.reasons.map((r, i) => (
                      <div key={i} className="text-xs text-slate-400 flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                        <span>{r}</span>
                      </div>
                    ))}
                    {sig.rejectionReason && (
                      <div className="text-xs text-amber-400 flex items-start gap-1.5 mt-1 font-mono">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span>Rejected: {sig.rejectionReason}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Sizing & Action Button */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
                  <div className="text-xs font-mono text-slate-400">
                    Sized: <span className="text-white font-bold">{sizing.quantity} qty</span> ({sizing.lots} lots)
                  </div>

                  <button
                    onClick={() => handleOpenModal(sig)}
                    disabled={!account.tradingAllowed}
                    className="px-4 py-2 text-xs font-semibold rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white transition-colors flex items-center gap-1.5 shrink-0"
                  >
                    <span>Review & Paper Trade</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 1-Click Order Confirmation Modal */}
      {selectedSignal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#111827] border border-slate-800 rounded-lg max-w-lg w-full p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-indigo-400" />
                Paper Order Risk Review
              </h3>
              <button
                onClick={() => setSelectedSignal(null)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Contract & Sizing Breakdown */}
            {(() => {
              const sizing = calculatePositionSizing(selectedSignal, account, DEFAULT_RISK_CONFIG);
              return (
                <div className="space-y-4">
                  <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded font-mono text-xs space-y-2">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Instrument & Contract:</span>
                      <span className="text-white font-bold">{selectedSignal.recommendedContract.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Order Action:</span>
                      <span className="text-emerald-400 font-bold">BUY (LONG)</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Execution Limit / LTP:</span>
                      <span className="text-white font-bold">₹{selectedSignal.proposedEntryPremium}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Stop Loss:</span>
                      <span className="text-rose-400 font-bold">₹{selectedSignal.proposedStopPremium}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Target Premium:</span>
                      <span className="text-emerald-400 font-bold">₹{selectedSignal.proposedTargetPremium}</span>
                    </div>
                  </div>

                  {/* Risk Math Calculation */}
                  <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded font-mono text-xs space-y-2">
                    <div className="flex justify-between text-slate-400">
                      <span>Account Capital:</span>
                      <span>₹{account.currentEquity.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Permitted Trade Risk (0.5%):</span>
                      <span className="text-indigo-300 font-bold">₹{sizing.permittedTradeRisk.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Risk Per Lot:</span>
                      <span>₹{(sizing.riskPerUnit * sizing.lotSize).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-slate-800 pt-2 text-white">
                      <span>Approved Order Lots:</span>
                      <span className="font-bold">{sizing.lots} lots ({sizing.quantity} units)</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Estimated Brokerage & Taxes:</span>
                      <span>₹{sizing.estimatedCharges}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>Required Capital:</span>
                      <span>₹{sizing.totalCapitalRequired.toFixed(2)}</span>
                    </div>
                  </div>

                  {/* Invariant Warnings */}
                  {sizing.rejectionReasons.length > 0 && (
                    <div className="p-3 bg-rose-950/40 border border-rose-900 rounded text-xs text-rose-300 font-mono space-y-1">
                      {sizing.rejectionReasons.map((r, i) => (
                        <div key={i}>• {r}</div>
                      ))}
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={() => setSelectedSignal(null)}
                      className="w-1/2 py-2 text-xs font-semibold rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmOrder}
                      disabled={!sizing.isApproved || !account.tradingAllowed}
                      className="w-1/2 py-2 text-xs font-semibold rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white transition-colors"
                    >
                      Confirm Paper Order
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};
