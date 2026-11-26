import { z } from 'zod';
import { WalletPaymentMethod } from '../../models/WalletTransaction.ts';

export const rechargeWalletSchema = z.object({
  amount: z.coerce
    .number({ error: 'Recharge amount must be a valid number' })
    .min(100, 'Minimum wallet recharge is INR 100')
    .max(500000, 'Maximum single recharge is INR 5,00,000'),
  paymentMethod: z.enum([
    WalletPaymentMethod.UPI,
    WalletPaymentMethod.NEFT_RTGS,
    WalletPaymentMethod.NETBANKING,
    WalletPaymentMethod.CARD,
  ]),
  referenceNote: z.string().max(120).trim().optional(),
  idempotencyKey: z.string().min(8).max(128).trim().optional(),
});

export type RechargeWalletInput = z.infer<typeof rechargeWalletSchema>;
