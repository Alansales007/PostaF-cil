import { describe, expect, it } from 'vitest';
import { buildProviderAccessToken } from '@/lib/social/access-token-for-provider';
import { splitAccessToken as splitInstagram } from '@/providers/instagram/InstagramProvider';
import { splitAccessToken as splitFacebook } from '@/providers/facebook/FacebookProvider';

describe('lib/social/access-token-for-provider', () => {
  it('empacota Instagram como "igUserId:token"', () => {
    const packed = buildProviderAccessToken('INSTAGRAM', '178414000', 'token-abc');
    expect(splitInstagram(packed)).toEqual({ igUserId: '178414000', accessToken: 'token-abc' });
  });

  it('empacota Facebook como "pageId:token"', () => {
    const packed = buildProviderAccessToken('FACEBOOK', '112233', 'token-xyz');
    expect(splitFacebook(packed)).toEqual({ pageId: '112233', accessToken: 'token-xyz' });
  });

  it('TikTok e Kwai usam o token puro, sem empacotar', () => {
    expect(buildProviderAccessToken('TIKTOK', 'open-id-qualquer', 'token-tiktok')).toBe('token-tiktok');
    expect(buildProviderAccessToken('KWAI', 'id-qualquer', 'token-kwai')).toBe('token-kwai');
  });
});
