import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF protection tailored for HTTP-only cookie authentication:
 * - Safe HTTP methods pass through.
 * - Requests authenticated via cookie must carry either the double-submit
 *   X-CSRF-Token header matching the zipit_csrf cookie OR the custom
 *   X-Requested-With: XMLHttpRequest header (blocked on cross-origin simple forms).
 */
export function csrfProtection(req: Request, _res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  // Explicit Authorization: Bearer requests are non-ambient and immune to cookie CSRF
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    return next();
  }

  // Only enforce when cookie auth is present on state-changing routes
  const hasAuthCookie = Boolean(req.cookies?.zipit_token);
  if (!hasAuthCookie) {
    return next();
  }

  const csrfCookie = req.cookies?.zipit_csrf;
  const csrfHeader = req.headers['x-csrf-token'];
  const requestedWith = req.headers['x-requested-with'];

  const validDoubleSubmit =
    typeof csrfCookie === 'string' &&
    csrfCookie.length > 0 &&
    typeof csrfHeader === 'string' &&
    csrfHeader === csrfCookie;

  const validCustomHeader = requestedWith === 'XMLHttpRequest';

  if (!validDoubleSubmit && !validCustomHeader) {
    return next(new AppError('Invalid or missing CSRF verification token.', 403, 'CSRF_VALIDATION_FAILED'));
  }

  next();
}
