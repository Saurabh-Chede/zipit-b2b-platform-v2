import type { CookieOptions, Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  changePassword,
  getCurrentUserContext,
  loginUser,
  requestPasswordReset,
  resetPasswordWithOtp,
} from './auth.service.ts';
import { logger } from '../../config/logger.ts';
import { env } from '../../config/env.ts';

function resolveCookieDomain(req: Request): string | undefined {
  const configured = env.cookieDomain.trim();
  if (!configured) return undefined;

  const host = (req.hostname || req.headers.host || '').split(':')[0].toLowerCase();
  const normalizedConfigured = configured.replace(/^\./, '').toLowerCase();

  // Only attach the configured domain when the request host belongs to that domain
  // (protects localhost / direct IP / preview URL tests from dropping cookies)
  if (!host || host === normalizedConfigured || host.endsWith(`.${normalizedConfigured}`)) {
    return configured;
  }
  return undefined;
}

export function getCookieOptions(req: Request, httpOnly: boolean): CookieOptions {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  const domain = resolveCookieDomain(req);

  let sameSite: 'lax' | 'none' | 'strict';
  if (env.cookieSameSite === 'auto') {
    if (!isHttps) {
      sameSite = 'lax';
    } else if (domain) {
      // Subdomains sharing a parent COOKIE_DOMAIN (e.g. app.zipit.in <-> api.zipit.in) are same-site;
      // Lax works reliably across Safari ITP/Chrome and provides stronger CSRF defense than None.
      sameSite = 'lax';
    } else {
      sameSite = 'none';
    }
  } else {
    sameSite = env.cookieSameSite;
  }

  const options: CookieOptions & { partitioned?: boolean } = {
    httpOnly,
    secure: sameSite === 'none' ? true : isHttps,
    sameSite,
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    ...(domain ? { domain } : {}),
  };

  if (sameSite === 'none' && options.secure) {
    options.partitioned = true;
  }

  return options;
}

export const loginController = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body);

  res.cookie('zipit_token', result.token, getCookieOptions(req, true));
  res.cookie('zipit_csrf', result.csrfToken, getCookieOptions(req, false));

  logger.info({
    requestId: req.requestId,
    module: 'auth',
    action: 'user_login',
    meta: { userId: result.user.id, role: result.user.role },
  });

  res.status(200).json({
    success: true,
    message: 'Logged in successfully',
    data: {
      token: result.token,
      user: result.user,
      profile: result.profile,
      csrfToken: result.csrfToken,
    },
  });
});

export const logoutController = asyncHandler(async (req: Request, res: Response) => {
  const clearAllVariants = (name: string, httpOnly: boolean) => {
    const baseOpts = getCookieOptions(req, httpOnly) as CookieOptions & { partitioned?: boolean };
    delete baseOpts.maxAge;
    res.clearCookie(name, baseOpts);

    // Also expire legacy unpartitioned cookies (previously set without Partitioned)
    if (baseOpts.partitioned) {
      const legacyOpts: CookieOptions = { ...baseOpts };
      delete (legacyOpts as CookieOptions & { partitioned?: boolean }).partitioned;
      res.clearCookie(name, legacyOpts);
    }

    // Also expire host-only variant if COOKIE_DOMAIN was configured
    if (baseOpts.domain) {
      const hostOnlyOpts: CookieOptions = { ...baseOpts };
      delete hostOnlyOpts.domain;
      res.clearCookie(name, hostOnlyOpts);
    }
  };

  clearAllVariants('zipit_token', true);
  clearAllVariants('zipit_csrf', false);

  logger.info({
    requestId: req.requestId,
    module: 'auth',
    action: 'user_logout',
    meta: { userId: req.user?.id },
  });

  res.status(200).json({
    success: true,
    message: 'Logged out successfully',
  });
});

export const meController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getCurrentUserContext(req.user!.id);
  res.status(200).json({
    success: true,
    data,
  });
});

export const forgotPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const data = await requestPasswordReset(req.body);
  logger.info({
    requestId: req.requestId,
    module: 'auth',
    action: 'password_reset_otp_requested',
    meta: { email: req.body.email },
  });
  res.status(200).json({
    success: true,
    message:
      'If an active account exists for this email, a 6-digit password reset OTP has been sent.',
    data,
  });
});

export const resetPasswordController = asyncHandler(async (req: Request, res: Response) => {
  const data = await resetPasswordWithOtp(req.body);
  logger.info({
    requestId: req.requestId,
    module: 'auth',
    action: 'password_reset_completed',
    meta: { email: data.email },
  });
  res.status(200).json({
    success: true,
    message: 'Password reset successfully. You can now sign in with your new password.',
    data,
  });
});

export const changePasswordController = asyncHandler(async (req: Request, res: Response) => {
  const result = await changePassword(req.user!.id, req.body);

  res.cookie('zipit_token', result.token, getCookieOptions(req, true));
  res.cookie('zipit_csrf', result.csrfToken, getCookieOptions(req, false));

  logger.info({
    requestId: req.requestId,
    module: 'auth',
    action: 'password_changed',
    meta: { userId: req.user!.id },
  });

  res.status(200).json({
    success: true,
    message: 'Password updated successfully. Other active sessions have been signed out.',
    data: {
      token: result.token,
      csrfToken: result.csrfToken,
    },
  });
});


