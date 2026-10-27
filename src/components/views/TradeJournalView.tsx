/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { TradeRecord } from '../../types/market.ts';
import { formatInr } from '../EquityCurveChart.tsx';
import { BookOpen, Download, ChevronDown, ChevronRight, Save, Search } from 'lucide-react';

interface TradeJournalViewProps {
  trades: TradeRecord[];
  onUpdateTradeNotes: (tradeId: string, notes: string) => void | Promise<void>;
}

type OutcomeFilter = 'ALL' | 'WIN' | 'LOSS';

function formatTime(epochSeconds: number): string {
  if (!epochSeconds) return '–';
  return new Date(epochSeconds * 1000).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  // Quote fields with separators/quotes; prefix formula-like values so spreadsheets don't execute them.
  const safe = /^[=+\-@]/.test(s) && isNaN(Number(s)) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function exportCsv(trades: TradeRecord[]) {
  const headers = [
    'tradeId', 'symbol', 'strategy', 'regime', 'lots', 'quantity', 'entryPrice', 'exitPrice',
    'entryTimeIST', 'exitTimeIST', 'holdingMinutes', 'exitReason', 'grossPnL', 'charges', 'netPnL', 'roiPct', 'rationale', 'notes',
  ];
  const lines = trades.map(t => [
    t.id, t.symbol, t.strategyName, t.regime, t.lots, t.quantity, t.entryPrice, t.exitPrice,
    formatTime(t.entryTime), formatTime(t.exitTime), t.holdingTimeMinutes, t.exitReason,
    t.grossPnL, t.brokerageAndTaxes, t.netPnL, t.roiPct, t.rationale, t.userNotes ?? '',
  ].map(csvEscape).join(','));

  const blob = new Blob([[headers.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `probabilityedge-journal-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export const TradeJournalView: React.FC<TradeJournalViewProps> = ({ trades, onUpdateTradeNotes }) => {
  const [query, setQuery] = useState('');
  const [outcome, setOutcome] = useState<OutcomeFilter>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...trades]
      .sort((a, b) => b.exitTime - a.exitTime)
      .filter(t => (outcome === 'ALL' ? true : outcome === 'WIN' ? t.netPnL > 0 : t.netPnL <= 0))
      .filter(t =>
        !q ||
        [t.symbol, t.strategyName, t.regime, t.exitReason, t.userNotes ?? ''].some(v => v?.toLowerCase().includes(q))
      );
  }, [trades, query, outcome]);

  const handleSave = async (trade: TradeRecord) => {
    const notes = drafts[trade.id] ?? trade.userNotes ?? '';
    setSavingId(trade.id);
    try {
      await onUpdateTradeNotes(trade.id, notes);
      setDrafts(prev => {
        const next = { ...prev };
        delete next[trade.id];
        return next;
      });
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#111827] border border-slate-800 rounded-lg">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-indigo-400" />
          Trade Journal
          <span className="text-xs font-mono font-normal text-slate-400">{visible.length} of {trades.length}</span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search symbol, strategy, notes"
              className="bg-[#0B0F17] border border-slate-800 rounded pl-7 pr-2 py-1.5 text-white w-56"
            />
          </div>
          <div className="flex rounded border border-slate-800 overflow-hidden">
            {(['ALL', 'WIN', 'LOSS'] as OutcomeFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setOutcome(f)}
                className={`px-2.5 py-1.5 ${outcome === f ? 'bg-indigo-600 text-white' : 'bg-[#0B0F17] text-slate-400 hover:text-white'}`}
              >
                {f}
              </button>
            ))}
          </div>
          <button
            onClick={() => exportCsv(visible)}
            disabled={visible.length === 0}
            className="px-2.5 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[820px]">
          <thead>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className="w-6" />
              <th className="text-left px-2 py-2 font-normal">Exit (IST)</th>
              <th className="text-left px-2 py-2 font-normal">Contract</th>
              <th className="text-left px-2 py-2 font-normal">Strategy</th>
              <th className="text-right px-2 py-2 font-normal">Qty</th>
              <th className="text-right px-2 py-2 font-normal">Entry → Exit</th>
              <th className="text-left px-2 py-2 font-normal">Exit reason</th>
              <th className="text-right px-2 py-2 font-normal">Net P&L</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(t => {
              const open = expandedId === t.id;
              const draft = drafts[t.id] ?? t.userNotes ?? '';
              const dirty = draft !== (t.userNotes ?? '');
              return (
                <React.Fragment key={t.id}>
                  <tr
                    onClick={() => setExpandedId(open ? null : t.id)}
                    className="border-b border-slate-800/60 hover:bg-slate-800/30 cursor-pointer text-slate-200"
                  >
                    <td className="pl-2 text-slate-500">{open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}</td>
                    <td className="px-2 py-2 whitespace-nowrap">{formatTime(t.exitTime)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-white">{t.symbol}</td>
                    <td className="px-2 py-2 truncate max-w-[220px]" title={t.strategyName}>{t.strategyName}</td>
                    <td className="px-2 py-2 text-right">{t.quantity}</td>
                    <td className="px-2 py-2 text-right whitespace-nowrap">{t.entryPrice.toFixed(1)} → {t.exitPrice.toFixed(1)}</td>
                    <td className="px-2 py-2 whitespace-nowrap text-slate-400">{t.exitReason?.replace(/_/g, ' ')}</td>
                    <td className={`px-2 py-2 text-right font-semibold ${t.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                      {formatInr(t.netPnL, 1)}
                    </td>
                  </tr>
                  {open && (
                    <tr className="border-b border-slate-800 bg-[#0B0F17]">
                      <td />
                      <td colSpan={7} className="px-2 py-3 space-y-3">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px] text-slate-400">
                          <div>Entry: <span className="text-slate-200">{formatTime(t.entryTime)}</span></div>
                          <div>Held: <span className="text-slate-200">{t.holdingTimeMinutes} min</span></div>
                          <div>Gross: <span className="text-slate-200">{formatInr(t.grossPnL, 1)}</span> · Charges: <span className="text-slate-200">{formatInr(t.brokerageAndTaxes, 1)}</span></div>
                          <div>ROI: <span className="text-slate-200">{t.roiPct}%</span> · Regime: <span className="text-slate-200">{t.regime}</span></div>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Rationale: <span className="text-slate-300">{t.rationale}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2" onClick={e => e.stopPropagation()}>
                          <textarea
                            value={draft}
                            onChange={e => setDrafts(prev => ({ ...prev, [t.id]: e.target.value }))}
                            placeholder="What went right or wrong? What would you do differently?"
                            rows={2}
                            className="flex-1 bg-[#111827] border border-slate-800 rounded px-3 py-2 text-white font-sans text-xs"
                          />
                          <button
                            onClick={() => handleSave(t)}
                            disabled={!dirty || savingId === t.id}
                            className="self-end px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-sans text-xs flex items-center gap-1.5"
                          >
                            <Save className="w-3.5 h-3.5" />
                            {savingId === t.id ? 'Saving…' : 'Save note'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8} className="py-10 text-center text-slate-500">
                  {trades.length === 0 ? 'No closed trades yet. They appear here when paper positions close.' : 'No trades match these filters.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
