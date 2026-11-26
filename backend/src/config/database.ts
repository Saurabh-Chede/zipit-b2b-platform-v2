import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fs from 'fs';
import path from 'path';
import { env } from './env.ts';
import { logger, LogSeverity } from './logger.ts';
import { sendRealtimeAlert } from '../services/alerting.service.ts';

let memoryServer: MongoMemoryServer | null = null;
let isConnected = false;

mongoose.set('strictQuery', true);

mongoose.connection.on('disconnected', () => {
  isConnected = false;
  logger.warn({
    module: 'database',
    action: 'connection_disconnected',
    errorMessage: 'MongoDB connection lost. Attempting automatic reconnection if configured.',
  });
  if (!env.isTest) {
    void sendRealtimeAlert({
      source: 'DATABASE',
      severity: 'WARN',
      errorCode: 'DB_DISCONNECTED',
      message: 'MongoDB connection lost. Attempting automatic reconnection.',
    }).catch(() => undefined);
  }
});

mongoose.connection.on('reconnected', () => {
  isConnected = true;
  logger.info({
    module: 'database',
    action: 'connection_reconnected',
  });
});

mongoose.connection.on('error', (err) => {
  const errMsg = err instanceof Error ? err.message : 'Unknown MongoDB error';
  logger.error({
    module: 'database',
    action: 'connection_error',
    errorCode: 'DB_CONNECTION_ERROR',
    errorMessage: errMsg,
    severity: LogSeverity.ERROR,
  });
  if (!env.isTest) {
    void sendRealtimeAlert({
      source: 'DATABASE',
      severity: 'ERROR',
      errorCode: 'DB_CONNECTION_ERROR',
      message: errMsg,
      stack: err instanceof Error ? err.stack : undefined,
    }).catch(() => undefined);
  }
});

export async function connectDatabase(): Promise<string> {
  if (isConnected && mongoose.connection.readyState === 1) {
    return env.mongodbUri || memoryServer?.getUri() || '';
  }

  let uri = env.mongodbUri;

  if (!uri) {
    if (env.isProduction && !env.isTest) {
      throw new Error(
        'MONGODB_URI is required in production. Embedded MongoDB fallback is disabled in production mode.'
      );
    }
    if (env.isTest) {
      memoryServer = await MongoMemoryServer.create();
    } else {
      const dbPath = path.resolve(process.cwd(), '.data/mongodb');
      fs.mkdirSync(dbPath, { recursive: true });
      memoryServer = await MongoMemoryServer.create({
        instance: {
          dbPath,
          storageEngine: 'wiredTiger',
        },
      });
    }
    uri = memoryServer.getUri('zipit_b2b');
    logger.info({
      module: 'database',
      action: 'embedded_mongodb_started',
      meta: { mode: env.isTest ? 'ephemeral' : 'local-persistent' },
    });
  }

  const maxRetries = 3;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000,
        socketTimeoutMS: 45000,
        maxPoolSize: 20,
        minPoolSize: 2,
      });
      isConnected = true;
      logger.info({
        module: 'database',
        action: 'mongodb_connected',
        meta: { attempt },
      });
      return uri;
    } catch (err) {
      lastError = err;
      logger.warn({
        module: 'database',
        action: 'mongodb_connect_retry',
        errorCode: 'DB_CONNECT_RETRY',
        errorMessage: err instanceof Error ? err.message : 'Connection attempt failed',
        meta: { attempt, maxRetries },
      });
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }

  const fatalMsg = lastError instanceof Error ? lastError.message : 'Failed to connect to MongoDB';
  logger.fatal({
    module: 'database',
    action: 'mongodb_connect_failed',
    errorCode: 'DB_CONNECT_FATAL',
    errorMessage: fatalMsg,
    severity: LogSeverity.FATAL,
  });
  if (!env.isTest) {
    await sendRealtimeAlert({
      source: 'DATABASE',
      severity: 'FATAL',
      errorCode: 'DB_CONNECT_FATAL',
      message: fatalMsg,
      stack: lastError instanceof Error ? lastError.stack : undefined,
    }).catch(() => undefined);
  }
  throw lastError;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (memoryServer) {
    await memoryServer.stop();
    memoryServer = null;
  }
  isConnected = false;
  logger.info({
    module: 'database',
    action: 'mongodb_disconnected',
  });
}

/**
 * Executes an operation inside a MongoDB transaction when connected to a replica set,
 * or falls back cleanly on standalone MongoDB instances (such as single-node local dev).
 */
export async function runInTransaction<T>(
  work: (session: mongoose.ClientSession | null) => Promise<T>
): Promise<T> {
  const topology = (mongoose.connection as unknown as { client?: { topology?: { description?: { type?: string } } } })
    .client?.topology?.description?.type;
  const supportsTransactions = topology === 'ReplicaSetWithPrimary' || topology === 'Sharded';

  if (!supportsTransactions) {
    return work(null);
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
