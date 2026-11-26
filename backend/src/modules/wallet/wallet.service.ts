import crypto from 'crypto';
import { SellerProfile } from '../../models/SellerProfile.ts';
import {
  WalletPaymentMethod,
  WalletTransaction,
  WalletTransactionType,
} from '../../models/WalletTransaction.ts';
import { env } from '../../config/env.ts';
import { runInTransaction } from '../../config/database.ts';
import { AppError } from '../../utils/AppError.ts';
import { UserRole } from '../../utils/constants.ts';
import { NotificationCategory } from '../../models/Notification.ts';
import { createAndPushNotification } from '../notifications/notifications.service.ts';
import type { RechargeWalletInput } from './wallet.validator.ts';

function generateTransactionId(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(
    now.getDate()
  ).padStart(2, '0')}`;
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `ZPT-TXN-${ymd}-${rand}`;
}

export async function getWalletSummary(userId: string) {
  const seller = await SellerProfile.findOne({ userId }).lean();
  if (!seller) {
    throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
  }

  const transactions = await WalletTransaction.find({ sellerId: seller._id })
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();

  return {
    walletBalance: Number(seller.walletBalance || 0),
    transactions,
  };
}

export async function rechargeSellerWallet(
  userId: string,
  input: RechargeWalletInput,
  headerIdempotencyKey?: string
) {
  if (env.isProduction) {
    throw new AppError(
      'Direct unverified wallet top-up is disabled in production. Please pay via Razorpay Checkout.',
      403,
      'DIRECT_RECHARGE_DISABLED'
    );
  }

  const seller = await SellerProfile.findOne({ userId }).lean();
  if (!seller) {
    throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
  }

  const effectiveIdempotencyKey = input.idempotencyKey || headerIdempotencyKey;

  if (effectiveIdempotencyKey) {
    const existingTxn = await WalletTransaction.findOne({
      sellerId: seller._id,
      idempotencyKey: effectiveIdempotencyKey,
    }).lean();

    if (existingTxn) {
      const currentSeller = await SellerProfile.findById(seller._id).lean();
      return {
        walletBalance: Number(currentSeller?.walletBalance || 0),
        transaction: existingTxn,
        idempotentReplay: true,
      };
    }
  }

  const cleanAmount = Math.round(input.amount * 100) / 100;
  const transactionId = generateTransactionId();

  const methodLabels: Record<string, string> = {
    [WalletPaymentMethod.UPI]: 'UPI Instant Top-up',
    [WalletPaymentMethod.NEFT_RTGS]: 'NEFT / RTGS Transfer',
    [WalletPaymentMethod.NETBANKING]: 'Corporate NetBanking',
    [WalletPaymentMethod.CARD]: 'Corporate Card Recharge',
  };

  try {
    const result = await runInTransaction(async (session) => {
      const updatedSeller = await SellerProfile.findOneAndUpdate(
        { _id: seller._id },
        { $inc: { walletBalance: cleanAmount } },
        {
          returnDocument: 'after',
          ...(session ? { session } : {}),
        }
      ).lean();

      if (!updatedSeller) {
        throw new AppError('Seller profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND');
      }

      const [txn] = await WalletTransaction.create(
        [
          {
            transactionId,
            sellerId: seller._id,
            userId,
            type: WalletTransactionType.CREDIT,
            amount: cleanAmount,
            balanceAfter: Number(updatedSeller.walletBalance || 0),
            paymentMethod: input.paymentMethod,
            referenceNote: input.referenceNote || undefined,
            description: methodLabels[input.paymentMethod] || 'Wallet Recharge',
            idempotencyKey: effectiveIdempotencyKey || undefined,
          },
        ],
        session ? { session } : undefined
      );

      return {
        walletBalance: Number(updatedSeller.walletBalance || 0),
        transaction: txn.toJSON(),
        idempotentReplay: false,
      };
    });

    void createAndPushNotification({
      recipientUserId: userId,
      recipientRole: UserRole.SELLER,
      category: NotificationCategory.WALLET,
      title: `Wallet Credited: INR ${cleanAmount.toFixed(2)}`,
      message: `${methodLabels[input.paymentMethod] || 'Wallet top-up'} succeeded. New balance: INR ${result.walletBalance.toFixed(2)}.`,
      link: '/seller/profile',
      entityType: 'WalletTransaction',
      entityId: transactionId,
    });

    return result;
  } catch (err: unknown) {
    if (
      effectiveIdempotencyKey &&
      typeof err === 'object' &&
      err !== null &&
      'code' in err &&
      (err as { code: number }).code === 11000
    ) {
      const existingTxn = await WalletTransaction.findOne({
        sellerId: seller._id,
        idempotencyKey: effectiveIdempotencyKey,
      }).lean();
      if (existingTxn) {
        const currentSeller = await SellerProfile.findById(seller._id).lean();
        return {
          walletBalance: Number(currentSeller?.walletBalance || 0),
          transaction: existingTxn,
          idempotentReplay: true,
        };
      }
    }
    throw err;
  }
}
