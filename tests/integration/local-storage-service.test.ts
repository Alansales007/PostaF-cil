import { describe, expect, it, afterAll } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { LocalStorageService } from '@/services/storage/localStorageService';

/**
 * Testa o backend de storage em disco (usado em desenvolvimento quando
 * STORAGE_PROVIDER=local) de ponta a ponta: iniciar upload multipart,
 * simular a gravação de partes (como a rota /api/media/upload/local-part
 * faria), listar partes para retomada, concluir e ler o objeto final.
 */
describe('services/storage/localStorageService', () => {
  const storage = new LocalStorageService();
  const testKey = `tests/${randomUUID()}/video.mp4`;

  async function writePartDirectly(uploadId: string, partNumber: number, content: Buffer) {
    const dir = path.join(process.cwd(), '.data', 'uploads', uploadId);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `part-${partNumber}.bin`), content);
    const etag = `"${createHash('md5').update(content).digest('hex')}"`;
    await storage.recordUploadedPart(uploadId, { partNumber, etag, size: content.length });
    return etag;
  }

  afterAll(async () => {
    await storage.deleteObject({ key: testKey }).catch(() => {});
  });

  it('cobre o fluxo completo: iniciar, gravar partes, listar, concluir e ler', async () => {
    const { uploadId } = await storage.createMultipartUpload({ key: testKey, contentType: 'video/mp4' });
    expect(uploadId).toBeTruthy();

    const part1 = Buffer.from('ftyp'.padEnd(20, '0'));
    const part2 = Buffer.from('resto-do-arquivo-de-teste');

    const etag1 = await writePartDirectly(uploadId, 1, part1);
    const etag2 = await writePartDirectly(uploadId, 2, part2);

    const listed = await storage.listUploadedParts({ key: testKey, uploadId });
    expect(listed).toHaveLength(2);
    expect(listed.map((p) => p.partNumber).sort()).toEqual([1, 2]);

    const { sizeBytes } = await storage.completeMultipartUpload({
      key: testKey,
      uploadId,
      parts: [
        { partNumber: 1, etag: etag1 },
        { partNumber: 2, etag: etag2 },
      ],
    });
    expect(sizeBytes).toBe(part1.length + part2.length);

    const header = await storage.readHeaderBytes({ key: testKey, length: 4 });
    expect(header.toString('ascii')).toBe('ftyp');
  });

  it('aborta um upload em andamento removendo os arquivos temporários', async () => {
    const key = `tests/${randomUUID()}/aborted.mp4`;
    const { uploadId } = await storage.createMultipartUpload({ key, contentType: 'video/mp4' });
    await writePartDirectly(uploadId, 1, Buffer.from('parte-parcial'));

    await storage.abortMultipartUpload({ key, uploadId });

    const dirExists = await fs
      .access(path.join(process.cwd(), '.data', 'uploads', uploadId))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(false);
  });
});
