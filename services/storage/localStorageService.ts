import { promises as fs, createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { getEnv } from '@/lib/env';
import { signLocalToken } from '@/lib/upload/local-upload-token';
import type {
  CompleteMultipartUploadInput,
  CreateMultipartUploadInput,
  StorageService,
  UploadedPart,
} from './types';

const DATA_ROOT = path.join(process.cwd(), '.data');
const UPLOADS_ROOT = path.join(DATA_ROOT, 'uploads');
const OBJECTS_ROOT = path.join(DATA_ROOT, 'objects');
const PART_URL_EXPIRES_SECONDS = 15 * 60;

interface UploadMeta {
  key: string;
  contentType: string;
  parts: UploadedPart[];
}

async function readMeta(uploadId: string): Promise<UploadMeta> {
  const raw = await fs.readFile(path.join(UPLOADS_ROOT, uploadId, 'meta.json'), 'utf8');
  return JSON.parse(raw) as UploadMeta;
}

async function writeMeta(uploadId: string, meta: UploadMeta): Promise<void> {
  await fs.writeFile(path.join(UPLOADS_ROOT, uploadId, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8');
}

/**
 * Backend de armazenamento em disco local — usado apenas quando
 * STORAGE_PROVIDER=local, para desenvolvimento sem depender de um bucket
 * S3/R2/Supabase real. Implementa o mesmo contrato StorageService, então
 * o restante do sistema (rotas de upload, MediaProcessor, providers)
 * funciona de forma idêntica com qualquer um dos dois backends.
 */
export class LocalStorageService implements StorageService {
  readonly providerName = 'local' as const;

  private uploadDir(uploadId: string) {
    return path.join(UPLOADS_ROOT, uploadId);
  }

  private partFile(uploadId: string, partNumber: number) {
    return path.join(this.uploadDir(uploadId), `part-${partNumber}.bin`);
  }

  private objectFile(key: string) {
    return path.join(OBJECTS_ROOT, key);
  }

  async createMultipartUpload({ key, contentType }: CreateMultipartUploadInput) {
    const uploadId = createHash('sha1').update(`${key}:${Date.now()}:${Math.random()}`).digest('hex');
    await fs.mkdir(this.uploadDir(uploadId), { recursive: true });
    await writeMeta(uploadId, { key, contentType, parts: [] });
    return { uploadId };
  }

  async getPartUploadUrl({ key, uploadId, partNumber }: { key: string; uploadId: string; partNumber: number }) {
    const exp = Date.now() + PART_URL_EXPIRES_SECONDS * 1000;
    const token = signLocalToken({ purpose: 'upload-part' as const, uploadId, key, partNumber, exp });
    const env = getEnv();
    const url = `${env.APP_URL}/api/media/upload/local-part?token=${encodeURIComponent(token)}`;
    return { url, expiresAt: new Date(exp) };
  }

  async listUploadedParts({ uploadId }: { key: string; uploadId: string }): Promise<UploadedPart[]> {
    const meta = await readMeta(uploadId).catch(() => null);
    return meta?.parts ?? [];
  }

  /** Chamado pela rota /api/media/upload/local-part após gravar a parte em disco. */
  async recordUploadedPart(uploadId: string, part: UploadedPart): Promise<void> {
    const meta = await readMeta(uploadId);
    const withoutDuplicate = meta.parts.filter((p) => p.partNumber !== part.partNumber);
    meta.parts = [...withoutDuplicate, part].sort((a, b) => a.partNumber - b.partNumber);
    await writeMeta(uploadId, meta);
  }

  async completeMultipartUpload({ key, uploadId, parts }: CompleteMultipartUploadInput) {
    await fs.mkdir(path.dirname(this.objectFile(key)), { recursive: true });
    const sorted = [...parts].sort((a, b) => a.partNumber - b.partNumber);

    const writeStream = createWriteStream(this.objectFile(key));
    let totalSize = 0;
    for (const part of sorted) {
      const partPath = this.partFile(uploadId, part.partNumber);
      await new Promise<void>((resolve, reject) => {
        const read = createReadStream(partPath);
        read.on('data', (chunk) => {
          totalSize += chunk.length;
        });
        read.on('error', reject);
        read.pipe(writeStream, { end: false });
        read.on('end', () => resolve());
      });
    }
    await new Promise<void>((resolve) => writeStream.end(resolve));

    await fs.rm(this.uploadDir(uploadId), { recursive: true, force: true });
    return { sizeBytes: totalSize };
  }

  async abortMultipartUpload({ uploadId }: { key: string; uploadId: string }) {
    await fs.rm(this.uploadDir(uploadId), { recursive: true, force: true });
  }

  async readHeaderBytes({ key, length }: { key: string; length: number }): Promise<Buffer> {
    const handle = await fs.open(this.objectFile(key), 'r');
    try {
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, 0);
      return buffer.subarray(0, bytesRead);
    } finally {
      await handle.close();
    }
  }

  async getReadUrl({ key, expiresInSeconds }: { key: string; expiresInSeconds: number }): Promise<string> {
    const exp = Date.now() + expiresInSeconds * 1000;
    const token = signLocalToken({ purpose: 'read' as const, key, exp });
    const env = getEnv();
    return `${env.APP_URL}/api/media/file?token=${encodeURIComponent(token)}`;
  }

  async downloadToFile({ key, destPath }: { key: string; destPath: string }): Promise<void> {
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.copyFile(this.objectFile(key), destPath);
  }

  async uploadFile({ key, sourcePath }: { key: string; sourcePath: string; contentType: string }): Promise<void> {
    await fs.mkdir(path.dirname(this.objectFile(key)), { recursive: true });
    await fs.copyFile(sourcePath, this.objectFile(key));
  }

  async deleteObject({ key }: { key: string }) {
    await fs.rm(this.objectFile(key), { force: true });
  }
}
