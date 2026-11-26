import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import { getWalletSummary, rechargeSellerWallet } from './wallet.service.ts';
import { logger } from '../../config/logger.ts';

export const getWalletController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getWalletSummary(req.user!.id);
  res.status(200).json({ success: true, data });
});

export const rechargeWalletController = asyncHandler(async (req: Request, res: Response) => {
  const headerKey =
    typeof req.headers['idempotency-key'] === 'string' ? req.headers['idempotency-key'] : undefined;

  const result = await rechargeSellerWallet(req.user!.id, req.body, headerKey);

  logger.info({
    requestId: req.requestId,
    module: 'wallet',
    action: result.idempotentReplay ? 'wallet_recharge_replay' : 'wallet_recharged',
    meta: {
      transactionId: result.transaction?.transactionId,
      amount: result.transaction?.amount,
      walletBalance: result.walletBalance,
    },
  });

  res.status(result.idempotentReplay ? 200 : 201).json({
    success: true,
    message: result.idempotentReplay
      ? 'Existing wallet recharge returned.'
      : `Wallet recharged with INR ${Number(result.transaction?.amount || 0).toFixed(2)}.`,
    data: result,
  });
});
