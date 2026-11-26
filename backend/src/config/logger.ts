import pino from 'pino';
import { env } from './env.ts';

export enum LogSeverity {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  FATAL = 'FATAL',
}

const baseLogger = pino({
  level: env.isTest ? 'silent' : env.isProduction ? 'info' : 'debug',
  redact: {
    paths: [
      'password',
      'passwordHash',
      'token',
      'jwt',
      'secret',
      'cookie',
      'authorization',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.authorization',
      'req.headers.cookie',
      'req.headers.authorization',
    ],
    censor: '[REDACTED]',
  },
  formatters: {
    level(label) {
      return { severity: label.toUpperCase() };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export interface StructuredLogPayload {
  requestId?: string;
  module: string;
  action: string;
  errorCode?: string;
  errorMessage?: string;
  severity?: LogSeverity;
  meta?: Record<string, unknown>;
}

export const logger = {
  debug(payload: StructuredLogPayload) {
    baseLogger.debug({
      timestamp: new Date().toISOString(),
      ...payload,
      severity: payload.severity ?? LogSeverity.DEBUG,
    });
  },
  info(payload: StructuredLogPayload) {
    baseLogger.info({
      timestamp: new Date().toISOString(),
      ...payload,
      severity: payload.severity ?? LogSeverity.INFO,
    });
  },
  warn(payload: StructuredLogPayload) {
    baseLogger.warn({
      timestamp: new Date().toISOString(),
      ...payload,
      severity: payload.severity ?? LogSeverity.WARN,
    });
  },
  error(payload: StructuredLogPayload) {
    baseLogger.error({
      timestamp: new Date().toISOString(),
      ...payload,
      severity: payload.severity ?? LogSeverity.ERROR,
    });
  },
  fatal(payload: StructuredLogPayload) {
    baseLogger.fatal({
      timestamp: new Date().toISOString(),
      ...payload,
      severity: payload.severity ?? LogSeverity.FATAL,
    });
  },
};
