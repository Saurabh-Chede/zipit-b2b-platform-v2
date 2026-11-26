import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../../models/User.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import { Transporter } from '../../models/Transporter.ts';
import { OtpPurpose } from '../../models/OtpVerification.ts';
import { runInTransaction } from '../../config/database.ts';
import { issueEmailOtp, verifyAndConsumeEmailOtp } from './otp.service.ts';
import { AppError } from '../../utils/AppError.ts';
import { UserRole } from '../../utils/constants.ts';
import { env } from '../../config/env.ts';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  ResetPasswordInput,
} from './auth.validator.ts';

export interface AuthSessionResult {
  token: string;
  csrfToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  };
  profile: unknown;
}

export async function loginUser(input: LoginInput): Promise<AuthSessionResult> {
  const user = await User.findOne({ email: input.email }).select('+passwordHash');
  if (!user) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  if (!user.isActive) {
    throw new AppError('Your account has been deactivated. Contact administrator.', 403, 'ACCOUNT_INACTIVE');
  }

  const passwordValid = await bcrypt.compare(input.password, user.passwordHash);
  if (!passwordValid) {
    throw new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      tokenVersion: user.tokenVersion ?? 0,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );

  const csrfToken = crypto.randomBytes(24).toString('hex');
  const profile = await getRoleProfile(user._id.toString(), user.role);

  return {
    token,
    csrfToken,
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
    },
    profile,
  };
}

export async function getRoleProfile(userId: string, role: UserRole): Promise<unknown> {
  if (role === UserRole.SELLER) {
    return SellerProfile.findOne({ userId }).lean();
  }
  if (role === UserRole.TRANSPORTER) {
    return Transporter.findOne({ userId }).lean();
  }
  return null;
}

export async function getCurrentUserContext(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) {
    throw new AppError('User account not found.', 404, 'USER_NOT_FOUND');
  }

  const profile = await getRoleProfile(user._id.toString(), user.role);
  return {
    user: {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
    },
    profile,
  };
}

export async function requestPasswordReset(input: ForgotPasswordInput) {
  const user = await User.findOne({ email: input.email }).lean();

  // Always return a generic 200 response for non-existent or inactive accounts to prevent email enumeration
  if (!user || !user.isActive) {
    return {
      email: input.email,
      expiresInMinutes: 10,
      deliveryMode: 'SMTP' as const,
    };
  }

  const otpResult = await issueEmailOtp({
    email: user.email,
    purpose: OtpPurpose.PASSWORD_RESET,
    recipientName: user.name,
  });

  return {
    email: user.email,
    expiresInMinutes: otpResult.expiresInMinutes,
    deliveryMode: otpResult.deliveryMode,
    ...(otpResult.sandboxOtp ? { sandboxOtp: otpResult.sandboxOtp } : {}),
  };
}

export async function resetPasswordWithOtp(input: ResetPasswordInput) {
  const user = await User.findOne({ email: input.email }).lean();
  if (!user) {
    throw new AppError(
      'Verification code is invalid or has expired. Please request a new OTP.',
      400,
      'INVALID_OR_EXPIRED_OTP'
    );
  }

  if (!user.isActive) {
    throw new AppError('Your account has been deactivated. Contact administrator.', 403, 'ACCOUNT_INACTIVE');
  }

  const passwordHash = await bcrypt.hash(input.newPassword, 10);

  await runInTransaction(async (session) => {
    await verifyAndConsumeEmailOtp(
      {
        email: input.email,
        purpose: OtpPurpose.PASSWORD_RESET,
        otp: input.otp,
      },
      session
    );

    await User.updateOne(
      { _id: user._id },
      {
        $set: {
          passwordHash,
          passwordChangedAt: new Date(),
        },
        $inc: {
          tokenVersion: 1,
        },
      },
      session ? { session } : undefined
    );
  });

  return {
    email: user.email,
  };
}

export async function changePassword(userId: string, input: ChangePasswordInput) {
  const user = await User.findById(userId).select('+passwordHash');
  if (!user) {
    throw new AppError('User account not found.', 404, 'USER_NOT_FOUND');
  }
  if (!user.isActive) {
    throw new AppError('Your account has been deactivated.', 403, 'ACCOUNT_INACTIVE');
  }

  const currentValid = await bcrypt.compare(input.currentPassword, user.passwordHash);
  if (!currentValid) {
    throw new AppError('Current password is incorrect.', 401, 'INVALID_CURRENT_PASSWORD');
  }

  if (input.currentPassword === input.newPassword) {
    throw new AppError(
      'New password must be different from your current password.',
      400,
      'SAME_PASSWORD'
    );
  }

  const newHash = await bcrypt.hash(input.newPassword, 10);
  const updated = await User.findByIdAndUpdate(
    user._id,
    {
      $set: {
        passwordHash: newHash,
        passwordChangedAt: new Date(),
      },
      $inc: {
        tokenVersion: 1,
      },
    },
    { returnDocument: 'after' }
  ).lean();

  const nextVersion = updated?.tokenVersion ?? (user.tokenVersion ?? 0) + 1;
  const token = jwt.sign(
    {
      userId: user._id.toString(),
      role: user.role,
      email: user.email,
      tokenVersion: nextVersion,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );
  const csrfToken = crypto.randomBytes(24).toString('hex');

  return {
    token,
    csrfToken,
    user: {
      id: user._id.toString(),
      email: user.email,
      role: user.role,
    },
  };
}


