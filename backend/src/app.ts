import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import mongoose from 'mongoose';
import { env } from './config/env.ts';
import { AppError } from './utils/AppError.ts';
import { requestIdMiddleware } from './middleware/requestId.ts';
import { csrfProtection } from './middleware/csrf.ts';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.ts';
import { authRouter } from './modules/auth/auth.routes.ts';
import { sellersRouter } from './modules/sellers/sellers.routes.ts';
import { transportersRouter } from './modules/transporters/transporters.routes.ts';
import { transporterOpsRouter } from './modules/transporters/transporterOps.routes.ts';
import { routesRouter } from './modules/routes/routes.routes.ts';
import { pricingRouter } from './modules/pricing/pricing.routes.ts';
import { bookingsRouter } from './modules/bookings/bookings.routes.ts';
import { publicTrackingRouter, trackingRouter } from './modules/tracking/tracking.routes.ts';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.ts';
import { walletRouter } from './modules/wallet/wallet.routes.ts';
import { supportRouter } from './modules/support/support.routes.ts';
import { alertsRouter } from './modules/alerts/alerts.routes.ts';
import { notificationsRouter } from './modules/notifications/notifications.routes.ts';
import { kycRouter } from './modules/kyc/kyc.routes.ts';
import { paymentsRouter } from './modules/payments/payments.routes.ts';
import { settlementsRouter } from './modules/settlements/settlements.routes.ts';
import { platformConfigRouter } from './modules/platformConfig/platformConfig.routes.ts';
import { whatsappRouter } from './modules/whatsapp/whatsapp.routes.ts';

export function createApiApp() {
  const app = express();

  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false, // Vite dev scripts / inline module support in preview iframe
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || !env.isProduction) {
          callback(null, true);
          return;
        }
        const normalizedOrigin = origin.trim().replace(/\/+$/, '');
        if (normalizedOrigin !== '*' && env.corsOrigins.includes(normalizedOrigin)) {
          callback(null, true);
          return;
        }
        callback(new AppError('CORS origin not allowed', 403, 'CORS_ORIGIN_DENIED'));
      },
      credentials: true,
    })
  );

  app.use(
    express.json({
      limit: '1mb',
      verify(req, _res, buf) {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser(env.cookieSecret));
  app.use(requestIdMiddleware);

  const apiLimiter = rateLimit({
    windowMs: env.rateLimitWindowMs,
    max: env.isTest ? 5000 : env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      success: false,
      message: 'Rate limit exceeded. Please wait before sending more requests.',
      errorCode: 'RATE_LIMIT_EXCEEDED',
    },
  });

  app.use('/api', apiLimiter);
  app.use('/api', csrfProtection);

  const livenessHandler = (_req: express.Request, res: express.Response) => {
    res.status(200).json({
      success: true,
      service: 'zipit-b2b-transport',
      check: 'liveness',
      status: 'alive',
      mode: env.serveFrontend ? 'monolithic' : 'api-only',
      timestamp: new Date().toISOString(),
    });
  };

  app.get('/api/health', livenessHandler);
  app.get('/api/health/live', livenessHandler);

  app.get('/api/health/ready', async (_req, res) => {
    const readyState = mongoose.connection.readyState;
    if (readyState === 1 && mongoose.connection.db) {
      const start = performance.now();
      try {
        await mongoose.connection.db.admin().ping();
        const pingMs = Math.round((performance.now() - start) * 100) / 100;
        res.status(200).json({
          success: true,
          service: 'zipit-b2b-transport',
          check: 'readiness',
          status: 'ready',
          mode: env.serveFrontend ? 'monolithic' : 'api-only',
          database: {
            connected: true,
            pingMs,
          },
          timestamp: new Date().toISOString(),
        });
        return;
      } catch {
        // Fall through to 503 not_ready response below
      }
    }

    res.status(503).json({
      success: false,
      service: 'zipit-b2b-transport',
      check: 'readiness',
      status: 'not_ready',
      mode: env.serveFrontend ? 'monolithic' : 'api-only',
      database: {
        connected: false,
        readyState,
      },
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/sellers', sellersRouter);
  app.use('/api/v1/transporters', transportersRouter);
  app.use('/api/v1/transporter', transporterOpsRouter);
  app.use('/api/v1/routes', routesRouter);
  app.use('/api/v1/rates', pricingRouter);
  app.use('/api/v1/bookings', bookingsRouter);
  app.use('/api/v1/tracking', trackingRouter);
  app.use('/api/v1/public/tracking', publicTrackingRouter);
  app.use('/api/v1/dashboard', dashboardRouter);
  app.use('/api/v1/wallet', walletRouter);
  app.use('/api/v1/support', supportRouter);
  app.use('/api/v1/alerts', alertsRouter);
  app.use('/api/v1/notifications', notificationsRouter);
  app.use('/api/v1/kyc', kycRouter);
  app.use('/api/v1/payments', paymentsRouter);
  app.use('/api/v1/settlements', settlementsRouter);
  app.use('/api/v1/platform-config', platformConfigRouter);
  app.use('/api/v1/whatsapp', whatsappRouter);

  // API-scoped 404 handler (frontend SPA routes handled after Vite/static middleware)
  app.use('/api', notFoundHandler);

  return app;
}

export { errorHandler, notFoundHandler };
