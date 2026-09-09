/**
 * Guarda no navegador qual mediaId/uploadId corresponde a um arquivo já
 * identificado (nome + tamanho + data de modificação), para permitir
 * retomar o envio mesmo depois de fechar a aba ou perder a conexão —
 * não só durante o mesmo carregamento de página.
 */
const STORAGE_PREFIX = 'postafacil-upload:';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface ResumeEntry {
  mediaId: string;
  createdAt: number;
}

export function fingerprintFile(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function saveResumeEntry(file: File, mediaId: string): void {
  try {
    const key = STORAGE_PREFIX + fingerprintFile(file);
    const entry: ResumeEntry = { mediaId, createdAt: Date.now() };
    window.localStorage.setItem(key, JSON.stringify(entry));
  } catch {
    // localStorage indisponível — só perde a retomada entre sessões, não é fatal
  }
}

export function getResumeEntry(file: File): string | null {
  try {
    const key = STORAGE_PREFIX + fingerprintFile(file);
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as ResumeEntry;
    if (Date.now() - entry.createdAt > MAX_AGE_MS) {
      window.localStorage.removeItem(key);
      return null;
    }
    return entry.mediaId;
  } catch {
    return null;
  }
}

export function clearResumeEntry(file: File): void {
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + fingerprintFile(file));
  } catch {
    // ignora
  }
}
