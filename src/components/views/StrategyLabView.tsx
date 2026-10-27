/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { BacktestConfig, BacktestMetrics, Candle, Instrument, MarketRegime, StrategyId } from '../../types/market.ts';
import { runBacktest } from '../../engine/backtester.ts';
import { EquityCurveChart, formatInr } from '../EquityCurveChart.tsx';
import { FlaskConical, Play, Info } from 'lucide-react';

interface StrategyLabViewProps {
  instrument: Instrument;
  candles1m: Candle[];
  candles5m: Candle[];
  candles15m: Candle[];
}

const STRATEGIES: { id: StrategyId; name: string }[] = [
  { id: 'STRATEGY_A', name: 'A · 1m Comparative Divergence Breakout' },
  { id: 'STRATEGY_B', name: 'B · 1m Range Failed-Breakout Reversal' },
  { id: 'STRATEGY_C', name: 'C · 5m Trend-Pullback Continuation' },
  { id: 'STRATEGY_D', name: 'D · 5m Structural Trend-Reversal' },
  { id: 'STRATEGY_E', name: 'E · BTST Research Module' },
];

const REGIMES: MarketRegime[] = ['TREND_UP', 'TREND_DOWN', 'RANGE', 'HIGH_VOLATILITY', 'TRANSITION', 'NO_TRADE'];

