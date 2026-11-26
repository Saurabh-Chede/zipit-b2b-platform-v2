import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  createRazorpayWalletOrder,
  getPaymentGatewayConfig,
  listSellerPaymentOrders,
  processRazorpayWebhook,
  verifyRazorpayWalletPayment,
} from './payments.service.ts';
import { logger } from '../../config/logger.ts';

export const getPaymentConfigController = asyncHandler(async (_req: Request, res: Response) => {
  const data = getPaymentGatewayConfig();
  res.status(200).json({ success: true, data });
});

export const listPaymentOrdersController = asyncHandler(async (req: Request, res: Response) => {
  const items = await listSellerPaymentOrders(req.user!.id);
  res.status(200).json({ success: true, data: { items } });
});

export const createPaymentOrderController = asyncHandler(async (req: Request, res: Response) => {
  const data = await createRazorpayWalletOrder(req.user!.id, req.body);

  logger.info({
    requestId: req.requestId,
    module: 'payments',
    action: 'payment_order_created',
    meta: {
      orderRef: data.orderRef,
      gatewayOrderId: data.gatewayOrderId,
      amountInr: data.amountInr,
    },
  });

  res.status(201).json({
    success: true,
    message: `Payment order ${data.orderRef} created.`,
    data,
  });
});

export const verifyPaymentController = asyncHandler(async (req: Request, res: Response) => {
  const result = await verifyRazorpayWalletPayment(req.user!.id, req.body);

  logger.info({
    requestId: req.requestId,
    module: 'payments',
    action: result.idempotentReplay ? 'payment_verify_replay' : 'payment_verified_credited',
    meta: {
      gatewayOrderId: req.body.razorpay_order_id,
      gatewayPaymentId: req.body.razorpay_payment_id,
      walletBalance: result.walletBalance,
    },
  });

  res.status(200).json({
    success: true,
    message: result.idempotentReplay
      ? 'Payment already verified and credited.'
      : `Payment verified! Wallet credited with INR ${Number(result.transaction?.amount || 0).toFixed(2)}.`,
    data: result,
  });
});

export const razorpayWebhookController = asyncHandler(async (req: Request, res: Response) => {
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
  const signature =
    typeof req.headers['x-razorpay-signature'] === 'string'
      ? req.headers['x-razorpay-signature']
      : undefined;

  const result = await processRazorpayWebhook(rawBody, signature, req.body);

  logger.info({
    requestId: req.requestId,
    module: 'payments',
    action: 'razorpay_webhook_received',
    meta: {
      event: req.body?.event,
      processed: result.processed,
    },
  });

  res.status(200).json({ success: true, data: result });
});
