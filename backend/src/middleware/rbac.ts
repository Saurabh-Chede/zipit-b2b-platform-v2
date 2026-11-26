import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.ts';
import { SellerApprovalStatus, UserRole } from '../utils/constants.ts';
import { SellerProfile } from '../models/SellerProfile.ts';

export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
    }
    if (!allowedRoles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do not have permission to perform this action.',
          403,
          'FORBIDDEN_ROLE'
        )
      );
    }
    next();
  };
}

export async function requireApprovedSeller(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'AUTH_REQUIRED'));
    }
    if (req.user.role !== UserRole.SELLER) {
      return next(new AppError('Only registered sellers can access this resource.', 403, 'SELLER_ROLE_REQUIRED'));
    }

    const seller = await SellerProfile.findOne({ userId: req.user.id }).lean();
    if (!seller) {
      return next(new AppError('Seller business profile not found.', 404, 'SELLER_PROFILE_NOT_FOUND'));
    }

    if (seller.approvalStatus === SellerApprovalStatus.PENDING) {
      return next(
        new AppError(
          'Your seller application is pending admin approval. You cannot create shipments yet.',
          403,
          'SELLER_APPROVAL_PENDING'
        )
      );
    }

    if (seller.approvalStatus === SellerApprovalStatus.REJECTED) {
      return next(
        new AppError(
          `Your seller application was rejected: ${seller.rejectionReason || 'No reason provided'}`,
          403,
          'SELLER_APPROVAL_REJECTED'
        )
      );
    }

    next();
  } catch (err) {
    next(err);
  }
}
