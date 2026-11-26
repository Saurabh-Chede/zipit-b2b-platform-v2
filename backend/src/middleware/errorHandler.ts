import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import multer from 'multer';
import { AppError } from '../utils/AppError.ts';
import { logger, LogSeverity } from '../config/logger.ts';
import { env } from '../config/env.ts';
import { sendRealtimeAlert } from '../services/alerting.service.ts';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'ROUTE_NOT_FOUND'));
}

function shouldSuppressErrorAlert(req: Request, statusCode: number, errorCode: string): boolean {
  const path = req.originalUrl || req.url || '';
  // Never create feedback loops on the client error ingestion endpoint itself
  if (path.startsWith('/api/v1/alerts/client-error')) {
    return true;
  }
  // Unauthenticated initial page loads check GET /api/v1/auth/me which returns 401 AUTH_REQUIRED normally
  if (req.method === 'GET' && path.startsWith('/api/v1/auth/me') && statusCode === 401 && errorCode === 'AUTH_REQUIRED') {
    return true;
  }
  return false;
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const requestId = req.requestId || 'unknown-request-id';

  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'An unexpected error occurred. Please try again later.';
  let details: unknown = undefined;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;
    details = err.details;
  } else if (err instanceof ZodError) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = err.issues.map((i) => `${i.path.join('.') || 'field'}: ${i.message}`).join('; ');
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof multer.MulterError) {
    statusCode = 400;
    errorCode = err.code === 'LIMIT_FILE_SIZE' ? 'FILE_TOO_LARGE' : 'FILE_UPLOAD_ERROR';
    message =
      err.code === 'LIMIT_FILE_SIZE'
        ? 'Uploaded file exceeds the maximum allowed size of 5 MB.'
        : err.message;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    errorCode = 'DATABASE_VALIDATION_ERROR';
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join('; ');
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    errorCode = 'INVALID_IDENTIFIER';
    message = `Invalid identifier format for ${err.path}`;
  } else if (typeof err === 'object' && err !== null && 'code' in err && (err as { code: number }).code === 11000) {
    statusCode = 409;
    errorCode = 'DUPLICATE_RESOURCE';
    const keyPattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern;
    const fields = keyPattern ? Object.keys(keyPattern).join(', ') : 'resource';
    message = `A record with this ${fields} already exists.`;
  } else if (err instanceof Error && err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid authentication session. Please log in again.';
  } else if (err instanceof Error && err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Your session has expired. Please log in again.';
  } else if (err instanceof Error && (err.name === 'MongoNetworkError' || err.name === 'MongooseServerSelectionError')) {
    statusCode = 503;
    errorCode = 'DATABASE_UNAVAILABLE';
    message = 'Database service is temporarily unavailable. Please retry shortly.';
  } else if (err instanceof SyntaxError && 'body' in err) {
    statusCode = 400;
    errorCode = 'MALFORMED_JSON';
    message = 'Malformed JSON request payload.';
  }

  const severity = statusCode >= 500 ? LogSeverity.ERROR : LogSeverity.WARN;
  const rawErrorMessage = err instanceof Error ? err.message : message;

  logger[statusCode >= 500 ? 'error' : 'warn']({
    requestId,
    module: 'errorHandler',
    action: `${req.method} ${req.originalUrl}`,
    errorCode,
    errorMessage: rawErrorMessage,
    severity,
  });

  if (!shouldSuppressErrorAlert(req, statusCode, errorCode)) {
    void sendRealtimeAlert({
      source: 'BACKEND_API',
      severity: statusCode >= 500 ? 'ERROR' : 'WARN',
      errorCode,
      message: rawErrorMessage || message,
      route: req.originalUrl,
      method: req.method,
      statusCode,
      requestId,
      userId: req.user?.id,
      userRole: req.user?.role,
      stack: statusCode >= 500 && err instanceof Error ? err.stack : undefined,
    }).catch(() => undefined);
  }

  const payload: Record<string, unknown> = {
    success: false,
    message,
    errorCode,
    requestId,
  };

  if (details && !env.isProduction) {
    payload.details = details;
  }

  res.status(statusCode).json(payload);
}
