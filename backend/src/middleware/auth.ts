import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';
import { User } from '../models/User.ts';
import { AppError } from '../utils/AppError.ts';
import { UserRole } from '../utils/constants.ts';

export interface JwtPayload {
  userId: string;
  role: UserRole;
  email: string;
  tokenVersion?: number;
  iat?: number;
}

export interface AuthenticatedRequestUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isActive: boolean;
}

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthenticatedRequestUser;
      authMethod?: 'cookie' | 'bearer';
    }
  }
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;
    let authMethod: 'cookie' | 'bearer' | undefined;

    if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
      authMethod = 'bearer';
    } else if (req.cookies && typeof req.cookies.zipit_token === 'string') {
      token = req.cookies.zipit_token;
      authMethod = 'cookie';
    }

    if (!token) {
      return next(new AppError('Authentication required. Please log in.', 401, 'AUTH_REQUIRED'));
    }

    const decoded = jwt.verify(token, env.jwtSecret) as JwtPayload;
    const user = await User.findById(decoded.userId).lean();

    if (!user) {
      return next(new AppError('User account no longer exists.', 401, 'USER_NOT_FOUND'));
    }

    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact administrator.', 403, 'ACCOUNT_INACTIVE'));
    }

    if ((decoded.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      return next(
        new AppError(
          'Your password was recently changed. Please sign in again.',
          401,
          'SESSION_EXPIRED'
        )
      );
    }

    req.user = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    };
    req.authMethod = authMethod;

    next();
  } catch (err) {
    next(err);
  }
}
