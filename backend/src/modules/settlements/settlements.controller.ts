import type { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler.ts';
import {
  createTransporterSettlement,
  getAdminSettlementsOverview,
  getTransporterPendingBookings,
} from './settlements.service.ts';
import { logger } from '../../config/logger.ts';

export const getSettlementsOverviewController = asyncHandler(async (_req: Request, res: Response) => {
  const data = await getAdminSettlementsOverview();
  res.status(200).json({ success: true, data });
});

export const getTransporterPendingBookingsController = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await getTransporterPendingBookings(req.params.transporterId);
    res.status(200).json({ success: true, data });
  }
);

export const createTransporterSettlementController = asyncHandler(
  async (req: Request, res: Response) => {
    const settlement = await createTransporterSettlement(req.user!.id, req.body);

    logger.info({
      requestId: req.requestId,
      module: 'settlements',
      action: 'transporter_payout_settled',
      meta: {
        settlementId: settlement.settlementId,
        transporterId: req.body.transporterId,
        bookingCount: settlement.bookingCount,
        netPayoutAmount: settlement.netPayoutAmount,
        utrNumber: settlement.utrNumber,
        adminUserId: req.user!.id,
      },
    });

    res.status(201).json({
      success: true,
      message: `Settlement ${settlement.settlementId} recorded (UTR: ${settlement.utrNumber}).`,
      data: settlement,
    });
  }
);