export const StrategyLabView: React.FC<StrategyLabViewProps> = ({ instrument, candles1m, candles5m, candles15m }) => {
  const [enabled, setEnabled] = useState<StrategyId[]>(['STRATEGY_A', 'STRATEGY_B', 'STRATEGY_C', 'STRATEGY_D']);
  const [initialCapital, setInitialCapital] = useState<number>(500000);
  const [riskPerTradePct, setRiskPerTradePct] = useState<number>(0.5);
  const [slippagePct, setSlippagePct] = useState<number>(0.3);
  const [includeCharges, setIncludeCharges] = useState<boolean>(true);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string>('');
  const [result, setResult] = useState<{ metrics: BacktestMetrics; bars: number; instrument: Instrument } | null>(null);

  const toggle = (id: StrategyId) =>
    setEnabled(prev => (prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]));

  const canRun = !running && enabled.length > 0 && candles1m.length > 60;

  const handleRun = () => {
    setRunning(true);
    setError('');
    // Let the "Running…" state paint before the synchronous backtest blocks the thread.
    setTimeout(() => {
      try {
        const config: BacktestConfig = {
          underlying: instrument,
          startDate: candles1m[0]?.timestamp ?? '',
          endDate: candles1m[candles1m.length - 1]?.timestamp ?? '',
          enabledStrategies: enabled,
          riskPerTradePct,
          slippagePct,
          includeCharges,
          initialCapital,
        };
        const metrics = runBacktest(candles1m, candles5m, candles15m, config);
        setResult({ metrics, bars: candles1m.length, instrument });
      } catch (err: any) {
        console.error('Backtest failed:', err);
        setError(err?.message || 'Backtest failed');
      } finally {
        setRunning(false);
      }
    }, 30);
  };

  const m = result?.metrics;
  const input = 'w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white';

  const stat = (label: string, value: string, tone?: 'pos' | 'neg') => (
    <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className={`text-base font-bold mt-0.5 ${tone === 'pos' ? 'text-emerald-400' : tone === 'neg' ? 'text-rose-400' : 'text-white'}`}>
        {value}
      </div>
    </div>
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[340px_1fr] gap-6">
      {/* Configuration */}
      <div className="p-5 bg-[#111827] border border-slate-800 rounded-lg space-y-4 h-fit">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <FlaskConical className="w-4 h-4 text-indigo-400" />
          Backtest Configuration
        </h2>

        <div className="space-y-2">
          <div className="text-xs text-slate-400 font-mono">Strategies</div>
          {STRATEGIES.map(s => (
            <label key={s.id} className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
              <input type="checkbox" checked={enabled.includes(s.id)} onChange={() => toggle(s.id)} className="accent-indigo-500" />
              {s.name}
            </label>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 font-mono text-xs">
          <label className="col-span-2 text-slate-400">
            Initial capital (₹)
            <input type="number" min={10000} step={10000} value={initialCapital} onChange={e => setInitialCapital(Number(e.target.value) || 0)} className={`${input} mt-1`} />
          </label>
          <label className="text-slate-400">
            Risk / trade %
            <input type="number" min={0.1} max={5} step={0.1} value={riskPerTradePct} onChange={e => setRiskPerTradePct(Number(e.target.value) || 0)} className={`${input} mt-1`} />
          </label>
          <label className="text-slate-400">
            Slippage %
            <input type="number" min={0} max={5} step={0.1} value={slippagePct} onChange={e => setSlippagePct(Number(e.target.value) || 0)} className={`${input} mt-1`} />
          </label>
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-200 cursor-pointer">
          <input type="checkbox" checked={includeCharges} onChange={e => setIncludeCharges(e.target.checked)} className="accent-indigo-500" />
          Include brokerage, STT and exchange charges
        </label>

        <button
          onClick={handleRun}
          disabled={!canRun}
          className="w-full px-3 py-2 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2"
        >
          <Play className="w-3.5 h-3.5" />
          {running ? 'Running backtest…' : `Run on ${candles1m.length} × 1m bars`}
        </button>
        {candles1m.length <= 60 && (
          <p className="text-[11px] text-amber-400 font-mono">Need more than 60 one-minute bars to run a backtest.</p>
        )}
        {error && <p className="text-[11px] text-rose-400 font-mono">{error}</p>}
      </div>

      {/* Results */}
      <div className="space-y-4">
        <div className="flex items-start gap-2 px-3 py-2 text-[11px] font-mono text-amber-300/90 bg-amber-950/30 border border-amber-900/50 rounded">
          <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>
            Research estimate only. Option premiums are modelled (Black-Scholes), exits use fixed premium levels,
            and daily loss / max-trade limits are not applied. Treat results as indicative, not as expected returns.
          </span>
        </div>

        {!m && (
          <div className="p-10 bg-[#111827] border border-slate-800 rounded-lg text-center text-xs font-mono text-slate-500">
            Choose strategies and run a backtest over the loaded {instrument} candles.
          </div>
        )}

        {m && result && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
              {stat('Net P&L', formatInr(m.netPnL), m.netPnL >= 0 ? 'pos' : 'neg')}
              {stat('Trades', `${m.totalTrades} (${m.winRate}% win)`)}
              {stat('Profit factor', m.profitFactor.toFixed(2))}
              {stat('Max drawdown', `${formatInr(m.maxDrawdown)} · ${m.maxDrawdownPct}%`, m.maxDrawdown > 0 ? 'neg' : undefined)}
              {stat('Expectancy / trade', formatInr(m.expectancy, 1), m.expectancy >= 0 ? 'pos' : 'neg')}
              {stat('Avg win / loss', `${formatInr(m.avgWin)} / ${formatInr(m.avgLoss)}`)}
              {stat('Charges paid', formatInr(m.totalCharges))}
              {stat('Streaks W / L', `${m.maxConsecutiveWins} / ${m.maxConsecutiveLosses}`)}
            </div>

            <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-2">
                <span>Equity curve · {result.instrument} · {result.bars} bars</span>
                <span>Start {formatInr(initialCapital)}</span>
              </div>
              <EquityCurveChart points={m.equityCurve} baseline={m.equityCurve[0]?.equity ?? initialCapital} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BreakdownTable
                title="By strategy"
                rows={STRATEGIES.map(s => ({ label: s.name, ...m.strategyBreakdown[s.id] }))}
              />
              <BreakdownTable
                title="By market regime"
                rows={REGIMES.map(r => ({ label: r.replace('_', ' '), ...m.regimeBreakdown[r] }))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

const BreakdownTable: React.FC<{
  title: string;
  rows: { label: string; trades: number; netPnL: number; winRate: number }[];
}> = ({ title, rows }) => (
  <div className="p-4 bg-[#111827] border border-slate-800 rounded-lg">
    <div className="text-xs font-bold text-white mb-2">{title}</div>
    <table className="w-full text-xs font-mono">
      <thead>
        <tr className="text-slate-500 border-b border-slate-800">
          <th className="text-left py-1.5 font-normal">Bucket</th>
          <th className="text-right py-1.5 font-normal">Trades</th>
          <th className="text-right py-1.5 font-normal">Win %</th>
          <th className="text-right py-1.5 font-normal">Net P&L</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.label} className={`border-b border-slate-800/50 ${r.trades === 0 ? 'text-slate-600' : 'text-slate-200'}`}>
            <td className="py-1.5 pr-2">{r.label}</td>
            <td className="py-1.5 text-right">{r.trades}</td>
            <td className="py-1.5 text-right">{r.trades ? `${r.winRate}%` : '–'}</td>
            <td className={`py-1.5 text-right ${r.trades === 0 ? '' : r.netPnL >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              {r.trades ? formatInr(r.netPnL) : '–'}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
