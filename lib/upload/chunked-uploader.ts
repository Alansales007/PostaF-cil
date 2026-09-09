import { DEFAULT_PART_SIZE_BYTES, getPartRange, type PartPlan } from './part-plan';
import { StreamingCrc32 } from './crc32';
import { saveResumeEntry, getResumeEntry, clearResumeEntry } from './resume-store';
import type { VideoMetadata } from './read-video-metadata';

export type UploadPhase =
  | 'idle'
  | 'initializing'
  | 'uploading'
  | 'completing'
  | 'done'
  | 'error'
  | 'cancelled';

export interface UploadProgress {
  loadedBytes: number;
  totalBytes: number;
  percent: number;
}

export interface ChunkedUploadCallbacks {
  onPhaseChange?: (phase: UploadPhase) => void;
  onProgress?: (progress: UploadProgress) => void;
  onError?: (message: string) => void;
  onComplete?: (mediaId: string) => void;
}

interface UploadedPartInfo {
  partNumber: number;
  etag: string;
  size: number;
}

const MAX_ATTEMPTS_PER_PART = 5;
const CONCURRENCY = 3;

async function withBackoff<T>(fn: () => Promise<T>, attempt: number): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= MAX_ATTEMPTS_PER_PART) throw err;
    const delayMs = Math.min(1000 * 2 ** (attempt - 1), 15_000);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return withBackoff(fn, attempt + 1);
  }
}

/**
 * Motor de upload resumível em chunks — roda inteiramente no navegador.
 *
 * - Nunca lê o arquivo inteiro de uma vez: cada parte é lida com
 *   `File.slice()` (visão preguiçosa do arquivo, sem cópia em memória)
 *   e só vira bytes de fato na hora do envio daquela parte.
 * - Cada parte tenta novamente com backoff exponencial antes de desistir.
 * - Ao recarregar a página com o mesmo arquivo, retoma consultando quais
 *   partes o storage já confirma ter recebido (GET /parts) em vez de
 *   reenviar tudo de novo.
 */
export class ChunkedUploader {
  private xhrs = new Map<number, XMLHttpRequest>();
  private cancelled = false;
  private phase: UploadPhase = 'idle';

  constructor(
    private file: File,
    private metadata: VideoMetadata | null,
    private callbacks: ChunkedUploadCallbacks = {},
  ) {}

  private setPhase(phase: UploadPhase) {
    this.phase = phase;
    this.callbacks.onPhaseChange?.(phase);
  }

  cancel() {
    this.cancelled = true;
    for (const xhr of this.xhrs.values()) xhr.abort();
    this.xhrs.clear();
    this.setPhase('cancelled');
  }

  private putPartWithProgress(partNumber: number, url: string, blob: Blob, onProgress: (loaded: number) => void): Promise<string> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.xhrs.set(partNumber, xhr);

      const done = () => this.xhrs.delete(partNumber);

