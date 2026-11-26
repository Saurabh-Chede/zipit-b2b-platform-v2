import { Readable } from 'stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, expect, it, vi } from 'vitest';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { buildApiUrl, resolveApiBaseUrl, resolveWebSocketUrl } from '../src/utils/apiConfig.ts';
import { LocalDiskStorageProvider, S3StorageProvider } from '../backend/src/config/storage.ts';

describe('Deployment URL & Cloud Storage Helpers', () => {
  it('resolves frontend API and WebSocket URLs across monolithic and separate origins', () => {
    expect(resolveApiBaseUrl('')).toBe('/api/v1');
    expect(resolveApiBaseUrl('https://api.zipit.in')).toBe('https://api.zipit.in/api/v1');
    expect(resolveApiBaseUrl('https://api.zipit.in/')).toBe('https://api.zipit.in/api/v1');
    expect(resolveApiBaseUrl('https://api.zipit.in/api/v1/')).toBe('https://api.zipit.in/api/v1');

    expect(buildApiUrl('/alerts/client-error', '')).toBe('/api/v1/alerts/client-error');
    expect(buildApiUrl('alerts/client-error', 'https://api.zipit.in')).toBe(
      'https://api.zipit.in/api/v1/alerts/client-error'
    );

    expect(
      resolveWebSocketUrl({
        rawWsUrl: '',
        rawApiUrl: '',
        locationProtocol: 'https:',
        locationHost: 'app.zipit.in',
      })
    ).toBe('wss://app.zipit.in/ws/notifications');

    expect(
      resolveWebSocketUrl({
        rawWsUrl: '',
        rawApiUrl: 'https://api.zipit.in',
        locationProtocol: 'https:',
        locationHost: 'app.zipit.in',
      })
    ).toBe('wss://api.zipit.in/ws/notifications');

    expect(
      resolveWebSocketUrl({
        rawWsUrl: 'wss://api.zipit.in',
        rawApiUrl: 'https://api.zipit.in',
      })
    ).toBe('wss://api.zipit.in/ws/notifications');

    expect(
      resolveWebSocketUrl({
        rawWsUrl: 'wss://api.zipit.in/ws/notifications/',
      })
    ).toBe('wss://api.zipit.in/ws/notifications');

    expect(
      resolveWebSocketUrl({
        rawApiUrl: 'https://api.zipit.in',
        token: 'jwt.token+value',
      })
    ).toBe('wss://api.zipit.in/ws/notifications?token=jwt.token%2Bvalue');
  });

  it('supports LocalDiskStorageProvider async stream and health check', async () => {
    const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zipit-storage-'));
    try {
      const provider = new LocalDiskStorageProvider(tmpDir);
      const saved = await provider.saveFile(Buffer.from('hello-zipit'), 'pod.png', 'image/png', 'pod');
      expect(await provider.exists(saved.storageKey)).toBe(true);

      const stream = await provider.getFileReadStream(saved.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      expect(Buffer.concat(chunks).toString('utf8')).toBe('hello-zipit');

      const health = await provider.checkHealth();
      expect(health).toEqual({ writable: true, provider: 'local-disk' });

      await provider.deleteFile(saved.storageKey);
      expect(await provider.exists(saved.storageKey)).toBe(false);
    } finally {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('supports S3StorageProvider put/get/head/delete/health and rejects path traversal', async () => {
    const objects = new Map<string, { body: Buffer; contentType: string }>();

    const mockS3Client = {
      send: vi.fn(async (command: unknown) => {
        if (command instanceof PutObjectCommand) {
          const input = command.input;
          objects.set(input.Key!, {
            body: Buffer.from(input.Body as Buffer),
            contentType: input.ContentType || 'application/octet-stream',
          });
          return {};
        }
        if (command instanceof HeadObjectCommand) {
          const key = command.input.Key!;
          if (!objects.has(key)) {
            const err = new Error('NotFound') as Error & { name: string; $metadata: { httpStatusCode: number } };
            err.name = 'NotFound';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return {};
        }
        if (command instanceof GetObjectCommand) {
          const key = command.input.Key!;
          const item = objects.get(key);
          if (!item) {
            const err = new Error('NoSuchKey') as Error & { name: string; $metadata: { httpStatusCode: number } };
            err.name = 'NoSuchKey';
            err.$metadata = { httpStatusCode: 404 };
            throw err;
          }
          return { Body: Readable.from([item.body]) };
        }
        if (command instanceof DeleteObjectCommand) {
          objects.delete(command.input.Key!);
          return {};
        }
        if (command instanceof HeadBucketCommand) {
          return {};
        }
        throw new Error('Unexpected S3 command');
      }),
    } as unknown as S3Client;

    const s3Provider = new S3StorageProvider({
      bucket: 'zipit-b2b-private',
      region: 'auto',
      endpoint: 'https://example.r2.cloudflarestorage.com',
      accessKeyId: 'test-key',
      secretAccessKey: 'test-secret',
      keyPrefix: 'zipit-uploads',
      client: mockS3Client,
    });

    const stored = await s3Provider.saveFile(Buffer.from('r2-bytes'), 'kyc doc.pdf', 'application/pdf', 'kyc');
    expect(stored.storageKey).toMatch(/^kyc-\d+-[a-f0-9]+\.pdf$/);
    expect(objects.has(`zipit-uploads/${stored.storageKey}`)).toBe(true);
    expect(await s3Provider.exists(stored.storageKey)).toBe(true);

    const stream = await s3Provider.getFileReadStream(stored.storageKey, 'KYC_DOC_FILE_NOT_FOUND');
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString('utf8')).toBe('r2-bytes');

    expect(await s3Provider.checkHealth()).toEqual({ writable: true, provider: 's3-compatible' });

    await expect(s3Provider.getFileReadStream('../secret.txt')).rejects.toMatchObject({
      statusCode: 400,
      errorCode: 'INVALID_FILE_KEY',
    });

    await s3Provider.deleteFile(stored.storageKey);
    expect(await s3Provider.exists(stored.storageKey)).toBe(false);
    await expect(s3Provider.getFileReadStream(stored.storageKey, 'KYC_DOC_FILE_NOT_FOUND')).rejects.toMatchObject({
      statusCode: 404,
      errorCode: 'KYC_DOC_FILE_NOT_FOUND',
    });
  });
});
