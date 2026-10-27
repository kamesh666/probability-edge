# ProbabilityEdge F&O Engine — Implementation Plan

Institutional-grade quantitative research, backtesting, and paper-trading platform specialized for Indian index derivatives (NIFTY 50 and BANKNIFTY). Combines causal market structure analysis (BOS, CHoCH, pivots), 5 quantitative intraday strategies, Black-Scholes option pricing and Greeks, strict regulatory/risk controls, and an institutional dark terminal workspace.

---

### User Review & Critical Decisions

> [!IMPORTANT]
> The following architectural and user preferences were confirmed in Phase 1:
> - **Data Feed & Replay Mode**: Preloaded realistic NIFTY and BANKNIFTY 1-min/5-min historical data with interactive live playback controls (play, pause, speed, step-forward) and Angel One SmartAPI live/mock connection toggle.
> - **Execution Workflow**: Semi-automated workflow — real-time signal scanner flags confirmed candidate signals with complete risk calculation, and the trader approves with 1-click into the paper broker.
> - **Interface Style**: Institutional dark trading terminal (`#0B0F17` canvas, `#111827` panels) featuring interactive multi-pane candlestick charts, market structure overlays (HH/HL/LH/LL, BOS, CHoCH, S/R zones), option chains, and risk monitors.

---

## 1. Overview & Core Concept

**ProbabilityEdge** is an algorithmic and discretionary trading research platform designed specifically for the National Stock Exchange of India (NSE) Equity Derivatives segment. 

### Key Capabilities
- **Primary Instruments**: NIFTY 50 (`NIFTY`) and BANKNIFTY (`BANKNIFTY`) index options (Weekly/Monthly contracts, validated strike intervals and lot sizes).
- **Strict Distinction of States**:
  1. *Market Observation* (raw multi-timeframe candles and indicators)
  2. *Candidate Signal* (objective rule trigger detected)
  3. *Confirmed Signal* (completed candle confirmation, multi-timeframe alignment, and regime compatibility)
  4. *Risk-Approved Paper Order* (capital sizing, daily drawdown check, lot size validation)
  5. *Simulated Fill* (bid-ask spread and slippage applied at subsequent candle open)
  6. *Completed Trade & Post-Mortem* (P&L, brokerage, STT/exchange charges, journal logging).
- **Default Operating Mode**: 100% paper trading with persistent local storage. Live exchange order placement is strictly disabled.

---

## 2. User Experience & Visual Design

