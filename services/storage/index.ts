import { getEnv } from '@/lib/env';
import { S3StorageService } from './s3StorageService';
import { LocalStorageService } from './localStorageService';
import type { StorageService } from './types';

export type { StorageService, UploadedPart, CreateMultipartUploadInput, CompleteMultipartUploadInput } from './types';

let cached: StorageService | undefined;

/**
 * Fábrica central do storage. STORAGE_PROVIDER=local usa disco (só em
 * desenvolvimento); qualquer outro valor usa o backend S3-compatible real
 * configurado em .env (AWS S3, Cloudflare R2 ou Supabase Storage).
 */
export function getStorageService(): StorageService {
  if (cached) return cached;
  const env = getEnv();
  cached = env.STORAGE_PROVIDER === 'local' ? new LocalStorageService() : new S3StorageService();
  return cached;
}

/** Só para a rota interna /api/media/upload/local-part — não usar fora do modo local. */
export function getLocalStorageServiceForInternalRoute(): LocalStorageService {
  const service = getStorageService();
  if (!(service instanceof LocalStorageService)) {
    throw new Error('getLocalStorageServiceForInternalRoute só pode ser usado com STORAGE_PROVIDER=local');
  }
  return service;
}
