/**
 * Lançado por qualquer método do KwaiProvider enquanto a integração não
 * estiver liberada — ver providers/kwai/KwaiProvider.ts para o resultado
 * da pesquisa que levou a essa decisão.
 */
export class KwaiNotAvailableError extends Error {
  constructor() {
    super('Integração aguardando autorização da plataforma.');
    this.name = 'KwaiNotAvailableError';
  }
}
