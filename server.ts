/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express, { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import {
  insertTradeRecord,
  getTradeRecordsByUser,
  updateTradeRecordNotes,
  upsertAngelOneConfig,
  getAngelOneConfigByUser,
  getOrCreateUser,
  toAngelOneConfigSummary,
} from './src/db/queries.ts';

import {
  getLiveQuote,
  getLiveCandles,
  getIndianMarketStatus,
  authenticateAngelOne,
} from './src/server/marketDataFeed.ts';
import { Instrument } from './src/types/market.ts';

dotenv.config();

// Make sure a users row exists for the signed-in user. Failure here should not block the request.
async function syncUserProfile(req: AuthRequest) {
  const user = req.user;
  if (!user) return;
  try {
    await getOrCreateUser(user.uid, user.email || `${user.uid}@users.probabilityedge.local`);
  } catch (err) {
    console.warn('Could not sync user profile:', err);
  }
}

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

  // Angel One SmartAPI: Authenticate & Generate Session.
  // Any field left blank falls back to the credential saved for this user.
  // Session tokens are stored server-side and never returned to the browser.
  app.post('/api/angel-one/authenticate', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      const body = req.body || {};
      const pick = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
      const stored = await getAngelOneConfigByUser(userId);

      const result = await authenticateAngelOne({
        apiKey: pick(body.apiKey) ?? stored?.apiKey ?? '',
        clientCode: pick(body.clientCode) ?? stored?.clientCode ?? '',
        mpin: pick(body.mpin) ?? stored?.mpin ?? '',
        totpSecret: pick(body.totpSecret) ?? stored?.totpSecret ?? undefined,
      });

      if (result.success && stored) {
        await upsertAngelOneConfig(userId, {
          jwtToken: result.jwtToken,
          feedToken: result.feedToken,
          lastConnectedAt: result.sessionTime ?? new Date(),
        });
      }

      res.json({
        success: result.success,
        message: result.message,
        sessionTime: result.sessionTime,
      });
    } catch (err: any) {
      console.error('API /api/angel-one/authenticate error:', err);
      res.status(500).json({ success: false, message: 'Authentication handshake failed' });
    }
  });

  // Trades: Get trade records for the signed-in user
  app.get('/api/trades', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const records = await getTradeRecordsByUser(req.user!.uid);
      res.json(records);
    } catch (err: any) {
      console.error('API /api/trades GET error:', err);
      res.status(500).json({ error: 'Failed to fetch trade records' });
    }
  });

  // Trades: Insert new trade record for the signed-in user
  app.post('/api/trades', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      await syncUserProfile(req);

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

  // Trades: Update journal note on a trade the signed-in user owns
  app.patch('/api/trades/:id/notes', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const notes = req.body?.notes;
      if (notes != null && typeof notes !== 'string') {
        return res.status(400).json({ error: 'Notes must be a string' });
      }

      const updated = await updateTradeRecordNotes(req.user!.uid, req.params.id, notes ?? '');
      if (!updated) {
        return res.status(404).json({ error: 'Trade not found' });
      }
      res.json({ success: true, trade: updated });
    } catch (err: any) {
      console.error('API /api/trades/:id/notes PATCH error:', err);
      res.status(500).json({ error: 'Failed to update trade note' });
    }
  });

  // Angel One: Get saved settings (secrets are reported as saved/not saved, never returned)
  app.get('/api/angel-one', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const config = await getAngelOneConfigByUser(req.user!.uid);
      res.json(toAngelOneConfigSummary(config));
    } catch (err: any) {
      console.error('API /api/angel-one GET error:', err);
      res.status(500).json({ error: 'Failed to retrieve Angel One configuration' });
    }
  });

  // Angel One: Save or update credentials & settings.
  // Session tokens are server-managed and cannot be set from the client.
  app.post('/api/angel-one', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user!.uid;
      await syncUserProfile(req);

      const body = req.body || {};
      const str = (v: unknown) => (typeof v === 'string' ? v : undefined);
      const saved = await upsertAngelOneConfig(userId, {
        apiKey: str(body.apiKey),
        clientCode: str(body.clientCode),
        mpin: str(body.mpin),
        totpSecret: str(body.totpSecret),
        isMockMode: typeof body.isMockMode === 'boolean' ? body.isMockMode : undefined,
      });
      res.json({ success: true, config: toAngelOneConfigSummary(saved) });
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
