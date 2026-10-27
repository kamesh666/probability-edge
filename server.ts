/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { optionalAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  insertTradeRecord,
  getTradeRecordsByUser,
  updateTradeRecordNotes,
  upsertAngelOneConfig,
  getAngelOneConfigByUser,
  getOrCreateUser,
} from './src/db/queries.ts';

import {
  getLiveQuote,
  getLiveCandles,
  getIndianMarketStatus,
  authenticateAngelOne,
} from './src/server/marketDataFeed.ts';
import { Instrument } from './src/types/market.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  app.use(express.json({ limit: '10mb' }));

  // --- API Endpoints ---

  // Health & Market Status
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const market = getIndianMarketStatus();
      res.json({
        status: 'ok',
        platform: 'ProbabilityEdge F&O Engine',
        mode: 'PAPER_TRADING_ONLY',
        database: 'Cloud SQL PostgreSQL',
        market,
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({ status: 'error', message: 'Health check failed' });
    }
  });

  // Live Market Status (IST Time and NSE Open/Closed state)
  app.get('/api/market/status', async (_req: Request, res: Response) => {
    try {
      const status = getIndianMarketStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to retrieve market status' });
    }
  });

  // Live Market Quote (Real-time spot price, day high/low, change %)
  app.get('/api/market/quote', async (req: Request, res: Response) => {
    try {
      const symbolParam = (req.query.symbol as string)?.toUpperCase();
      const instrument: Instrument = symbolParam === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY';
      const quote = await getLiveQuote(instrument);
      res.json(quote);
    } catch (err: any) {
      console.error('API /api/market/quote error:', err);
      res.status(500).json({ error: 'Failed to fetch live market quote' });
    }
  });

  // Live Intraday Candles (Real 1m candles for today's session)
  app.get('/api/market/candles', async (req: Request, res: Response) => {
    try {
      const symbolParam = (req.query.symbol as string)?.toUpperCase();
      const instrument: Instrument = symbolParam === 'BANKNIFTY' ? 'BANKNIFTY' : 'NIFTY';
      const candles = await getLiveCandles(instrument);
      res.json({
        symbol: instrument,
        count: candles.length,
        candles,
      });
    } catch (err: any) {
      console.error('API /api/market/candles error:', err);
      res.status(500).json({ error: 'Failed to fetch live candles' });
    }
  });

  // Angel One SmartAPI: Authenticate & Generate Session
  app.post('/api/angel-one/authenticate', async (req: Request, res: Response) => {
    try {
      const { apiKey, clientCode, mpin, totpSecret } = req.body || {};
      const result = await authenticateAngelOne({ apiKey, clientCode, mpin, totpSecret });
      res.json(result);
    } catch (err: any) {
      console.error('API /api/angel-one/authenticate error:', err);
      res.status(500).json({ success: false, message: 'Authentication handshake failed' });
    }
  });

  // Trades: Get trade records for user
  app.get('/api/trades', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid || 'default_trader';
      const records = await getTradeRecordsByUser(userId);
      res.json(records);
    } catch (err: any) {
      console.error('API /api/trades GET error:', err);
      res.status(500).json({ error: 'Failed to fetch trade records' });
    }
  });

  // Trades: Insert new trade record
  app.post('/api/trades', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid || 'default_trader';
      const userEmail = (req.user as any)?.email || 'trader@probabilityedge.local';

      // Ensure user entry exists
      try {
        await getOrCreateUser(userId, userEmail);
      } catch (uErr) {
        // Non-blocking for trade recording
        console.warn('Could not sync user profile:', uErr);
      }

      const input = req.body;
      if (!input || !input.tradeId || !input.symbol) {
        return res.status(400).json({ error: 'Missing required trade details' });
      }

      const saved = await insertTradeRecord(userId, input);
      res.status(201).json({ success: true, trade: saved });
    } catch (err: any) {
      console.error('API /api/trades POST error:', err);
      res.status(500).json({ error: 'Failed to save trade record' });
    }
  });

  // Trades: Update journal note for a trade
  app.patch('/api/trades/:id/notes', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid || 'default_trader';
      const tradeId = req.params.id;
      const { notes } = req.body;

      const updated = await updateTradeRecordNotes(userId, tradeId, notes ?? '');
      res.json({ success: true, trade: updated });
    } catch (err: any) {
      console.error('API /api/trades/:id/notes PATCH error:', err);
      res.status(500).json({ error: 'Failed to update trade note' });
    }
  });

  // Angel One: Get credentials & settings
  app.get('/api/angel-one', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid || 'default_trader';
      const config = await getAngelOneConfigByUser(userId);
      res.json(config || null);
    } catch (err: any) {
      console.error('API /api/angel-one GET error:', err);
      res.status(500).json({ error: 'Failed to retrieve Angel One configuration' });
    }
  });

  // Angel One: Save or update credentials & settings
  app.post('/api/angel-one', optionalAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.uid || 'default_trader';
      const userEmail = (req.user as any)?.email || 'trader@probabilityedge.local';

      try {
        await getOrCreateUser(userId, userEmail);
      } catch (uErr) {
        console.warn('Could not sync user profile:', uErr);
      }

      const config = req.body;
      const saved = await upsertAngelOneConfig(userId, config);
      res.json({ success: true, config: saved });
    } catch (err: any) {
      console.error('API /api/angel-one POST error:', err);
      res.status(500).json({ error: 'Failed to save Angel One configuration' });
    }
  });

  // --- Frontend Serving / Vite Dev Middleware ---
  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[ProbabilityEdge] Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
