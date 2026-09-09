# PostaFácil — Arquitetura

> Nome final do produto: **PostaFácil** ("Publique uma vez. Conecte o seu mundo."). O prompt original citava o codinome "MultiPost" — mantido apenas como referência histórica interna.

## 1. Análise dos requisitos (resumo)

O sistema precisa de três planos de execução bem separados, porque têm perfis de latência e de confiabilidade muito diferentes:

1. **Plano síncrono (HTTP)** — login, CRUD, OAuth connect/callback, upload resumível. Deve responder rápido (segundos).
2. **Plano de processamento (worker)** — transcodificação FFmpeg e chamadas às APIs sociais (que podem levar minutos e exigem polling). Nunca deve rodar dentro de uma requisição HTTP.
3. **Plano de notificação em tempo real** — SSE para refletir no navegador o que o worker está fazendo, sem polling agressivo do cliente.

Isso implica **dois processos Node/TS**: o app Next.js (frontend + API routes finas, só enfileiram trabalho) e um **worker** BullMQ separado (mesmo código-fonte, `tsx workers/index.ts`), ambos falando com o mesmo PostgreSQL/Redis/Storage. Rodar o worker fora do runtime serverless da Vercel é obrigatório — funções serverless têm timeout incompatível com polling de processamento de vídeo do Instagram/TikTok.

## 2. Stack

| Camada | Escolha | Justificativa |
|---|---|---|
| Frontend | Next.js 14 (App Router) + React 18 + TS + Tailwind | SSR, mobile-first, rotas de API colocadas |
| Auth do app | NextAuth.js v4 (Credentials + JWT) | Login próprio do PostaFácil é independente do OAuth das redes sociais |
| ORM/DB | Prisma + PostgreSQL (compatível com Supabase Postgres) | Migrations versionadas, type-safety |
| Storage | Camada `StorageService` sobre S3-compatible (`@aws-sdk/client-s3`) — funciona com R2, Backblaze ou Supabase Storage (S3-compatible) | Um único código para qualquer provedor |
| Fila | BullMQ + Redis (ioredis) | Retry/backoff nativo, jobs atrasados = agendamento |
| Transcodificação | FFmpeg via `fluent-ffmpeg`, executado só no worker | Nunca no processo web |
| Tempo real | Server-Sent Events (`/api/events`) | Mais simples que WebSocket atrás de proxies/CDN, funciona bem em Safari iOS |
| Testes | Vitest + mocks de provider | Rápido, ESM nativo |

## 3. Árvore de diretórios

```
/app
  /(auth)/login, /(auth)/register
  /(dashboard)/dashboard, /publications, /publications/new, /settings
  /api/auth/[...nextauth]
  /api/social/[provider]/connect|callback|disconnect
  /api/media/upload/init|chunk|complete
  /api/publications, /api/publications/[id], /api/publications/[id]/retry
  /api/events
/components/{ui,dashboard,publication,providers,theme}
/lib            -> db, redis, auth, crypto, logger, env, rate-limit, sse
/services       -> mediaProcessor, storageService, publicationService, tokenService
/providers      -> SocialProvider (contrato) + instagram/ facebook/ tiktok/ kwai/ mock/
/workers        -> index, publishWorker, transcodeWorker, cleanupWorker
/prisma         -> schema.prisma, migrations
/types
/utils
/tests/{unit,integration,mocks}
```

## 4. Esquema de banco

Ver `prisma/schema.prisma`. Tabelas: `User`, `SocialAccount`, `MediaFile`, `Publication`, `PublicationTarget`, `OAuthState`, `AuditLog`, com enums `Provider`, `SocialAccountStatus`, `MediaFileStatus`, `PublicationStatus`, `PublicationTargetStatus`. `PublicationTarget` tem `@@unique([publicationId, provider])` para garantir idempotência (não é possível criar dois alvos da mesma rede na mesma publicação).

## 5. Fluxo OAuth por plataforma

Todos os fluxos usam `state` assinado + persistido em `OAuthState` (expira em 10 min) para CSRF. PKCE é usado onde a plataforma suporta/exige.

