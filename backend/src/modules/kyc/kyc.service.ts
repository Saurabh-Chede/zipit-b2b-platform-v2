import type { Express } from 'express';
import { fileStorage } from '../../config/storage.ts';
import { NotificationCategory } from '../../models/Notification.ts';
import { SellerProfile, type ISellerProfile } from '../../models/SellerProfile.ts';
import { Transporter, type ITransporter } from '../../models/Transporter.ts';
import { sanitizeKycDetails, type IKycDocument } from '../../models/kycSchema.ts';
import { AppError } from '../../utils/AppError.ts';
import {
  EntityStatus,
  KycDocumentType,
  KycEntityType,
  KycVerificationStatus,
  SellerApprovalStatus,
  TransporterApprovalStatus,
  UserRole,
} from '../../utils/constants.ts';
import { buildPaginatedResponse, parsePagination } from '../../utils/pagination.ts';
import { escapeRegex } from '../../utils/sanitize.ts';
import {
  createAndPushNotification,
  notifyAllAdmins,
} from '../notifications/notifications.service.ts';
import type { z } from 'zod';
import type {
  kycReviewBodySchema,
  listKycQueueQuerySchema,
  updateKycDetailsSchema,
} from './kyc.validator.ts';

export type UpdateKycDetailsInput = z.infer<typeof updateKycDetailsSchema>;
export type KycReviewInput = z.infer<typeof kycReviewBodySchema>;
export type ListKycQueueQuery = z.infer<typeof listKycQueueQuerySchema>;

type KycOwnerDoc = ISellerProfile | ITransporter;

function verifyMagicBytes(buffer: Buffer, mimeType: string) {
  const isJpeg =
    buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP';
  const isPdf = buffer.length >= 5 && buffer.toString('ascii', 0, 5) === '%PDF-';

  const valid =
    (mimeType === 'image/jpeg' && isJpeg) ||
    (mimeType === 'image/png' && isPng) ||
    (mimeType === 'image/webp' && isWebp) ||
    (mimeType === 'application/pdf' && isPdf);

  if (!valid) {
    throw new AppError(
      'Uploaded file contents do not match the declared file format.',
      400,
      'INVALID_FILE_SIGNATURE'
    );
  }
}

async function findProfileByUserRole(userId: string, role: UserRole) {
  if (role === UserRole.SELLER) {
    const seller = await SellerProfile.findOne({ userId });
    if (!seller) {
      throw new AppError('Seller profile not found.', 404, 'SELLER_NOT_FOUND');
    }
    return { entityType: KycEntityType.SELLER, doc: seller, displayName: seller.businessName };
  }

  if (role === UserRole.TRANSPORTER) {
    const transporter = await Transporter.findOne({ userId });
    if (!transporter) {
      throw new AppError('Transporter profile not found.', 404, 'TRANSPORTER_NOT_FOUND');
    }
    return {
      entityType: KycEntityType.TRANSPORTER,
      doc: transporter,
      displayName: transporter.companyName,
    };
  }

  throw new AppError('KYC submission is only available for Sellers and Transporters.', 403, 'FORBIDDEN_ROLE');
}

function buildSelfKycResponse(
  entityType: KycEntityType,
  doc: KycOwnerDoc,
  displayName: string
) {
  return {
    entityType,
    profileId: doc._id.toString(),
    displayName,
    gstNumber: doc.gstNumber,
    email: doc.email,
    phone: doc.phone,
    kyc: sanitizeKycDetails(doc.kyc),
  };
}

export async function getMyKycProfile(userId: string, role: UserRole) {
  const { entityType, doc, displayName } = await findProfileByUserRole(userId, role);
  return buildSelfKycResponse(entityType, doc, displayName);
}

