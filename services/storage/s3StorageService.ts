import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListPartsCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '@/lib/env';
import type {
  CompleteMultipartUploadInput,
  CreateMultipartUploadInput,
  StorageService,
  UploadedPart,
} from './types';

const PART_URL_EXPIRES_SECONDS = 15 * 60;

/**
 * Implementação real sobre qualquer backend S3-compatible
 * (AWS S3, Cloudflare R2, Supabase Storage via S3 gateway).
 *
 * Importante: o bucket precisa de CORS liberando PUT a partir da origem
 * do app para o upload direto do navegador funcionar (ver README, seção 5).
 */
export class S3StorageService implements StorageService {
  readonly providerName = 's3' as const;
  private client: S3Client;
  private bucket: string;
  private publicBaseUrl?: string;

  constructor() {
    const env = getEnv();
    this.bucket = env.STORAGE_BUCKET;
    this.publicBaseUrl = env.STORAGE_PUBLIC_BASE_URL;
    this.client = new S3Client({
      region: env.STORAGE_REGION,
      endpoint: env.STORAGE_ENDPOINT || undefined,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials:
        env.STORAGE_ACCESS_KEY_ID && env.STORAGE_SECRET_ACCESS_KEY
          ? { accessKeyId: env.STORAGE_ACCESS_KEY_ID, secretAccessKey: env.STORAGE_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async createMultipartUpload({ key, contentType }: CreateMultipartUploadInput) {
    const result = await this.client.send(
      new CreateMultipartUploadCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
    );
    if (!result.UploadId) throw new Error('S3 não retornou UploadId ao iniciar o multipart upload');
    return { uploadId: result.UploadId };
  }

  async getPartUploadUrl({ key, uploadId, partNumber }: { key: string; uploadId: string; partNumber: number }) {
    const command = new UploadPartCommand({
      Bucket: this.bucket,
      Key: key,
      UploadId: uploadId,
      PartNumber: partNumber,
    });
    const url = await getSignedUrl(this.client, command, { expiresIn: PART_URL_EXPIRES_SECONDS });
    return { url, expiresAt: new Date(Date.now() + PART_URL_EXPIRES_SECONDS * 1000) };
  }

  async listUploadedParts({ key, uploadId }: { key: string; uploadId: string }): Promise<UploadedPart[]> {
    const parts: UploadedPart[] = [];
    let partNumberMarker: string | undefined;

    do {
      const result = await this.client.send(
        new ListPartsCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId, PartNumberMarker: partNumberMarker }),
      );
      for (const p of result.Parts ?? []) {
        if (p.PartNumber && p.ETag && p.Size != null) {
          parts.push({ partNumber: p.PartNumber, etag: p.ETag, size: p.Size });
        }
      }
      partNumberMarker = result.IsTruncated ? result.NextPartNumberMarker : undefined;
    } while (partNumberMarker);

    return parts;
  }

  async completeMultipartUpload({ key, uploadId, parts }: CompleteMultipartUploadInput) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.bucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: {
          Parts: parts
            .sort((a, b) => a.partNumber - b.partNumber)
            .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
        },
      }),
    );

    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
    return { sizeBytes: head.ContentLength ?? 0 };
  }

  async abortMultipartUpload({ key, uploadId }: { key: string; uploadId: string }) {
    await this.client.send(new AbortMultipartUploadCommand({ Bucket: this.bucket, Key: key, UploadId: uploadId }));
  }

  async readHeaderBytes({ key, length }: { key: string; length: number }): Promise<Buffer> {
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${length - 1}` }),
    );
    const bytes = await result.Body?.transformToByteArray();
    return Buffer.from(bytes ?? []);
  }

  async getReadUrl({ key, expiresInSeconds }: { key: string; expiresInSeconds: number }): Promise<string> {
    if (this.publicBaseUrl) {
      return `${this.publicBaseUrl.replace(/\/$/, '')}/${key}`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: expiresInSeconds });
  }

  async deleteObject({ key }: { key: string }) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
