import { describe, expect, it } from 'vitest';
import { createPendingPageSelection, readPendingPageSelection, decryptSelectedPageToken } from '@/lib/oauth/facebook-page-selection';

describe('lib/oauth/facebook-page-selection', () => {
  it('empacota, assina e recupera a lista de Páginas com os tokens cifrados', () => {
    const token = createPendingPageSelection('user-1', [
      { id: 'page-1', name: 'Loja A', category: 'Comércio', accessToken: 'token-pagina-a' },
      { id: 'page-2', name: 'Loja B', category: null, accessToken: 'token-pagina-b' },
    ]);

    const selection = readPendingPageSelection(token);
    expect(selection).not.toBeNull();
    expect(selection!.userId).toBe('user-1');
    expect(selection!.pages).toHaveLength(2);

    // O token de acesso nunca aparece em texto puro no payload.
    expect(JSON.stringify(selection)).not.toContain('token-pagina-a');

    const decrypted = decryptSelectedPageToken(selection!.pages[0]!);
    expect(decrypted).toBe('token-pagina-a');
  });

  it('rejeita um token assinado adulterado', () => {
    const token = createPendingPageSelection('user-1', [
      { id: 'page-1', name: 'Loja A', category: null, accessToken: 'token-a' },
    ]);
    const tampered = token.slice(0, -2) + 'xx';
    expect(readPendingPageSelection(tampered)).toBeNull();
  });

  it('rejeita um token inválido/vazio', () => {
    expect(readPendingPageSelection('lixo')).toBeNull();
  });
});
