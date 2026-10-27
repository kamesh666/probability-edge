/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Instrument, MarketRegime, MarketDataMode, LiveMarketQuote } from '../types/market.ts';
import { Play, Pause, StepForward, RotateCcw, AlertTriangle, ShieldCheck, Radio, Database, LogIn, UserCheck, RefreshCw, Zap, Activity } from 'lucide-react';
import { User } from 'firebase/auth';

export type ActiveTab = 
  | 'overview' 
  | 'monitor' 
  | 'scanner' 
  | 'options' 
  | 'strategies' 
  | 'paper' 
  | 'analytics' 
  | 'journal' 
  | 'settings';

interface NavbarProps {
  activeTab: ActiveTab;
  onTabChange: (tab: ActiveTab) => void;
  instrument: Instrument;
  onInstrumentChange: (inst: Instrument) => void;
  regime: MarketRegime;
  // Market Data Mode
  marketMode: MarketDataMode;
  onMarketModeChange: (mode: MarketDataMode) => void;
  liveQuote?: LiveMarketQuote | null;
  isLiveLoading?: boolean;
  isLivePolling?: boolean;
  onToggleLivePolling?: () => void;
  onRefreshLiveQuote?: () => void;
  // Replay playback
  isPlaying: boolean;
  playbackSpeed: number;
  onTogglePlay: () => void;
  onStepForward: () => void;
  onSpeedChange: (speed: number) => void;
  onResetPlayback: () => void;
  currentCandleIndex: number;
  totalCandles: number;
  // Risk & Paper
  todayRealizedPnL: number;
  todayUnrealizedPnL: number;
  openPositionsCount: number;
  onEmergencySquareOff: () => void;
  tradingAllowed: boolean;
  currentUser?: User | null;
  onSignIn?: () => void;
  onSignOut?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeTab,
  onTabChange,
  instrument,
  onInstrumentChange,
  regime,
  marketMode,
  onMarketModeChange,
  liveQuote,
  isLiveLoading = false,
  isLivePolling = true,
  onToggleLivePolling,
  onRefreshLiveQuote,
  isPlaying,
  playbackSpeed,
  onTogglePlay,
  onStepForward,
  onSpeedChange,
  onResetPlayback,
  currentCandleIndex,
  totalCandles,
  todayRealizedPnL,
  todayUnrealizedPnL,
  openPositionsCount,
  onEmergencySquareOff,
  tradingAllowed,
  currentUser,
  onSignIn,
  onSignOut,
}) => {
  const totalPnL = todayRealizedPnL + todayUnrealizedPnL;
  const isProfit = totalPnL >= 0;

  const getRegimeColor = (reg: MarketRegime) => {
    switch (reg) {
      case 'TREND_UP': return 'text-emerald-400';
      case 'TREND_DOWN': return 'text-rose-400';
      case 'RANGE': return 'text-amber-400';
      case 'HIGH_VOLATILITY': return 'text-purple-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <header className="bg-[#0B0F17] border-b border-slate-800 sticky top-0 z-50">
      {/* Top Bar Contract: 3 zones separated by gap-8 */}
      <div className="flex items-center justify-between gap-8 px-6 py-2.5">
        {/* Zone 1: Single text element wordmark */}
        <div className="flex items-center gap-3 shrink-0">
          <button 
            onClick={() => onTabChange('overview')}
            className="text-base font-extrabold tracking-tight text-white whitespace-nowrap text-left hover:text-indigo-400 transition-colors"
          >
            PROBABILITY<span className="text-indigo-400">EDGE</span>
          </button>
          
          <div className="h-4 w-[1px] bg-slate-800" />

          {/* Instrument Selector Segmented Control */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => onInstrumentChange('NIFTY')}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                instrument === 'NIFTY' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              NIFTY 50
            </button>
            <button
              onClick={() => onInstrumentChange('BANKNIFTY')}
              className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors whitespace-nowrap ${
                instrument === 'BANKNIFTY' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              BANKNIFTY
            </button>
          </div>
        </div>

        {/* Zone 2: Navigation Links */}
        <nav className="hidden xl:flex items-center gap-5 text-xs font-medium text-slate-400">
          <button 
            onClick={() => onTabChange('overview')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'overview' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Overview
          </button>
          <button 
            onClick={() => onTabChange('monitor')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'monitor' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Market Monitor
          </button>
          <button 
            onClick={() => onTabChange('scanner')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'scanner' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Signal Scanner
          </button>
          <button 
            onClick={() => onTabChange('options')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'options' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Option Chain
          </button>
          <button 
            onClick={() => onTabChange('strategies')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'strategies' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Strategy Lab
          </button>
          <button 
            onClick={() => onTabChange('paper')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'paper' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Paper Trading {openPositionsCount > 0 && `(${openPositionsCount})`}
          </button>
          <button 
            onClick={() => onTabChange('analytics')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'analytics' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Analytics
          </button>
          <button 
            onClick={() => onTabChange('journal')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'journal' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Trade Journal
          </button>
          <button 
            onClick={() => onTabChange('settings')} 
            className={`whitespace-nowrap transition-colors pb-0.5 border-b-2 ${
              activeTab === 'settings' ? 'text-white border-indigo-500 font-semibold' : 'border-transparent hover:text-slate-200'
            }`}
          >
            Diagnostics
          </button>
        </nav>

        {/* Zone 3: Primary Action & Status */}
        <div className="flex items-center gap-4 shrink-0">
          {/* Regime Badge */}
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono">
            <span className="text-slate-500">Regime:</span>
            <span className={`font-semibold ${getRegimeColor(regime)}`}>{regime}</span>
          </div>

          {/* Today PnL */}
          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums">
            <span className="text-slate-500">Day P&L:</span>
            <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isProfit ? '+' : ''}₹{totalPnL.toLocaleString('en-IN', { maximumFractionDigits: 1 })}
            </span>
          </div>

          {/* Emergency Square Off */}
          {openPositionsCount > 0 && (
            <button
              onClick={onEmergencySquareOff}
              className="px-2.5 py-1 text-xs font-semibold text-rose-400 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 rounded transition-colors whitespace-nowrap shrink-0 flex items-center gap-1"
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Square Off ({openPositionsCount})</span>
            </button>
          )}

          {/* Cloud SQL Persistence Indicator */}
          <div 
            title="Intraday paper trades and Angel One configuration persist to Cloud SQL database"
            className="hidden lg:flex items-center gap-1.5 text-[11px] font-mono text-emerald-400 px-2 py-0.5 bg-emerald-950/40 border border-emerald-800/50 rounded"
          >
            <Database className="w-3 h-3 text-emerald-400" />
            <span>Cloud SQL</span>
          </div>

          {/* Paper Trading Mode Badge */}
          <div className="hidden md:flex items-center gap-1 text-[11px] font-mono text-slate-300 px-2 py-0.5 bg-slate-900 border border-slate-800 rounded">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-400" />
            <span>PAPER TRADING</span>
          </div>

          {/* User Sign In / Profile */}
          {currentUser ? (
            <button
              onClick={onSignOut}
              title={`Logged in as ${currentUser.email}. Click to sign out.`}
              className="text-[11px] font-mono text-slate-300 hover:text-white px-2 py-0.5 bg-slate-900 hover:bg-slate-850 border border-slate-800 rounded flex items-center gap-1.5 transition-colors"
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-400" />
              <span className="truncate max-w-[90px]">{currentUser.email?.split('@')[0]}</span>
            </button>
          ) : (
            onSignIn && (
              <button
                onClick={onSignIn}
                title="Sign in with Google to synchronize trades across devices"
                className="text-[11px] font-mono text-indigo-300 hover:text-white px-2 py-0.5 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-800/50 rounded flex items-center gap-1.5 transition-colors"
              >
                <LogIn className="w-3.5 h-3.5 text-indigo-400" />
                <span>Google Sync</span>
              </button>
            )
          )}
        </div>
      </div>

      {/* Sub-bar: Live Stream & Playback Controller */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-1.5 bg-[#090D14] border-t border-slate-900 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          {/* Market Data Mode Switch: Live Feed vs Replay Simulator */}
          <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded p-0.5">
            <button
              onClick={() => onMarketModeChange('LIVE')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                marketMode === 'LIVE'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Stream real live NSE spot market quotes and today's intraday candles"
            >
              <Radio className={`w-3.5 h-3.5 ${marketMode === 'LIVE' ? 'animate-pulse text-emerald-200' : ''}`} />
              <span>LIVE FEED</span>
            </button>
            <button
              onClick={() => onMarketModeChange('REPLAY')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                marketMode === 'REPLAY'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Historical candle replay and deterministic simulation backtest"
            >
              <Activity className="w-3.5 h-3.5" />
              <span>REPLAY SIMULATOR</span>
            </button>
          </div>

          <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

          {/* Conditional Sub-controls based on Market Mode */}
          {marketMode === 'LIVE' ? (
            <div className="flex flex-wrap items-center gap-3">
              {/* Real Market Spot Ticker */}
              {liveQuote ? (
                <div className="flex items-center gap-2 px-2.5 py-1 rounded bg-slate-900 border border-slate-800 font-mono text-xs">
                  <span className="text-slate-400 font-bold">{instrument}</span>
                  <span className="text-white font-bold tracking-tight">
                    ₹{liveQuote.ltp.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span
                    className={`text-[11px] font-semibold px-1 py-0.2 rounded ${
                      liveQuote.change >= 0
                        ? 'text-emerald-400 bg-emerald-950/60'
                        : 'text-rose-400 bg-rose-950/60'
                    }`}
                  >
                    {liveQuote.change >= 0 ? '+' : ''}
                    {liveQuote.changePct.toFixed(2)}%
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-slate-400 font-mono text-xs">
                  <Activity className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                  <span>Fetching live quote...</span>
                </div>
              )}

              {/* Market Status Badge (Open / Closed) */}
              <div
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono border ${
                  liveQuote?.isMarketOpen
                    ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300'
                    : 'bg-amber-950/50 border-amber-800/70 text-amber-300'
                }`}
                title={
                  liveQuote?.isMarketOpen
                    ? 'NSE Market is open (09:15 - 15:30 IST)'
                    : 'NSE Regular hours are 09:15-15:30 IST. Showing latest market session & live tick feed.'
                }
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    liveQuote?.isMarketOpen ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'
                  }`}
                />
                <span className="font-semibold">
                  NSE: {liveQuote?.marketStatus || 'MONITORING'}
                </span>
                {liveQuote?.istTime && (
                  <span className="text-slate-400 font-normal">({liveQuote.istTime})</span>
                )}
              </div>

              {/* Auto Poll 3s Button */}
              {onToggleLivePolling && (
                <button
                  onClick={onToggleLivePolling}
                  className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border transition-colors ${
                    isLivePolling
                      ? 'bg-emerald-950/40 border-emerald-800 text-emerald-400'
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                  title={isLivePolling ? 'Auto-polling every 3s is active' : 'Click to enable 3s auto-polling'}
                >
                  <Zap className={`w-3 h-3 ${isLivePolling ? 'text-emerald-400' : 'text-slate-500'}`} />
                  <span>{isLivePolling ? 'Auto-Poll (3s)' : 'Poll Paused'}</span>
                </button>
              )}

              {/* Manual Refresh Button */}
              {onRefreshLiveQuote && (
                <button
                  onClick={onRefreshLiveQuote}
                  disabled={isLiveLoading}
                  className="p-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors"
                  title="Force refresh live quote and candles"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLiveLoading ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-3">
              {/* Play/Pause Button */}
              <button
                onClick={onTogglePlay}
                className={`px-3 py-1 rounded flex items-center gap-1.5 text-xs font-semibold transition-colors ${
                  isPlaying
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                }`}
                title={isPlaying ? 'Pause Replay' : 'Play Candle Stream'}
              >
                {isPlaying ? <Pause className="w-3 h-3 fill-current" /> : <Play className="w-3 h-3 fill-current" />}
                <span>{isPlaying ? 'Pause Replay' : 'Play Candle Stream'}</span>
              </button>

              <button
                onClick={onStepForward}
                disabled={isPlaying}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 transition-colors"
                title="Step Forward 1 Candle"
              >
                <StepForward className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={onResetPlayback}
                className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
                title="Reset to Day Open"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>

              {/* Speed Buttons */}
              <div className="flex items-center bg-slate-900 border border-slate-800 rounded p-0.5">
                {[1, 2, 5, 10].map(speed => (
                  <button
                    key={speed}
                    onClick={() => onSpeedChange(speed)}
                    className={`px-2 py-0.5 text-[11px] font-mono rounded ${
                      playbackSpeed === speed
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {speed}x
                  </button>
                ))}
              </div>

              <span className="text-slate-500 font-mono text-[11px] hidden sm:inline">
                Candle <span className="text-slate-300">{currentCandleIndex}</span> / {totalCandles}
              </span>
            </div>
          )}
        </div>

        {/* Mobile Navigation Dropdown for smaller screens */}
        <div className="xl:hidden flex items-center">
          <select
            value={activeTab}
            onChange={(e) => onTabChange(e.target.value as ActiveTab)}
            className="bg-slate-900 border border-slate-800 text-slate-200 text-xs rounded px-2 py-1"
          >
            <option value="overview">Overview</option>
            <option value="monitor">Market Monitor</option>
            <option value="scanner">Signal Scanner</option>
            <option value="options">Option Chain</option>
            <option value="strategies">Strategy Lab</option>
            <option value="paper">Paper Trading</option>
            <option value="analytics">Analytics</option>
            <option value="journal">Trade Journal</option>
            <option value="settings">Diagnostics</option>
          </select>
        </div>
      </div>
    </header>
  );
};
