import PDFDocument from 'pdfkit';
import bwipjs from 'bwip-js';
import type { IBooking } from '../../models/Booking.ts';
import type { ITransporter } from '../../models/Transporter.ts';
import type { ISellerProfile } from '../../models/SellerProfile.ts';

export interface LrDocumentInput {
  booking: IBooking;
  transporter: Pick<ITransporter, 'companyName' | 'contactPerson' | 'phone' | 'email' | 'gstNumber' | 'address'>;
  seller: Pick<ISellerProfile, 'businessName' | 'gstNumber' | 'phone'> | null;
}

function formatMoney(amount: number): string {
  return `INR ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Generates a Code 128 barcode PNG buffer encoding ONLY the unique LR number.
 */
export async function generateLrBarcodeBuffer(lrNumber: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: lrNumber,
    scale: 2,
    height: 12,
    includetext: true,
    textxalign: 'center',
    textsize: 9,
  });
}

function renderLrPage(doc: PDFKit.PDFDocument, input: LrDocumentInput, barcodePng: Buffer): void {
  const { booking, transporter, seller } = input;

  const left = 36;
  const pageWidth = doc.page.width - left * 2; // 523.28 pt on A4

  // Palette
  const INK = '#0F172A';
  const SLATE_700 = '#334155';
  const SLATE_500 = '#64748B';
  const SLATE_400 = '#94A3B8';
  const BORDER = '#CBD5E1';
  const BORDER_SOFT = '#E2E8F0';
  const BG_SUBTLE = '#F8FAFC';
  const BG_TINT = '#EFF6FF';
  const BLUE = '#2563EB';
  const BLUE_DARK = '#1D4ED8';
  const BLUE_BRIGHT = '#3B82F6';

  // -------------------------------------------------------------------------
  // 1. Modern Header Band
  // -------------------------------------------------------------------------
  const headerY = 30;
  const headerH = 74;
  doc.roundedRect(left, headerY, pageWidth, headerH, 8).fill(INK);
  doc.roundedRect(left, headerY, 5, headerH, 2).fill(BLUE_BRIGHT);

  doc
    .fillColor('#FFFFFF')
    .fontSize(18)
    .font('Helvetica-Bold')
    .text('ZIPIT B2B TRANSPORT', left + 18, headerY + 15);
  doc
    .fillColor('#94A3B8')
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .text(
      booking.bookingSource === 'TRANSPORTER_SELF'
        ? 'LORRY RECEIPT  ·  CONSIGNMENT NOTE (TRANSPORTER DIRECT)'
        : 'LORRY RECEIPT  ·  CONSIGNMENT NOTE (ORIGINAL)',
      left + 18,
      headerY + 39,
      {
        characterSpacing: 0.6,
      }
    );
  doc
    .fillColor('#64748B')
    .fontSize(7.5)
    .font('Helvetica')
    .text(
      booking.ewayBillNumber
        ? `E-Way Bill: ${booking.ewayBillNumber}${
            booking.ewayBillValidUpto
              ? ` · Valid Upto ${new Date(booking.ewayBillValidUpto).toLocaleDateString('en-IN')}`
              : ''
          }`
        : 'B2B Local & Intercity Commercial Freight Document',
      left + 18,
      headerY + 52
    );

  // Right LR / Booking Badge inside header
  const metaBoxW = 200;
  const metaBoxX = left + pageWidth - metaBoxW - 12;
  doc.roundedRect(metaBoxX, headerY + 10, metaBoxW, 54, 6).fill('#1E293B');

  doc
    .fillColor('#93C5FD')
    .fontSize(7)
    .font('Helvetica-Bold')
    .text('LORRY RECEIPT NO.', metaBoxX + 12, headerY + 16, {
      width: metaBoxW - 24,
      characterSpacing: 0.5,
    });
  doc
    .fillColor('#FFFFFF')
    .fontSize(11.5)
    .font('Helvetica-Bold')
    .text(booking.lrNumber, metaBoxX + 12, headerY + 26, { width: metaBoxW - 24 });
  doc
    .fillColor('#CBD5E1')
    .fontSize(7.5)
    .font('Helvetica')
    .text(`Ref: ${booking.bookingId}`, metaBoxX + 12, headerY + 42, { width: metaBoxW - 24 })
    .text(`Date: ${new Date(booking.createdAt).toLocaleString('en-IN')}`, metaBoxX + 12, headerY + 52, {
      width: metaBoxW - 24,
    });

  // -------------------------------------------------------------------------
  // 2. Lane & Code 128 Barcode Strip
  // -------------------------------------------------------------------------
  let y = headerY + headerH + 12;
  const laneH = 78;
  doc.roundedRect(left, y, pageWidth, laneH, 6).fillAndStroke(BG_SUBTLE, BORDER_SOFT);

  const barcodeBoxW = 192;
  const barcodeBoxX = left + pageWidth - barcodeBoxW - 10;
  doc.roundedRect(barcodeBoxX, y + 8, barcodeBoxW, laneH - 16, 5).fillAndStroke('#FFFFFF', BORDER_SOFT);
  doc.image(barcodePng, barcodeBoxX + 6, y + 12, {
    fit: [barcodeBoxW - 12, laneH - 24],
    align: 'center',
    valign: 'center',
  });

  // Origin Block
  doc
    .fillColor(SLATE_500)
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .text('ORIGIN HUB', left + 14, y + 14, { characterSpacing: 0.5 });
  doc
    .fillColor(INK)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text(booking.origin.city, left + 14, y + 27, { width: 118, ellipsis: true });
  doc
    .fillColor(SLATE_500)
    .fontSize(8.5)
    .font('Helvetica')
    .text(`PIN ${booking.origin.pincode}`, left + 14, y + 46);

  // Drawn Vector Arrow between Origin & Destination
  const arrowX1 = left + 140;
  const arrowX2 = left + 186;
  const arrowY = y + 36;
  doc.moveTo(arrowX1, arrowY).lineTo(arrowX2, arrowY).strokeColor(BLUE).lineWidth(1.5).stroke();
  doc
    .moveTo(arrowX2 - 5, arrowY - 4)
    .lineTo(arrowX2, arrowY)
    .lineTo(arrowX2 - 5, arrowY + 4)
    .strokeColor(BLUE)
    .lineWidth(1.5)
    .stroke();

  if (booking.pricingSnapshot.estimatedDeliveryTime) {
    doc
      .fillColor(BLUE_DARK)
      .fontSize(7)
      .font('Helvetica-Bold')
      .text(`ETA: ${booking.pricingSnapshot.estimatedDeliveryTime}`, arrowX1 - 8, y + 48, {
        width: 66,
        align: 'center',
      });
  }

  // Destination Block
  const destX = left + 202;
  doc
    .fillColor(SLATE_500)
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .text('DESTINATION HUB', destX, y + 14, { characterSpacing: 0.5 });
  doc
    .fillColor(INK)
    .fontSize(13)
    .font('Helvetica-Bold')
    .text(booking.destination.city, destX, y + 27, { width: 112, ellipsis: true });
  doc
    .fillColor(SLATE_500)
    .fontSize(8.5)
    .font('Helvetica')
    .text(`PIN ${booking.destination.pincode}`, destX, y + 46);

  // -------------------------------------------------------------------------
  // 3. Consignor & Consignee Cards (Side-by-Side)
  // -------------------------------------------------------------------------
  y += laneH + 12;
  const colGap = 12;
  const colW = (pageWidth - colGap) / 2;
  const partyH = 124;

  // Consignor Card
  doc.roundedRect(left, y, colW, partyH, 6).fillAndStroke('#FFFFFF', BORDER);
  doc.roundedRect(left, y, colW, 24, 6).fill(BG_TINT);
  doc.rect(left, y + 18, colW, 6).fill(BG_TINT);
  doc
    .moveTo(left, y + 24)
    .lineTo(left + colW, y + 24)
    .strokeColor(BORDER_SOFT)
    .lineWidth(0.75)
    .stroke();

  doc
    .fillColor(BLUE_DARK)
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('CONSIGNOR (SENDER)', left + 12, y + 8, { characterSpacing: 0.4 });

  const senderCompany = booking.sender.companyName || booking.sender.name;
  const senderContact = booking.sender.contactPerson;
  const senderGstin = booking.sender.gstin || seller?.gstNumber;

  doc
    .fillColor(INK)
    .fontSize(10.5)
    .font('Helvetica-Bold')
    .text(senderCompany, left + 12, y + 32, { width: colW - 24, ellipsis: true });
  doc
    .fillColor(SLATE_500)
    .fontSize(8)
    .font('Helvetica')
    .text(
      seller
        ? `Seller: ${seller.businessName}${senderGstin ? ` · GST: ${senderGstin}` : ''}`
        : `Direct Carrier Booking · ${transporter.companyName}${senderGstin ? ` · GST: ${senderGstin}` : ''}`,
      left + 12,
      y + 48,
      {
        width: colW - 24,
        ellipsis: true,
      }
    );
  doc
    .fillColor(SLATE_700)
    .fontSize(8.5)
    .font('Helvetica')
    .text(
      senderContact && senderContact !== senderCompany
        ? `Contact: ${senderContact} · Ph: ${booking.sender.phone}`
        : `Phone: ${booking.sender.phone}`,
      left + 12,
      y + 61,
      { width: colW - 24, ellipsis: true }
    )
    .text(booking.sender.address, left + 12, y + 75, {
      width: colW - 24,
      height: 26,
      ellipsis: true,
    });
  doc
    .fillColor(INK)
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .text(
      `${booking.sender.city}${booking.sender.state ? `, ${booking.sender.state}` : ''} — ${booking.sender.pincode}`,
      left + 12,
      y + 106,
      { width: colW - 24, ellipsis: true }
    );

  // Consignee Card
  const rightColX = left + colW + colGap;
  doc.roundedRect(rightColX, y, colW, partyH, 6).fillAndStroke('#FFFFFF', BORDER);
  doc.roundedRect(rightColX, y, colW, 24, 6).fill(BG_TINT);
  doc.rect(rightColX, y + 18, colW, 6).fill(BG_TINT);
  doc
    .moveTo(rightColX, y + 24)
    .lineTo(rightColX + colW, y + 24)
    .strokeColor(BORDER_SOFT)
    .lineWidth(0.75)
    .stroke();

  doc
    .fillColor(BLUE_DARK)
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('CONSIGNEE (RECEIVER)', rightColX + 12, y + 8, { characterSpacing: 0.4 });

  doc
    .fillColor(INK)
    .fontSize(10.5)
    .font('Helvetica-Bold')
    .text(booking.receiver.name, rightColX + 12, y + 32, { width: colW - 24, ellipsis: true });
  doc
    .fillColor(SLATE_700)
    .fontSize(8.5)
    .font('Helvetica')
    .text(`Phone: ${booking.receiver.phone}`, rightColX + 12, y + 50)
    .text(booking.receiver.address, rightColX + 12, y + 66, {
      width: colW - 24,
      height: 34,
      ellipsis: true,
    });
  doc
    .fillColor(INK)
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .text(`${booking.receiver.city} — ${booking.receiver.pincode}`, rightColX + 12, y + 106);

  // -------------------------------------------------------------------------
  // 4. Assigned Transporter & Status Strip
  // -------------------------------------------------------------------------
  y += partyH + 12;
  const carrierH = 56;
  doc.roundedRect(left, y, pageWidth, carrierH, 6).fillAndStroke(BG_SUBTLE, BORDER_SOFT);

  doc
    .fillColor(SLATE_500)
    .fontSize(7.5)
    .font('Helvetica-Bold')
    .text('ASSIGNED CARRIER', left + 12, y + 10, { characterSpacing: 0.4 })
    .text('CONTACT & GSTIN', left + 225, y + 10, { characterSpacing: 0.4 })
    .text('BOOKING STATUS', left + 415, y + 10, { characterSpacing: 0.4 });

  doc
    .fillColor(INK)
    .fontSize(10)
    .font('Helvetica-Bold')
    .text(transporter.companyName, left + 12, y + 23, { width: 200, ellipsis: true });
  doc
    .fillColor(SLATE_500)
    .fontSize(8)
    .font('Helvetica')
    .text(`Rep: ${transporter.contactPerson}`, left + 12, y + 38, { width: 200, ellipsis: true });

  doc
    .fillColor(SLATE_700)
    .fontSize(8.5)
    .font('Helvetica')
    .text(`Ph: ${transporter.phone}`, left + 225, y + 23)
    .text(`GSTIN: ${transporter.gstNumber}`, left + 225, y + 37, { width: 180 });

  doc.roundedRect(left + 415, y + 22, 92, 20, 4).fill(BG_TINT);
  doc
    .fillColor(BLUE_DARK)
    .fontSize(8.5)
    .font('Helvetica-Bold')
    .text(booking.status, left + 415, y + 28, { width: 92, align: 'center' });

  // -------------------------------------------------------------------------
  // 5. Parcel & Weight Specification Table
  // -------------------------------------------------------------------------
  y += carrierH + 12;
  const parcelH = 82;
  doc.roundedRect(left, y, pageWidth, parcelH, 6).fillAndStroke('#FFFFFF', BORDER);

  doc.roundedRect(left, y, pageWidth, 24, 6).fill('#F1F5F9');
  doc.rect(left, y + 18, pageWidth, 6).fill('#F1F5F9');
  doc
    .moveTo(left, y + 24)
    .lineTo(left + pageWidth, y + 24)
    .strokeColor(BORDER_SOFT)
    .lineWidth(0.75)
    .stroke();

  const cols = [
    { label: 'GOODS DESCRIPTION', x: left + 12, w: 168, align: 'left' as const },
    { label: 'PKGS', x: left + 184, w: 42, align: 'center' as const },
    { label: 'DIMENSIONS (L×W×H)', x: left + 230, w: 105, align: 'center' as const },
    { label: 'ACTUAL WT', x: left + 338, w: 58, align: 'right' as const },
    { label: 'VOL. WT', x: left + 398, w: 56, align: 'right' as const },
    { label: 'CHARGEABLE', x: left + 456, w: 58, align: 'right' as const },
  ];

  doc.fillColor(SLATE_700).fontSize(7.5).font('Helvetica-Bold');
  for (const col of cols) {
    doc.text(col.label, col.x, y + 8, { width: col.w, align: col.align });
  }

  doc.rect(left + 454, y + 24, 69, parcelH - 24).fill(BG_TINT);

  doc.fillColor(INK).fontSize(9).font('Helvetica');
  doc.text(booking.parcel.description, cols[0].x, y + 36, {
    width: cols[0].w,
    height: 36,
    ellipsis: true,
  });
  doc
    .font('Helvetica-Bold')
    .text(String(booking.parcel.numberOfPackages), cols[1].x, y + 40, {
      width: cols[1].w,
      align: 'center',
    });
  doc
    .font('Helvetica')
    .text(
      `${booking.parcel.lengthCm} × ${booking.parcel.widthCm} × ${booking.parcel.heightCm} cm`,
      cols[2].x,
      y + 40,
      { width: cols[2].w, align: 'center' }
    );
  doc.text(`${booking.actualWeight.toFixed(2)} kg`, cols[3].x, y + 40, {
    width: cols[3].w,
    align: 'right',
  });
  doc.text(`${booking.volumetricWeight.toFixed(2)} kg`, cols[4].x, y + 40, {
    width: cols[4].w,
    align: 'right',
  });
  doc
    .fillColor(BLUE_DARK)
    .font('Helvetica-Bold')
    .text(`${booking.chargeableWeight.toFixed(2)} kg`, cols[5].x, y + 40, {
      width: cols[5].w,
      align: 'right',
    });

  // -------------------------------------------------------------------------
  // 6. Freight & Tax Summary Ledger
  // -------------------------------------------------------------------------
  y += parcelH + 12;
  const platformChargeAmt = Number(booking.pricingSnapshot.platformCharge ?? booking.platformCharge ?? 0);

  const rows: [string, string][] = [
    [
      `Base Freight (Rate ${formatMoney(booking.pricingSnapshot.ratePerKg)}/kg · Min ${formatMoney(
        booking.pricingSnapshot.minimumFreight
      )})`,
      formatMoney(booking.freight),
    ],
    ['Additional Handling & Loading Charges', formatMoney(booking.pricingSnapshot.additionalCharges)],
  ];
  if (platformChargeAmt > 0) {
    rows.push(['Platform Service Charge', formatMoney(platformChargeAmt)]);
  }
  rows.push(
    [
      booking.pricingSnapshot.gstApplicable
        ? `Applicable GST (${booking.pricingSnapshot.gstRatePercent}%)`
        : 'GST (Not Applicable / Exempt)',
      formatMoney(booking.tax),
    ],
    ['RTO Charges (Payable only if shipment is returned)', formatMoney(booking.rtoCharges)]
  );

  const rowStep = rows.length > 4 ? 18 : 20;
  const ledgerH = 34 + rows.length * rowStep + 38;
  doc.roundedRect(left, y, pageWidth, ledgerH, 6).fillAndStroke('#FFFFFF', BORDER);
  doc.roundedRect(left, y, pageWidth, 24, 6).fill('#F1F5F9');
  doc.rect(left, y + 18, pageWidth, 6).fill('#F1F5F9');
  doc
    .moveTo(left, y + 24)
    .lineTo(left + pageWidth, y + 24)
    .strokeColor(BORDER_SOFT)
    .lineWidth(0.75)
    .stroke();

  doc
    .fillColor(SLATE_700)
    .fontSize(8)
    .font('Helvetica-Bold')
    .text('FREIGHT & TAX BREAKDOWN', left + 12, y + 8, { characterSpacing: 0.4 })
    .text('AMOUNT (INR)', left + pageWidth - 150, y + 8, { width: 138, align: 'right' });

  let rowY = y + 32;
  rows.forEach(([label, amount], idx) => {
    doc.fillColor(SLATE_700).fontSize(8.5).font('Helvetica').text(label, left + 12, rowY, {
      width: 350,
    });
    doc
      .fillColor(INK)
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text(amount, left + pageWidth - 150, rowY, { width: 138, align: 'right' });

    if (idx < rows.length - 1) {
      doc
        .moveTo(left + 12, rowY + (rowStep - 4))
        .lineTo(left + pageWidth - 12, rowY + (rowStep - 4))
        .strokeColor('#F1F5F9')
        .lineWidth(0.75)
        .stroke();
    }
    rowY += rowStep;
  });

  const totalBandY = y + ledgerH - 34;
  doc.roundedRect(left + 1, totalBandY, pageWidth - 2, 33, 5).fill(BG_TINT);
  doc
    .moveTo(left, totalBandY)
    .lineTo(left + pageWidth, totalBandY)
    .strokeColor(BORDER)
    .lineWidth(0.75)
    .stroke();

  doc
    .fillColor(INK)
    .fontSize(10.5)
    .font('Helvetica-Bold')
    .text('TOTAL PAYABLE FREIGHT', left + 12, totalBandY + 11);
  doc
    .fillColor(BLUE_DARK)
    .fontSize(12)
    .font('Helvetica-Bold')
    .text(formatMoney(booking.finalAmount), left + pageWidth - 160, totalBandY + 10, {
      width: 148,
      align: 'right',
    });

  // -------------------------------------------------------------------------
  // 7. Declaration & Signature Boxes
  // -------------------------------------------------------------------------
  y += ledgerH + 14;
  const sigW = (pageWidth - 24) / 3;
  const sigH = 54;
  const sigLabels = [
    'Consignor / Seller Signature',
    'Transporter / Driver Signature',
    'Consignee Stamp & Signature',
  ];

  sigLabels.forEach((label, i) => {
    const sx = left + i * (sigW + 12);
    doc.roundedRect(sx, y, sigW, sigH, 5).fillAndStroke(BG_SUBTLE, BORDER_SOFT);
    doc
      .moveTo(sx + 10, y + sigH - 18)
      .lineTo(sx + sigW - 10, y + sigH - 18)
      .strokeColor(BORDER)
      .lineWidth(0.75)
      .stroke();
    doc
      .fillColor(SLATE_500)
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .text(label, sx + 8, y + sigH - 13, { width: sigW - 16, align: 'center' });
  });

  doc
    .fillColor(SLATE_400)
    .fontSize(7.2)
    .font('Helvetica')
    .text(
      'Electronic Lorry Receipt issued by ZIPIT B2B Transport · Code 128 barcode encodes unique LR number · Subject to standard B2B carriage terms.',
      left,
      y + sigH + 14,
      { align: 'center', width: pageWidth }
    );
}

/**
 * Generates a modern, single-page A4 Lorry Receipt (LR) PDF buffer
 * with ZIPIT branding, Code 128 barcode, sender/receiver cards, weight table, and freight ledger.
 */
export async function generateLrPdfBuffer(input: LrDocumentInput): Promise<Buffer> {
  return generateCombinedLrPdfBuffer([input]);
}

/**
 * Generates a multi-page A4 Lorry Receipt (LR) PDF bundle combining one page per booking.
 */
export async function generateCombinedLrPdfBuffer(inputs: LrDocumentInput[]): Promise<Buffer> {
  const barcodes = await Promise.all(inputs.map((item) => generateLrBarcodeBuffer(item.booking.lrNumber)));

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 32, autoFirstPage: false });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    inputs.forEach((item, index) => {
      doc.addPage({ size: 'A4', margin: 32 });
      renderLrPage(doc, item, barcodes[index]);
    });

    doc.end();
  });
}
