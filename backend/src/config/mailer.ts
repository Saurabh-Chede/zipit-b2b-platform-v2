import nodemailer from 'nodemailer';
import { env } from './env.ts';
import { logger } from './logger.ts';
import { AppError } from '../utils/AppError.ts';

function getSmtpSettings() {
  const host = (process.env.SMTP_HOST || env.smtpHost || '').trim();
  const port = Number(process.env.SMTP_PORT || env.smtpPort || 587);
  const secure =
    process.env.SMTP_SECURE !== undefined
      ? process.env.SMTP_SECURE === 'true'
      : env.smtpSecure;
  const user = (process.env.SMTP_USER || env.smtpUser || '').trim();
  const pass = (process.env.SMTP_PASS || env.smtpPass || '').trim();
  const from = (process.env.SMTP_FROM || env.smtpFrom || 'ZIPIT B2B Transport <noreply@zipit.in>').trim();

  const validHost = host && !host.startsWith('CHANGE_ME') ? host : '';
  const validUser = user && !user.startsWith('CHANGE_ME') ? user : '';
  const validPass = pass && !pass.startsWith('CHANGE_ME') ? pass : '';

  return {
    configured: Boolean(validHost && validUser && validPass),
    host: validHost,
    port,
    secure,
    user: validUser,
    pass: validPass,
    from,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isSmtpConfigured(): boolean {
  return getSmtpSettings().configured;
}

export async function sendOtpEmail(params: {
  to: string;
  otp: string;
  purpose: 'SIGNUP_EMAIL' | 'PASSWORD_RESET';
  recipientName?: string;
}): Promise<{ deliveryMode: 'SMTP' | 'SANDBOX' }> {
  const smtp = getSmtpSettings();
  const safeName = escapeHtml(params.recipientName || 'Partner');
  const safeOtp = escapeHtml(params.otp);

  const isSignup = params.purpose === 'SIGNUP_EMAIL';
  const subject = isSignup
    ? 'ZIPIT B2B — Verify Your Email Address (OTP)'
    : 'ZIPIT B2B — Password Reset Verification Code';

  const heading = isSignup
    ? 'Verify Your Business Email'
    : 'Reset Your Account Password';

  const intro = isSignup
    ? 'Use the 6-digit verification code below to complete your B2B Seller registration on ZIPIT B2B Transport.'
    : 'We received a request to reset your ZIPIT B2B Transport account password. Enter the 6-digit verification code below to set a new password.';

  const textBody = `${heading}\n\nHello ${params.recipientName || 'Partner'},\n\n${intro}\n\nVerification Code: ${params.otp}\n\nThis code expires in 10 minutes. Never share this code with anyone.\nIf you did not request this, please ignore this email.`;

  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #0f172a; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px;">
      <p style="margin: 0 0 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.06em; color: #2563eb; text-transform: uppercase;">ZIPIT B2B Transport</p>
      <h2 style="margin: 0 0 12px; font-size: 20px; font-weight: 700; color: #0f172a;">${heading}</h2>
      <p style="margin: 0 0 16px; font-size: 14px; line-height: 1.5; color: #475569;">Hello ${safeName},</p>
      <p style="margin: 0 0 20px; font-size: 14px; line-height: 1.5; color: #475569;">${intro}</p>
      <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 16px; text-align: center; margin-bottom: 20px;">
        <span style="font-family: 'Courier New', monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">${safeOtp}</span>
      </div>
      <p style="margin: 0; font-size: 12px; color: #64748b;">This OTP expires in <strong>10 minutes</strong>. Do not share this code with anyone.</p>
    </div>
  `;

  if (!smtp.configured) {
    if (env.isProduction) {
      throw new AppError(
        'Email delivery service is not configured on the server (set SMTP_HOST, SMTP_USER, SMTP_PASS).',
        503,
        'EMAIL_SERVICE_NOT_CONFIGURED'
      );
    }

    logger.info({
      module: 'mailer',
      action: 'sandbox_otp_generated',
      meta: {
        to: params.to,
        purpose: params.purpose,
        otp: params.otp,
      },
    });
    return { deliveryMode: 'SANDBOX' };
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.pass,
      },
    });

    await transporter.sendMail({
      from: smtp.from,
      to: params.to,
      subject,
      text: textBody,
      html: htmlBody,
    });

    logger.info({
      module: 'mailer',
      action: 'smtp_otp_sent',
      meta: {
        to: params.to,
        purpose: params.purpose,
      },
    });

    return { deliveryMode: 'SMTP' };
  } catch (err) {
    logger.error({
      module: 'mailer',
      action: 'smtp_otp_failed',
      meta: {
        to: params.to,
        purpose: params.purpose,
        error: err instanceof Error ? err.message : 'SMTP error',
      },
    });
    throw new AppError(
      'Unable to send verification email at the moment. Please verify SMTP settings or try again.',
      502,
      'EMAIL_DELIVERY_FAILED'
    );
  }
}
