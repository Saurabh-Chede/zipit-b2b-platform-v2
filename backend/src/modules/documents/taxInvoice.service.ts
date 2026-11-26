import PDFDocument from 'pdfkit';
import type { IBooking } from '../../models/Booking.ts';
import type { ITransporter } from '../../models/Transporter.ts';
import type { ISellerProfile } from '../../models/SellerProfile.ts';

export interface TaxInvoiceInput {
  booking: IBooking;
  transporter: Pick<ITransporter, 'companyName' | 'gstNumber' | 'address' | 'phone'>;
  seller: Pick<ISellerProfile, 'businessName' | 'gstNumber' | 'businessAddress' | 'city' | 'pincode' | 'phone'> | null;
  invoiceNumber: string;
}

const SUPPLIER_LEGAL_NAME = 'ZIPIT B2B Transport Logistics Pvt. Ltd.';
const SUPPLIER_GSTIN = '27AAACZ1234F1Z5';
const SUPPLIER_STATE_CODE = '27';
const SUPPLIER_ADDRESS = 'Unit 402, Logistics Park, Andheri East, Mumbai, Maharashtra — 400069';
const SAC_CODE = '996511';

const STATE_NAMES: Record<string, string> = {
  '07': 'Delhi (07)',
  '19': 'West Bengal (19)',
  '24': 'Gujarat (24)',
  '27': 'Maharashtra (27)',
  '29': 'Karnataka (29)',
  '33': 'Tamil Nadu (33)',
  '36': 'Telangana (36)',
};

function formatMoney(amount: number): string {
  return `INR ${amount.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function twoDigitToWords(n: number): string {
  const ones = [
    '',
    'One',
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seven', 'Eighty', 'Ninety'];
  tens[7] = 'Seventy';
  if (n === 0) return '';
  if (n < 20) return ones[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${tens[t]}${o ? ` ${ones[o]}` : ''}`;
}

function threeDigitToWords(n: number): string {
  const h = Math.floor(n / 100);
  const rem = n % 100;
  const parts: string[] = [];
  if (h > 0) parts.push(`${twoDigitToWords(h)} Hundred`);
  if (rem > 0) parts.push(twoDigitToWords(rem));
  return parts.join(' ');
}

export function amountToIndianWords(amount: number): string {
  const rounded = Math.round(amount * 100);
  const rupees = Math.floor(rounded / 100);
  const paise = rounded % 100;

  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const crore = Math.floor(rupees / 10000000);
  const lakh = Math.floor((rupees % 10000000) / 100000);
  const thousand = Math.floor((rupees % 100000) / 1000);
  const rest = rupees % 1000;

  const chunks: string[] = [];
  if (crore > 0) chunks.push(`${threeDigitToWords(crore)} Crore`);
  if (lakh > 0) chunks.push(`${twoDigitToWords(lakh)} Lakh`);
  if (thousand > 0) chunks.push(`${twoDigitToWords(thousand)} Thousand`);
  if (rest > 0) chunks.push(threeDigitToWords(rest));

  const rupeeText = chunks.length > 0 ? `${chunks.join(' ')} Rupees` : '';
  const paiseText = paise > 0 ? `${twoDigitToWords(paise)} Paise` : '';

  if (rupeeText && paiseText) return `${rupeeText} and ${paiseText} Only`;
  return `${rupeeText || paiseText} Only`;
}

export function resolveInvoiceNumber(booking: Pick<IBooking, 'invoiceNumber' | 'lrNumber' | 'createdAt'>): string {
  if (booking.invoiceNumber && booking.invoiceNumber.trim()) {
    return booking.invoiceNumber.trim().toUpperCase();
  }
  const d = new Date(booking.createdAt || Date.now());
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  const tail = booking.lrNumber.replace(/[^A-Z0-9]/gi, '').slice(-6).toUpperCase();
  return `ZPT-INV-${ymd}-${tail}`;
}

