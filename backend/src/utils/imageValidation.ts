import { AppError } from './AppError.ts';

export function verifyImageMagicBytes(
  buffer: Buffer,
  mimeType: string,
  contextLabel = 'uploaded image'
): void {
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

  const valid =
    ((mimeType === 'image/jpeg' || mimeType === 'image/jpg') && isJpeg) ||
    (mimeType === 'image/png' && isPng) ||
    (mimeType === 'image/webp' && isWebp);

  if (!valid) {
    throw new AppError(
      `The ${contextLabel} contents do not match the declared image format.`,
      400,
      'INVALID_FILE_SIGNATURE'
    );
  }
}
