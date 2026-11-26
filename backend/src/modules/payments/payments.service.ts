import crypto from 'crypto';
import { env } from '../../config/env.ts';
import { runInTransaction } from '../../config/database.ts';
import { PaymentOrder, PaymentOrderStatus } from '../../models/PaymentOrder.ts';
import { SellerProfile } from '../../models/SellerProfile.ts';
import {
  WalletPaymentMethod,
  WalletTransaction,
  WalletTransactionType,
} from '../../models/WalletTransaction.ts';
import { NotificationCategory } from '../../models/Notification.ts';
import { createAndPushNotification } from '../notifications/notifications.service.ts';
import { AppError } from '../../utils/AppError.ts';
import { UserRole } from '../../utils/constants.ts';
import type { CreatePaymentOrderInput, VerifyRazorpayPaymentInput } from './payments.validator.ts';

interface RazorpayOrderApiResponse {
  id: string;
  amount: number;
  currency: string;
  receipt?: string;
  status?: string;
}

function getRazorpayCredentials() {
  const keyId = (process.env.RAZORPAY_KEY_ID || env.razorpayKeyId || '').trim();
  const keySecret = (process.env.RAZORPAY_KEY_SECRET || env.razorpayKeySecret || '').trim();
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || env.razorpayWebhookSecret || '').trim();

  const validKeyId = keyId && !keyId.startsWith('CHANGE_ME') ? keyId : '';
  const validKeySecret = keySecret && !keySecret.startsWith('CHANGE_ME') ? keySecret : '';
  const validWebhookSecret =
    webhookSecret && !webhookSecret.startsWith('CHANGE_ME') ? webhookSecret : '';

  return {
    keyId: validKeyId,
    keySecret: validKeySecret,
    webhookSecret: validWebhookSecret,
  };
}

