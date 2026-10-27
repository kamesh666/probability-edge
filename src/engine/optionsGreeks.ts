/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Instrument, OptionContract, OptionGreeks, OptionType } from '../types/market.ts';

// Standard normal cumulative distribution function (Abramowitz and Stegun approximation)
export function cdfNormal(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2.0);
  const t = 1.0 / (1.0 + p * absX);
  const erf = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * erf);
}

// Standard normal probability density function
export function pdfNormal(x: number): number {
  return (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * x * x);
}

/**
 * Calculates Black-Scholes Greeks and theoretical price
 * @param S Current Spot Price
 * @param K Strike Price
 * @param T Time to expiration in years (e.g. 5 days = 5 / 365)
 * @param r Risk-free interest rate (e.g. 0.07 for RBI repo rate 7%)
 * @param sigma Implied Volatility (e.g. 0.14 for 14%)
 * @param type 'CE' or 'PE'
 */
export function calculateBlackScholesGreeks(
  S: number,
  K: number,
  T: number,
  r: number = 0.07,
  sigma: number = 0.14,
  type: OptionType = 'CE'
): { price: number; greeks: OptionGreeks } {
  // Prevent zero/negative time to expiry
  const tSafe = Math.max(0.0001, T);
  const sigmaSafe = Math.max(0.01, sigma);

  const d1 = (Math.log(S / K) + (r + (sigmaSafe * sigmaSafe) / 2) * tSafe) / (sigmaSafe * Math.sqrt(tSafe));
  const d2 = d1 - sigmaSafe * Math.sqrt(tSafe);

  let price = 0;
  let delta = 0;

  if (type === 'CE') {
    price = S * cdfNormal(d1) - K * Math.exp(-r * tSafe) * cdfNormal(d2);
    delta = cdfNormal(d1);
  } else {
    price = K * Math.exp(-r * tSafe) * cdfNormal(-d2) - S * cdfNormal(-d1);
    delta = cdfNormal(d1) - 1;
  }

  // Gamma is identical for Call and Put
  const gamma = pdfNormal(d1) / (S * sigmaSafe * Math.sqrt(tSafe));

  // Theta (decay per calendar day)
  let thetaYearly = 0;
  if (type === 'CE') {
    thetaYearly = -(S * pdfNormal(d1) * sigmaSafe) / (2 * Math.sqrt(tSafe)) - r * K * Math.exp(-r * tSafe) * cdfNormal(d2);
  } else {
    thetaYearly = -(S * pdfNormal(d1) * sigmaSafe) / (2 * Math.sqrt(tSafe)) + r * K * Math.exp(-r * tSafe) * cdfNormal(-d2);
  }
  const theta = thetaYearly / 365;

  // Vega (change in price for 1 percentage point change in IV, e.g. 1% = 0.01)
  const vega = (S * Math.sqrt(tSafe) * pdfNormal(d1)) / 100;

  return {
    price: Math.max(0.05, price),
    greeks: {
      delta: Math.round(delta * 1000) / 1000,
      gamma: Math.round(gamma * 100000) / 100000,
      theta: Math.round(theta * 100) / 100,
      vega: Math.round(vega * 100) / 100,
      iv: Math.round(sigmaSafe * 1000) / 10,
    },
  };
}

/**
 * Solves for Implied Volatility from market price using Newton-Raphson
 */
export function impliedVolatility(
  marketPrice: number,
  S: number,
  K: number,
  T: number,
  r: number = 0.07,
  type: OptionType = 'CE'
): number {
  let sigma = 0.20; // Initial guess 20%
  const maxIterations = 50;
  const tolerance = 0.001;

  for (let i = 0; i < maxIterations; i++) {
    const { price, greeks } = calculateBlackScholesGreeks(S, K, T, r, sigma, type);
    const diff = price - marketPrice;
    if (Math.abs(diff) < tolerance) return sigma;

    const vega = Math.max(0.01, greeks.vega * 100); // unscaled vega
    sigma = sigma - diff / vega;

    if (sigma <= 0.01) sigma = 0.01;
    if (sigma >= 2.0) sigma = 2.0;
  }

  return sigma;
}

/**
 * Generates an active Option Chain matrix for NIFTY or BANKNIFTY
 */
export function generateOptionChain(
  underlying: Instrument,
  spotPrice: number,
  expiryDays: number = 3
): OptionContract[] {
  const contracts: OptionContract[] = [];
  const lotSize = underlying === 'NIFTY' ? 25 : 15;
  const strikeStep = underlying === 'NIFTY' ? 50 : 100;
  const T = expiryDays / 365;
  const baseIV = underlying === 'NIFTY' ? 0.135 : 0.165; // realistic India VIX levels

  const atmStrike = Math.round(spotPrice / strikeStep) * strikeStep;
  const strikeRange = 8; // 8 strikes above and 8 strikes below ATM

  for (let step = -strikeRange; step <= strikeRange; step++) {
    const strike = atmStrike + step * strikeStep;
    
    // Add IV skew / smile
    const moneynessRatio = strike / spotPrice;
    const skew = Math.abs(moneynessRatio - 1) * 0.15;
    const strikeIV = baseIV + skew;

    // CE
    const ce = calculateBlackScholesGreeks(spotPrice, strike, T, 0.07, strikeIV, 'CE');
    const ceSpread = Math.max(0.3, Math.round(ce.price * 0.01 * 10) / 10);
    const ceBid = Math.round((ce.price - ceSpread / 2) * 10) / 10;
    const ceAsk = Math.round((ce.price + ceSpread / 2) * 10) / 10;
    const ceMoneyness = strike < atmStrike ? 'ITM' : strike === atmStrike ? 'ATM' : 'OTM';

    contracts.push({
      symbol: `${underlying} ${strike} CE`,
      underlying,
      strike,
      optionType: 'CE',
      expiry: `Weekly (+${expiryDays}d)`,
      lotSize,
      ltp: Math.round(ce.price * 10) / 10,
      bid: Math.max(0.05, ceBid),
      ask: Math.max(0.1, ceAsk),
      spread: ceSpread,
      volume: Math.floor(Math.random() * 400000 + 100000),
      openInterest: Math.floor(Math.random() * 2500000 + 500000),
      greeks: ce.greeks,
      moneyness: ceMoneyness,
    });

    // PE
    const pe = calculateBlackScholesGreeks(spotPrice, strike, T, 0.07, strikeIV, 'PE');
    const peSpread = Math.max(0.3, Math.round(pe.price * 0.01 * 10) / 10);
    const peBid = Math.round((pe.price - peSpread / 2) * 10) / 10;
    const peAsk = Math.round((pe.price + peSpread / 2) * 10) / 10;
    const peMoneyness = strike > atmStrike ? 'ITM' : strike === atmStrike ? 'ATM' : 'OTM';

    contracts.push({
      symbol: `${underlying} ${strike} PE`,
      underlying,
      strike,
      optionType: 'PE',
      expiry: `Weekly (+${expiryDays}d)`,
      lotSize,
      ltp: Math.round(pe.price * 10) / 10,
      bid: Math.max(0.05, peBid),
      ask: Math.max(0.1, peAsk),
      spread: peSpread,
      volume: Math.floor(Math.random() * 400000 + 100000),
      openInterest: Math.floor(Math.random() * 2500000 + 500000),
      greeks: pe.greeks,
      moneyness: peMoneyness,
    });
  }

  return contracts;
}
