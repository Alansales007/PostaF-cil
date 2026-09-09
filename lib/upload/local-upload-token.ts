// Mantido como ponto de import estável para o storage local — a
// implementação genérica de assinatura vive em lib/signed-token.ts
// (reaproveitada também pela seleção de Página do Facebook).
export { signToken as signLocalToken, verifyToken as verifyLocalToken } from '@/lib/signed-token';

export interface LocalUploadPartTokenPayload {
  purpose: 'upload-part';
  uploadId: string;
  key: string;
  partNumber: number;
  exp: number;
}

export interface LocalReadTokenPayload {
  purpose: 'read';
  key: string;
  exp: number;
}
