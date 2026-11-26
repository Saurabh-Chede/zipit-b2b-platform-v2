import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  changePasswordController,
  forgotPasswordController,
  loginController,
  logoutController,
  meController,
  resetPasswordController,
} from './auth.controller.ts';
import { validateRequest } from '../../middleware/validate.ts';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
} from './auth.validator.ts';
import { authenticate } from '../../middleware/auth.ts';
import { env } from '../../config/env.ts';

const authRouter = Router();

const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 200 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts. Please wait 15 minutes before retrying.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  },
});

const otpRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.isTest ? 200 : 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many OTP requests. Please wait 15 minutes before retrying.',
    errorCode: 'RATE_LIMIT_EXCEEDED',
  },
});

authRouter.post('/login', loginRateLimiter, validateRequest({ body: loginSchema }), loginController);
authRouter.post('/logout', logoutController);
authRouter.get('/me', authenticate, meController);
authRouter.post(
  '/forgot-password',
  otpRateLimiter,
  validateRequest({ body: forgotPasswordSchema }),
  forgotPasswordController
);
authRouter.post(
  '/reset-password',
  otpRateLimiter,
  validateRequest({ body: resetPasswordSchema }),
  resetPasswordController
);
authRouter.post(
  '/change-password',
  authenticate,
  validateRequest({ body: changePasswordSchema }),
  changePasswordController
);

export { authRouter };
