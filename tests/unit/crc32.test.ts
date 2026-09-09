import { describe, expect, it } from 'vitest';
import { StreamingCrc32, crc32Hex } from '@/lib/upload/crc32';

describe('lib/upload/crc32', () => {
  it('produz o mesmo checksum processando de uma vez ou em pedaços', () => {
    const data = new TextEncoder().encode('PostaFácil - publique uma vez, conecte o seu mundo.');

    const whole = crc32Hex(data);

    const streaming = new StreamingCrc32();
    streaming.update(data.subarray(0, 10));
    streaming.update(data.subarray(10, 25));
    streaming.update(data.subarray(25));

    expect(streaming.digestHex()).toBe(whole);
  });

  it('gera checksums diferentes para conteúdos diferentes', () => {
    const a = crc32Hex(new TextEncoder().encode('conteudo-a'));
    const b = crc32Hex(new TextEncoder().encode('conteudo-b'));
    expect(a).not.toBe(b);
  });

  it('é determinístico para o mesmo conteúdo', () => {
    const data = new TextEncoder().encode('mesmo conteudo sempre');
    expect(crc32Hex(data)).toBe(crc32Hex(data));
  });
});
