import { describe, expect, it } from 'vitest';
import { TikTokApiError } from '@/providers/tiktok/api';
import { describeTikTokError, describeFailReason } from '@/providers/tiktok/errors';

describe('providers/tiktok/errors', () => {
  it('traduz token inválido pedindo reconexão', () => {
    const result = describeTikTokError(new TikTokApiError('token invalid', 'access_token_invalid'));
    expect(result.code).toBe('TOKEN_EXPIRED');
    expect(result.reconnectRequired).toBe(true);
  });

  it('traduz escopo faltando pedindo reconexão', () => {
    const result = describeTikTokError(new TikTokApiError('missing scope', 'scope_not_authorized'));
    expect(result.code).toBe('MISSING_SCOPE');
    expect(result.reconnectRequired).toBe(true);
  });

  it('traduz rate limit sem pedir reconexão', () => {
    const result = describeTikTokError(new TikTokApiError('too fast', 'rate_limit_exceeded'));
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.reconnectRequired).toBe(false);
  });

  it('describeFailReason traduz motivos conhecidos de falha de publicação', () => {
    expect(describeFailReason('duration_check_failed')).toMatch(/duração/);
    expect(describeFailReason('spam_risk_user_banned_from_posting')).toMatch(/impedida/);
  });

  it('describeFailReason lida com motivo desconhecido sem quebrar', () => {
    expect(describeFailReason('algo_novo_nao_mapeado')).toContain('algo_novo_nao_mapeado');
  });

  it('describeFailReason retorna null quando não há motivo', () => {
    expect(describeFailReason(undefined)).toBeNull();
  });
});