function timingSafeHexEqual(expectedHex: string, actualHex: string): boolean {
  const cleanExpected = expectedHex.trim().toLowerCase();
  const cleanActual = actualHex.trim().toLowerCase();
  if (!cleanExpected || !cleanActual || cleanExpected.length !== cleanActual.length) {
    return false;
  }
  const a = Buffer.from(cleanExpected, 'utf8');
  const b = Buffer.from(cleanActual, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function mapGatewayMethod(
  rawMethod?: string,
  fallback: WalletPaymentMethod = WalletPaymentMethod.UPI
): WalletPaymentMethod {
  const m = (rawMethod || '').trim().toLowerCase();
  if (m === 'upi') return WalletPaymentMethod.UPI;
  if (m === 'netbanking') return WalletPaymentMethod.NETBANKING;
  if (m === 'card') return WalletPaymentMethod.CARD;
  if (m === 'bank_transfer' || m === 'neft' || m === 'rtgs' || m === 'neft_rtgs') {
    return WalletPaymentMethod.NEFT_RTGS;
  }
  return fallback;
}

function generateOrderRef(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ZPT-PAY-${ymd}-${rand}`;
}

function generateTransactionId(): string {
  const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ZPT-TXN-${ymd}-${rand}`;
}

export function getPaymentGatewayConfig() {
  const { keyId, keySecret, webhookSecret } = getRazorpayCredentials();
  return {
    gateway: 'RAZORPAY' as const,
    configured: Boolean(keyId && keySecret),
    webhookConfigured: Boolean(webhookSecret),
    currency: 'INR' as const,
    minAmountInr: 100,
    maxAmountInr: 500000,
    directLedgerAllowed: !env.isProduction,
  };
}

export async function listSellerPaymentOrders(userId: string) {
  const seller = await SellerProfile.findOne({ userId }).lean();
  if (!seller) {
    throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
  }

  return PaymentOrder.find({ sellerId: seller._id })
    .sort({ createdAt: -1 })
    .limit(15)
    .lean();
}

export async function createRazorpayWalletOrder(userId: string, input: CreatePaymentOrderInput) {
  const { keyId, keySecret } = getRazorpayCredentials();
  if (!keyId || !keySecret) {
    throw new AppError(
      'Live payment gateway is not configured on the server (set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET).',
      503,
      'PAYMENT_GATEWAY_NOT_CONFIGURED'
    );
  }

  const seller = await SellerProfile.findOne({ userId }).lean();
  if (!seller) {
    throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
  }

  const cleanAmount = Math.round(input.amount * 100) / 100;
  const amountPaise = Math.round(cleanAmount * 100);
  const orderRef = generateOrderRef();

  const authToken = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  let response: Response;
  try {
    response = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: orderRef,
        notes: {
          orderRef,
          sellerId: seller._id.toString(),
          userId,
          businessName: seller.businessName,
        },
      }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new AppError(
      `Unable to connect to Razorpay Orders API: ${err instanceof Error ? err.message : 'Network error'}`,
      502,
      'PAYMENT_GATEWAY_UNREACHABLE'
    );
  }

  const payload = (await response.json().catch(() => ({}))) as Partial<RazorpayOrderApiResponse> & {
    error?: { description?: string; reason?: string };
  };

  if (!response.ok || !payload.id) {
    throw new AppError(
      payload?.error?.description || 'Failed to create Razorpay payment order.',
      502,
      'PAYMENT_ORDER_CREATION_FAILED'
    );
  }

  const order = await PaymentOrder.create({
    orderRef,
    gateway: 'RAZORPAY',
    sellerId: seller._id,
    userId,
    amountInr: cleanAmount,
    amountPaise,
    currency: 'INR',
    preferredMethod: input.paymentMethod,
    gatewayOrderId: payload.id,
    status: PaymentOrderStatus.CREATED,
  });

  return {
    orderRef: order.orderRef,
    gateway: 'RAZORPAY' as const,
    gatewayKeyId: keyId,
    gatewayOrderId: order.gatewayOrderId,
    amountInr: order.amountInr,
    amountPaise: order.amountPaise,
    currency: 'INR' as const,
    prefill: {
      name: seller.ownerName || seller.businessName,
      email: seller.email,
      contact: seller.phone,
    },
  };
}

async function settlePaymentOrderAndCreditWallet(
  gatewayOrderId: string,
  gatewayPaymentId: string,
  walletMethod: WalletPaymentMethod,
  rawMethodLabel?: string
) {
  const idempotencyKey = `rzp-order:${gatewayOrderId}`;

  const txResult = await runInTransaction(async (session) => {
    const claimed = await PaymentOrder.findOneAndUpdate(
      { gatewayOrderId, status: { $ne: PaymentOrderStatus.PAID } },
      {
        $set: {
          status: PaymentOrderStatus.PAID,
          gatewayPaymentId,
          paidMethod: rawMethodLabel || walletMethod,
          creditedAt: new Date(),
        },
      },
      {
        returnDocument: 'before',
        ...(session ? { session } : {}),
      }
    ).lean();

    if (!claimed) {
      const existingOrder = await PaymentOrder.findOne({ gatewayOrderId }).lean();
      if (!existingOrder) {
        throw new AppError('Payment order not found.', 404, 'PAYMENT_ORDER_NOT_FOUND');
      }

      const [existingSeller, existingTxn] = await Promise.all([
        SellerProfile.findById(existingOrder.sellerId).lean(),
        WalletTransaction.findOne({
          sellerId: existingOrder.sellerId,
          idempotencyKey,
        }).lean(),
      ]);

      return {
        walletBalance: Number(existingSeller?.walletBalance || 0),
        transaction: existingTxn,
        paymentOrder: existingOrder,
        idempotentReplay: true,
      };
    }

    const updatedSeller = await SellerProfile.findOneAndUpdate(
      { _id: claimed.sellerId },
      { $inc: { walletBalance: claimed.amountInr } },
      {
        returnDocument: 'after',
        ...(session ? { session } : {}),
      }
    ).lean();

    if (!updatedSeller) {
      throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
    }

    const transactionId = generateTransactionId();
    const [txn] = await WalletTransaction.create(
      [
        {
          transactionId,
          sellerId: claimed.sellerId,
          userId: claimed.userId,
          type: WalletTransactionType.CREDIT,
          amount: claimed.amountInr,
          balanceAfter: Number(updatedSeller.walletBalance || 0),
          paymentMethod: walletMethod,
          referenceNote: gatewayPaymentId,
          description: `Razorpay Wallet Top-up (${claimed.orderRef})`,
          idempotencyKey,
        },
      ],
      session ? { session } : undefined
    );

    const updatedOrder = await PaymentOrder.findByIdAndUpdate(
      claimed._id,
      { $set: { walletTransactionId: transactionId } },
      { returnDocument: 'after', ...(session ? { session } : {}) }
    ).lean();

    return {
      walletBalance: Number(updatedSeller.walletBalance || 0),
      transaction: txn.toJSON(),
      paymentOrder: updatedOrder,
      idempotentReplay: false,
    };
  });

  if (!txResult.idempotentReplay && txResult.paymentOrder) {
    void createAndPushNotification({
      recipientUserId: txResult.paymentOrder.userId.toString(),
      recipientRole: UserRole.SELLER,
      category: NotificationCategory.WALLET,
      title: `Wallet Credited: INR ${txResult.paymentOrder.amountInr.toFixed(2)}`,
      message: `Razorpay payment ${gatewayPaymentId} verified. New balance: INR ${txResult.walletBalance.toFixed(2)}.`,
      link: '/seller/profile',
      entityType: 'WalletTransaction',
      entityId: txResult.paymentOrder.walletTransactionId || gatewayPaymentId,
    });
  }

  return txResult;
}

export async function verifyRazorpayWalletPayment(
  userId: string,
  input: VerifyRazorpayPaymentInput
) {
  const { keySecret } = getRazorpayCredentials();
  if (!keySecret) {
    throw new AppError(
      'Live payment gateway is not configured on the server.',
      503,
      'PAYMENT_GATEWAY_NOT_CONFIGURED'
    );
  }

  const seller = await SellerProfile.findOne({ userId }).lean();
  if (!seller) {
    throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
  }

  const order = await PaymentOrder.findOne({
    gatewayOrderId: input.razorpay_order_id,
  }).lean();

  if (!order) {
    throw new AppError('Payment order not found.', 404, 'PAYMENT_ORDER_NOT_FOUND');
  }

  if (order.sellerId.toString() !== seller._id.toString()) {
    throw new AppError('You are not authorized to verify this payment order.', 403, 'PAYMENT_ORDER_FORBIDDEN');
  }

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(`${input.razorpay_order_id}|${input.razorpay_payment_id}`)
    .digest('hex');

  if (!timingSafeHexEqual(expectedSignature, input.razorpay_signature)) {
    await PaymentOrder.updateOne(
      { _id: order._id, status: PaymentOrderStatus.CREATED },
      { $set: { failureReason: 'HMAC signature mismatch' } }
    );
    throw new AppError(
      'Razorpay payment signature verification failed.',
      400,
      'INVALID_PAYMENT_SIGNATURE'
    );
  }

  const method = input.paymentMethod || order.preferredMethod || WalletPaymentMethod.UPI;
  return settlePaymentOrderAndCreditWallet(
    order.gatewayOrderId,
    input.razorpay_payment_id,
    method,
    input.paymentMethod
  );
}

interface RazorpayWebhookPayload {
  event?: string;
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        currency?: string;
        method?: string;
        error_description?: string;
      };
    };
  };
}

