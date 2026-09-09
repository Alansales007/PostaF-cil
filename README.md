# PostaFácil

**Publique uma vez. Conecte o seu mundo.**

Painel web para publicar vídeos simultaneamente no Instagram, Facebook, TikTok e Kwai, usando **somente APIs oficiais** de cada plataforma (sem automação de navegador, scraping ou simulação de cliques).

> Estado atual: as 10 etapas do roteiro original estão prontas — estrutura, banco, login, upload, as 4 integrações sociais, fila com retry/idempotência, agendamento, testes/segurança e o material de deploy (Docker + CI) — **mais a transcodificação de vídeo (MediaProcessor/FFmpeg)**, que não fazia parte das 10 etapas originais mas fecha um "nunca presuma" que ficava em aberto desde o upload. O que falta a partir daqui é só configuração externa (credenciais reais das plataformas, infraestrutura de produção) — ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para o roteiro completo e a seção 15 abaixo para o checklist final.

## Sumário

1. [Requisitos](#1-requisitos)
2. [Instalação](#2-instalação)
3. [Banco de dados](#3-banco-de-dados)
4. [Redis](#4-redis)
5. [Storage](#5-storage)
6. [Configuração — Meta (Instagram)](#6-configuração--meta-instagram)
7. [Configuração — Meta (Facebook)](#7-configuração--meta-facebook)
8. [Configuração — TikTok](#8-configuração--tiktok)
9. [Configuração — Kwai](#9-configuração--kwai)
10. [Variáveis de ambiente](#10-variáveis-de-ambiente)
11. [Execução local](#11-execução-local)
12. [Deploy](#12-deploy)
13. [Configuração OAuth (visão geral)](#13-configuração-oauth-visão-geral)
14. [URLs de callback](#14-urls-de-callback)
15. [Checklist para produção](#15-checklist-para-produção)
16. [Modo mock (desenvolvimento sem credenciais)](#16-modo-mock-desenvolvimento-sem-credenciais)
17. [Testes](#17-testes)
18. [Segurança — revisão feita nesta etapa](#18-segurança--revisão-feita-nesta-etapa)

---

## 1. Requisitos

- Node.js 20+
- PostgreSQL 14+ (local, Docker ou Supabase)
- Redis 6+ (fila BullMQ)
- FFmpeg instalado no servidor do worker (a partir da ETAPA 2/7 — não necessário para a ETAPA 1)
- Uma conta de storage compatível com S3 (AWS S3, Cloudflare R2 ou Supabase Storage) — a partir da ETAPA 2

## 2. Instalação

```bash
npm install
cp .env.example .env
# preencha .env com os valores descritos na seção 10
npm run db:generate
npm run db:migrate
npm run dev
```

A aplicação sobe em `http://localhost:3000`.

## 3. Banco de dados

O schema fica em [prisma/schema.prisma](prisma/schema.prisma) e cobre: `users`, `social_accounts`, `media_files`, `publications`, `publication_targets`, `oauth_states`, `audit_logs`.

```bash
# aplica migrations em desenvolvimento (cria uma nova se o schema mudou)
npm run db:migrate

# aplica migrations existentes (produção/CI, não gera novas)
npm run db:deploy

# inspecionar dados
npm run db:studio
```

Com Supabase: use a *Connection string* (modo "Session" ou "Transaction pooling", conforme o plano) do painel do projeto em `DATABASE_URL`.

## 4. Redis

Necessário para a fila BullMQ e para o pub/sub de eventos em tempo real. Localmente:

```bash
docker run -p 6379:6379 redis:7-alpine
```

Defina `REDIS_URL=redis://localhost:6379`.

### 4.1 Fila, retries e tempo real

Ao clicar em **Publicar**, a rota `POST /api/publications` cria uma `Publication` e um `PublicationTarget` por rede selecionada, e enfileira cada um independentemente ([lib/queue/publish-queue.ts](lib/queue/publish-queue.ts)) — o processo `npm run worker` ([workers/publishWorker.ts](workers/publishWorker.ts)) é quem de fato chama cada `SocialProvider`.

- **Idempotência**: o worker nunca chama `publishVideo()` duas vezes para o mesmo alvo — uma vez que existe um `providerContainerId`, só faz polling (`getPublishStatus`). Enquanto um alvo está em andamento, o próprio job se reagenda nele mesmo (`job.moveToDelayed`, o padrão oficial do BullMQ para jobs de longa duração) em vez de criar um job novo.
- **Retry**: erros são classificados em [lib/queue/retry-policy.ts](lib/queue/retry-policy.ts) — permanentes (token expirado, mídia recusada, permissão faltando) falham na hora e pedem reconexão; temporários (rate limit, erro de rede) tentam de novo com backoff exponencial + jitter, respeitando `Retry-After`/`retryAfterSeconds` quando a plataforma informa, até `maxAttempts` (padrão 5) por alvo.
- **Se uma rede falha, as outras não são afetadas** — cada `PublicationTarget` é uma linha independente; "Tentar novamente" ([POST /api/publications/[id]/retry](app/api/publications/[id]/retry/route.ts)) só reprocessa a rede que falhou.
- **Tempo real**: o worker publica cada mudança de status no Redis ([lib/realtime/publish-events.ts](lib/realtime/publish-events.ts)); a rota [/api/events](app/api/events/route.ts) expõe isso como Server-Sent Events, consumido pelo hook [usePublicationEvents](hooks/use-publication-events.ts) — funciona nativamente no Safari do iPhone, sem biblioteca extra.
- **Detalhes técnicos**: cada `PublicationTarget` guarda um histórico (`statusHistory`) com timestamp e mensagem de cada transição, exibido na tela de detalhes da publicação.
- **Agendamento**: "Publicar agora" ou "Agendar" usam o mesmo mecanismo — o delay do job BullMQ é calculado a partir de `scheduledAt` ([lib/publication/schedule.ts](lib/publication/schedule.ts)), então a publicação acontece no horário certo mesmo com o navegador fechado, sem depender de nenhum cron externo. O fuso horário exibido é o detectado no navegador (`Intl.DateTimeFormat().resolvedOptions().timeZone`) — o PostaFácil não oferece escolher um fuso diferente do seu ainda, para evitar bugs de conversão sem uma biblioteca de timezone dedicada. Cancelar um agendamento (antes de qualquer rede começar a processar) remove o job ainda em espera da fila.

## 5. Storage

A camada `StorageService` ([services/storage](services/storage)) fala com qualquer backend S3-compatible através de upload multipart (o mesmo mecanismo usado pelo upload resumível em chunks do navegador):

- **`STORAGE_PROVIDER=local`** (padrão em `.env.example`): grava em `./.data`, sem precisar de nenhum bucket real. Use para desenvolver e rodar os testes sem depender de infraestrutura externa.
- **AWS S3**: `STORAGE_PROVIDER=s3`, `STORAGE_ENDPOINT` vazio, `STORAGE_REGION` = região do bucket.
- **Cloudflare R2**: `STORAGE_PROVIDER=s3`, `STORAGE_ENDPOINT=https://<account_id>.r2.cloudflarestorage.com`, `STORAGE_REGION=auto`.
- **Supabase Storage**: `STORAGE_PROVIDER=s3`, use o endpoint S3-compatible do painel (Storage → Settings → S3 Connection).

**CORS do bucket (obrigatório em produção)**: como o navegador envia cada parte do vídeo diretamente para o bucket via URL assinada, ele precisa liberar `PUT` a partir da origem do app, por exemplo:

```json
[
  {
    "AllowedOrigins": ["https://seu-dominio.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag"]
  }
]
```

O bucket guarda os vídeos **temporariamente**; a exclusão automática (24h configurável via `MEDIA_RETENTION_HOURS`) só ocorre depois que todas as plataformas selecionadas processaram o vídeo (implementado no `cleanupWorker`, ETAPA 7).

### 5.1 Upload de vídeo

- `MAX_UPLOAD_SIZE_MB` (padrão 2048) e `ALLOWED_VIDEO_MIME_TYPES` controlam o que é aceito em `/api/media/upload/init`.
- O vídeo nunca passa pelo processo Next.js: o navegador o divide em partes (~8MB, calculado em [lib/upload/part-plan.ts](lib/upload/part-plan.ts)) e envia cada uma diretamente ao storage por URL assinada — sem carregar o arquivo inteiro na memória do navegador.
- Cada parte tenta novamente com backoff exponencial ([lib/upload/chunked-uploader.ts](lib/upload/chunked-uploader.ts)); ao recarregar a página com o mesmo arquivo, o upload retoma consultando ao storage quais partes já foram recebidas (`GET /api/media/upload/[mediaId]/parts`) em vez de reenviar tudo.
- Integridade: o tamanho final é conferido contra o declarado, os primeiros bytes são validados como um container de vídeo real (MP4/MOV/WebM/AVI — [lib/upload/magic-bytes.ts](lib/upload/magic-bytes.ts)), um checksum CRC32 é calculado no navegador enquanto os chunks são lidos ([lib/upload/crc32.ts](lib/upload/crc32.ts)), e logo em seguida o `ffprobe` detecta o codec real do vídeo (ver seção 5.2 e [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#10-mediaprocessor-transcodificação)).

### 5.2 Transcodificação (MediaProcessor)

Quando o vídeo não está em MP4/H.264/AAC (ex.: `.mov` em HEVC, comum em iPhones recentes; ou `.webm`/VP9), o `createPublication()` aciona automaticamente o [MediaProcessor](services/mediaProcessor.ts) antes de publicar — sem que o usuário precise fazer nada. Usa `ffmpeg-static`/`ffprobe-static` (binários próprios, não depende de FFmpeg instalado no servidor). O arquivo original **nunca** é sobrescrito nem alterado; a versão convertida fica num caminho irmão (`.../transcoded.mp4`) e é isso que é publicado. Proporção e resolução são sempre preservadas — a transcodificação corrige container/codec, não "conserta" enquadramento.

## 6. Configuração — Meta (Instagram)

O PostaFácil usa o **Instagram API with Instagram Login** ("Business Login for Instagram") — o fluxo atual e recomendado pela Meta, que não depende de uma Página do Facebook. Endpoints e escopos abaixo conferidos na documentação oficial em setembro/2026 ([Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)) — **revalide antes de ir para produção**, a Meta muda esses detalhes com alguma frequência.

1. Crie um app em [developers.facebook.com](https://developers.facebook.com/apps) e adicione o produto **Instagram** (Business Login for Instagram).
2. A conta do Instagram precisa ser **Profissional** (Business ou Creator) — não precisa mais estar vinculada a uma Página do Facebook nesse fluxo.
3. Escopos usados: `instagram_business_basic` (perfil) e `instagram_business_content_publish` (publicar). Apps novos usam esses nomes; escopos antigos (`instagram_basic`, `instagram_content_publish`, do fluxo via Facebook Login) foram descontinuados pela Meta em janeiro/2025.
4. Solicite **App Review** para `instagram_business_content_publish` antes de publicar para usuários reais fora da lista de testers do app.
5. Preencha `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_REDIRECT_URI` (o App ID/Secret são os do produto Instagram do app, não o `META_APP_ID` genérico — esse é usado pelo FacebookProvider na ETAPA 4).
6. Token: a autorização retorna um token de curta duração (~1h), trocado por um de longa duração válido por 60 dias (`services/tokenService.ts` renova automaticamente com 5 dias de antecedência). Não há *refresh token* separado — o próprio access token de longa duração é renovado nele mesmo.
7. **Desconectar**: o PostaFácil remove a conta do seu banco, mas a Graph API não expõe um endpoint de revogação total para este fluxo — para revogar de vez, o usuário precisa remover o app em *Instagram > Configurações > Apps e mídia > Permissões do site* (a interface já avisa isso).

## 7. Configuração — Meta (Facebook)

Conferido contra a documentação oficial em setembro/2026 ([Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business), [Reels Publishing](https://developers.facebook.com/docs/video-api/guides/reels-publishing/)).

1. No mesmo app Meta, adicione o produto **Facebook Login for Business**.
2. O usuário precisa ser administrador de pelo menos uma Página do Facebook.
3. Escopos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts` — exigem **App Review** para funcionar com usuários fora da lista de testers.
4. (Opcional, recomendado pela Meta) Crie uma *Login Configuration* em Facebook Login for Business e preencha `FACEBOOK_CONFIG_ID` — nesse caso o dialog usa `config_id` no lugar de `scope`. Sem isso, o dialog clássico por `scope` funciona normalmente.
5. Preencha `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`.
6. **Múltiplas Páginas**: se o usuário administra mais de uma Página, o PostaFácil mostra uma tela para escolher qual conectar — o token de cada Página só é decifrado depois da escolha.
7. Token de Página derivado do token de usuário de longa duração **não expira** (só é invalidado por revogação/troca de senha) — por isso não há uma renovação automática real para o Facebook, diferente do Instagram.

## 8. Configuração — TikTok

Conferido contra a documentação oficial em setembro/2026 ([Login Kit](https://developers.tiktok.com/doc/login-kit-overview/), [Content Posting API](https://developers.tiktok.com/docs/en/content-posting-api-get-started)).

1. Crie um app em [developers.tiktok.com](https://developers.tiktok.com).
2. Ative **Login Kit** e **Content Posting API**.
3. Configure `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_REDIRECT_URI`.
4. O PostaFácil publica via `PULL_FROM_URL` por padrão — o domínio do seu storage (`STORAGE_PUBLIC_BASE_URL` ou o do bucket) precisa estar **verificado** no painel do TikTok (Content Posting API > Domain Verification). Sem isso, use o modo `FILE_UPLOAD` (já implementado em [providers/tiktok/api.ts](providers/tiktok/api.ts), envio em chunks para a `upload_url` retornada pelo TikTok).
5. Apps **não auditados** só publicam em modo privado (`SELF_ONLY`) — é o que o PostaFácil usa por padrão até você passar pela auditoria da TikTok e a tela de publicação (ETAPA 7) obter consentimento explícito para outro nível de privacidade.
6. Particularidade de implementação: o PKCE do TikTok deriva o `code_challenge` como SHA-256 do `code_verifier` **em hex**, não em base64url (diferente da maioria dos provedores OAuth) — já tratado em [providers/tiktok/pkce.ts](providers/tiktok/pkce.ts).

## 9. Configuração — Kwai

Pesquisado em setembro/2026 antes de implementar: **não existe hoje uma Kwai Open Platform pública de publicação de vídeo** equivalente à do Instagram, Facebook ou TikTok. `developers.kwai.com` serve um painel interno de gestão, não um developer portal de self-service; o único produto com OAuth documentado publicamente é o **Kwai for Business / Magnetic Engine**, uma API de **anúncios**, não de publicação orgânica em nome de um usuário. Não encontrei nenhum escopo equivalente a `user_video_publish` documentado.

Por isso o [`KwaiProvider`](providers/kwai/KwaiProvider.ts) não faz nenhuma chamada de rede — toda ação lança um erro claro (`KwaiNotAvailableError`) — e enquanto `KWAI_API_AVAILABLE=false` (padrão), a interface exibe:

> "Integração aguardando autorização da plataforma."

Se você conseguir credenciais via uma parceria comercial direta com a Kwai no futuro, preencha `KWAI_CLIENT_ID`, `KWAI_CLIENT_SECRET`, `KWAI_REDIRECT_URI`, `KWAI_API_AVAILABLE=true` — e implemente as chamadas reais em `providers/kwai/api.ts` (a criar) usando a documentação que a Kwai fornecer na parceria, mantendo o restante do contrato (`SocialProvider`) intacto.

**Em desenvolvimento** (`MOCK_SOCIAL_APIS=true`), o Kwai funciona como qualquer outra rede — o objetivo do modo mock é testar o sistema inteiro de ponta a ponta, independentemente do que está aprovado de verdade.

## 10. Variáveis de ambiente

Ver [.env.example](.env.example) — comentado, sem nenhum segredo real. Nunca commitar `.env`.

Destaques de segurança:

- `NEXTAUTH_SECRET`: gere com `openssl rand -base64 32`.
- `TOKEN_ENCRYPTION_KEY`: 32 bytes em hex (`openssl rand -hex 32`) — usada para cifrar (AES-256-GCM) os tokens OAuth antes de gravar no banco.

## 11. Execução local

```bash
npm run dev        # app Next.js (frontend + API routes)
npm run worker      # processo worker (BullMQ) — a partir da ETAPA 7
```

São dois processos porque transcodificação de vídeo e polling de status das redes sociais não podem rodar dentro do tempo de vida de uma requisição HTTP.

## 12. Deploy

O sistema é sempre **dois processos** — nunca dá pra rodar o worker dentro do mesmo host serverless do app (ver [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)).

### Opção A — Vercel (app) + container separado (worker)

- **App**: deploy normal no Vercel (ou qualquer host com suporte a Next.js 14). `npm run build` já usa `output: 'standalone'`.
- **Worker**: Vercel não roda processos de longa duração — suba `Dockerfile.worker` em Fly.io, Railway, Render ou uma VM comum, apontando para o mesmo Postgres/Redis/storage do app.
- Rode `npx prisma migrate deploy` (não `migrate dev`) como parte do processo de deploy do app, antes de trocar o tráfego para a nova versão.

### Opção B — Docker (app + worker no mesmo lugar)

Este repositório já traz [Dockerfile](Dockerfile) (app, multi-stage, imagem final rodando como usuário não-root), [Dockerfile.worker](Dockerfile.worker) e [docker-compose.yml](docker-compose.yml) (stack completa com Postgres e Redis reais — útil até em desenvolvimento, para validar a fila de ponta a ponta):

```bash
cp .env.example .env   # preencha os valores reais
docker compose up -d postgres redis
docker compose run --rm app npx prisma migrate deploy
docker compose up -d app worker
```

Em produção, aponte `DATABASE_URL`/`REDIS_URL`/`STORAGE_*` para serviços gerenciados (RDS/Supabase, ElastiCache/Upstash, S3/R2) em vez dos containers `postgres`/`redis` do compose, que são só para desenvolvimento/homologação.

### Observabilidade do deploy

- `GET /api/health` — liveness/readiness probe (checa Postgres e Redis), sem autenticação, pronto para load balancer/orquestrador.
- [.github/workflows/ci.yml](.github/workflows/ci.yml) — roda `typecheck`, `lint`, `test` e `build` a cada push/PR contra um Postgres e Redis reais (o `db:deploy` das migrations é exercitado de verdade aqui, diferente do ambiente local de desenvolvimento).

## 13. Configuração OAuth (visão geral)

Todo fluxo segue: `authorization URL` (com `state` assinado e persistido em `oauth_states`, expira em 10 min) → `callback` → troca de `code` por token → token cifrado salvo em `social_accounts`. PKCE é usado onde a plataforma exige (TikTok).

## 14. URLs de callback

| Plataforma | Variável | Valor local |
|---|---|---|
| Instagram | `INSTAGRAM_REDIRECT_URI` | `http://localhost:3000/api/social/instagram/callback` |
| Facebook | `META_REDIRECT_URI` | `http://localhost:3000/api/social/facebook/callback` |
| TikTok | `TIKTOK_REDIRECT_URI` | `http://localhost:3000/api/social/tiktok/callback` |
| Kwai | `KWAI_REDIRECT_URI` | `http://localhost:3000/api/social/kwai/callback` |

Em produção, troque `http://localhost:3000` pelo domínio HTTPS real e cadastre a mesma URL no portal de cada plataforma.

## 15. Checklist para produção

- [ ] `.env` de produção preenchido com segredos reais (nunca reaproveitar os de desenvolvimento)
- [ ] `NEXTAUTH_SECRET` e `TOKEN_ENCRYPTION_KEY` gerados especificamente para produção
- [ ] `MOCK_SOCIAL_APIS=false`
- [ ] Apps da Meta e TikTok em modo **Live** (não em desenvolvimento) e com App Review aprovado para os escopos usados
- [ ] Domínio verificado no TikTok (se usar `PULL_FROM_URL`)
- [ ] HTTPS válido em todas as URLs de callback
- [ ] Bucket de storage com política de acesso mínima necessária (URLs assinadas, não bucket público permanente)
- [ ] Worker rodando como processo de longa duração monitorado (restart automático em caso de crash)
- [ ] Alertas configurados para filas com jobs falhando repetidamente
- [ ] Rate limiting e CSRF revisados nas rotas expostas
- [ ] Rotina de expurgo de mídia temporária (`MEDIA_RETENTION_HOURS`) testada
- [ ] Logs validados para garantir que nenhum token completo é gravado
- [ ] `Content-Security-Policy` avaliado e testado no navegador (não incluído por padrão — ver seção 18)
- [ ] Rate limiting migrado de memória para Redis se rodar mais de uma instância do app
- [ ] Avaliar upgrade do Next.js para a versão 15/16 (`npm audit`) — a 14.2.35 já corrige o bypass de autorização no middleware, mas algumas advisories restantes só têm correção completa em versões major
- [ ] Testar a transcodificação (`transcodeWorker`) rodando de verdade no container Linux de produção — só foi validada nativamente no Windows neste ambiente; os Dockerfiles usam `node:20-slim` (não `alpine`) de propósito, por causa da compatibilidade do binário do ffmpeg-static com glibc

## 16. Modo mock (desenvolvimento sem credenciais)

Com `MOCK_SOCIAL_APIS=true` (padrão em `.env.example`), todos os providers respondem com dados simulados — dá para testar login, conexão de conta, upload e o ciclo completo de publicação sem chamar nenhuma API real nem publicar nada de verdade. Ver [providers/mock/MockProvider.ts](providers/mock/MockProvider.ts).

O botão "Conectar" também funciona nesse modo: ele passa pelo mesmo fluxo OAuth real (state CSRF persistido, redirect, callback) só que a tela de consentimento da rede social é substituída por [app/api/mock/oauth/authorize](app/api/mock/oauth/authorize/route.ts), que já "aceita" na hora e devolve um `code` fake — então dá pra clicar em Conectar → ver a conta aparecer como conectada sem nenhuma credencial real.

## 17. Testes

```bash
npm run test        # roda uma vez
npm run test:watch  # modo watch
npm run typecheck   # checagem de tipos
npm run lint        # ESLint
```

Cobertura por área: OAuth (CSRF do `state`, PKCE do TikTok), upload (chunking, checksum, magic bytes, storage local), publicação (validação de `createPublication` — vídeo de outro usuário, rede não conectada, agendamento no passado), retry/idempotência (`retry-policy`, `poll-decision`), falha parcial (`aggregatePublicationStatus`), expiração/renovação de token (`tokenService`). Providers reais (Instagram/Facebook/TikTok) são testados na camada de regras puras (constraints, mapeamento de erro) — as chamadas de rede em si só podem ser validadas com credenciais reais.

## 18. Segurança — revisão feita nesta etapa

Revisão manual do código (sem git configurado neste ambiente, então não deu pra usar diff de PR) cobrindo: IDOR, CSRF, XSS, SSRF, path traversal, mass assignment, exposição de segredos em log, e limites de payload. Resumo:

- **IDOR**: toda rota que opera em um recurso (mídia, publicação, conta social) confere `resource.userId === session.user.id` antes de qualquer leitura/escrita — adicionei um teste (`publication-service-validation.test.ts`) cravando esse comportamento para `createPublication`.
- **CSRF**: cookies de sessão do NextAuth são `SameSite=Lax` por padrão (não alterado) — bloqueia o cenário clássico de CSRF via formulário cross-site em POST. O `state` do OAuth cobre o fluxo de conexão de contas.
- **XSS**: nenhuma `dangerouslySetInnerHTML`/`eval` no projeto — todo conteúdo dinâmico (legendas, nomes de arquivo) passa por interpolação JSX normal, escapada pelo React.
- **Injeção**: 100% das consultas passam pelo Prisma (parametrizado) — nenhum `$queryRaw`/`$executeRaw` no código.
- **Payloads sem limite**: encontrei e corrigi dois pontos sem teto de tamanho — o array `parts` do `/api/media/upload/[mediaId]/complete` (agora `.max(9500)`, alinhado ao limite do S3) e `providers` duplicados em `/api/publications` (agora rejeitado com mensagem clara em vez de estourar a constraint única do banco no meio de uma transação).
- **Rate limiting**: adicionei nas rotas de retry/cancelamento de publicação e na finalização da escolha de Página do Facebook, que ainda não tinham (as demais rotas mutáveis já tinham desde as etapas anteriores). Continua em memória por instância — documentado como ponto de atenção para múltiplas instâncias em produção.
- **Segredos em log**: `lib/logger.ts` redige campos sensíveis automaticamente; conferi manualmente que nenhuma rota loga token/senha fora desses campos.
- **Path traversal**: a chave de storage é sempre montada a partir de um `mediaId` gerado pelo servidor + `path.extname()` do nome original (que nunca contém `/`) — o nome de arquivo do usuário não participa da chave além disso.
- **CSP**: não adicionei um `Content-Security-Policy` porque não consigo testar visualmente no navegador neste ambiente que ele não quebra a hidratação do Next.js — fica como item do checklist abaixo em vez de arriscar publicar algo não verificado.

---

## Estrutura do projeto

```
/app            → rotas Next.js (App Router): páginas + API routes
/components     → componentes React (ui, dashboard, auth, theme, upload)
/hooks          → hooks React (ex.: useChunkedUpload)
/lib            → db, auth, crypto, logger, env, rate-limit, utils, signed-token,
                   redis, upload/*, oauth/*, social/*, queue/* (fila + retry),
                   publication/* (status/histórico), realtime/* (SSE)
/services       → storage/ (S3 + local), publicationService, tokenService, mediaProcessor (FFmpeg real)
/providers      → contrato SocialProvider + instagram/ facebook/ tiktok/ kwai/ mock/
/workers        → processo BullMQ separado — publishWorker e transcodeWorker reais; cleanup ainda placeholder
/prisma         → schema.prisma + migrations
/types          → tipos compartilhados
/tests          → testes unitários e de integração
/docs           → documentação de arquitetura
/.github/workflows → CI (typecheck, lint, test, build contra Postgres/Redis reais)
Dockerfile, Dockerfile.worker, docker-compose.yml → deploy (ver seção 12)
```

Veja [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para a análise completa de arquitetura, fluxos OAuth por plataforma, credenciais necessárias e limitações conhecidas de cada API.
