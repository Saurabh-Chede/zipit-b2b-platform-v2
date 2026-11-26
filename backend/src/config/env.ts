import dotenv from 'dotenv';
import { z } from 'zod';
import crypto from 'crypto';
import path from 'path';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  SERVE_FRONTEND: z.string().optional().default('true'),
  APP_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  COOKIE_DOMAIN: z.string().optional().default(''),
  COOKIE_SAME_SITE: z.enum(['auto', 'lax', 'none', 'strict']).optional().default('auto'),
  MONGODB_URI: z.string().optional().default(''),
  JWT_SECRET: z.string().min(16).optional(),
  JWT_EXPIRES_IN: z.string().default('7d'),
  COOKIE_SECRET: z.string().min(16).optional(),
  STORAGE_PROVIDER: z.enum(['local', 's3']).optional().default('local'),
  UPLOAD_DIR: z.string().default(path.resolve(process.cwd(), 'uploads/delivery-proofs')),
  S3_BUCKET: z.string().optional().default(''),
  S3_REGION: z.string().optional().default('auto'),
  S3_ENDPOINT: z.string().optional().default(''),
  S3_ACCESS_KEY_ID: z.string().optional().default(''),
  S3_SECRET_ACCESS_KEY: z.string().optional().default(''),
  S3_FORCE_PATH_STYLE: z.string().optional().default('false'),
  S3_KEY_PREFIX: z.string().optional().default('zipit-uploads'),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(500),
  SEED_ON_STARTUP: z.string().optional().default('true'),
  DISCORD_ALERT_WEBHOOK_URL: z.string().optional().default(''),
  ALERT_WEBHOOK_URL: z.string().optional().default(''),
  ALERT_MIN_LEVEL: z.enum(['ERROR', 'WARN', 'ALL']).default('WARN'),
  RAZORPAY_KEY_ID: z.string().optional().default(''),
  RAZORPAY_KEY_SECRET: z.string().optional().default(''),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional().default(''),
  SMTP_HOST: z.string().optional().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_SECURE: z.string().optional().default('false'),
  SMTP_USER: z.string().optional().default(''),
  SMTP_PASS: z.string().optional().default(''),
  SMTP_FROM: z.string().optional().default('ZIPIT B2B Transport <noreply@zipit.in>'),
  WHATSAPP_ENABLED: z.string().optional().default('false'),
  WHATSAPP_API_VERSION: z.string().optional().default('v21.0'),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional().default(''),
  WHATSAPP_ACCESS_TOKEN: z.string().optional().default(''),
  WHATSAPP_APP_SECRET: z.string().optional().default(''),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

const raw = parsed.data;
const isProduction = raw.NODE_ENV === 'production' || process.argv.includes('--prod');
const isTest = raw.NODE_ENV === 'test' || process.env.VITEST === 'true';

const corsOrigins = Array.from(
  new Set(
    raw.CORS_ORIGIN.split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean)
  )
);

if (isProduction && !isTest) {
  const missingOrPlaceholder: string[] = [];

  if (!raw.MONGODB_URI.trim()) {
    missingOrPlaceholder.push('MONGODB_URI (must be set to a MongoDB Atlas / Replica Set URI)');
  }
  if (!raw.JWT_SECRET || raw.JWT_SECRET.startsWith('CHANGE_ME')) {
    missingOrPlaceholder.push('JWT_SECRET (must be a strong random secret, >= 16 chars)');
  }
  if (!raw.COOKIE_SECRET || raw.COOKIE_SECRET.startsWith('CHANGE_ME')) {
    missingOrPlaceholder.push('COOKIE_SECRET (must be a strong random secret, >= 16 chars)');
  }
  if (corsOrigins.length === 0 || corsOrigins.includes('*')) {
    missingOrPlaceholder.push('CORS_ORIGIN (must list explicit origins; wildcard "*" is not allowed with credentials)');
  }
  if (raw.STORAGE_PROVIDER === 's3') {
    if (!raw.S3_BUCKET.trim()) missingOrPlaceholder.push('S3_BUCKET (required when STORAGE_PROVIDER="s3")');
    if (!raw.S3_ACCESS_KEY_ID.trim()) {
      missingOrPlaceholder.push('S3_ACCESS_KEY_ID (required when STORAGE_PROVIDER="s3")');
    }
    if (!raw.S3_SECRET_ACCESS_KEY.trim()) {
      missingOrPlaceholder.push('S3_SECRET_ACCESS_KEY (required when STORAGE_PROVIDER="s3")');
    }
  }

  if (missingOrPlaceholder.length > 0) {
    console.error(
      `Invalid production environment configuration:\n - ${missingOrPlaceholder.join('\n - ')}`
    );
    process.exit(1);
  }
}

