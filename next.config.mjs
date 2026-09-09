/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Sem Server Actions e sem next/image apontando para hosts externos no
  // projeto — de propósito: cada CVE recente do Next.js nessas duas áreas
  // (DoS/SSRF em Server Actions, DoS no Image Optimizer com remotePatterns
  // amplo) só se aplica a quem usa essas features. Reduzir a superfície em
  // vez de configurar "por via das dúvidas".
  output: 'standalone', // imagem Docker enxuta — ver Dockerfile
  webpack: (config) => {
    // bullmq tenta importar opcionalmente o cliente Valkey Glide (um driver
    // alternativo ao ioredis) — não usamos esse modo, então só silenciamos
    // o aviso de "módulo não encontrado" em vez de instalar uma dependência
    // extra que nunca é chamada em runtime.
    config.externals = [...(config.externals ?? []), '@valkey/valkey-glide'];
    return config;
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
