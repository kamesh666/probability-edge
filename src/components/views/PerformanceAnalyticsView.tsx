/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { TradeRecord } from '../../types/market.ts';
import { EquityCurveChart, formatInr } from '../EquityCurveChart.tsx';
import { BarChart3 } from 'lucide-react';

interface PerformanceAnalyticsViewProps {
  trades: TradeRecord[];
  initialCapital: number;
}

interface Bucket {
  label: string;
  trades: number;
  wins: number;
  netPnL: number;
}

function groupBy(trades: TradeRecord[], key: (t: TradeRecord) => string): Bucket[] {
  const map = new Map<string, Bucket>();
  for (const t of trades) {
    const label = key(t) || 'Unknown';
    const b = map.get(label) ?? { label, trades: 0, wins: 0, netPnL: 0 };
    b.trades += 1;
    b.netPnL += t.netPnL;
    if (t.netPnL > 0) b.wins += 1;
    map.set(label, b);
  }
  return [...map.values()].sort((a, b) => b.netPnL - a.netPnL);
}

export const PerformanceAnalyticsView: React.FC<PerformanceAnalyticsViewProps> = ({ trades, initialCapital }) => {
  const stats = useMemo(() => {
    // Oldest first, so the equity curve and drawdown run forward in time.
    const ordered = [...trades].sort((a, b) => a.exitTime - b.exitTime);

    let equity = initialCapital;
    let peak = equity;
    let maxDrawdown = 0;
    let maxDrawdownPct = 0;
    const curve = [{ time: ordered[0]?.entryTime ?? 0, equity }];

    for (const t of ordered) {
      equity += t.netPnL;
      peak = Math.max(peak, equity);
      const dd = peak - equity;
      maxDrawdown = Math.max(maxDrawdown, dd);
      maxDrawdownPct = Math.max(maxDrawdownPct, peak > 0 ? (dd / peak) * 100 : 0);
      curve.push({ time: t.exitTime, equity });
    }

    const wins = ordered.filter(t => t.netPnL > 0);
    const losses = ordered.filter(t => t.netPnL <= 0);
    const grossWin = wins.reduce((s, t) => s + t.netPnL, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netPnL, 0));
    const netPnL = ordered.reduce((s, t) => s + t.netPnL, 0);
    const charges = ordered.reduce((s, t) => s + t.brokerageAndTaxes, 0);
    const avgHold = ordered.length ? ordered.reduce((s, t) => s + t.holdingTimeMinutes, 0) / ordered.length : 0;

    return {
      count: ordered.length,
      netPnL,
      charges,
      winRate: ordered.length ? (wins.length / ordered.length) * 100 : 0,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
      avgWin: wins.length ? grossWin / wins.length : 0,
      avgLoss: losses.length ? grossLoss / losses.length : 0,
      expectancy: ordered.length ? netPnL / ordered.length : 0,
      maxDrawdown,
      maxDrawdownPct,
      avgHold,
      curve,
      byStrategy: groupBy(ordered, t => t.strategyName),
      byRegime: groupBy(ordered, t => t.regime?.replace('_', ' ')),
      byExit: groupBy(ordered, t => t.exitReason?.replace(/_/g, ' ')),
    };
  }, [trades, initialCapital]);

  if (stats.count === 0) {
    return (
      <div className="p-10 bg-[#111827] border border-slate-800 rounded-lg text-center">
        <BarChart3 className="w-6 h-6 text-slate-600 mx-auto mb-2" />
        <div className="text-sm text-slate-300">No closed trades yet</div>
        <div className="text-xs text-slate-500 font-mono mt-1">Analytics appear once paper trades are closed.</div>
      </div>
    );
  }

  const tile = (label: string, value: string, tone?: 'pos' | 'neg', sub?: string) => (
    <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
      <div className="text-xs text-slate-400 font-mono">{label}</div>
      <div className={`text-xl font-bold font-mono mt-1 ${tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-rose-400' : 'text-white'}`}>
        {value}
      </div>
      {sub && <div className="text-xs text-slate-500 font-mono mt-1">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tile('NET P&L', formatInr(stats.netPnL), stats.netPnL >= 0 ? 'pos' : 'neg', `${stats.count} closed trades`)}
        {tile('WIN RATE', `${stats.winRate.toFixed(0)}%`, undefined, `Avg win ${formatInr(stats.avgWin)} · loss ${formatInr(stats.avgLoss)}`)}
        {tile('PROFIT FACTOR', stats.profitFactor === null ? '∞' : stats.profitFactor.toFixed(2), undefined, `Expectancy ${formatInr(stats.expectancy, 1)} / trade`)}
        {tile('MAX DRAWDOWN', formatInr(stats.maxDrawdown), stats.maxDrawdown > 0 ? 'neg' : undefined, `${stats.maxDrawdownPct.toFixed(1)}% from peak`)}
      </div>

      <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
          <span>Equity curve (closed trades)</span>
          <span>Charges paid {formatInr(stats.charges)} · avg hold {stats.avgHold.toFixed(0)} min</span>
        </div>
        <EquityCurveChart points={stats.curve} baseline={initialCapital} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BucketTable title="By strategy" rows={stats.byStrategy} />
        <BucketTable title="By market regime" rows={stats.byRegime} />
        <BucketTable title="By exit reason" rows={stats.byExit} />
      </div>
    </div>
  );
};

const BucketTable: React.FC<{ title: string; rows: Bucket[] }> = ({ title, rows }) => (
  <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
    <div className="text-xs font-bold text-white mb-2">{title}</div>
    <table className="w-full text-xs font-mono">
      <thead>
        <tr className="text-slate-500 border-b border-slate-800">
          <th className="text-left py-1.5 font-normal">Bucket</th>
          <th className="text-right py-1.5 font-normal">Trades</th>
          <th className="text-right py-1.5 font-normal">Win %</th>
          <th className="text-right py-1.5 font-normal">Net</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className="border-b border-slate-800/50 text-slate-200">
            <td className="py-1.5 pr-2 truncate max-w-[160px]" title={r.label}>{r.label}</td>
            <td className="py-1.5 text-right">{r.trades}</td>
            <td className="py-1.5 text-right">{Math.round((r.wins / r.trades) * 100)}%</td>
            <td className={`py-1.5 text-right ${r.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatInr(r.netPnL)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
