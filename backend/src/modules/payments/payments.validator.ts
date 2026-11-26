import { z } from 'zod';
import { WalletPaymentMethod } from '../../models/WalletTransaction.ts';

export const createPaymentOrderSchema = z.object({
  amount: z.coerce
    .number({ error: 'Recharge amount must be a valid number' })
    .min(100, 'Minimum wallet recharge is INR 100')
    .max(500000, 'Maximum single recharge is INR 5,00,000'),
  paymentMethod: z
    .enum([
      WalletPaymentMethod.UPI,
      WalletPaymentMethod.NEFT_RTGS,
      WalletPaymentMethod.NETBANKING,
      WalletPaymentMethod.CARD,
    ])
    .default(WalletPaymentMethod.UPI),
});

export const verifyRazorpayPaymentSchema = z.object({
  razorpay_order_id: z.string().trim().min(5, 'Razorpay order ID is required').max(100),
  razorpay_payment_id: z.string().trim().min(5, 'Razorpay payment ID is required').max(100),
  razorpay_signature: z.string().trim().min(16, 'Payment signature is required').max(256),
  paymentMethod: z
    .enum([
      WalletPaymentMethod.UPI,
      WalletPaymentMethod.NEFT_RTGS,
      WalletPaymentMethod.NETBANKING,
      WalletPaymentMethod.CARD,
    ])
    .optional(),
});

export type CreatePaymentOrderInput = z.infer<typeof createPaymentOrderSchema>;
export type VerifyRazorpayPaymentInput = z.infer<typeof verifyRazorpayPaymentSchema>;
