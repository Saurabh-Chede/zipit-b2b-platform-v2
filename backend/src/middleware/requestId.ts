import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../config/logger.ts';
import { sanitizeValue } from '../utils/sanitize.ts';

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.headers['x-request-id'];
  const requestId = typeof incomingId === 'string' && incomingId.trim() ? incomingId.trim() : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }

  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl.startsWith('/api')) {
      logger.info({
        requestId,
        module: 'http',
        action: `${req.method} ${req.originalUrl}`,
        meta: {
          statusCode: res.statusCode,
          durationMs: Date.now() - start,
        },
      });
    }
  });

  next();
}