- **Instagram** — confirmado contra a documentação oficial em setembro/2026 ([Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/), [Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/)): fluxo **Instagram API with Instagram Login** ("Business Login for Instagram"), que não depende mais de uma Página do Facebook. Autorização em `https://www.instagram.com/oauth/authorize` (`client_id`, `redirect_uri`, `response_type=code`, `scope` separado por vírgula, `state`); troca do `code` em `https://api.instagram.com/oauth/access_token` (token curto, ~1h); troca para token de longa duração (60 dias) em `https://graph.instagram.com/access_token` (`grant_type=ig_exchange_token`); renovação em `https://graph.instagram.com/refresh_access_token` (`grant_type=ig_refresh_token`). Sem PKCE (cliente confidencial). Escopos: `instagram_business_basic` e `instagram_business_content_publish` (os antigos `instagram_basic`/`instagram_content_publish` do fluxo via Facebook Login foram descontinuados pela Meta em jan/2025). Implementado em [providers/instagram](../providers/instagram).
- **Facebook** — confirmado contra a documentação oficial em setembro/2026 ([Facebook Login for Business](https://developers.facebook.com/documentation/facebook-login/facebook-login-for-business), [fluxo manual](https://developers.facebook.com/docs/facebook-login/guides/advanced/manual-flow), [token de longa duração](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived), [Reels Publishing](https://developers.facebook.com/docs/video-api/guides/reels-publishing/)): autorização em `https://www.facebook.com/{version}/dialog/oauth` (`client_id`, `redirect_uri`, `state`, e `scope` — ou `config_id` de uma Login Configuration, que a Meta recomenda no lugar de `scope` para Facebook Login for Business); troca do `code` em `https://graph.facebook.com/{version}/oauth/access_token`; troca para token de usuário de longa duração via `grant_type=fb_exchange_token` (~60 dias); Páginas administradas via `GET /me/accounts` — cada uma já vem com seu próprio **token de Página**, que não expira quando derivado de um token de usuário de longa duração. Escopos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`. Publicação de Reels é um fluxo de 3 passos separado do upload de vídeo comum: `POST /{page-id}/video_reels` (`upload_phase=start` → `video_id`+`upload_url`), envio do vídeo para `rupload.facebook.com` (aceita `file_url` apontando para uma URL já hospedada, sem reenviar o binário), `POST /{page-id}/video_reels` (`upload_phase=finish`, `video_state=PUBLISHED`). Status via `GET /{video_id}?fields=status` (`video_status`: `ready`/`processing`/`error`). Como um usuário pode administrar mais de uma Página, o callback resolve isso com uma tela de escolha quando necessário — ver [providers/facebook](../providers/facebook) e [lib/oauth/facebook-page-selection.ts](../lib/oauth/facebook-page-selection.ts).
- **TikTok** — confirmado contra a documentação oficial em setembro/2026 ([Login Kit](https://developers.tiktok.com/doc/login-kit-overview/), [gestão de tokens](https://developers.tiktok.com/doc/oauth-user-access-token-management), [Content Posting API](https://developers.tiktok.com/docs/en/content-posting-api-get-started), [status de publicação](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)): autorização em `https://www.tiktok.com/v2/auth/authorize/`, token em `https://open.tiktokapis.com/v2/oauth/token/`. **PKCE obrigatório** — particularidade importante: o `code_challenge` é o SHA-256 do `code_verifier` **em hex**, não em base64url como a maioria dos provedores. Escopos: `user.info.basic`, `video.publish`. Token de acesso dura 24h, refresh token dura 365 dias (o único dos três providers implementados que usa o padrão clássico access+refresh token). Publicação via Direct Post: `POST /v2/post/publish/creator_info/query/` (obrigatório antes de publicar — retorna os níveis de privacidade disponíveis e o limite de duração real da conta, que **não é um valor fixo do app**), `POST /v2/post/publish/video/init/` (`PULL_FROM_URL` ou `FILE_UPLOAD`), status via `POST /v2/post/publish/status/fetch/` (limite de 30 chamadas/min por token). Apps não auditados só publicam como `SELF_ONLY` — o provider usa esse nível por padrão até haver uma tela de consentimento explícito do usuário (ETAPA 7). É o único dos três com endpoint de revogação real (`POST /v2/oauth/revoke/`). Implementado em [providers/tiktok](../providers/tiktok).
- **Kwai** — pesquisado em setembro/2026 (não apenas "documentação limitada": **não existe uma Kwai Open Platform pública de publicação de vídeo equivalente às demais**). `developers.kwai.com` hoje serve um painel interno ("MAPI 管理平台"), não um developer portal de self-service; o único produto com OAuth e escopos documentados publicamente é o **Kwai for Business / Magnetic Engine** (kwai-marketing-api) — uma API de **anúncios/campanhas**, não de publicação orgânica em nome de um usuário. Nenhum escopo equivalente a `user_video_publish` está documentado publicamente. Por isso o `KwaiProvider` não faz nenhuma chamada de rede: toda ação lança `KwaiNotAvailableError`, e `isAvailable` reflete `KWAI_API_AVAILABLE` (só fica `true` manualmente, se/quando houver credenciais via parceria comercial direta com a Kwai). Em modo mock (`MOCK_SOCIAL_APIS=true`) a UI trata o Kwai como qualquer outra rede, para o sistema inteiro continuar testável de ponta a ponta. Ver [providers/kwai](../providers/kwai).

## 6. Credenciais a criar em cada portal

- **Meta for Developers**: 1 App cobrindo dois produtos com credenciais próprias — **Instagram** (Business Login for Instagram: `INSTAGRAM_APP_ID`/`INSTAGRAM_APP_SECRET`, exige só uma conta Instagram Profissional) e **Facebook Login for Business** (`META_APP_ID`/`META_APP_SECRET`, para Facebook Pages na ETAPA 4); App Review para as permissões avançadas de cada um.
- **TikTok for Developers**: App com "Login Kit" + "Content Posting API"; client key/secret; domínio verificado (obrigatório para `PULL_FROM_URL`); auditoria para postagem pública (apps não auditados só publicam como privado/self-only).
- **Kwai**: não há um cadastro de developer self-service para publicação de vídeo — o único caminho identificado é uma parceria comercial/de negócios direta com a Kwai (produto "Kwai for Business", que hoje só documenta publicamente uma API de anúncios).

## 7. APIs que exigem aprovação/auditoria

- Meta (Instagram): `instagram_business_content_publish` exige App Review (Advanced Access) para publicar fora da lista de testers.
- Meta (Facebook): `pages_manage_posts`, `pages_read_engagement` exigem App Review.
- TikTok: Content Posting API exige auditoria para publicar como público; sem auditoria, só `SELF_ONLY`.
- Kwai: não é uma questão de auditoria — é a própria existência de uma API pública de publicação que não está confirmada (ver seção 8).

## 8. Limitações atuais conhecidas

- Instagram/Facebook exigem o vídeo acessível por **URL HTTPS pública/assinada** para criar o container — não há upload binário direto no fluxo padrão de Reels.
- Processamento do container do Instagram é assíncrono — é obrigatório fazer polling do `status_code` até `FINISHED`/`ERROR`, respeitando rate limit.
- TikTok: apps não auditados só publicam em modo privado; o `code_challenge` do PKCE é hex, não base64url (fácil de implementar errado se seguido "de memória").
- Kwai: **confirmado por pesquisa** (não é suposição) que não existe hoje uma Kwai Open Platform pública equivalente às demais para publicação de vídeo — `KwaiProvider` não faz nenhuma chamada de rede real, só o contrato pronto.
- Limites exatos de tamanho/duração/codec por plataforma mudam; ficam centralizados em `providers/*/constraints.ts` com comentário para revalidação periódica em vez de hardcode espalhado.
- **Transcodificação (MediaProcessor/FFmpeg) ainda não está implementada** — `services/mediaProcessor.ts` continua um placeholder. O worker de publicação (ETAPA 7) publica o vídeo original enviado pelo usuário; quando a pré-validação já indicou `needsConversion`, a plataforma pode recusar ou reformatar por conta própria, e o erro (se houver) aparece traduzido na tela de detalhes da publicação, nunca falha silenciosamente.
- A verificação de ponta a ponta da fila (BullMQ + Redis reais) não pôde ser executada neste ambiente de desenvolvimento (sem Redis disponível) — a lógica de decisão (retry, idempotência, agregação de status) tem cobertura de teste unitário completa e sem I/O; a execução ao vivo do worker precisa ser validada pelo usuário com um Redis real.
- **Agendamento** (ETAPA 8) reaproveita o `delay` nativo do BullMQ — sem cron externo. Simplificação deliberada: o usuário não escolhe um fuso horário diferente do detectado no próprio navegador, porque converter "horário de parede em um fuso arbitrário" para um instante UTC corretamente exige uma biblioteca de timezone (ex.: Luxon) que não foi adicionada nesta etapa.
- **Next.js**: atualizado de 14.2.5 para 14.2.35 (última correção dentro da própria 14.2.x) na ETAPA 9 depois de `npm audit` acusar CVEs conhecidos, incluindo um bypass de autorização no middleware — o exato mecanismo em que este projeto se apoia para proteger rotas. Algumas advisories listadas pelo `npm audit` só têm correção completa em Next.js 15/16 (major); não fiz esse upgrade nesta sessão por ser uma mudança grande demais para aplicar sem conseguir testar visualmente no navegador — fica registrado como risco residual conhecido, não como algo ignorado.

## 9. Regra de implementação

Nenhum endpoint, parâmetro ou escopo é implementado "de memória" nas etapas 3-6 (Instagram/Facebook/TikTok/Kwai) sem antes revalidar contra a documentação oficial vigente (via WebFetch/WebSearch) naquela etapa. Até lá, os providers reais ficam com a assinatura do contrato pronta e `MOCK_SOCIAL_APIS=true` cobre todo o fluxo de ponta a ponta em desenvolvimento.
