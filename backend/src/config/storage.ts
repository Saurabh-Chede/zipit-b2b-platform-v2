import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { env } from './env.ts';
import { AppError } from '../utils/AppError.ts';

export interface StoredFileMeta {
  storageKey: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

export interface StorageHealthStatus {
  writable: boolean;
  provider: string;
}

export interface FileStorageProvider {
  readonly providerName: string;
  saveFile(buffer: Buffer, originalName: string, mimeType: string, prefix?: string): Promise<StoredFileMeta>;
  getFileReadStream(storageKey: string, notFoundCode?: string): Promise<Readable>;
  exists(storageKey: string): Promise<boolean>;
  deleteFile(storageKey: string): Promise<void>;
  checkHealth(): Promise<StorageHealthStatus>;
}

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

function sanitizeStorageKey(storageKey: string): string {
  const cleanKey = path.basename(storageKey);
  if (!cleanKey || cleanKey !== storageKey || cleanKey.includes('..') || cleanKey.includes('\\')) {
    throw new AppError('Invalid storage file key', 400, 'INVALID_FILE_KEY');
  }
  return cleanKey;
}

function buildStorageKey(originalName: string, mimeType: string, prefix = 'pod'): { storageKey: string; safeFileName: string } {
  const ext = MIME_EXTENSIONS[mimeType] || path.extname(originalName).toLowerCase() || '.bin';
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, '') || 'file';
  const storageKey = `${safePrefix}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
  const safeFileName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, '_');
  return { storageKey, safeFileName };
}

/**
 * Local disk storage provider (development, tests, or single-instance persistent disk deployments).
 */
export class LocalDiskStorageProvider implements FileStorageProvider {
  public readonly providerName = 'local-disk';
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = path.resolve(baseDir);
    fs.mkdirSync(this.baseDir, { recursive: true });
  }

  private resolveSafePath(storageKey: string): string {
    const cleanKey = sanitizeStorageKey(storageKey);
    const target = path.resolve(this.baseDir, cleanKey);
    if (!target.startsWith(this.baseDir + path.sep)) {
      throw new AppError('Path traversal detected', 400, 'INVALID_FILE_PATH');
    }
    return target;
  }

  async saveFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    prefix = 'pod'
  ): Promise<StoredFileMeta> {
    const { storageKey, safeFileName } = buildStorageKey(originalName, mimeType, prefix);
    const fullPath = this.resolveSafePath(storageKey);
    await fs.promises.writeFile(fullPath, buffer);

    return {
      storageKey,
      fileName: safeFileName,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  async getFileReadStream(storageKey: string, notFoundCode = 'DELIVERY_PROOF_FILE_NOT_FOUND'): Promise<Readable> {
    const fullPath = this.resolveSafePath(storageKey);
    if (!fs.existsSync(fullPath)) {
      throw new AppError('Stored file not found', 404, notFoundCode);
    }
    return fs.createReadStream(fullPath);
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      const fullPath = this.resolveSafePath(storageKey);
      await fs.promises.access(fullPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  async deleteFile(storageKey: string): Promise<void> {
    const fullPath = this.resolveSafePath(storageKey);
    if (fs.existsSync(fullPath)) {
      await fs.promises.unlink(fullPath);
    }
  }

  async checkHealth(): Promise<StorageHealthStatus> {
    try {
      await fs.promises.access(this.baseDir, fs.constants.R_OK | fs.constants.W_OK);
      return { writable: true, provider: this.providerName };
    } catch {
      return { writable: false, provider: this.providerName };
    }
  }
}

export interface S3StorageConfig {
  bucket: string;
  region: string;
  endpoint?: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  keyPrefix?: string;
  client?: S3Client;
}

/**
 * S3-compatible cloud object storage provider (Cloudflare R2, AWS S3, DigitalOcean Spaces, MinIO).
 * Keeps all objects private; files are streamed exclusively via authorized backend endpoints.
 */
export class S3StorageProvider implements FileStorageProvider {
  public readonly providerName = 's3-compatible';
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly keyPrefix: string;

  constructor(config: S3StorageConfig) {
    this.bucket = config.bucket;
    this.keyPrefix = (config.keyPrefix || '').replace(/^\/+|\/+$/g, '');
    this.client =
      config.client ||
      new S3Client({
        region: config.region || 'auto',
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        forcePathStyle: Boolean(config.forcePathStyle),
        credentials: {
          accessKeyId: config.accessKeyId,
          secretAccessKey: config.secretAccessKey,
        },
      });
  }

  private toObjectKey(storageKey: string): string {
    const cleanKey = sanitizeStorageKey(storageKey);
    return this.keyPrefix ? `${this.keyPrefix}/${cleanKey}` : cleanKey;
  }

  private isNotFoundError(err: unknown): boolean {
    if (!err || typeof err !== 'object') return false;
    const e = err as { name?: string; Code?: string; $metadata?: { httpStatusCode?: number } };
    return (
      e.name === 'NoSuchKey' ||
      e.name === 'NotFound' ||
      e.Code === 'NoSuchKey' ||
      e.$metadata?.httpStatusCode === 404
    );
  }

  async saveFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
    prefix = 'pod'
  ): Promise<StoredFileMeta> {
    const { storageKey, safeFileName } = buildStorageKey(originalName, mimeType, prefix);
    const objectKey = this.toObjectKey(storageKey);

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
        ContentLength: buffer.length,
        Metadata: {
          original_filename: safeFileName,
        },
      })
    );

    return {
      storageKey,
      fileName: safeFileName,
      mimeType,
      sizeBytes: buffer.length,
    };
  }

  async getFileReadStream(storageKey: string, notFoundCode = 'DELIVERY_PROOF_FILE_NOT_FOUND'): Promise<Readable> {
    const objectKey = this.toObjectKey(storageKey);
    try {
      const response = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        })
      );

      const body = response.Body;
      if (!body) {
        throw new AppError('Stored file not found', 404, notFoundCode);
      }

      if (body instanceof Readable) {
        return body;
      }

      if (typeof (body as { transformToWebStream?: () => unknown }).transformToWebStream === 'function') {
        const webStream = (body as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
        return Readable.fromWeb(webStream as unknown as import('stream/web').ReadableStream);
      }

      throw new AppError('Unable to stream stored file', 500, 'STORAGE_STREAM_ERROR');
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (this.isNotFoundError(err)) {
        throw new AppError('Stored file not found', 404, notFoundCode);
      }
      throw err;
    }
  }

  async exists(storageKey: string): Promise<boolean> {
    const objectKey = this.toObjectKey(storageKey);
    try {
      await this.client.send(
        new HeadObjectCommand({
          Bucket: this.bucket,
          Key: objectKey,
        })
      );
      return true;
    } catch (err) {
      if (this.isNotFoundError(err)) {
        return false;
      }
      throw err;
    }
  }

  async deleteFile(storageKey: string): Promise<void> {
    const objectKey = this.toObjectKey(storageKey);
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
      })
    );
  }

  async checkHealth(): Promise<StorageHealthStatus> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      return { writable: true, provider: this.providerName };
    } catch {
      return { writable: false, provider: this.providerName };
    }
  }
}

export function createStorageProvider(): FileStorageProvider {
  if (env.storageProvider === 's3') {
    return new S3StorageProvider({
      bucket: env.s3.bucket,
      region: env.s3.region,
      endpoint: env.s3.endpoint || undefined,
      accessKeyId: env.s3.accessKeyId,
      secretAccessKey: env.s3.secretAccessKey,
      forcePathStyle: env.s3.forcePathStyle,
      keyPrefix: env.s3.keyPrefix,
    });
  }
  return new LocalDiskStorageProvider(env.uploadDir);
}

export const fileStorage: FileStorageProvider = createStorageProvider();
