import { describe, expect, it } from 'vitest';
import { decryptToken, encryptToken, maskToken } from '@/lib/crypto';

describe('lib/crypto — criptografia de tokens OAuth', () => {
  it('faz round-trip de criptografia/decriptografia preservando o valor original', () => {
    const original = 'access-token-super-secreto-1234567890';
    const encrypted = encryptToken(original);

    expect(encrypted).not.toBe(original);
    expect(encrypted).toContain('.');
    expect(decryptToken(encrypted)).toBe(original);
  });

  it('gera um payload diferente a cada chamada (IV aleatório)', () => {
    const a = encryptToken('mesmo-valor');
    const b = encryptToken('mesmo-valor');
    expect(a).not.toBe(b);
  });

  it('rejeita payload em formato inválido', () => {
    expect(() => decryptToken('formato-invalido')).toThrow();
  });

  it('rejeita payload adulterado (auth tag não confere)', () => {
    const encrypted = encryptToken('valor-original');
    const [iv, tag, data] = encrypted.split('.');
    if (!iv || !tag || !data) throw new Error('payload inesperado no teste');

    // Inverte um byte do ciphertext mantendo o mesmo tamanho, para garantir
    // que o conteúdo decodificado realmente muda (append simples pode ser
    // descartado pelo decodificador base64 caso não feche um grupo de 4).
    const dataBuf = Buffer.from(data, 'base64');
    dataBuf[0] = dataBuf[0]! ^ 0xff;
    const tampered = [iv, tag, dataBuf.toString('base64')].join('.');

    expect(() => decryptToken(tampered)).toThrow();
  });

  it('mascara o token mostrando apenas os últimos 4 caracteres', () => {
    expect(maskToken('abcdefgh1234')).toBe('****1234');
    expect(maskToken(null)).toBe('—');
    expect(maskToken(undefined)).toBe('—');
  });
});
