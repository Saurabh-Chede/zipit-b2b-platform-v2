import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  addSellerAddress,
  adjustSellerWalletByAdmin,
  approveSeller,
  deleteSellerAddress,
  getSellerById,
  getSellerByUserId,
  getSellerWalletForAdmin,
  listPendingSellers,
  listSellerAddresses,
  listSellers,
  registerSeller,
  rejectSeller,
  setPrimarySellerAddress,
  updateSellerAddress,
} from './sellers.service.ts';
import { logger } from '../../config/logger.ts';

export const registerSellerController = asyncHandler(async (req: Request, res: Response) => {
  const result = await registerSeller(req.body);
  logger.info({
    requestId: req.requestId,
    module: 'sellers',
    action: 'seller_registered',
    meta: { sellerId: result.sellerProfile._id.toString() },
  });
  res.status(201).json({
    success: true,
    message: 'Seller registration submitted. Pending admin approval.',
    data: result,
  });
});

export const listSellersController = asyncHandler(async (req: Request, res: Response) => {
  const data = await listSellers(req.query as Record<string, unknown>);
  res.status(200).json({ success: true, data });
});

export const listPendingSellersController = asyncHandler(async (req: Request, res: Response) => {
  const data = await listPendingSellers(req.query as Record<string, unknown>);
  res.status(200).json({ success: true, data });
});

export const getSellerByIdController = asyncHandler(async (req: Request, res: Response) => {
  const seller = await getSellerById(req.params.id);
  res.status(200).json({ success: true, data: seller });
});

export const getOwnSellerProfileController = asyncHandler(async (req: Request, res: Response) => {
  const seller = await getSellerByUserId(req.user!.id);
  res.status(200).json({ success: true, data: seller });
});

export const approveSellerController = asyncHandler(async (req: Request, res: Response) => {
  const seller = await approveSeller(req.params.id, req.user!.id);
  logger.info({
    requestId: req.requestId,
    module: 'sellers',
    action: 'seller_approved',
    meta: { sellerId: req.params.id, adminUserId: req.user!.id },
  });
  res.status(200).json({
    success: true,
    message: 'Seller approved successfully',
    data: seller,
  });
});

export const rejectSellerController = asyncHandler(async (req: Request, res: Response) => {
  const seller = await rejectSeller(req.params.id, req.user!.id, req.body.rejectionReason);
  logger.info({
    requestId: req.requestId,
    module: 'sellers',
    action: 'seller_rejected',
    meta: { sellerId: req.params.id, adminUserId: req.user!.id },
  });
  res.status(200).json({
    success: true,
    message: 'Seller application rejected',
    data: seller,
  });
});

export const getSellerWalletAdminController = asyncHandler(async (req: Request, res: Response) => {
  const data = await getSellerWalletForAdmin(req.params.id);
  res.status(200).json({ success: true, data });
});

export const adjustSellerWalletController = asyncHandler(async (req: Request, res: Response) => {
  const idempotencyKey =
    (req.headers['idempotency-key'] as string | undefined)?.trim() || undefined;

  const result = await adjustSellerWalletByAdmin(
    req.params.id,
    req.user!.id,
    req.user!.name,
    req.body,
    idempotencyKey
  );

  logger.info({
    requestId: req.requestId,
    module: 'sellers',
    action: result.idempotentReplay ? 'seller_wallet_adjust_replay' : 'seller_wallet_adjusted',
    meta: {
      sellerId: req.params.id,
      adminUserId: req.user!.id,
      type: req.body.type,
      amount: req.body.amount,
      walletBalance: result.walletBalance,
    },
  });

  res.status(result.idempotentReplay ? 200 : 201).json({
    success: true,
    message: result.idempotentReplay
      ? 'Wallet adjustment already processed.'
      : `Seller wallet ${req.body.type === 'CREDIT' ? 'credited' : 'debited'} successfully.`,
    data: result,
  });
});

export const listSellerAddressesController = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await listSellerAddresses(req.user!.id);
  res.status(200).json({ success: true, data: addresses });
});

export const addSellerAddressController = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await addSellerAddress(req.user!.id, req.body);
  res.status(201).json({
    success: true,
    message: 'Address saved to your address book.',
    data: addresses,
  });
});

export const updateSellerAddressController = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await updateSellerAddress(req.user!.id, req.params.addressId, req.body);
  res.status(200).json({
    success: true,
    message: 'Saved address updated successfully.',
    data: addresses,
  });
});

export const setPrimarySellerAddressController = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await setPrimarySellerAddress(req.user!.id, req.params.addressId);
  res.status(200).json({
    success: true,
    message: 'Primary pickup address updated.',
    data: addresses,
  });
});

export const deleteSellerAddressController = asyncHandler(async (req: Request, res: Response) => {
  const addresses = await deleteSellerAddress(req.user!.id, req.params.addressId);
  res.status(200).json({
    success: true,
    message: 'Address removed from your address book.',
    data: addresses,
  });
});