export async function updateMyKycDetails(
  userId: string,
  role: UserRole,
  input: UpdateKycDetailsInput
) {
  const { entityType, doc, displayName } = await findProfileByUserRole(userId, role);

  const currentKyc = doc.kyc || {
    status: KycVerificationStatus.NOT_SUBMITTED,
    documents: [],
  };

  currentKyc.panNumber = input.panNumber;
  currentKyc.bankAccountHolder = input.bankAccountHolder;
  currentKyc.bankAccountNumber = input.bankAccountNumber;
  currentKyc.ifscCode = input.ifscCode;
  currentKyc.bankName = input.bankName;
  currentKyc.status = KycVerificationStatus.PENDING;
  currentKyc.submittedAt = new Date();
  currentKyc.rejectionReason = undefined;

  doc.kyc = currentKyc;
  doc.markModified('kyc');
  await doc.save();

  void notifyAllAdmins({
    category: NotificationCategory.SELLER_KYC,
    title: `KYC Submitted: ${displayName}`,
    message: `${entityType === KycEntityType.SELLER ? 'Seller' : 'Transporter'} submitted PAN & bank details for KYC verification.`,
    link: '/admin/kyc',
    entityType: entityType === KycEntityType.SELLER ? 'SellerProfile' : 'Transporter',
    entityId: doc._id.toString(),
  });

  return buildSelfKycResponse(entityType, doc, displayName);
}

export async function uploadMyKycDocument(
  userId: string,
  role: UserRole,
  docType: KycDocumentType,
  file?: Express.Multer.File
) {
  if (!file) {
    throw new AppError('KYC document file is required.', 400, 'KYC_FILE_REQUIRED');
  }

  verifyMagicBytes(file.buffer, file.mimetype);

  const { entityType, doc, displayName } = await findProfileByUserRole(userId, role);
  const stored = await fileStorage.saveFile(file.buffer, file.originalname, file.mimetype, 'kyc');

  const currentKyc = doc.kyc || {
    status: KycVerificationStatus.NOT_SUBMITTED,
    documents: [],
  };

  const existingDoc = currentKyc.documents.find((d) => d.docType === docType);
  const previousStorageKey = existingDoc?.storageKey;

  const nextDoc: IKycDocument = {
    docType,
    storageKey: stored.storageKey,
    fileName: stored.fileName,
    mimeType: stored.mimeType,
    sizeBytes: stored.sizeBytes,
    uploadedAt: new Date(),
  };

  currentKyc.documents = [
    ...currentKyc.documents.filter((d) => d.docType !== docType),
    nextDoc,
  ];
  currentKyc.status = KycVerificationStatus.PENDING;
  currentKyc.submittedAt = new Date();
  currentKyc.rejectionReason = undefined;

  doc.kyc = currentKyc;
  doc.markModified('kyc');

  try {
    await doc.save();
  } catch (err) {
    await fileStorage.deleteFile(stored.storageKey).catch(() => undefined);
    throw err;
  }

  if (previousStorageKey && previousStorageKey !== stored.storageKey) {
    await fileStorage.deleteFile(previousStorageKey).catch(() => undefined);
  }

  void notifyAllAdmins({
    category: NotificationCategory.SELLER_KYC,
    title: `KYC Document Uploaded: ${displayName}`,
    message: `${docType.replace(/_/g, ' ')} uploaded by ${displayName} for review.`,
    link: '/admin/kyc',
    entityType: entityType === KycEntityType.SELLER ? 'SellerProfile' : 'Transporter',
    entityId: doc._id.toString(),
  });

  return buildSelfKycResponse(entityType, doc, displayName);
}