export async function processRazorpayWebhook(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  parsedBody: RazorpayWebhookPayload
) {
  const { webhookSecret } = getRazorpayCredentials();
  if (!webhookSecret) {
    throw new AppError(
      'Razorpay webhook secret is not configured on the server.',
      503,
      'PAYMENT_WEBHOOK_NOT_CONFIGURED'
    );
  }

  if (!rawBody || !signatureHeader) {
    throw new AppError('Missing Razorpay webhook signature or payload.', 400, 'INVALID_WEBHOOK_SIGNATURE');
  }

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(rawBody)
    .digest('hex');

  if (!timingSafeHexEqual(expectedSignature, signatureHeader)) {
    throw new AppError('Invalid Razorpay webhook signature.', 400, 'INVALID_WEBHOOK_SIGNATURE');
  }

  const eventName = parsedBody?.event || '';
  const paymentEntity = parsedBody?.payload?.payment?.entity;
  const orderId = paymentEntity?.order_id;
  const paymentId = paymentEntity?.id;

  if (!orderId) {
    return { processed: false, event: eventName, reason: 'NO_ORDER_ID' };
  }

  const existingOrder = await PaymentOrder.findOne({ gatewayOrderId: orderId }).lean();
  if (!existingOrder) {
    return { processed: false, event: eventName, reason: 'ORDER_NOT_FOUND' };
  }

  if (eventName === 'payment.captured' || eventName === 'order.paid') {
    if (!paymentId) {
      return { processed: false, event: eventName, reason: 'NO_PAYMENT_ID' };
    }

    const paidPaise = Number(paymentEntity?.amount || 0);
    if (paidPaise < existingOrder.amountPaise) {
      throw new AppError(
        `Captured payment amount (${paidPaise} paise) is less than order amount (${existingOrder.amountPaise} paise).`,
        400,
        'PAYMENT_AMOUNT_MISMATCH'
      );
    }

    const mappedMethod = mapGatewayMethod(paymentEntity?.method, existingOrder.preferredMethod);
    const result = await settlePaymentOrderAndCreditWallet(
      orderId,
      paymentId,
      mappedMethod,
      paymentEntity?.method
    );

    return {
      processed: true,
      event: eventName,
      idempotentReplay: result.idempotentReplay,
      walletBalance: result.walletBalance,
    };
  }

  if (eventName === 'payment.failed') {
    await PaymentOrder.updateOne(
      { _id: existingOrder._id, status: PaymentOrderStatus.CREATED },
      {
        $set: {
          status: PaymentOrderStatus.FAILED,
          gatewayPaymentId: paymentId,
          failureReason: paymentEntity?.error_description || 'Payment failed at gateway',
        },
      }
    );
    return { processed: true, event: eventName };
  }

  return { processed: false, event: eventName, reason: 'EVENT_IGNORED' };
}