export async function generateTaxInvoicePdfBuffer(input: TaxInvoiceInput): Promise<Buffer> {
  const { booking, seller, transporter, invoiceNumber } = input;

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 36 });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err: Error) => reject(err));

    const left = 36;
    const pageWidth = doc.page.width - left * 2;
    const INK = '#0F172A';
    const SLATE_700 = '#334155';
    const SLATE_500 = '#64748B';
    const BORDER = '#CBD5E1';
    const BORDER_SOFT = '#E2E8F0';
    const BG_SUBTLE = '#F8FAFC';
    const BG_TINT = '#EFF6FF';
    const BLUE_DARK = '#1D4ED8';

    // 1. Header
    const headerY = 32;
    const headerH = 74;
    doc.roundedRect(left, headerY, pageWidth, headerH, 8).fill(INK);
    doc
      .fillColor('#FFFFFF')
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('TAX INVOICE', left + 18, headerY + 14);
    doc
      .fillColor('#94A3B8')
      .fontSize(8.5)
      .font('Helvetica')
      .text(SUPPLIER_LEGAL_NAME, left + 18, headerY + 35)
      .text(`GSTIN: ${SUPPLIER_GSTIN} · SAC: ${SAC_CODE} (Road Freight GTA)`, left + 18, headerY + 49);

    const metaW = 205;
    const metaX = left + pageWidth - metaW - 12;
    doc.roundedRect(metaX, headerY + 10, metaW, 54, 6).fill('#1E293B');
    doc
      .fillColor('#93C5FD')
      .fontSize(7)
      .font('Helvetica-Bold')
      .text('INVOICE NUMBER', metaX + 12, headerY + 15);
    doc
      .fillColor('#FFFFFF')
      .fontSize(10.5)
      .font('Helvetica-Bold')
      .text(invoiceNumber, metaX + 12, headerY + 25, { width: metaW - 24 });
    doc
      .fillColor('#CBD5E1')
      .fontSize(7.5)
      .font('Helvetica')
      .text(`Date: ${new Date(booking.createdAt).toLocaleDateString('en-IN')}`, metaX + 12, headerY + 40)
      .text(`LR No: ${booking.lrNumber}`, metaX + 12, headerY + 51);

    // 2. Supplier & Recipient Cards
    let y = headerY + headerH + 14;
    const colGap = 12;
    const colW = (pageWidth - colGap) / 2;
    const boxH = 114;

    doc.roundedRect(left, y, colW, boxH, 6).fillAndStroke('#FFFFFF', BORDER);
    doc.roundedRect(left, y, colW, 22, 6).fill(BG_TINT);
    doc.rect(left, y + 16, colW, 6).fill(BG_TINT);
    doc
      .fillColor(BLUE_DARK)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text('SUPPLIER OF SERVICE', left + 12, y + 7);
    doc
      .fillColor(INK)
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text(SUPPLIER_LEGAL_NAME, left + 12, y + 30, { width: colW - 24 });
    doc
      .fillColor(SLATE_700)
      .fontSize(8)
      .font('Helvetica')
      .text(`GSTIN: ${SUPPLIER_GSTIN}`, left + 12, y + 46)
      .text(SUPPLIER_ADDRESS, left + 12, y + 59, { width: colW - 24, height: 28 })
      .text(`Carrier: ${transporter.companyName}`, left + 12, y + 92, { width: colW - 24, ellipsis: true });

    const recipientName = seller?.businessName || booking.sender.companyName || booking.sender.name;
    const recipientGst = (booking.sender.gstin || seller?.gstNumber || '').trim().toUpperCase();
    const pickupLocationLine = `${booking.sender.address}, ${booking.sender.city}${
      booking.sender.state ? `, ${booking.sender.state}` : ''
    } — ${booking.sender.pincode}`;
    const recipientAddress = seller
      ? `Pickup: ${pickupLocationLine}`
      : pickupLocationLine;
    const recipientPhone = booking.sender.phone || seller?.phone || '';
    const hasValidGst = /^[0-9]{2}[A-Z0-9]{13}$/.test(recipientGst);
    const recipientStateCode = hasValidGst ? recipientGst.slice(0, 2) : SUPPLIER_STATE_CODE;
    const isIntraState = recipientStateCode === SUPPLIER_STATE_CODE;
    const placeOfSupply = hasValidGst
      ? STATE_NAMES[recipientStateCode] || `State Code ${recipientStateCode}`
      : `${booking.sender.state || booking.sender.city || booking.origin.city} (Unregistered)`;

    const rightX = left + colW + colGap;
    doc.roundedRect(rightX, y, colW, boxH, 6).fillAndStroke('#FFFFFF', BORDER);
    doc.roundedRect(rightX, y, colW, 22, 6).fill(BG_TINT);
    doc.rect(rightX, y + 16, colW, 6).fill(BG_TINT);
    doc
      .fillColor(BLUE_DARK)
      .fontSize(8)
      .font('Helvetica-Bold')
      .text(seller ? 'BILLED TO (RECIPIENT / SELLER)' : 'BILLED TO (CONSIGNOR)', rightX + 12, y + 7);
    doc
      .fillColor(INK)
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text(recipientName, rightX + 12, y + 30, { width: colW - 24, ellipsis: true });
    doc
      .fillColor(SLATE_700)
      .fontSize(8)
      .font('Helvetica')
      .text(`GSTIN: ${recipientGst || 'N/A'} · Place of Supply: ${placeOfSupply}`, rightX + 12, y + 46, {
        width: colW - 24,
      })
      .text(recipientAddress, rightX + 12, y + 60, {
        width: colW - 24,
        height: 28,
      })
      .text(
        booking.sender.contactPerson && booking.sender.contactPerson !== recipientName
          ? `Contact: ${booking.sender.contactPerson} · Ph: ${recipientPhone}`
          : `Phone: ${recipientPhone}`,
        rightX + 12,
        y + 92,
        { width: colW - 24, ellipsis: true }
      );

    // 3. Shipment Reference Strip
    y += boxH + 12;
    const refH = 48;
    doc.roundedRect(left, y, pageWidth, refH, 6).fillAndStroke(BG_SUBTLE, BORDER_SOFT);
    doc
      .fillColor(SLATE_500)
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .text('BOOKING & CONSIGNMENT LANE', left + 12, y + 10)
      .text('E-WAY BILL NO.', left + 250, y + 10)
      .text('PAYMENT MODE', left + 405, y + 10);

    const paymentModeLabel =
      booking.paymentMode === 'WALLET'
        ? 'Prepaid Wallet'
        : booking.paymentMode === 'CASH'
          ? 'Cash'
          : booking.paymentMode === 'TO_PAY'
            ? 'To Pay'
            : 'B2B Invoice';

    doc
      .fillColor(INK)
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text(
        `${booking.origin.city} (${booking.origin.pincode}) -> ${booking.destination.city} (${booking.destination.pincode})`,
        left + 12,
        y + 24,
        { width: 225, ellipsis: true }
      )
      .text(booking.ewayBillNumber || 'Not Provided', left + 250, y + 24, { width: 140 })
      .text(paymentModeLabel, left + 405, y + 24);

    // 4. Taxable Line Items Table
    y += refH + 14;
    const platformChargeAmt = Number(booking.pricingSnapshot.platformCharge ?? booking.platformCharge ?? 0);
    const taxableValue =
      Number(booking.freight) +
      Number(booking.pricingSnapshot.additionalCharges || 0) +
      platformChargeAmt;
    const gstRate = booking.pricingSnapshot.gstApplicable ? booking.pricingSnapshot.gstRatePercent : 0;
    const totalTax = Number(booking.tax || 0);
    const halfTax = Math.round((totalTax / 2) * 100) / 100;
    const secondHalfTax = Math.round((totalTax - halfTax) * 100) / 100;

    const lines: [string, string, string, string][] = [
      [
        SAC_CODE,
        `Road Goods Transport — ${booking.parcel.description} (${booking.lrNumber})`,
        `${booking.chargeableWeight.toFixed(2)} kg`,
        formatMoney(booking.freight),
      ],
      [
        SAC_CODE,
        'Handling, Documentation & Terminal Loading Charges',
        `${booking.parcel.numberOfPackages} pkg`,
        formatMoney(booking.pricingSnapshot.additionalCharges || 0),
      ],
    ];

    if (platformChargeAmt > 0) {
      lines.push([
        SAC_CODE,
        'Platform Service Charge',
        '1 shipment',
        formatMoney(platformChargeAmt),
      ]);
    }

    lines.push(['', 'Total Freight & Charges Value', '', formatMoney(taxableValue)]);

    if (booking.pricingSnapshot.gstApplicable && gstRate > 0) {
      if (isIntraState) {
        lines.push(['', `CGST @ ${(gstRate / 2).toFixed(1)}% (Intra-State)`, '', formatMoney(halfTax)]);
        lines.push(['', `SGST @ ${(gstRate / 2).toFixed(1)}% (Intra-State)`, '', formatMoney(secondHalfTax)]);
      } else {
        lines.push(['', `IGST @ ${gstRate.toFixed(1)}% (Inter-State)`, '', formatMoney(totalTax)]);
      }
    } else {
      lines.push(['', 'GST (Exempt / Nil)', '', formatMoney(0)]);
    }

    const tableH = 38 + lines.length * 22 + 40;
    doc.roundedRect(left, y, pageWidth, tableH, 6).fillAndStroke('#FFFFFF', BORDER);
    doc.roundedRect(left, y, pageWidth, 24, 6).fill('#F1F5F9');
    doc.rect(left, y + 18, pageWidth, 6).fill('#F1F5F9');

    doc
      .fillColor(SLATE_700)
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .text('SAC', left + 12, y + 8)
      .text('DESCRIPTION OF SERVICE', left + 70, y + 8)
      .text('QTY / WT', left + 310, y + 8, { width: 80, align: 'right' })
      .text('AMOUNT (INR)', left + pageWidth - 120, y + 8, { width: 108, align: 'right' });

    let ly = y + 34;
    lines.forEach(([sac, desc, qty, amt]) => {
      const isSubtotal = desc === 'Total Freight & Charges Value';
      doc
        .fillColor(isSubtotal ? INK : SLATE_700)
        .fontSize(8.5)
        .font(isSubtotal ? 'Helvetica-Bold' : 'Helvetica');
      if (sac) doc.text(sac, left + 12, ly, { width: 50 });
      doc.text(desc, left + 70, ly, { width: 235, ellipsis: true });
      if (qty) doc.text(qty, left + 310, ly, { width: 80, align: 'right' });
      doc.font('Helvetica-Bold').text(amt, left + pageWidth - 120, ly, { width: 108, align: 'right' });
      ly += 22;
    });

    const grandY = y + tableH - 36;
    doc.roundedRect(left + 1, grandY, pageWidth - 2, 35, 5).fill(BG_TINT);
    doc
      .fillColor(INK)
      .fontSize(10.5)
      .font('Helvetica-Bold')
      .text('GRAND TOTAL INVOICE VALUE', left + 12, grandY + 12);
    doc
      .fillColor(BLUE_DARK)
      .fontSize(12)
      .font('Helvetica-Bold')
      .text(formatMoney(booking.finalAmount), left + pageWidth - 150, grandY + 11, {
        width: 138,
        align: 'right',
      });

    // 5. Amount in Words & Declaration
    y += tableH + 14;
    doc.roundedRect(left, y, pageWidth, 44, 6).fillAndStroke(BG_SUBTLE, BORDER_SOFT);
    doc
      .fillColor(SLATE_500)
      .fontSize(7.5)
      .font('Helvetica-Bold')
      .text('AMOUNT IN WORDS', left + 12, y + 9);
    doc
      .fillColor(INK)
      .fontSize(9)
      .font('Helvetica-Bold')
      .text(amountToIndianWords(booking.finalAmount), left + 12, y + 22, { width: pageWidth - 24 });

    y += 58;
    doc
      .fillColor(SLATE_500)
      .fontSize(7.5)
      .font('Helvetica')
      .text(
        'This is a computer-generated GST Tax Invoice issued under Goods Transport Agency services (SAC 996511). Subject to Mumbai jurisdiction.',
        left,
        y,
        { align: 'center', width: pageWidth }
      );

    doc.end();
  });
}
