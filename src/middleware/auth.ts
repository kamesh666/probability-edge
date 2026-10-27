/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { DecodedIdToken } from 'firebase-admin/auth';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

/**
 * Requires a verified Firebase ID token in the Authorization header.
 * The user identity comes only from the verified token, never from
 * client-supplied headers or query parameters.
 */
export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    req.user = await adminAuth.verifyIdToken(token);
    next();
  } catch (error) {
    console.warn('Firebase ID token verification failed:', (error as Error)?.message);
    return res.status(401).json({ error: 'Unauthorized: Invalid token' });
  }
};
