/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sem Server Actions e sem next/image apontando para hosts externos no
  // projeto — de propósito: cada CVE recente do Next.js nessas duas áreas
  // (DoS/SSRF em Server Actions, DoS no Image Optimizer com remotePatterns
  // amplo) só se aplica a quem usa essas features. Reduzir a superfície em
  // vez de configurar "por via das dúvidas".
  output: 'standalone', // imagem Docker enxuta — ver Dockerfile (deploy alternativo/self-host; a Vercel não usa isso)
  experimental: {
    // A Vercel empacota cada rota de API rastreando os módulos que ela
    // importa — mas ffmpeg-static/ffprobe-static resolvem o caminho do
    // binário dinamicamente (process.platform), então o rastreamento
    // automático não os encontra. Duas rotas usam o MediaProcessor:
    // /api/inngest (transcodeMediaFunction, precisa de ffmpeg+ffprobe) e
    // .../upload/[mediaId]/complete (só detecta o codec logo após o
    // upload, precisa só do ffprobe) — sem isso, o probe falha em
    // silêncio (é tratado como erro recuperável) e todo vídeo acaba
    // caindo na transcodificação por segurança, que também falharia pelo
    // mesmo motivo.
    outputFileTracingIncludes: {
      '/api/inngest': ['./node_modules/ffmpeg-static/**/*', './node_modules/ffprobe-static/**/*'],
      '/api/media/upload/[mediaId]/complete': ['./node_modules/ffprobe-static/**/*'],
    },
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
