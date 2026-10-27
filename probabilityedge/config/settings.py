"""
ProbabilityEdge F&O Engine Configuration Settings
"""
from pydantic import BaseModel
import os

class AppSettings(BaseModel):
    app_name: str = "ProbabilityEdge F&O Engine"
    version: str = "1.0.0"
    mode: str = "PAPER_TRADING"
    default_instrument: str = "NIFTY"
    nifty_lot_size: int = 25
    banknifty_lot_size: int = 15

settings = AppSettings()
