/**
 * CRC32 incremental (streaming) — puro JS, roda no navegador e no Node.
 *
 * Usado como checksum de integridade do arquivo inteiro calculado no
 * cliente ENQUANTO cada chunk é lido para upload, sem nunca precisar
 * manter o vídeo inteiro em memória: cada chamada a `update()` processa
 * só o chunk que já está sendo enviado.
 */
let table: Uint32Array | null = null;

function getTable(): Uint32Array {
  if (table) return table;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    t[n] = c >>> 0;
  }
  table = t;
  return t;
}

export class StreamingCrc32 {
  private crc = 0xffffffff;

  update(chunk: Uint8Array): void {
    const t = getTable();
    let crc = this.crc;
    for (let i = 0; i < chunk.length; i++) {
      const byte = chunk[i]!;
      crc = t[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
    }
    this.crc = crc;
  }

  digestHex(): string {
    const value = (this.crc ^ 0xffffffff) >>> 0;
    return value.toString(16).padStart(8, '0');
  }
}

export function crc32Hex(data: Uint8Array): string {
  const crc = new StreamingCrc32();
  crc.update(data);
  return crc.digestHex();
}
