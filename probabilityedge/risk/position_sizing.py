"""
Position Sizing and Risk Validation Engine
"""
import math

def calculate_position_size(
    account_equity: float,
    entry_premium: float,
    stop_premium: float,
    lot_size: int,
    risk_pct: float = 0.5,
    estimated_cost_per_lot: float = 25.0
) -> dict:
    if stop_premium >= entry_premium:
        return {"approved": False, "lots": 0, "quantity": 0, "reason": "Stop must be below entry for long option"}

    permitted_risk = account_equity * (risk_pct / 100.0)
    risk_per_unit = entry_premium - stop_premium
    risk_per_lot = (risk_per_unit * lot_size) + estimated_cost_per_lot

    lots = math.floor(permitted_risk / risk_per_lot)
    if lots < 1:
        return {"approved": False, "lots": 0, "quantity": 0, "reason": f"Permitted risk {permitted_risk} insufficient for 1 lot"}

    quantity = lots * lot_size
    return {
        "approved": True,
        "lots": lots,
        "quantity": quantity,
        "permitted_risk": permitted_risk,
        "risk_per_unit": risk_per_unit,
        "capital_required": entry_premium * quantity
    }
