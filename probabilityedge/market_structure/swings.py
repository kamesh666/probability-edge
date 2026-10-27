"""
Causal Swing Detection with Strict Confirmation Timing (No Lookahead Bias)
"""
from typing import List, Dict, Any

def detect_swings(candles: List[Dict[str, Any]], left_bars: int = 3, right_bars: int = 3) -> List[Dict[str, Any]]:
    swings = []
    n = len(candles)
    if n < left_bars + right_bars + 1:
        return swings

    for i in range(left_bars, n - right_bars):
        curr = candles[i]
        is_high = True
        is_low = True

        for j in range(1, left_bars + 1):
            if candles[i - j]["high"] >= curr["high"]:
                is_high = False
            if candles[i - j]["low"] <= curr["low"]:
                is_low = False

        for j in range(1, right_bars + 1):
            if candles[i + j]["high"] > curr["high"]:
                is_high = False
            if candles[i + j]["low"] < curr["low"]:
                is_low = False

        conf_idx = i + right_bars
        conf_time = candles[conf_idx]["time"]

        if is_high:
            swings.append({
                "index": i,
                "time": curr["time"],
                "price": curr["high"],
                "type": "HIGH",
                "confirmed_at_index": conf_idx,
                "confirmed_at_time": conf_time
            })
        elif is_low:
            swings.append({
                "index": i,
                "time": curr["time"],
                "price": curr["low"],
                "type": "LOW",
                "confirmed_at_index": conf_idx,
                "confirmed_at_time": conf_time
            })

    return swings