      xhr.open('PUT', url);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
      xhr.onload = () => {
        done();
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(xhr.getResponseHeader('ETag') ?? '');
        } else {
          reject(new Error(`Falha ao enviar parte (HTTP ${xhr.status})`));
        }
      };
      xhr.onerror = () => {
        done();
        reject(new Error('Falha de rede ao enviar parte do vídeo.'));
      };
      xhr.onabort = () => {
        done();
        reject(new Error('Envio cancelado.'));
      };
      xhr.send(blob);
    });
  }

  async start(): Promise<string> {
    try {
      return await this.run();
    } catch (err) {
      if (this.phase !== 'cancelled') {
        this.setPhase('error');
        this.callbacks.onError?.(err instanceof Error ? err.message : 'Falha desconhecida no upload.');
      }
      throw err;
    }
  }

  private async run(): Promise<string> {
    this.setPhase('initializing');

    const resumedMediaId = getResumeEntry(this.file);
    let mediaId: string;
    let plan: PartPlan;
    let alreadyUploaded: UploadedPartInfo[] = [];

    if (resumedMediaId) {
      const resumeInfo = await this.tryResume(resumedMediaId);
      if (resumeInfo) {
        ({ mediaId, plan, alreadyUploaded } = resumeInfo);
      } else {
        clearResumeEntry(this.file);
        ({ mediaId, plan } = await this.initUpload());
      }
    } else {
      ({ mediaId, plan } = await this.initUpload());
    }

    saveResumeEntry(this.file, mediaId);

    const totalBytes = this.file.size;
    const doneParts = new Map<number, UploadedPartInfo>(alreadyUploaded.map((p) => [p.partNumber, p]));
    const inFlightBytes = new Map<number, number>();

    const reportProgress = () => {
      const completedBytes = [...doneParts.values()].reduce((sum, p) => sum + p.size, 0);
      const pendingBytes = [...inFlightBytes.values()].reduce((sum, b) => sum + b, 0);
      const loadedBytes = Math.min(completedBytes + pendingBytes, totalBytes);
      this.callbacks.onProgress?.({
        loadedBytes,
        totalBytes,
        percent: totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0,
      });
    };

    this.setPhase('uploading');
    const crc = new StreamingCrc32();

    const partNumbers = Array.from({ length: plan.totalParts }, (_, i) => i + 1);
    let cursor = 0;

    const worker = async () => {
      while (cursor < partNumbers.length) {
        if (this.cancelled) return;
        const partNumber = partNumbers[cursor++]!;
        const { start, end } = getPartRange(partNumber, plan, totalBytes);
        const blob = this.file.slice(start, end);

        // Hash sempre, mesmo em partes já enviadas antes (resume), para o
        // checksum final continuar representando o arquivo inteiro em ordem.
        const buffer = new Uint8Array(await blob.arrayBuffer());
        crc.update(buffer);

        if (doneParts.has(partNumber)) {
          reportProgress();
          continue;
        }

        await withBackoff(async () => {
          if (this.cancelled) throw new Error('cancelado');
          const { url } = await this.requestPartUrl(mediaId, partNumber);
          const etag = await this.putPartWithProgress(partNumber, url, new Blob([buffer]), (loaded) => {
            inFlightBytes.set(partNumber, loaded);
            reportProgress();
          });
          inFlightBytes.delete(partNumber);
          doneParts.set(partNumber, { partNumber, etag, size: buffer.length });
          reportProgress();
        }, 1);
      }
    };

    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, partNumbers.length) }, () => worker()));

    if (this.cancelled) {
      throw new Error('Upload cancelado.');
    }

    this.setPhase('completing');
    const checksum = crc.digestHex();
    const parts = [...doneParts.values()]
      .sort((a, b) => a.partNumber - b.partNumber)
      .map((p) => ({ partNumber: p.partNumber, etag: p.etag }));

    await this.completeUpload(mediaId, parts, checksum);
    clearResumeEntry(this.file);

    this.setPhase('done');
    this.callbacks.onComplete?.(mediaId);
    return mediaId;
  }

  private async initUpload(): Promise<{ mediaId: string; plan: PartPlan }> {
    const res = await fetch('/api/media/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: this.file.name, mimeType: this.file.type, filesizeBytes: this.file.size }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Não foi possível iniciar o upload.');
    }
    const data = await res.json();
    return {
      mediaId: data.mediaId,
      plan: { partSize: data.partSize ?? DEFAULT_PART_SIZE_BYTES, totalParts: data.totalParts },
    };
  }

  private async tryResume(
    mediaId: string,
  ): Promise<{ mediaId: string; plan: PartPlan; alreadyUploaded: UploadedPartInfo[] } | null> {
    const res = await fetch(`/api/media/upload/${mediaId}/parts`);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.status !== 'UPLOADING' || !data.partSize || !data.totalParts) return null;
    return {
      mediaId,
      plan: { partSize: data.partSize, totalParts: data.totalParts },
      alreadyUploaded: data.uploadedParts ?? [],
    };
  }

  private async requestPartUrl(mediaId: string, partNumber: number): Promise<{ url: string }> {
    const res = await fetch(`/api/media/upload/${mediaId}/part-url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partNumber }),
    });
    if (!res.ok) throw new Error('Não foi possível obter a URL de envio da parte.');
    return res.json();
  }

  private async completeUpload(
    mediaId: string,
    parts: { partNumber: number; etag: string }[],
    checksum: string,
  ): Promise<void> {
    const res = await fetch(`/api/media/upload/${mediaId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parts,
        checksum,
        duration: this.metadata?.duration,
        width: this.metadata?.width,
        height: this.metadata?.height,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Não foi possível concluir o upload.');
    }
  }
}
