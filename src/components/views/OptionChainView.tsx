/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Instrument, OptionContract } from '../../types/market.ts';
import { generateOptionChain } from '../../engine/optionsGreeks.ts';
import { Layers, Info } from 'lucide-react';

interface OptionChainViewProps {
  instrument: Instrument;
  spotPrice: number;
  onTradeContract: (contract: OptionContract) => void;
}

const EXPIRY_CHOICES = [1, 3, 7, 14, 30];

export const OptionChainView: React.FC<OptionChainViewProps> = ({ instrument, spotPrice, onTradeContract }) => {
  const [expiryDays, setExpiryDays] = useState<number>(3);

  // The chain generator randomises volume/OI, so only rebuild when the inputs change.
  const roundedSpot = Math.round(spotPrice * 100) / 100;
  const chain = useMemo(
    () => (roundedSpot > 0 ? generateOptionChain(instrument, roundedSpot, expiryDays) : []),
    [instrument, roundedSpot, expiryDays]
  );

  const rows = useMemo(() => {
    const byStrike = new Map<number, { ce?: OptionContract; pe?: OptionContract }>();
    for (const c of chain) {
      const row = byStrike.get(c.strike) ?? {};
      if (c.optionType === 'CE') row.ce = c;
      else row.pe = c;
      byStrike.set(c.strike, row);
    }
    return [...byStrike.entries()].sort((a, b) => a[0] - b[0]);
  }, [chain]);

  const totals = useMemo(() => {
    let ceOI = 0;
    let peOI = 0;
    for (const c of chain) {
      if (c.optionType === 'CE') ceOI += c.openInterest;
      else peOI += c.openInterest;
    }
    return { ceOI, peOI, pcr: ceOI > 0 ? peOI / ceOI : 0 };
  }, [chain]);

  const cell = 'px-2 py-1.5 text-right tabular-nums';

  const side = (c: OptionContract | undefined, align: 'ce' | 'pe') => {
    if (!c) return <td colSpan={5} />;
    const itm = c.moneyness === 'ITM';
    const cls = `${cell} ${itm ? 'bg-amber-950/20' : ''}`;
    const cols = [
      <td key="oi" className={`${cls} text-slate-500`}>{(c.openInterest / 100000).toFixed(1)}L</td>,
      <td key="iv" className={`${cls} text-slate-400`}>{c.greeks.iv.toFixed(1)}</td>,
      <td key="delta" className={`${cls} text-slate-400`}>{c.greeks.delta.toFixed(2)}</td>,
      <td key="ltp" className={`${cls} text-white font-semibold`}>{c.ltp.toFixed(1)}</td>,
      <td key="buy" className={`${cls} text-center`}>
        <button
          onClick={() => onTradeContract(c)}
          className={`px-2 py-0.5 rounded text-[11px] font-sans font-semibold border transition-colors ${
            align === 'ce'
              ? 'text-emerald-300 border-emerald-800 bg-emerald-950/60 hover:bg-emerald-900'
              : 'text-rose-300 border-rose-800 bg-rose-950/60 hover:bg-rose-900'
          }`}
          aria-label={`Paper buy ${c.symbol}`}
        >
          Buy
        </button>
      </td>,
    ];
    return align === 'ce' ? cols : [...cols].reverse();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-[#111827] border border-slate-800 rounded-lg">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-indigo-400" />
          <h2 className="text-sm font-bold text-white">{instrument} Option Chain</h2>
          <span className="text-xs font-mono text-slate-400">Spot {spotPrice.toFixed(2)}</span>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <span className="text-slate-400">PCR <span className="text-white">{totals.pcr.toFixed(2)}</span></span>
          <label className="flex items-center gap-2 text-slate-400">
            Expiry
            <select
              value={expiryDays}
              onChange={e => setExpiryDays(Number(e.target.value))}
              className="bg-[#0B0F17] border border-slate-800 rounded px-2 py-1 text-white"
            >
              {EXPIRY_CHOICES.map(d => (
                <option key={d} value={d}>{d}d</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="flex items-start gap-2 px-3 py-2 text-[11px] font-mono text-amber-300/90 bg-amber-950/30 border border-amber-900/50 rounded">
        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        <span>
          Modelled chain: prices and Greeks come from Black-Scholes with an assumed IV smile; volume and OI are simulated.
          Not live exchange data. Buying places a paper order only.
        </span>
      </div>

      <div className="bg-[#111827] border border-slate-800 rounded-lg overflow-x-auto">
        <table className="w-full text-xs font-mono min-w-[760px]">
          <thead>
            <tr className="text-slate-400 border-b border-slate-800">
              <th colSpan={5} className="py-2 text-emerald-400 font-semibold">CALLS (CE)</th>
              <th className="py-2" />
              <th colSpan={5} className="py-2 text-rose-400 font-semibold">PUTS (PE)</th>
            </tr>
            <tr className="text-slate-500 border-b border-slate-800">
              <th className={cell}>OI</th>
              <th className={cell}>IV%</th>
              <th className={cell}>Δ</th>
              <th className={cell}>LTP</th>
              <th className="px-2 py-1.5" />
              <th className="px-2 py-1.5 text-center">Strike</th>
              <th className="px-2 py-1.5" />
              <th className={cell}>LTP</th>
              <th className={cell}>Δ</th>
              <th className={cell}>IV%</th>
              <th className={cell}>OI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([strike, { ce, pe }]) => {
              const isAtm = ce?.moneyness === 'ATM';
              return (
                <tr key={strike} className={`border-b border-slate-800/60 ${isAtm ? 'bg-indigo-950/40' : 'hover:bg-slate-800/30'}`}>
                  {side(ce, 'ce')}
                  <td className={`px-3 py-1.5 text-center font-bold ${isAtm ? 'text-indigo-300' : 'text-slate-200'}`}>
                    {strike}
                  </td>
                  {side(pe, 'pe')}
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-slate-500">Waiting for a spot price…</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
