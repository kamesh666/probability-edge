"""
Data Schemas and Validation for Market Candles and Contracts
"""
from pydantic import BaseModel, field_validator
from typing import Optional, Literal

class Candle(BaseModel):
    timestamp: str
    time: int
    open: float
    high: float
    low: float
    close: float
    volume: float

    @field_validator("high")
    @classmethod
    def validate_high(cls, v, info):
        if "open" in info.data and v < info.data["open"]:
            raise ValueError("High must be >= Open")
        return v

    @field_validator("low")
    @classmethod
    def validate_low(cls, v, info):
        if "open" in info.data and v > info.data["open"]:
            raise ValueError("Low must be <= Open")
        return v

class OptionContract(BaseModel):
    symbol: str
    underlying: Literal["NIFTY", "BANKNIFTY"]
    strike: float
    option_type: Literal["CE", "PE"]
    expiry: str
    lot_size: int
    ltp: float
    delta: float
    iv: float
