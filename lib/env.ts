import { z } from 'zod';

/**
 * Validação central das variáveis de ambiente.
 * Falha rápido e com mensagem clara em vez de quebrar em runtime
 * dentro de um provider ou worker.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NEXTAUTH_SECRET: z.string().min(1, 'NEXTAUTH_SECRET é obrigatório'),
  NEXTAUTH_URL: z.string().url().optional(),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL é obrigatório'),
  REDIS_URL: z.string().min(1, 'REDIS_URL é obrigatório'),

  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes)'),

  STORAGE_PROVIDER: z.string().default('s3'),
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_REGION: z.string().default('auto'),
  STORAGE_BUCKET: z.string().default('postafacil-media'),
  STORAGE_ACCESS_KEY_ID: z.string().optional(),
  STORAGE_SECRET_ACCESS_KEY: z.string().optional(),
  STORAGE_PUBLIC_BASE_URL: z.string().optional(),
  STORAGE_FORCE_PATH_STYLE: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  MEDIA_RETENTION_HOURS: z
    .string()
    .default('24')
    .transform((v) => Number(v)),

  MAX_UPLOAD_SIZE_MB: z.string().default('2048').transform(Number),
  ALLOWED_VIDEO_MIME_TYPES: z
    .string()
    .default('video/mp4,video/quicktime,video/webm,video/x-m4v,video/3gpp')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),

  MOCK_SOCIAL_APIS: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),

  // Instagram API with Instagram Login ("Business Login for Instagram") —
  // credenciais próprias do produto Instagram no app da Meta, distintas do
  // Facebook Login for Business usado pelo FacebookProvider (ETAPA 4).
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_REDIRECT_URI: z.string().optional(),
  INSTAGRAM_GRAPH_API_VERSION: z.string().default('v21.0'),

  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_REDIRECT_URI: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default('v21.0'),
  // Opcional: ID de uma "Login Configuration" do produto Facebook Login for
  // Business (App Dashboard > Facebook Login for Business > Configurações).
  // Quando definido, é usado no lugar do parâmetro `scope` no dialog OAuth,
  // como a Meta recomenda atualmente. Sem ele, caímos no dialog clássico
  // por `scope` (funciona igual para apps em modo de desenvolvimento/teste).
  FACEBOOK_CONFIG_ID: z.string().optional(),

  TIKTOK_CLIENT_KEY: z.string().optional(),
  TIKTOK_CLIENT_SECRET: z.string().optional(),
  TIKTOK_REDIRECT_URI: z.string().optional(),

  KWAI_CLIENT_ID: z.string().optional(),
  KWAI_CLIENT_SECRET: z.string().optional(),
  KWAI_REDIRECT_URI: z.string().optional(),
  KWAI_API_AVAILABLE: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),

  RATE_LIMIT_WINDOW_MS: z.string().default('60000').transform(Number),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100').transform(Number),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

/**
 * Lê e valida process.env sob demanda (lazy) para não quebrar o build
 * (`next build`/lint) em ambientes onde as env vars reais ainda não existem.
 * Rotas de API e workers devem chamar getEnv() antes de usar segredos.
 */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Variáveis de ambiente inválidas:\n${issues}`);
  }
  cached = parsed.data;
  return cached;
}

/**
 * Só para testes: força uma releitura de process.env na próxima chamada
 * de getEnv(). Sem isso, o cache em módulo faria um teste que muda
 * process.env no meio do arquivo continuar vendo o valor antigo.
 */
export function __resetEnvCacheForTests(): void {
  cached = undefined;
}
