/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Instrument, Timeframe, TradeSignal, OptionContract, RiskConfig, MarketDataMode, LiveMarketQuote } from './types/market.ts';
import { generateSyntheticIntradayData, resampleCandles, parseAndValidateCSV, fetchLiveMarketQuote, fetchLiveMarketCandles } from './data/marketDataService.ts';
import { detectSwings, detectBOSandCHoCH, computeSupportResistanceLevels, detectRangeBoundaries } from './engine/marketStructure.ts';
import { classifyMarketRegime } from './engine/regime.ts';
import { generateOptionChain } from './engine/optionsGreeks.ts';
import { evaluateAllStrategies } from './engine/strategies.ts';
import { PaperBroker } from './engine/paperBroker.ts';
import { DEFAULT_RISK_CONFIG } from './engine/riskManager.ts';
import { auth, signInWithGoogle, logOut, onAuthStateChanged, User } from './lib/firebase.ts';
import { syncTradeToCloudSql, fetchTradesFromCloudSql, updateTradeNotesInCloudSql } from './data/dbSyncService.ts';

import { Navbar, ActiveTab } from './components/Navbar.tsx';
import { OverviewView } from './components/views/OverviewView.tsx';
import { MarketMonitorView } from './components/views/MarketMonitorView.tsx';
import { SignalScannerView } from './components/views/SignalScannerView.tsx';
import { OptionChainView } from './components/views/OptionChainView.tsx';
import { StrategyLabView } from './components/views/StrategyLabView.tsx';
import { PaperTradingView } from './components/views/PaperTradingView.tsx';
import { PerformanceAnalyticsView } from './components/views/PerformanceAnalyticsView.tsx';
import { TradeJournalView } from './components/views/TradeJournalView.tsx';
import { DiagnosticsSettingsView } from './components/views/DiagnosticsSettingsView.tsx';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('overview');
  const [instrument, setInstrument] = useState<Instrument>('NIFTY');
  const [timeframe, setTimeframe] = useState<Timeframe>('1m');

  // Live Market Data Feed & Playback Mode
  const [marketMode, setMarketMode] = useState<MarketDataMode>('LIVE');
  const [liveQuote, setLiveQuote] = useState<LiveMarketQuote | null>(null);
  const [liveCandles, setLiveCandles] = useState<any[]>([]);
  const [isLiveLoading, setIsLiveLoading] = useState<boolean>(false);
  const [isLivePolling, setIsLivePolling] = useState<boolean>(true);

  // Risk & Broker
  const [riskConfig, setRiskConfig] = useState<RiskConfig>(DEFAULT_RISK_CONFIG);
  const paperBrokerRef = useRef<PaperBroker>(new PaperBroker(riskConfig));
  const paperBroker = paperBrokerRef.current;

  // React state mirroring broker state for reactivity
  const [accountState, setAccountState] = useState(paperBroker.getAccountState());
  const [positions, setPositions] = useState(paperBroker.getPositions());
  const [orders, setOrders] = useState(paperBroker.getOrders());
  const [trades, setTrades] = useState(paperBroker.getTradeHistory());
  const [notification, setNotification] = useState<{ message: string; type: 'info' | 'success' | 'warn' } | null>(null);

  // User Authentication & Cloud SQL User Sync
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [idToken, setIdToken] = useState<string | undefined>(undefined);

  const showNotification = (msg: string, type: 'info' | 'success' | 'warn' = 'info') => {
    setNotification({ message: msg, type });
    setTimeout(() => setNotification(null), 4000);
  };

  // Listen to Firebase Auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const token = await user.getIdToken();
          setIdToken(token);
          showNotification(`Signed in as ${user.email} · Cloud SQL active`, 'success');
          const res = await fetchTradesFromCloudSql(user.uid, token);
          if (res.success && res.trades && res.trades.length > 0) {
            paperBroker.mergeHistoricalTrades(res.trades);
            setTrades([...paperBroker.getTradeHistory()]);
          }
        } catch (e) {
          console.error('Error fetching user token or trades:', e);
        }
      } else {
        setIdToken(undefined);
        fetchTradesFromCloudSql('default_trader').then((res) => {
          if (res.success && res.trades && res.trades.length > 0) {
            paperBroker.mergeHistoricalTrades(res.trades);
            setTrades([...paperBroker.getTradeHistory()]);
          }
        });
      }
    });
    return () => unsubscribe();
  }, []);

  // Hook PaperBroker onTradeClosed to persist trades into Cloud SQL
  useEffect(() => {
    paperBroker.onTradeClosed = async (closedTrade) => {
      setTrades([...paperBroker.getTradeHistory()]);
      setAccountState({ ...paperBroker.getAccountState() });
      setPositions([...paperBroker.getPositions()]);

      const uid = currentUser?.uid || 'default_trader';
      const res = await syncTradeToCloudSql(closedTrade, uid, idToken);
      if (res.success) {
        showNotification(`Trade ${closedTrade.symbol} persisted to Cloud SQL`, 'success');
      }
    };
  }, [currentUser, idToken]);

  const handleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err: any) {
      showNotification('Google Sign-In cancelled or failed.', 'warn');
    }
  };

  const handleSignOut = async () => {
    await logOut();
    showNotification('Signed out from Google Sync session.', 'info');
  };

  // Full datasets per instrument (3 days of 1m candles = ~1125 candles)
  const [niftyDataset, setNiftyDataset] = useState(() => generateSyntheticIntradayData('NIFTY', 3, 42));
  const [bankNiftyDataset, setBankNiftyDataset] = useState(() => generateSyntheticIntradayData('BANKNIFTY', 3, 108));

  const fullCandles = instrument === 'NIFTY' ? niftyDataset : bankNiftyDataset;

  // Replay playback state
  const [currentCandleIndex, setCurrentCandleIndex] = useState<number>(() => Math.min(180, fullCandles.length));
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);

  // Slice candles available up to the current moment in time (no future leak)
  const candles1m = useMemo(() => {
    if (marketMode === 'LIVE' && liveCandles.length > 0) {
      return liveCandles;
    }
    return fullCandles.slice(0, currentCandleIndex);
  }, [marketMode, liveCandles, fullCandles, currentCandleIndex]);

  // Resample 5m and 15m
  const candles5m = useMemo(() => resampleCandles(candles1m, '5m'), [candles1m]);
  const candles15m = useMemo(() => resampleCandles(candles1m, '15m'), [candles1m]);

  // Select candles based on chart timeframe
  const displayCandles = useMemo(() => {
    if (timeframe === '5m') return candles5m;
    if (timeframe === '15m') return candles15m;
    return candles1m;
  }, [timeframe, candles1m, candles5m, candles15m]);

  // Spot price (real live market LTP when in LIVE mode)
  const currentSpot = useMemo(() => {
    if (marketMode === 'LIVE' && liveQuote) {
      return liveQuote.ltp;
    }
    return candles1m.length > 0 ? candles1m[candles1m.length - 1].close : (instrument === 'NIFTY' ? 22750 : 54000);
  }, [marketMode, liveQuote, candles1m, instrument]);

  const currentTimestamp = useMemo(() => {
    if (marketMode === 'LIVE' && liveQuote) {
      return liveQuote.timestamp;
    }
    return candles1m.length > 0 ? candles1m[candles1m.length - 1].time : Math.floor(Date.now() / 1000);
  }, [marketMode, liveQuote, candles1m]);

  // Market Structure analysis
  const { swings: swings1m, events: events1m } = useMemo(() => {
    return detectSwings(candles1m, '1m', 3, 3);
  }, [candles1m]);

  const { swings: swings5m } = useMemo(() => {
    return detectSwings(candles5m, '5m', 2, 2);
  }, [candles5m]);

  const bosEvents = useMemo(() => {
    return detectBOSandCHoCH(candles1m, swings1m, '1m');
  }, [candles1m, swings1m]);

  const srLevels = useMemo(() => {
    return computeSupportResistanceLevels(swings1m);
  }, [swings1m]);

  const rangeBoundaries = useMemo(() => {
    return detectRangeBoundaries(candles1m, 30);
  }, [candles1m]);

  // Market Regime Classification
  const { regime } = useMemo(() => {
    return classifyMarketRegime(candles1m, [...events1m, ...bosEvents]);
  }, [candles1m, events1m, bosEvents]);

  // Live Option Chain Matrix
  const optionChain = useMemo(() => {
    return generateOptionChain(instrument, currentSpot);
  }, [instrument, currentSpot]);

  // Multi-Strategy Scanner Signals
  const signals: TradeSignal[] = useMemo(() => {
    return evaluateAllStrategies({
      underlying: instrument,
      candles1m,
      candles5m,
      candles15m,
      swings1m,
      swings5m,
      structureEvents: [...events1m, ...bosEvents],
      srLevels,
      rangeBoundaries,
      regime,
      optionChain,
    });
  }, [instrument, candles1m, candles5m, candles15m, swings1m, swings5m, events1m, bosEvents, srLevels, rangeBoundaries, regime, optionChain]);

  // Update paper positions mark to market on each candle advancement
  useEffect(() => {
    paperBroker.updatePositionsMarkToMarket(currentSpot, currentTimestamp);
    setPositions(paperBroker.getPositions());
    setAccountState(paperBroker.getAccountState());
    setTrades(paperBroker.getTradeHistory());
  }, [currentCandleIndex, currentSpot, currentTimestamp]);

  // Load live market quote and today's session candles
  const loadLiveMarketData = async (inst: Instrument) => {
    setIsLiveLoading(true);
    try {
      const [quote, candles] = await Promise.all([
        fetchLiveMarketQuote(inst),
        fetchLiveMarketCandles(inst),
      ]);
      if (quote) setLiveQuote(quote);
      if (candles && candles.length > 0) setLiveCandles(candles);
    } catch (err) {
      console.warn('Error loading live market data:', err);
    } finally {
      setIsLiveLoading(false);
    }
  };

  // Initial live market data fetch & on instrument change
  useEffect(() => {
    if (marketMode === 'LIVE') {
      loadLiveMarketData(instrument);
    }
  }, [instrument, marketMode]);

  // Real-time polling loop (3s interval) for live market ticks
  useEffect(() => {
    if (marketMode !== 'LIVE' || !isLivePolling) return;

    const timer = setInterval(async () => {
      const q = await fetchLiveMarketQuote(instrument);
      if (q) {
        setLiveQuote(q);
        // Mark to market paper positions
        paperBroker.updatePositionsMarkToMarket(q.ltp, q.timestamp);
        setPositions(paperBroker.getPositions());
        setAccountState(paperBroker.getAccountState());

        // Update latest candle with live tick
        setLiveCandles(prev => {
          if (prev.length === 0) return prev;
          const last = prev[prev.length - 1];
          const candleDuration = 60; // 1m
          if (q.timestamp - last.time < candleDuration) {
            const updated = {
              ...last,
              high: Math.max(last.high, q.ltp),
              low: Math.min(last.low, q.ltp),
              close: q.ltp,
              volume: last.volume + 75,
            };
            return [...prev.slice(0, -1), updated];
          } else {
            const newCandle = {
              timestamp: new Date(q.timestamp * 1000).toISOString().replace('T', ' ').substring(0, 19),
              time: q.timestamp,
              open: q.ltp,
              high: q.ltp,
              low: q.ltp,
              close: q.ltp,
              volume: 1500,
            };
            return [...prev, newCandle];
          }
        });
      }
    }, 3000);

    return () => clearInterval(timer);
  }, [marketMode, isLivePolling, instrument]);

  // Replay interval timer
  useEffect(() => {
    if (!isPlaying) return;

    const intervalTime = Math.max(100, 1000 / playbackSpeed);
    const timer = setInterval(() => {
      setCurrentCandleIndex(prev => {
        if (prev >= fullCandles.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalTime);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, fullCandles.length]);

  // Check if a new confirmed signal just appeared on playback
  useEffect(() => {
    const latestConfirmed = signals.find(s => s.status === 'CONFIRMED');
    if (latestConfirmed && isPlaying) {
      showNotification(`Strategy Alert: ${latestConfirmed.strategyName} flagged confirmed ${latestConfirmed.direction.replace('_CANDIDATE', '')}!`, 'success');
    }
  }, [currentCandleIndex]);

  // --- Handlers ---

  const handleTogglePlay = () => setIsPlaying(p => !p);

  const handleStepForward = () => {
    if (currentCandleIndex < fullCandles.length) {
      setCurrentCandleIndex(c => c + 1);
    }
  };

  const handleResetPlayback = () => {
    setIsPlaying(false);
    setCurrentCandleIndex(Math.min(180, fullCandles.length));
  };

  const handleExecutePaperOrder = (signal: TradeSignal) => {
    const result = paperBroker.placeOrderFromSignal(signal, currentTimestamp);
    setPositions(paperBroker.getPositions());
    setOrders(paperBroker.getOrders());
    setAccountState(paperBroker.getAccountState());

    if (result.success) {
      showNotification(result.message, 'success');
      setActiveTab('paper');
    } else {
      showNotification(result.message, 'warn');
    }
  };

  const handleTradeContractDirectly = (contract: OptionContract) => {
    // Synthesize signal from contract click
    const isCall = contract.optionType === 'CE';
    const stopPremium = Math.max(1.0, contract.ltp * 0.7);
    const targetPremium = contract.ltp * 1.5;

    const dummySignal: TradeSignal = {
      id: `DIR_${Date.now()}`,
      strategyId: 'STRATEGY_A',
      strategyName: 'Direct Option Matrix Order',
      underlying: instrument,
      direction: isCall ? 'CALL_CANDIDATE' : 'PUT_CANDIDATE',
      status: 'CONFIRMED',
      timeframe: '1m',
      candleTimestamp: new Date(currentTimestamp * 1000).toISOString(),
      candleTime: currentTimestamp,
      spotPrice: currentSpot,
      recommendedContract: contract,
      proposedEntryPremium: contract.ltp,
      proposedStopPremium: Math.round(stopPremium * 10) / 10,
      proposedTargetPremium: Math.round(targetPremium * 10) / 10,
      proposedStopSpot: isCall ? currentSpot - 30 : currentSpot + 30,
      proposedTargetSpot: isCall ? currentSpot + 50 : currentSpot - 50,
      rewardToRiskRatio: 1.67,
      calculatedLots: 1,
      calculatedQuantity: contract.lotSize,
      score: 85,
      isCalibrated: false,
      regime,
      featureScores: {},
      reasons: ['Direct order from Option Chain Matrix'],
      auditTrail: [],
    };

    handleExecutePaperOrder(dummySignal);
  };

  const handleSquareOffPosition = (posId: string) => {
    paperBroker.manualSquareOff(posId, currentSpot, currentTimestamp);
    setPositions(paperBroker.getPositions());
    setTrades(paperBroker.getTradeHistory());
    setAccountState(paperBroker.getAccountState());
    showNotification('Position closed successfully.', 'info');
  };

  const handleEmergencySquareOffAll = () => {
    paperBroker.emergencySquareOffAll(currentTimestamp);
    setPositions(paperBroker.getPositions());
    setTrades(paperBroker.getTradeHistory());
    setAccountState(paperBroker.getAccountState());
    showNotification('Emergency Square-Off: All positions closed.', 'warn');
  };

  const handleUpdateStopLoss = (posId: string, newStop: number) => {
    paperBroker.updateStopLoss(posId, newStop);
    setPositions(paperBroker.getPositions());
    showNotification(`Trailing stop updated to ₹${newStop}`, 'info');
  };

  const handleResetAccount = () => {
    paperBroker.resetAccount();
    setPositions([]);
    setOrders([]);
    setTrades([]);
    setAccountState(paperBroker.getAccountState());
    showNotification('Paper Trading Account balance reset to ₹5,00,000.', 'info');
  };

  const handleImportCSVData = (csvText: string) => {
    const res = parseAndValidateCSV(csvText);
    if (!res.success || !res.candles) {
      return { success: false, message: res.error || 'Invalid CSV dataset' };
    }

    if (instrument === 'NIFTY') {
      setNiftyDataset(res.candles);
    } else {
      setBankNiftyDataset(res.candles);
    }
    setCurrentCandleIndex(Math.min(180, res.candles.length));
    return { success: true, message: `Successfully loaded ${res.candles.length} candles for ${instrument}.` };
  };

  const handleRegenerateSynthetic = (days: number, seed: number) => {
    const newData = generateSyntheticIntradayData(instrument, days, seed);
    if (instrument === 'NIFTY') setNiftyDataset(newData);
    else setBankNiftyDataset(newData);
    setCurrentCandleIndex(Math.min(180, newData.length));
  };

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100 flex flex-col">
      {/* Institutional Top Bar Navigation */}
      <Navbar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        instrument={instrument}
        onInstrumentChange={(inst) => {
          setInstrument(inst);
          setCurrentCandleIndex(180);
        }}
        regime={regime}
        marketMode={marketMode}
        onMarketModeChange={setMarketMode}
        liveQuote={liveQuote}
        isLiveLoading={isLiveLoading}
        isLivePolling={isLivePolling}
        onToggleLivePolling={() => setIsLivePolling(p => !p)}
        onRefreshLiveQuote={() => loadLiveMarketData(instrument)}
        isPlaying={isPlaying}
        playbackSpeed={playbackSpeed}
        onTogglePlay={handleTogglePlay}
        onStepForward={handleStepForward}
        onSpeedChange={setPlaybackSpeed}
        onResetPlayback={handleResetPlayback}
        currentCandleIndex={currentCandleIndex}
        totalCandles={fullCandles.length}
        todayRealizedPnL={accountState.todayRealizedPnL}
        todayUnrealizedPnL={accountState.todayUnrealizedPnL}
        openPositionsCount={positions.length}
        onEmergencySquareOff={handleEmergencySquareOffAll}
        tradingAllowed={accountState.tradingAllowed}
        currentUser={currentUser}
        onSignIn={handleSignIn}
        onSignOut={handleSignOut}
      />

      {/* Floating System Notification Toast */}
      {notification && (
        <div className={`fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg border text-xs font-mono shadow-xl transition-all ${
          notification.type === 'success' ? 'bg-emerald-950 border-emerald-700 text-emerald-200' :
          notification.type === 'warn' ? 'bg-rose-950 border-rose-700 text-rose-200' :
          'bg-slate-900 border-slate-700 text-slate-200'
        }`}>
          {notification.message}
        </div>
      )}

      {/* Main Content Viewport */}
      <main className="flex-1 max-w-[1600px] w-full mx-auto px-4 sm:px-6 py-6">
        {activeTab === 'overview' && (
          <OverviewView
            candles={displayCandles}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            structureEvents={[...events1m, ...bosEvents]}
            srLevels={srLevels}
            regime={regime}
            instrument={instrument}
            account={accountState}
            positions={positions}
            signals={signals}
            onApproveSignal={handleExecutePaperOrder}
            onSquareOff={handleSquareOffPosition}
            onNavigateToTab={setActiveTab}
          />
        )}

        {activeTab === 'monitor' && (
          <MarketMonitorView
            candles={displayCandles}
            timeframe={timeframe}
            onTimeframeChange={setTimeframe}
            structureEvents={[...events1m, ...bosEvents]}
            srLevels={srLevels}
            regime={regime}
            instrument={instrument}
          />
        )}

        {activeTab === 'scanner' && (
          <SignalScannerView
            signals={signals}
            account={accountState}
            onExecuteTrade={handleExecutePaperOrder}
          />
        )}

        {activeTab === 'options' && (
          <OptionChainView
            instrument={instrument}
            spotPrice={currentSpot}
            onTradeContract={handleTradeContractDirectly}
          />
        )}

        {activeTab === 'strategies' && (
          <StrategyLabView
            instrument={instrument}
            candles1m={candles1m}
            candles5m={candles5m}
            candles15m={candles15m}
          />
        )}

        {activeTab === 'paper' && (
          <PaperTradingView
            account={accountState}
            positions={positions}
            orders={orders}
            onSquareOffPosition={handleSquareOffPosition}
            onEmergencySquareOffAll={handleEmergencySquareOffAll}
            onUpdateStopLoss={handleUpdateStopLoss}
            onResetAccount={handleResetAccount}
          />
        )}

        {activeTab === 'analytics' && (
          <PerformanceAnalyticsView
            trades={trades}
            initialCapital={riskConfig.accountEquity}
          />
        )}

        {activeTab === 'journal' && (
          <TradeJournalView
            trades={trades}
            onUpdateTradeNotes={async (tId, notes) => {
              const tr = trades.find(t => t.id === tId);
              if (tr) tr.userNotes = notes;
              setTrades([...trades]);
              const uid = currentUser?.uid || 'default_trader';
              await updateTradeNotesInCloudSql(tId, notes, uid, idToken);
              showNotification('Journal note updated in Cloud SQL', 'success');
            }}
          />
        )}

        {activeTab === 'settings' && (
          <DiagnosticsSettingsView
            riskConfig={riskConfig}
            onUpdateRiskConfig={cfg => {
              setRiskConfig(cfg);
              showNotification('Risk parameters updated.', 'success');
            }}
            onImportCSVData={handleImportCSVData}
            onRegenerateSyntheticData={handleRegenerateSynthetic}
            userId={currentUser?.uid || 'default_trader'}
            idToken={idToken}
          />
        )}
      </main>

      {/* Terminal Footer */}
      <footer className="border-t border-slate-900 bg-[#080C12] px-6 py-3 text-xs text-slate-500 font-mono flex flex-wrap items-center justify-between gap-4">
        <div>
          ProbabilityEdge F&O Engine · Indian Derivatives Research & Paper-Trading Platform
        </div>
        <div className="flex items-center gap-4 text-[11px]">
          <span>Lot Sizes: NIFTY 25 · BANKNIFTY 15</span>
          <span>Brokerage: ₹20 Flat + STT</span>
          <span className="text-emerald-400 font-semibold">Strict Paper Mode</span>
        </div>
      </footer>
    </div>
  );
}
