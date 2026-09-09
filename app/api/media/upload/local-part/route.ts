import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { verifyLocalToken, type LocalUploadPartTokenPayload } from '@/lib/upload/local-upload-token';
import { getLocalStorageServiceForInternalRoute } from '@/services/storage';

/**
 * Recebe o binário de uma parte do upload quando STORAGE_PROVIDER=local
 * (desenvolvimento sem bucket real). Em produção (S3-compatible), o
 * navegador envia a parte diretamente para o storage via URL assinada —
 * esta rota nunca é chamada.
 */
export async function PUT(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const payload = token ? verifyLocalToken<LocalUploadPartTokenPayload>(token) : null;

  if (!payload || payload.purpose !== 'upload-part') {
    return NextResponse.json({ error: 'Token de upload inválido ou expirado.' }, { status: 403 });
  }

  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.length === 0) {
    return NextResponse.json({ error: 'Corpo da requisição vazio.' }, { status: 400 });
  }

  const uploadDir = path.join(process.cwd(), '.data', 'uploads', payload.uploadId);
  await fs.mkdir(uploadDir, { recursive: true });
  const partPath = path.join(uploadDir, `part-${payload.partNumber}.bin`);
  await fs.writeFile(partPath, buffer);

  const etag = `"${createHash('md5').update(buffer).digest('hex')}"`;

  const storage = getLocalStorageServiceForInternalRoute();
  await storage.recordUploadedPart(payload.uploadId, {
    partNumber: payload.partNumber,
    etag,
    size: buffer.length,
  });

  return new NextResponse(null, { status: 200, headers: { ETag: etag } });
}
