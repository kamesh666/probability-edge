/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { RiskConfig } from '../../types/market.ts';
import { AngelOneCredentials, parseAndValidateCSV, authenticateSmartApiWithBackend } from '../../data/marketDataService.ts';
import { fetchAngelOneConfigFromCloudSql, saveAngelOneConfigToCloudSql, SavedAngelOneSecrets } from '../../data/dbSyncService.ts';
import { Settings, Shield, UploadCloud, RefreshCw, Terminal, CheckCircle2, AlertTriangle, Key, Save, Database } from 'lucide-react';

interface DiagnosticsSettingsViewProps {
  riskConfig: RiskConfig;
  onUpdateRiskConfig: (cfg: RiskConfig) => void;
  onImportCSVData: (csvText: string) => { success: boolean; message: string };
  onRegenerateSyntheticData: (days: number, seed: number) => void;
  /** Signed-in Firebase uid; undefined when signed out. */
  userId?: string;
}

export const DiagnosticsSettingsView: React.FC<DiagnosticsSettingsViewProps> = ({
  riskConfig,
  onUpdateRiskConfig,
  onImportCSVData,
  onRegenerateSyntheticData,
  userId,
}) => {
  // Risk Config local state
  const [localRisk, setLocalRisk] = useState<RiskConfig>({ ...riskConfig });
  const [riskSaveMsg, setRiskSaveMsg] = useState<string>('');

  // Angel One local state
  const [angelCreds, setAngelCreds] = useState<AngelOneCredentials>({
    apiKey: '',
    clientCode: '',
    mpin: '',
    totpSecret: '',
    isConnected: false,
    isMockMode: true,
  });
  const [angelStatusMsg, setAngelStatusMsg] = useState<string>('Connected to Mock Market Feed');
  const [dbSaving, setDbSaving] = useState<boolean>(false);
  const [dbSaveSuccess, setDbSaveSuccess] = useState<string>('');
  // Which secrets are already stored on the server (their values are never sent back)
  const [savedSecrets, setSavedSecrets] = useState<SavedAngelOneSecrets>({ apiKey: false, mpin: false, totpSecret: false });

  // Load saved Angel One credentials from Cloud SQL on mount
  useEffect(() => {
    let mounted = true;
    if (!userId) {
      setSavedSecrets({ apiKey: false, mpin: false, totpSecret: false });
      return;
    }
    fetchAngelOneConfigFromCloudSql().then(res => {
      if (mounted && res.success && res.config) {
        setAngelCreds(prev => ({
          ...prev,
          ...res.config,
        }));
        if (res.saved) setSavedSecrets(res.saved);
        if (res.saved?.apiKey && res.config.clientCode) {
          setAngelStatusMsg(`Saved credentials found for ${res.config.clientCode}`);
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, [userId]);

  const handleSaveAngelDetails = async () => {
    if (!userId) {
      setDbSaveSuccess('Sign in to save credentials');
      return;
    }
    setDbSaving(true);
    setDbSaveSuccess('');
    const res = await saveAngelOneConfigToCloudSql(angelCreds);
    setDbSaving(false);
    if (res.success) {
      setSavedSecrets(prev => ({
        apiKey: prev.apiKey || Boolean(angelCreds.apiKey),
        mpin: prev.mpin || Boolean(angelCreds.mpin),
        totpSecret: prev.totpSecret || Boolean(angelCreds.totpSecret),
      }));
      // Clear typed secrets from memory once they are stored server-side
      setAngelCreds(prev => ({ ...prev, apiKey: '', mpin: '', totpSecret: '' }));
      setDbSaveSuccess('Saved to Cloud SQL');
      setTimeout(() => setDbSaveSuccess(''), 3000);
    } else {
      setDbSaveSuccess('Error saving details');
    }
  };

  // CSV import local state
  const [csvInput, setCsvInput] = useState<string>('');
  const [csvStatusMsg, setCsvStatusMsg] = useState<string>('');

  // Synthetic generation local state
  const [synthDays, setSynthDays] = useState<number>(3);
  const [synthSeed, setSynthSeed] = useState<number>(42);
  const [synthMsg, setSynthMsg] = useState<string>('');

  const handleSaveRisk = () => {
    onUpdateRiskConfig(localRisk);
    setRiskSaveMsg('Risk parameters updated successfully.');
    setTimeout(() => setRiskSaveMsg(''), 3000);
  };

  const handleTestAngelConnection = async () => {
    if (angelCreds.isMockMode) {
      setAngelStatusMsg('Mock Adapter Active: Synthetic Indian Market F&O tick generator running.');
      setAngelCreds(prev => ({ ...prev, isConnected: true }));
      return;
    }

    const hasApiKey = Boolean(angelCreds.apiKey) || savedSecrets.apiKey;
    const hasMpin = Boolean(angelCreds.mpin) || savedSecrets.mpin;
    if (!hasApiKey || !angelCreds.clientCode || !hasMpin) {
      setAngelStatusMsg('Error: API Key, Client Code, and MPIN are required for Live SmartAPI session.');
      setAngelCreds(prev => ({ ...prev, isConnected: false }));
      return;
    }

    setAngelStatusMsg('Connecting to Angel One SmartAPI endpoint via backend proxy...');
    const result = await authenticateSmartApiWithBackend(angelCreds);
    if (result.success) {
      setAngelCreds(prev => ({
        ...prev,
        isConnected: true,
        lastConnectedAt: new Date().toLocaleTimeString(),
      }));
      setAngelStatusMsg(result.message);
    } else {
      setAngelCreds(prev => ({ ...prev, isConnected: false }));
      setAngelStatusMsg(result.message);
    }
  };

  const handleImportCSV = () => {
    if (!csvInput.trim()) {
      setCsvStatusMsg('Please paste valid CSV contents.');
      return;
    }
    const res = onImportCSVData(csvInput);
    setCsvStatusMsg(res.message);
  };

  const handleRegenerate = () => {
    onRegenerateSyntheticData(synthDays, synthSeed);
    setSynthMsg(`Generated ${synthDays} days of clean intraday data with seed ${synthSeed}.`);
    setTimeout(() => setSynthMsg(''), 3000);
  };

  return (
    <div className="space-y-6">
      {/* 2-Column Grid: Angel One + Risk Rules */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Angel One SmartAPI Adapter */}
        <div className="p-5 bg-[#111827] border border-slate-800 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-400" />
              Angel One SmartAPI Gateway
            </h3>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">Mock Feed:</span>
              <button
                onClick={() => setAngelCreds(p => ({ ...p, isMockMode: !p.isMockMode }))}
                className={`w-10 h-5 flex items-center rounded-full p-1 transition-colors ${
                  angelCreds.isMockMode ? 'bg-indigo-600 justify-end' : 'bg-slate-700 justify-start'
                }`}
              >
                <div className="bg-white w-3 h-3 rounded-full shadow-md" />
              </button>
            </div>
          </div>

          <p className="text-xs text-slate-400">
            Configure authorized SmartAPI credentials for live market data feed, or use the built-in deterministic simulator.
          </p>

          <div className="space-y-3 font-mono text-xs">
            <div>
              <label className="text-slate-400 block mb-1">API Key</label>
              <input
                type="password"
                placeholder={angelCreds.isMockMode ? 'MOCK_FEED_ENABLED' : savedSecrets.apiKey ? 'Saved (leave blank to keep)' : 'Enter SmartAPI Key'}
                disabled={angelCreds.isMockMode}
                value={angelCreds.apiKey}
                onChange={e => setAngelCreds({ ...angelCreds, apiKey: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white disabled:opacity-50"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Client Code</label>
                <input
                  type="text"
                  placeholder={angelCreds.isMockMode ? 'MOCK_USER' : 'e.g. A123456'}
                  disabled={angelCreds.isMockMode}
                  value={angelCreds.clientCode}
                  onChange={e => setAngelCreds({ ...angelCreds, clientCode: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white disabled:opacity-50"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">MPIN</label>
                <input
                  type="password"
                  placeholder={savedSecrets.mpin ? 'Saved' : '••••'}
                  disabled={angelCreds.isMockMode}
                  value={angelCreds.mpin}
                  onChange={e => setAngelCreds({ ...angelCreds, mpin: e.target.value })}
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <label className="text-slate-400 block mb-1">TOTP 2FA Secret Key</label>
              <input
                type="password"
                placeholder={savedSecrets.totpSecret ? 'Saved (leave blank to keep)' : 'Authenticator TOTP Secret Key (Base32)'}
                disabled={angelCreds.isMockMode}
                value={angelCreds.totpSecret || ''}
                onChange={e => setAngelCreds({ ...angelCreds, totpSecret: e.target.value })}
                className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white disabled:opacity-50"
              />
            </div>

            <div className="pt-2 flex items-center justify-between border-t border-slate-800/80 mt-2">
              <div className="flex items-center gap-2">
                <span className={`text-xs ${angelCreds.isConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {angelStatusMsg}
                </span>
                {dbSaveSuccess && (
                  <span className="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/60 px-2 py-0.5 rounded">
                    {dbSaveSuccess}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveAngelDetails}
                  disabled={dbSaving}
                  className="px-3 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-sans text-xs transition-colors shrink-0 flex items-center gap-1.5 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  {dbSaving ? 'Saving...' : 'Save to DB'}
                </button>
                <button
                  type="button"
                  onClick={handleTestAngelConnection}
                  className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-white font-sans text-xs transition-colors shrink-0"
                >
                  Test Connection
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Risk Limits Configuration */}
        <div className="p-5 bg-[#111827] border border-slate-800 rounded-lg space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-400" />
              Risk Rules & Capital Governance
            </h3>
            {riskSaveMsg && <span className="text-xs text-emerald-400 font-mono">{riskSaveMsg}</span>}
          </div>

          <div className="space-y-3 font-mono text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Account Capital (INR)</label>
                <input
                  type="number"
                  value={localRisk.accountEquity}
                  onChange={e => setLocalRisk({ ...localRisk, accountEquity: parseFloat(e.target.value) || 500000 })}
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Risk Per Trade (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={localRisk.riskPerTradePct}
                  onChange={e => setLocalRisk({ ...localRisk, riskPerTradePct: parseFloat(e.target.value) || 0.5 })}
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-slate-400 block mb-1">Daily Loss Limit (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={localRisk.dailyLossLimitPct}
                  onChange={e => setLocalRisk({ ...localRisk, dailyLossLimitPct: parseFloat(e.target.value) || 2.0 })}
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Max Entries Per Day</label>
                <input
                  type="number"
                  value={localRisk.maxTradesPerDay}
                  onChange={e => setLocalRisk({ ...localRisk, maxTradesPerDay: parseInt(e.target.value) || 3 })}
                  className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white"
                />
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={handleSaveRisk}
                className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white font-sans text-xs font-semibold transition-colors"
              >
                Save Risk Parameters
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2-Column Grid: CSV Importer + Synthetic Generator */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* CSV Historical Data Import */}
        <div className="p-5 bg-[#111827] border border-slate-800 rounded-lg space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <UploadCloud className="w-4 h-4 text-indigo-400" />
            Historical CSV Data Ingestion
          </h3>

          <p className="text-xs text-slate-400">
            Paste OHLCV CSV records with columns: <code>timestamp, open, high, low, close, volume</code>.
          </p>

          <textarea
            rows={4}
            value={csvInput}
            onChange={e => setCsvInput(e.target.value)}
            placeholder="timestamp,open,high,low,close,volume&#10;2026-10-27 09:15:00,24800,24820,24790,24810,45000&#10;2026-10-27 09:16:00,24810,24835,24805,24830,52000"
            className="w-full bg-[#0B0F17] border border-slate-800 rounded p-3 text-xs font-mono text-slate-200"
          />

          <div className="flex items-center justify-between">
            <span className="text-xs font-mono text-indigo-400">{csvStatusMsg}</span>
            <button
              onClick={handleImportCSV}
              className="px-4 py-2 rounded bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
            >
              Parse & Validate CSV
            </button>
          </div>
        </div>

        {/* Synthetic Generator */}
        <div className="p-5 bg-[#111827] border border-slate-800 rounded-lg space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-indigo-400" />
            Synthetic Market Simulator Generator
          </h3>

          <p className="text-xs text-slate-400">
            Generates authentic Indian intraday session profiles (09:15 - 15:30 IST) with morning momentum, lunch consolidation, and closing auction moves.
          </p>

          <div className="grid grid-cols-2 gap-3 font-mono text-xs">
            <div>
              <label className="text-slate-400 block mb-1">Trading Days</label>
              <input
                type="number"
                min="1"
                max="10"
                value={synthDays}
                onChange={e => setSynthDays(parseInt(e.target.value) || 3)}
                className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white"
              />
            </div>
            <div>
              <label className="text-slate-400 block mb-1">Deterministic Seed</label>
              <input
                type="number"
                value={synthSeed}
                onChange={e => setSynthSeed(parseInt(e.target.value) || 42)}
                className="w-full bg-[#0B0F17] border border-slate-800 rounded px-3 py-1.5 text-white"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs font-mono text-emerald-400">{synthMsg}</span>
            <button
              onClick={handleRegenerate}
              className="px-4 py-2 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors"
            >
              Regenerate Market Dataset
            </button>
          </div>
        </div>
      </div>

      {/* Windows PowerShell CLI & Python Quant Engine Instructions */}
      <div className="p-5 bg-[#111827] border border-slate-800 rounded-lg space-y-4 font-mono text-xs">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 font-sans">
          <Terminal className="w-4 h-4 text-indigo-400" />
          Windows PowerShell & Python 3.12 Local Deployment Guide
        </h3>

        <div className="p-3 bg-[#0B0F17] border border-slate-800 rounded space-y-2 text-slate-300">
          <div className="text-indigo-400 font-bold"># 1. Setup Virtual Environment on Windows:</div>
          <div className="text-slate-400 bg-black/40 p-2 rounded">
            python -m venv .venv<br/>
            .\.venv\Scripts\Activate.ps1
          </div>

          <div className="text-indigo-400 font-bold mt-2"># 2. Install Required Quant & Testing Packages:</div>
          <div className="text-slate-400 bg-black/40 p-2 rounded">
            pip install numpy pandas pydantic pytest streamlit plotly
          </div>

          <div className="text-indigo-400 font-bold mt-2"># 3. Run Strategy Test Suite:</div>
          <div className="text-slate-400 bg-black/40 p-2 rounded">
            pytest -v tests/
          </div>

          <div className="text-indigo-400 font-bold mt-2"># 4. Launch Local Interactive Terminal:</div>
          <div className="text-slate-400 bg-black/40 p-2 rounded">
            streamlit run app.py
          </div>
        </div>
      </div>
    </div>
  );
};
