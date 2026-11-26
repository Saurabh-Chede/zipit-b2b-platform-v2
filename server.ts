import express from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { env } from './backend/src/config/env.ts';
import { connectDatabase, disconnectDatabase } from './backend/src/config/database.ts';
import { logger } from './backend/src/config/logger.ts';
import { createApiApp, errorHandler, notFoundHandler } from './backend/src/app.ts';
import { seedDatabase } from './backend/src/seeds/seedData.ts';
import { sendRealtimeAlert } from './backend/src/services/alerting.service.ts';
import {
  attachNotificationWebSocketServer,
  closeNotificationWebSocketServer,
} from './backend/src/services/notificationRealtime.ts';

async function bootstrap() {
  await connectDatabase();

  if (env.seedOnStartup && !env.isTest) {
    await seedDatabase(false);
  }

  const app = createApiApp();

  if (!env.isProduction) {
    if (env.serveFrontend) {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      app.get('/', (_req, res) => {
        res.status(200).json({
          success: true,
          service: 'zipit-b2b-transport-api',
          mode: 'api-only',
          liveness: '/api/health',
          readiness: '/api/health/ready',
        });
      });
      app.use(notFoundHandler);
    }
  } else if (env.serveFrontend) {
    const distDir = path.resolve(process.cwd(), 'dist');
    const indexHtmlPath = path.join(distDir, 'index.html');
    if (!fs.existsSync(indexHtmlPath)) {
      throw new Error(
        'SERVE_FRONTEND is enabled, but dist/index.html was not found. Run "npm run build" or set SERVE_FRONTEND="false" for backend-only deployment.'
      );
    }
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(indexHtmlPath);
    });
  } else {
    app.get('/', (_req, res) => {
      res.status(200).json({
        success: true,
        service: 'zipit-b2b-transport-api',
        mode: 'api-only',
        liveness: '/api/health',
        readiness: '/api/health/ready',
      });
    });
    app.use(notFoundHandler);
  }

  app.use(errorHandler);

  const server = app.listen(env.port, '0.0.0.0', () => {
    logger.info({
      module: 'server',
      action: 'server_started',
      meta: {
        port: env.port,
        env: env.nodeEnv,
        mode: env.serveFrontend ? 'monolithic' : 'api-only',
      },
    });
    console.log(
      `ZIPIT B2B Transport server (${env.serveFrontend ? 'monolithic' : 'api-only'}) listening on http://0.0.0.0:${env.port}`
    );
  });

  attachNotificationWebSocketServer(server);

  const shutdown = async (signal: string) => {
    logger.info({ module: 'server', action: 'shutdown_initiated', meta: { signal } });
    closeNotificationWebSocketServer();
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    const errMsg = reason instanceof Error ? reason.message : String(reason);
    logger.fatal({
      module: 'server',
      action: 'unhandled_rejection',
      errorCode: 'UNHANDLED_REJECTION',
      errorMessage: errMsg,
    });
    void sendRealtimeAlert({
      source: 'PROCESS',
      severity: 'FATAL',
      errorCode: 'UNHANDLED_REJECTION',
      message: errMsg,
      stack: reason instanceof Error ? reason.stack : undefined,
    }).catch(() => undefined);
  });

  process.on('uncaughtException', (err) => {
    logger.fatal({
      module: 'server',
      action: 'uncaught_exception',
      errorCode: 'UNCAUGHT_EXCEPTION',
      errorMessage: err.message,
    });
    void sendRealtimeAlert({
      source: 'PROCESS',
      severity: 'FATAL',
      errorCode: 'UNCAUGHT_EXCEPTION',
      message: err.message,
      stack: err.stack,
    })
      .catch(() => undefined)
      .finally(() => {
        setTimeout(() => process.exit(1), 500);
      });
  });
}

bootstrap().catch(async (err) => {
  console.error('Fatal server startup error:', err);
  await sendRealtimeAlert({
    source: 'PROCESS',
    severity: 'FATAL',
    errorCode: 'SERVER_BOOTSTRAP_FAILED',
    message: err instanceof Error ? err.message : 'Fatal server startup error',
    stack: err instanceof Error ? err.stack : undefined,
  }).catch(() => undefined);
  process.exit(1);
});
