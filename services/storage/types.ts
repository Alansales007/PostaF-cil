/**
 * Contrato de armazenamento de objetos, independente do backend
 * (AWS S3, Cloudflare R2, Supabase Storage ou disco local em dev).
 * Todo o fluxo de upload resumível/em chunks fala apenas com esta
 * interface — nenhuma rota de API importa o SDK da AWS diretamente.
 */

export interface CreateMultipartUploadInput {
  key: string;
  contentType: string;
}

export interface UploadedPart {
  partNumber: number;
  etag: string;
  size: number;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface CompleteMultipartUploadInput {
  key: string;
  uploadId: string;
  parts: CompletedPart[];
}

export interface StorageService {
  readonly providerName: 's3' | 'local';

  createMultipartUpload(input: CreateMultipartUploadInput): Promise<{ uploadId: string }>;

  /** URL (assinada ou local) para o navegador enviar diretamente uma parte do arquivo. */
  getPartUploadUrl(input: { key: string; uploadId: string; partNumber: number }): Promise<{ url: string; expiresAt: Date }>;

  /** Partes já recebidas pelo storage para este uploadId — usado para retomar após queda/reload. */
  listUploadedParts(input: { key: string; uploadId: string }): Promise<UploadedPart[]>;

  completeMultipartUpload(input: CompleteMultipartUploadInput): Promise<{ sizeBytes: number }>;

  abortMultipartUpload(input: { key: string; uploadId: string }): Promise<void>;

  /** Lê os primeiros `length` bytes do objeto — usado para validar o container do vídeo sem baixar o arquivo inteiro. */
  readHeaderBytes(input: { key: string; length: number }): Promise<Buffer>;

  /** URL temporária (assinada) para leitura — usada quando uma API social exige acesso por URL. */
  getReadUrl(input: { key: string; expiresInSeconds: number }): Promise<string>;

  /** Baixa o objeto inteiro para um arquivo local — usado pelo MediaProcessor (FFmpeg precisa do arquivo completo em disco). */
  downloadToFile(input: { key: string; destPath: string }): Promise<void>;

  /** Envia um arquivo local inteiro para o storage (ex.: o vídeo já transcodificado). */
  uploadFile(input: { key: string; sourcePath: string; contentType: string }): Promise<void>;

  deleteObject(input: { key: string }): Promise<void>;
}
