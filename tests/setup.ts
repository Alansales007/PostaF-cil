// Variáveis de ambiente mínimas para os testes rodarem sem depender
// de infraestrutura real (banco/Redis/storage).
process.env.NEXTAUTH_SECRET ||= 'test-secret-not-for-production';
process.env.DATABASE_URL ||= 'postgresql://postgres:postgres@localhost:5432/postafacil_test?schema=public';
process.env.REDIS_URL ||= 'redis://localhost:6379';
process.env.TOKEN_ENCRYPTION_KEY ||= '0'.repeat(64);
process.env.MOCK_SOCIAL_APIS ||= 'true';
