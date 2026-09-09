import { describe, expect, it } from 'vitest';
import { isLikelyVideoContainer } from '@/lib/upload/magic-bytes';

function mp4Header(): Buffer {
  const header = Buffer.alloc(16);
  header.write('ftyp', 4, 'ascii');
  return header;
}

function webmHeader(): Buffer {
  return Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
}

function aviHeader(): Buffer {
  const header = Buffer.alloc(16);
  header.write('RIFF', 0, 'ascii');
  header.write('AVI ', 8, 'ascii');
  return header;
}

describe('lib/upload/magic-bytes', () => {
  it('aceita um cabeçalho MP4/MOV válido (ftyp)', () => {
    expect(isLikelyVideoContainer(mp4Header())).toBe(true);
  });

  it('aceita um cabeçalho WebM/Matroska válido (EBML)', () => {
    expect(isLikelyVideoContainer(webmHeader())).toBe(true);
  });

  it('aceita um cabeçalho AVI válido (RIFF....AVI )', () => {
    expect(isLikelyVideoContainer(aviHeader())).toBe(true);
  });

  it('rejeita um arquivo qualquer que não é vídeo', () => {
    const fakeExe = Buffer.from('MZ' + '\0'.repeat(30));
    expect(isLikelyVideoContainer(fakeExe)).toBe(false);
  });

  it('rejeita um buffer curto demais para ter uma assinatura', () => {
    expect(isLikelyVideoContainer(Buffer.from([1, 2, 3]))).toBe(false);
  });
});
