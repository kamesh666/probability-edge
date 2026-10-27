# ProbabilityEdge F&O Engine

Institutional-grade quantitative research, backtesting, and paper-trading platform specialized for Indian index derivatives (NIFTY 50 and BANKNIFTY).

## Features
- **Causal Market Structure Engine**: Swings, Higher Highs/Lows, Break of Structure (BOS), Change of Character (CHoCH), Dynamic S/R zones.
- **5 Quantitative Intraday Strategies**:
  1. Strategy A: 1m Comparative Divergence Breakout
  2. Strategy B: 1m Range-Bound Failed-Breakout Reversal
  3. Strategy C: 5m Trend-Pullback Continuation
  4. Strategy D: 5m Structural Trend-Reversal
  5. Strategy E: BTST Research Module (Overnight Gap)
- **Black-Scholes Options Greeks & Matrix**: Delta, Gamma, Theta decay, Vega, Implied Volatility (IV).
- **Strict Risk Engine**: 0.5% max risk per trade, 2% daily loss circuit breaker, 3 trades max/day, lot size enforcement (NIFTY 25, BANKNIFTY 15).
- **Event-Driven Backtester**: Chronological event queue, zero lookahead bias, conservative same-bar stop assumption.

## Windows Setup & Usability (PowerShell)

### 1. Create and Activate Virtual Environment
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
```

### 2. Install Dependencies
```powershell
pip install -r probabilityedge/requirements.txt
```

### 3. Run Automated Unit Tests
```powershell
python -m unittest discover -s probabilityedge/tests/unit -p "test_*.py"
```

### 4. Default Operating Mode
Default mode is **PAPER TRADING ONLY**. Live order placement is strictly disabled.
