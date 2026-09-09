import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import path from 'node:path';
import { db } from '@/lib/db';
import { verifyLocalToken, type LocalReadTokenPayload } from '@/lib/upload/local-upload-token';

/**
 * Serve o binário de um objeto guardado pelo LocalStorageService
 * (STORAGE_PROVIDER=local, desenvolvimento). Suporta Range requests
 * porque o Safari só reproduz <video> corretamente com isso.
 *
 * Em produção (S3-compatible) esta rota não é usada — o vídeo é lido
 * diretamente da URL assinada do storage.
 */
// Autentica só pelo token assinado na query string (sem cookies()) — sem
// isso o Next.js poderia tentar otimizar esta rota como estática em build.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const payload = token ? verifyLocalToken<LocalReadTokenPayload>(token) : null;
  if (!payload || payload.purpose !== 'read') {
    return NextResponse.json({ error: 'Token de leitura inválido ou expirado.' }, { status: 403 });
  }

  const filePath = path.join(process.cwd(), '.data', 'objects', payload.key);
  const mediaFile = await db.mediaFile.findFirst({ where: { storagePath: payload.key } });
  const contentType = mediaFile?.mimeType ?? 'application/octet-stream';

  let fileSize: number;
  try {
    fileSize = (await stat(filePath)).size;
  } catch {
    return NextResponse.json({ error: 'Arquivo não encontrado.' }, { status: 404 });
  }

  const range = req.headers.get('range');
  if (range) {
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? Number(match[1]) : 0;
    const end = match?.[2] ? Number(match[2]) : fileSize - 1;
    const chunkSize = end - start + 1;

    const stream = createReadStream(filePath, { start, end });
    return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
      status: 206,
      headers: {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
      },
    });
  }

  const stream = createReadStream(filePath);
  return new NextResponse(Readable.toWeb(stream) as unknown as ReadableStream, {
    status: 200,
    headers: {
      'Content-Length': String(fileSize),
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType,
    },
  });
}
