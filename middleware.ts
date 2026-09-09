import { withAuth } from 'next-auth/middleware';

export default withAuth({
  pages: {
    signIn: '/login',
  },
});

export const config = {
  // Atenção: /api/media/file fica de fora de propósito — ele já se
  // autentica pelo próprio token assinado embutido na URL (ver
  // services/storage/localStorageService.ts), e precisa ser alcançável
  // sem cookie de sessão: é assim que o ffmpeg/ffprobe do MediaProcessor
  // (rodando fora do navegador) conseguem ler o vídeo em modo local.
  matcher: [
    '/dashboard/:path*',
    '/publications/:path*',
    '/settings/:path*',
    '/api/social/:path*',
    '/api/media/upload/:path*',
    '/api/media/:mediaId/url',
    '/api/media/:mediaId/validate',
    '/api/publications/:path*',
  ],
};
