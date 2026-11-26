import crypto from 'crypto';
import type mongoose from 'mongoose';
import { OtpPurpose, OtpVerification } from '../../models/OtpVerification.ts';
import { env } from '../../config/env.ts';
import { sendOtpEmail } from '../../config/mailer.ts';
import { AppError } from '../../utils/AppError.ts';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const RESEND_COOLDOWN_MS = 30 * 1000;

function hashOtp(email: string, purpose: OtpPurpose, otp: string): string {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(`${purpose}:${email.toLowerCase().trim()}:${otp.trim()}`)
    .digest('hex');
}

function timingSafeHexEqual(expectedHex: string, actualHex: string): boolean {
  if (expectedHex.length !== actualHex.length) return false;
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(actualHex, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function issueEmailOtp(params: {
  email: string;
  purpose: OtpPurpose;
  recipientName?: string;
}) {
  const cleanEmail = params.email.toLowerCase().trim();
  const existing = await OtpVerification.findOne({
    email: cleanEmail,
    purpose: params.purpose,
  }).lean();

  if (
    env.isProduction &&
    existing &&
    !existing.consumedAt &&
    Date.now() - new Date(existing.lastSentAt).getTime() < RESEND_COOLDOWN_MS
  ) {
    throw new AppError(
      'Please wait 30 seconds before requesting a new verification code.',
      429,
      'OTP_RESEND_COOLDOWN'
    );
  }

  const otp = crypto.randomInt(100000, 1000000).toString();
  const otpHash = hashOtp(cleanEmail, params.purpose, otp);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS);

  await OtpVerification.findOneAndUpdate(
    { email: cleanEmail, purpose: params.purpose },
    {
      $set: {
        otpHash,
        attempts: 0,
        lastSentAt: now,
        expiresAt,
        consumedAt: null,
      },
      $inc: { resendCount: 1 },
    },
    { upsert: true, returnDocument: 'after' }
  );

  const mailResult = await sendOtpEmail({
    to: cleanEmail,
    otp,
    purpose: params.purpose,
    recipientName: params.recipientName,
  });

  return {
    deliveryMode: mailResult.deliveryMode,
    expiresInMinutes: 10,
    ...(mailResult.deliveryMode === 'SANDBOX' && !env.isProduction
      ? { sandboxOtp: otp }
      : {}),
  };
}

export async function verifyAndConsumeEmailOtp(
  params: {
    email: string;
    purpose: OtpPurpose;
    otp: string;
  },
  session?: mongoose.ClientSession | null
) {
  const cleanEmail = params.email.toLowerCase().trim();
  const cleanOtp = params.otp.trim();

  const record = await OtpVerification.findOne(
    { email: cleanEmail, purpose: params.purpose, consumedAt: null },
    null,
    session ? { session } : undefined
  ).lean();

  if (!record || new Date(record.expiresAt).getTime() <= Date.now()) {
    throw new AppError(
      'Verification code is invalid or has expired. Please request a new OTP.',
      400,
      'INVALID_OR_EXPIRED_OTP'
    );
  }

  if (record.attempts >= MAX_OTP_ATTEMPTS) {
    throw new AppError(
      'Too many invalid OTP attempts. Please request a fresh verification code.',
      429,
      'OTP_MAX_ATTEMPTS_EXCEEDED'
    );
  }

  const expectedHash = hashOtp(cleanEmail, params.purpose, cleanOtp);
  if (!timingSafeHexEqual(record.otpHash, expectedHash)) {
    // Persist failed attempt outside caller transaction so brute-force attempts count even on abort
    const updated = await OtpVerification.findOneAndUpdate(
      { _id: record._id },
      { $inc: { attempts: 1 } },
      { returnDocument: 'after' }
    ).lean();

    const attemptsNow = Number(updated?.attempts || record.attempts + 1);
    if (attemptsNow >= MAX_OTP_ATTEMPTS) {
      throw new AppError(
        'Too many invalid OTP attempts. Please request a fresh verification code.',
        429,
        'OTP_MAX_ATTEMPTS_EXCEEDED'
      );
    }

    const remaining = MAX_OTP_ATTEMPTS - attemptsNow;
    throw new AppError(
      `Invalid verification code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`,
      400,
      'INVALID_OTP'
    );
  }

  const consumed = await OtpVerification.findOneAndUpdate(
    {
      _id: record._id,
      consumedAt: null,
      attempts: { $lt: MAX_OTP_ATTEMPTS },
    },
    { $set: { consumedAt: new Date() } },
    {
      returnDocument: 'after',
      ...(session ? { session } : {}),
    }
  ).lean();

  if (!consumed) {
    throw new AppError(
      'Verification code has already been used. Please request a new OTP.',
      400,
      'INVALID_OR_EXPIRED_OTP'
    );
  }

  return consumed;
}