### Aesthetic Direction: Institutional Trading Terminal
Adheres to the universal frontend design constitution and SaaS/dashboard guidelines:
- **Canvas & Palette**: 60% deep obsidian canvas (`#0B0F17`), 30% structural panels (`#111827`, border `#1F2937`), 10% semantic accents (Bullish Emerald `#10B981`, Bearish Rose `#F43F5E`, Accent Indigo `#6366F1`, Warning Amber `#F59E0B`).
- **Typography & Tabular Discipline**: Monospace tabular numerals (`font-mono tabular-nums`) for all prices, strike prices, Greeks, quantities, timestamps, and P&L. Header brand text in crisp display sans (`Plus Jakarta Sans`).
- **Zero-Pill Restraint**: Information and statuses rendered as unboxed typography with dot separators (`NIFTY · 1m · ATM 24800 CE · Confirmed`), never bubbly capsules.
- **Top Bar Contract**: 3-zone layout with Wordmark ("PROBABILITYEDGE / F&O Engine"), navigation tabs, and primary action ("Playback Controller" / "Emergency Square-Off").

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│  PROBABILITYEDGE · F&O             Overview  Monitor  Scanner  Options  Strategies  Paper  Analytics  │
├──────────────────────────────────────┬──────────────────────────────────┬──────────────────────────────┤
│  MARKET MONITOR (NIFTY 50)           │  OPTION CHAIN (24800 ATM)        │  RISK & EXECUTION RADAR      │
│  [1m] [5m] [15m]  VWAP: 24,812.40    │  Strike   IV   Delta  Bid   Ask  │  Daily P&L: +₹12,450 (+1.2%) │
│  ── CANDLESTICK CHART ────────────── │  24750 CE 12.8 0.62   184   186  │  Max Risk / Trade: 0.5%      │
│  HH / HL / LH / LL + BOS / CHoCH     │  24800 CE 13.1 0.50   148   150  │  Trades Today: 2 / 3 Max     │
│  Dynamic Support & Resistance zones  │  24850 CE 13.6 0.38   112   114  │  Status: TRADING ALLOWED     │
│  Volume + RSI + ATR panel            │  ─────────────────────────────── │  ─────────────────────────── │
│  ─────────────────────────────────── │  24800 PE 13.2 -0.49  142   144  │  ACTIVE POSITIONS (1)        │
│  CONFIRMED STRATEGY SIGNALS (LIVE)   │  24750 PE 13.7 -0.37  108   110  │  BANKNIFTY 52200 PE (x30)    │
│  • Strategy C: 5m Pullback Cont. [CE]│  [Select Contract -> Order Plan] │  Entry: 285 | LTP: 312 (+₹810│
└──────────────────────────────────────┴──────────────────────────────────┴──────────────────────────────┘
```

### Core Navigation Views
1. **Overview**: Executive cockpit with daily P&L, regime indicator, active positions, risk meter, and latest alert.
2. **Market Monitor**: High-performance interactive candlestick chart with timeframe switcher (1m, 5m, 15m), structure markers, indicator toggles (VWAP, EMA 20/50, Bollinger Bands, ATR, RSI).
3. **Signal Scanner**: Multi-strategy real-time scanner scoring setups, showing feature breakdown, proposed stop/target, and 1-click "Approve Paper Order".
4. **Option Chain & Greeks**: Live matrix of Call/Put strikes around ATM with Black-Scholes IV, Delta, Gamma, Theta, Vega, OI, Volume, and payoff diagram.
5. **Strategy Lab**: Parameter configuration for all 5 strategies, backtest runner, sensitivity sliders, and rule explanations.
6. **Paper Trading Desk**: Active positions, pending orders, real-time tick simulator, stop/target adjustment, and execution log.
7. **Performance Analytics**: Equity curve, drawdown graph, win-rate breakdown by regime/strategy, profit factor, Sharpe ratio, and expectancy.
8. **Trade Journal & Audit Log**: Chronological trade logs with entry/exit reasoning, timestamps, slippage, and CSV export.
9. **Settings & Diagnostics**: Angel One SmartAPI credentials test, CSV historical data upload, synthetic data generator, and risk limit configuration.

---

## 3. Five Specialized Intraday Strategies

Each strategy operates strictly on **completed candles** to eradicate lookahead bias:

### Strategy A: One-Minute Comparative Divergence Breakout/Breakdown
- **Concept**: Compares index price action near key support/resistance against option premium dynamics.
- **Logic**: When index retests resistance with muted volume or exhaustion while ATM CALL premium surges (or vice-versa), flags momentum divergence.
- **Confirmation**: Requires a 1-minute close breaking the pivot level with volume expansion and liquidity filter check.

### Strategy B: One-Minute Range-Bound Failed-Breakout Reversal
- **Concept**: Exploits liquidity sweeps and false breakouts in consolidating markets.
- **Logic**: Identifies Range High, Range Low, and Midpoint. Detects a spike outside the range followed immediately by a completed candle closing back inside the range.
- **Risk/Reward**: Target 1 = Range Midpoint; Target 2 = Opposite boundary; Stop = Beyond the sweep wick + buffer. Minimum R:R = 1.5.

### Strategy C: Five-Minute Trend-Pullback Continuation
- **Concept**: Multi-timeframe trend following.
- **Logic**:
  - 15m: Directional bias (EMA 50 slope + HH/HL structure).
  - 5m: Orderly pullback to 20 EMA or broken resistance-turned-support without violating recent swing low.
  - 1m: Completed candle closing above local pullback high triggers entry.

### Strategy D: Five-Minute Trend-Reversal Setup
- **Concept**: Major swing turning points backed by structural breakdown.
- **Logic**: Identifies extended trend near session/daily extremes with RSI divergence, followed by a confirmed 5m Change of Character (CHoCH). 1m trigger executes in the direction of the new structure.

### Strategy E: BTST Research Module (Buy Today Sell Tomorrow)
- **Concept**: Explores 3:00 PM – 3:30 PM session close momentum with simulated overnight gap risk.
- **Safeguards**: Treats overnight gap as uncertain (stop-loss does not guarantee fill price on opening gap); applies overnight volatility haircut.

---

## 4. Technical Architecture & Engine Modules

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       PROBABILITYEDGE PLATFORM CORE                         │
├─────────────────────────────────────────────────────────────────────────────┤
│  DATA LAYER                                                                 │
│  ├─ Realistic Historical Generator (NIFTY & BANKNIFTY 1m/5m/15m OHLCV)     │
│  ├─ CSV Importer & Validator (Strict schema, monotonic timestamps)          │
│  └─ Angel One SmartAPI Adapter & Mock Provider                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  QUANTITATIVE ENGINE                                                        │
│  ├─ Market Structure: Swings (HH/HL/LH/LL), BOS, CHoCH, Dynamic S/R zones  │
│  ├─ Regime Classifier: TREND_UP, TREND_DOWN, RANGE, HIGH_VOL, TRANSITION   │
│  ├─ Option Engine: Black-Scholes Greeks (Delta, Gamma, Theta, Vega, IV)    │
│  └─ 5 Strategy Modules (A, B, C, D, E) with complete signal scoring         │
├─────────────────────────────────────────────────────────────────────────────┤
│  RISK & EXECUTION ENGINE                                                    │
│  ├─ Position Sizing: 0.5% account equity risk, validated lot sizes          │
│  ├─ Circuit Breakers: 2% daily loss limit, 3 max trades/day, cooldowns     │
│  ├─ Paper Broker: Limit/Market fills, slippage, brokerage + STT charges     │
│  └─ Local Storage Persistence: Positions, orders, journal, and state        │
├─────────────────────────────────────────────────────────────────────────────┤
│  BACKTESTING & ANALYTICS                                                    │
│  ├─ Event-driven chronological replay engine (No lookahead)                │
│  ├─ Performance Metrics: Win Rate, Profit Factor, Expectancy, Max Drawdown  │
│  └─ Walk-forward & regime-stratified analytics                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  STANDALONE PYTHON EXPORT & WINDOWS COMPATIBILITY                           │
│  ├─ Complete python package (`probabilityedge/`) with pytest test suite    │
│  └─ PowerShell CLI commands for local Windows/Linux quantitative deployment │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Risk Management Formula
For any approved option order:
$$\text{Risk Per Unit} = (\text{Entry Premium} - \text{Stop Premium}) \times \text{Lot Size}$$
$$\text{Max Lots} = \left\lfloor \frac{\text{Account Capital} \times \text{Max Risk \%}}{\text{Risk Per Unit} + \text{Estimated Charges Per Lot}} \right\rfloor$$
- Quantities are strictly enforced to integer multiples of exchange lot sizes:
  - `NIFTY`: 25 units per lot
  - `BANKNIFTY`: 15 units per lot
- Stops and Targets must be mathematically consistent (Stop < Entry < Target for CALL; Stop > Entry > Target for PUT).

---

## 5. Verification Plan

1. **Compilation & Type Checking**: Verify clean compilation using `compile_applet`.
2. **Market Structure Invariant Tests**:
   - Verify pivot high/low confirmation lag (no premature signals before candle close).
   - Test BOS vs CHoCH detection accuracy on benchmark synthetic trend series.
3. **Strategy Trigger Tests**:
   - Test all 5 strategies under synthetic market regimes.
   - Verify rejection of signals when R:R < 1.5 or daily loss limit is reached.
4. **Paper Trading Simulation**:
   - Execute sample paper trades, verify slippage and fee deduction (₹20 brokerage + STT).
   - Confirm position updates and P&L computation.
5. **Backtester Reproducibility**:
   - Run backtests across full sample dataset and verify identical metrics on repeated runs.
6. **Export & Documentation**:
   - Ensure clean PowerShell setup scripts and sample datasets.