export async function listAdminKycQueue(query: ListKycQueueQuery) {
  const pagination = parsePagination(query as Record<string, unknown>, 15, 100);
  const includeSellers = !query.entityType || query.entityType === KycEntityType.SELLER;
  const includeTransporters = !query.entityType || query.entityType === KycEntityType.TRANSPORTER;

  const statusFilter: Record<string, unknown> = {};
  if (query.status) {
    if (query.status === KycVerificationStatus.NOT_SUBMITTED) {
      statusFilter.$or = [
        { 'kyc.status': KycVerificationStatus.NOT_SUBMITTED },
        { 'kyc.status': { $exists: false } },
      ];
    } else {
      statusFilter['kyc.status'] = query.status;
    }
  }

  const searchTrimmed = typeof query.search === 'string' ? query.search.trim() : '';
  const regex = searchTrimmed ? new RegExp(escapeRegex(searchTrimmed), 'i') : null;

  const sellerQuery: Record<string, unknown> = { ...statusFilter };
  if (regex) {
    const searchOr = [
      { businessName: regex },
      { ownerName: regex },
      { email: regex },
      { gstNumber: regex },
      { 'kyc.panNumber': regex },
    ];
    if (sellerQuery.$or) {
      sellerQuery.$and = [{ $or: sellerQuery.$or }, { $or: searchOr }];
      delete sellerQuery.$or;
    } else {
      sellerQuery.$or = searchOr;
    }
  }

  const transporterQuery: Record<string, unknown> = { ...statusFilter };
  if (regex) {
    const searchOr = [
      { companyName: regex },
      { contactPerson: regex },
      { email: regex },
      { gstNumber: regex },
      { 'kyc.panNumber': regex },
    ];
    if (transporterQuery.$or) {
      transporterQuery.$and = [{ $or: transporterQuery.$or }, { $or: searchOr }];
      delete transporterQuery.$or;
    } else {
      transporterQuery.$or = searchOr;
    }
  }

  const [sellers, transporters] = await Promise.all([
    includeSellers ? SellerProfile.find(sellerQuery).lean() : Promise.resolve([]),
    includeTransporters ? Transporter.find(transporterQuery).lean() : Promise.resolve([]),
  ]);

  const combined = [
    ...sellers.map((s) => ({
      entityType: KycEntityType.SELLER,
      profileId: s._id.toString(),
      displayName: s.businessName,
      contactName: s.ownerName,
      email: s.email,
      phone: s.phone,
      gstNumber: s.gstNumber,
      city: s.city,
      accountStatus: s.approvalStatus,
      kyc: sanitizeKycDetails(s.kyc),
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    })),
    ...transporters.map((t) => ({
      entityType: KycEntityType.TRANSPORTER,
      profileId: t._id.toString(),
      displayName: t.companyName,
      contactName: t.contactPerson,
      email: t.email,
      phone: t.phone,
      gstNumber: t.gstNumber,
      city: t.serviceAreas?.[0]?.city || 'India',
      accountStatus:
        t.approvalStatus && t.approvalStatus !== TransporterApprovalStatus.APPROVED
          ? t.approvalStatus
          : t.status,
      kyc: sanitizeKycDetails(t.kyc),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
  ];

  // Prioritize PENDING KYC submissions first, then latest updates
  const statusPriority: Record<KycVerificationStatus, number> = {
    [KycVerificationStatus.PENDING]: 0,
    [KycVerificationStatus.REJECTED]: 1,
    [KycVerificationStatus.NOT_SUBMITTED]: 2,
    [KycVerificationStatus.VERIFIED]: 3,
  };

  combined.sort((a, b) => {
    const prioDiff =
      (statusPriority[a.kyc.status] ?? 9) - (statusPriority[b.kyc.status] ?? 9);
    if (prioDiff !== 0) return prioDiff;
    const aTime = new Date(a.kyc.submittedAt || a.updatedAt).getTime();
    const bTime = new Date(b.kyc.submittedAt || b.updatedAt).getTime();
    return bTime - aTime;
  });

  const total = combined.length;
  const pagedItems = combined.slice(pagination.skip, pagination.skip + pagination.limit);

  const summary = {
    total,
    pending: combined.filter((c) => c.kyc.status === KycVerificationStatus.PENDING).length,
    verified: combined.filter((c) => c.kyc.status === KycVerificationStatus.VERIFIED).length,
    rejected: combined.filter((c) => c.kyc.status === KycVerificationStatus.REJECTED).length,
    notSubmitted: combined.filter((c) => c.kyc.status === KycVerificationStatus.NOT_SUBMITTED).length,
  };

  return {
    ...buildPaginatedResponse(pagedItems, total, pagination),
    summary,
  };
}

export async function reviewKycApplication(
  entityType: KycEntityType,
  profileId: string,
  adminUserId: string,
  input: KycReviewInput
) {
  const isSeller = entityType === KycEntityType.SELLER;
  const doc = isSeller
    ? await SellerProfile.findById(profileId)
    : await Transporter.findById(profileId);

  if (!doc) {
    throw new AppError(
      `${isSeller ? 'Seller' : 'Transporter'} profile not found.`,
      404,
      'KYC_PROFILE_NOT_FOUND'
    );
  }

  const currentKyc = doc.kyc || {
    status: KycVerificationStatus.NOT_SUBMITTED,
    documents: [],
  };

  if (
    input.status === KycVerificationStatus.VERIFIED &&
    !currentKyc.panNumber &&
    currentKyc.documents.length === 0
  ) {
    throw new AppError(
      'Cannot verify KYC before PAN/bank details or supporting documents are submitted.',
      400,
      'KYC_INCOMPLETE'
    );
  }

  currentKyc.status = input.status;
  currentKyc.reviewedBy = adminUserId as unknown as typeof currentKyc.reviewedBy;
  currentKyc.reviewedAt = new Date();
  currentKyc.rejectionReason =
    input.status === KycVerificationStatus.REJECTED ? input.rejectionReason?.trim() : undefined;

  doc.kyc = currentKyc;
  doc.markModified('kyc');

  if (
    isSeller &&
    input.status === KycVerificationStatus.VERIFIED &&
    input.alsoApproveSeller !== false
  ) {
    const sellerDoc = doc as ISellerProfile;
    if (sellerDoc.approvalStatus === SellerApprovalStatus.PENDING) {
      sellerDoc.approvalStatus = SellerApprovalStatus.APPROVED;
      sellerDoc.rejectionReason = undefined;
      sellerDoc.reviewedBy = adminUserId as unknown as typeof sellerDoc.reviewedBy;
      sellerDoc.reviewedAt = new Date();
    }
  } else if (
    !isSeller &&
    input.status === KycVerificationStatus.VERIFIED &&
    input.alsoApproveSeller !== false
  ) {
    const transporterDoc = doc as ITransporter;
    if (transporterDoc.approvalStatus === TransporterApprovalStatus.PENDING) {
      transporterDoc.approvalStatus = TransporterApprovalStatus.APPROVED;
      transporterDoc.status = EntityStatus.ACTIVE;
      transporterDoc.rejectionReason = undefined;
      transporterDoc.reviewedBy = adminUserId as unknown as typeof transporterDoc.reviewedBy;
      transporterDoc.reviewedAt = new Date();
    }
  }

  await doc.save();

  const displayName = isSeller
    ? (doc as ISellerProfile).businessName
    : (doc as ITransporter).companyName;
  const recipientRole = isSeller ? UserRole.SELLER : UserRole.TRANSPORTER;
  const targetLink = isSeller ? '/seller/profile' : '/transporter/profile';

  void createAndPushNotification({
    recipientUserId: doc.userId.toString(),
    recipientRole,
    category: NotificationCategory.SELLER_KYC,
    title:
      input.status === KycVerificationStatus.VERIFIED
        ? 'KYC Verification Approved'
        : 'KYC Verification Rejected',
    message:
      input.status === KycVerificationStatus.VERIFIED
        ? `KYC for ${displayName} is now verified.`
        : `KYC for ${displayName} was rejected: ${currentKyc.rejectionReason}`,
    link: targetLink,
    entityType: isSeller ? 'SellerProfile' : 'Transporter',
    entityId: doc._id.toString(),
  });

  return buildSelfKycResponse(entityType, doc, displayName);
}

export async function getAuthorizedKycDocumentStream(
  entityType: KycEntityType,
  profileId: string,
  docType: KycDocumentType,
  requesterUserId: string,
  requesterRole: UserRole
) {
  const isSeller = entityType === KycEntityType.SELLER;
  const doc = isSeller
    ? await SellerProfile.findById(profileId).lean()
    : await Transporter.findById(profileId).lean();

  if (!doc) {
    throw new AppError('KYC profile not found.', 404, 'KYC_PROFILE_NOT_FOUND');
  }

  if (requesterRole !== UserRole.ADMIN) {
    const expectedRole = isSeller ? UserRole.SELLER : UserRole.TRANSPORTER;
    if (requesterRole !== expectedRole || doc.userId.toString() !== requesterUserId) {
      throw new AppError(
        'You are not authorized to access this KYC document.',
        403,
        'KYC_DOCUMENT_FORBIDDEN'
      );
    }
  }

  const targetDoc = doc.kyc?.documents?.find((d) => d.docType === docType);
  if (!targetDoc) {
    throw new AppError('Requested KYC document has not been uploaded.', 404, 'KYC_DOC_NOT_FOUND');
  }

  const stream = await fileStorage.getFileReadStream(targetDoc.storageKey, 'KYC_DOC_FILE_NOT_FOUND');
  return {
    stream,
    mimeType: targetDoc.mimeType,
    fileName: targetDoc.fileName,
  };
}