const fallbackSecret = crypto.createHash('sha256').update(`zipit-dev-secret-${process.cwd()}`).digest('hex');

export const env = {
  nodeEnv: isProduction ? 'production' : raw.NODE_ENV,
  isProduction,
  isTest,
  port: raw.PORT,
  serveFrontend: raw.SERVE_FRONTEND.trim().toLowerCase() !== 'false',
  appUrl: raw.APP_URL.trim().replace(/\/+$/, ''),
  corsOrigins,
  cookieDomain: raw.COOKIE_DOMAIN.trim(),
  cookieSameSite: raw.COOKIE_SAME_SITE,
  mongodbUri: raw.MONGODB_URI.trim(),
  jwtSecret: raw.JWT_SECRET && !raw.JWT_SECRET.startsWith('CHANGE_ME') ? raw.JWT_SECRET : fallbackSecret,
  jwtExpiresIn: raw.JWT_EXPIRES_IN,
  cookieSecret: raw.COOKIE_SECRET && !raw.COOKIE_SECRET.startsWith('CHANGE_ME') ? raw.COOKIE_SECRET : fallbackSecret,
  storageProvider: raw.STORAGE_PROVIDER,
  uploadDir: path.resolve(raw.UPLOAD_DIR),
  s3: {
    bucket: raw.S3_BUCKET.trim(),
    region: raw.S3_REGION.trim() || 'auto',
    endpoint: raw.S3_ENDPOINT.trim(),
    accessKeyId: raw.S3_ACCESS_KEY_ID.trim(),
    secretAccessKey: raw.S3_SECRET_ACCESS_KEY.trim(),
    forcePathStyle: raw.S3_FORCE_PATH_STYLE.trim().toLowerCase() === 'true',
    keyPrefix: raw.S3_KEY_PREFIX.trim().replace(/^\/+|\/+$/g, ''),
  },
  rateLimitWindowMs: raw.RATE_LIMIT_WINDOW_MS,
  rateLimitMax: raw.RATE_LIMIT_MAX,
  seedOnStartup: raw.SEED_ON_STARTUP !== 'false',
  discordAlertWebhookUrl: raw.DISCORD_ALERT_WEBHOOK_URL.trim(),
  alertWebhookUrl: raw.ALERT_WEBHOOK_URL.trim(),
  alertMinLevel: raw.ALERT_MIN_LEVEL,
  razorpayKeyId: raw.RAZORPAY_KEY_ID.trim(),
  razorpayKeySecret: raw.RAZORPAY_KEY_SECRET.trim(),
  razorpayWebhookSecret: raw.RAZORPAY_WEBHOOK_SECRET.trim(),
  smtpHost: raw.SMTP_HOST.trim(),
  smtpPort: raw.SMTP_PORT,
  smtpSecure: raw.SMTP_SECURE === 'true',
  smtpUser: raw.SMTP_USER.trim(),
  smtpPass: raw.SMTP_PASS.trim(),
  smtpFrom: raw.SMTP_FROM.trim(),
  whatsappEnabled: raw.WHATSAPP_ENABLED.trim().toLowerCase() === 'true',
  whatsappApiVersion: raw.WHATSAPP_API_VERSION.trim() || 'v21.0',
  whatsappPhoneNumberId: raw.WHATSAPP_PHONE_NUMBER_ID.trim(),
  whatsappBusinessAccountId: raw.WHATSAPP_BUSINESS_ACCOUNT_ID.trim(),
  whatsappAccessToken: raw.WHATSAPP_ACCESS_TOKEN.trim(),
  whatsappAppSecret: raw.WHATSAPP_APP_SECRET.trim(),
  whatsappWebhookVerifyToken: raw.WHATSAPP_WEBHOOK_VERIFY_TOKEN.trim(),
} as const;
