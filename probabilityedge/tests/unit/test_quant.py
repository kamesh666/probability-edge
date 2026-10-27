"""
Unit Tests for ProbabilityEdge Market Structure and Risk Management
Compatible with standard unittest and pytest.
"""
import unittest
from probabilityedge.market_structure.swings import detect_swings
from probabilityedge.risk.position_sizing import calculate_position_size

class TestProbabilityEdgeQuant(unittest.TestCase):
    def test_causal_swing_confirmation(self):
        candles = [
            {"time": 1000, "open": 100, "high": 102, "low": 99, "close": 101, "volume": 1000},
            {"time": 1060, "open": 101, "high": 105, "low": 100, "close": 104, "volume": 1200},
            {"time": 1120, "open": 104, "high": 110, "low": 103, "close": 109, "volume": 1500},
            {"time": 1180, "open": 109, "high": 120, "low": 108, "close": 118, "volume": 2500}, # Peak at index 3
            {"time": 1240, "open": 118, "high": 114, "low": 112, "close": 113, "volume": 1400},
            {"time": 1300, "open": 113, "high": 110, "low": 107, "close": 108, "volume": 1100}, # Right bar 2 closed at index 5
            {"time": 1360, "open": 108, "high": 109, "low": 105, "close": 106, "volume": 900},
        ]

        swings = detect_swings(candles, left_bars=2, right_bars=2)
        self.assertGreaterEqual(len(swings), 1)
        peak = [s for s in swings if s["type"] == "HIGH"][0]
        self.assertEqual(peak["index"], 3)
        self.assertEqual(peak["price"], 120)
        # Must be confirmed at index 3 + 2 = 5 (no lookahead!)
        self.assertEqual(peak["confirmed_at_index"], 5)
        self.assertEqual(peak["confirmed_at_time"], 1300)

    def test_position_sizing_lot_multiples(self):
        result = calculate_position_size(
            account_equity=500000.0,
            entry_premium=150.0,
            stop_premium=130.0,
            lot_size=25,
            risk_pct=0.5,
            estimated_cost_per_lot=25.0
        )
        self.assertTrue(result["approved"])
        self.assertEqual(result["lots"], 4)
        self.assertEqual(result["quantity"], 100)
        self.assertEqual(result["quantity"] % 25, 0)

    def test_position_sizing_rejection_invalid_stop(self):
        result = calculate_position_size(
            account_equity=500000.0,
            entry_premium=100.0,
            stop_premium=110.0,
            lot_size=25,
        )
        self.assertFalse(result["approved"])
        self.assertEqual(result["lots"], 0)

if __name__ == "__main__":
    unittest.main()
