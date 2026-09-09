# PostaFácil — Arquitetura

> Nome final do produto: **PostaFácil** ("Publique uma vez. Conecte o seu mundo."). O prompt original citava o codinome "MultiPost" — mantido apenas como referência histórica interna.

## 1. Análise dos requisitos (resumo)

O sistema precisa de dois planos de execução com perfis de latência bem diferentes:

1. **Plano síncrono (HTTP)** — login, CRUD, OAuth connect/callback, upload resumível. Deve responder rápido (segundos).
2. **Plano de processamento** — transcodificação FFmpeg e chamadas às APIs sociais (que podem levar minutos e exigem polling). Nunca roda dentro do ciclo de vida de uma requisição HTTP normal.

**Decisão de arquitetura (revisada)**: o volume real do produto é baixo (~20 publicações/dia), então manter um worker BullMQ+Redis ligado 24h só para isso não se justifica em custo. O plano de processamento roda como **funções Inngest** — step functions serverless (`step.run`/`step.sleep`/`step.sleepUntil`), chamadas pelo Inngest Cloud através de uma única rota Next.js (`/api/inngest`, ver [lib/inngest](../lib/inngest)). Não existe processo próprio: a Vercel só executa código quando há um "step" de verdade para rodar; entre eles (ex.: esperando o horário agendado, ou o próximo poll de status), nenhum processo fica ligado. Isso elimina o segundo processo Node/TS que a versão anterior desta arquitetura exigia (`tsx workers/index.ts`) — hoje é **um único deploy** (o app Next.js na Vercel).

Toda a lógica de decisão (classificação de erro, backoff exponencial, idempotência) é a mesma de antes e continua pura/testável sem I/O — só o mecanismo de controle mudou (`job.moveToDelayed()`+`DelayedError` do BullMQ → `step.sleep()` do Inngest). Ver riscos assumidos na seção 8.

## 2. Stack

| Camada | Escolha | Justificativa |
|---|---|---|
| Frontend | Next.js 14 (App Router) + React 18 + TS + Tailwind | SSR, mobile-first, rotas de API colocadas |
| Auth do app | NextAuth.js v4 (Credentials + JWT) | Login próprio do PostaFácil é independente do OAuth das redes sociais |
| ORM/DB | Prisma + PostgreSQL (compatível com Supabase Postgres) | Migrations versionadas, type-safety |
| Storage | Camada `StorageService` sobre S3-compatible (`@aws-sdk/client-s3`) — hoje Cloudflare R2 em produção, disco local em dev | Um único código para qualquer provedor |
| Fila | [Inngest](https://www.inngest.com/docs) (step functions serverless, via `/api/inngest`) | Sem processo permanente; `step.sleep`/`step.sleepUntil` cobrem polling e agendamento; free tier cobre o volume atual com folga |
| Transcodificação | FFmpeg via `ffmpeg-static`/`ffprobe-static`, dentro da própria função Inngest de transcodificação | Roda sob demanda, sem worker dedicado (ver riscos, seção 8) |
| Tempo real | Polling simples (`GET /api/publications/[id]` a cada 3s enquanto houver alvo não-terminal, ver [hooks/use-publication-status-polling.ts](../hooks/use-publication-status-polling.ts)) | Sem Redis/SSE — mais barato e simples nesse volume. Ponto de extensão: trocar só a implementação deste hook por SSE/WebSocket se o volume um dia justificar um push instantâneo |
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
  /api/inngest    -> serve() com as funções publish-target e transcode-media
/components/{ui,dashboard,publication,providers,theme}
/lib            -> db, auth, crypto, logger, env, rate-limit
/lib/inngest    -> client, events (envio), retry-policy, poll-decision, functions/publish-target, functions/transcode-media
/hooks          -> use-publication-status-polling (tempo real)
/services       -> mediaProcessor, storageService, publicationService, tokenService
/providers      -> SocialProvider (contrato) + instagram/ facebook/ tiktok/ kwai/ mock/
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
- **Transcodificação (MediaProcessor/FFmpeg)**: implementada — ver seção 10 abaixo. Usa `ffmpeg-static`/`ffprobe-static` (binários próprios, não depende de FFmpeg instalado no SO). Só entra em ação quando o vídeo realmente precisa (container/codec incompatível) — nunca degrada um vídeo que já está em MP4/H.264/AAC, e nunca corta/redimensiona para "corrigir" proporção (isso fica só como aviso ao usuário).
- **Docker (`Dockerfile`, self-host opcional) + `ffmpeg-static` em Alpine**: usa `node:20-slim` (Debian/glibc), não `node:20-alpine` (musl) — o binário do ffmpeg-static é compilado contra glibc e é sabidamente instável em Alpine. A Vercel (deploy padrão) não usa este Dockerfile — ele fica só como caminho alternativo de self-host.
- A verificação de ponta a ponta das funções Inngest não pôde ser executada neste ambiente de desenvolvimento sandboxed — a lógica de decisão (retry, idempotência, agregação de status) tem cobertura de teste unitário completa e sem I/O, idêntica à usada antes com BullMQ; a execução ao vivo (Inngest Dev Server local, depois produção) precisa ser validada pelo usuário.
- **Transcodificação de vídeos grandes pode estourar o tempo máximo de execução de uma função Vercel**, mesmo com "Fluid Compute" habilitado no plano Hobby (teto de 300s). Mitigado parcialmente pela troca do preset do ffmpeg de `slow` para `veryfast` (mesmo CRF, bem mais rápido) e pelo fato de vídeos de Reels/TikTok/Kwai já serem curtos por natureza da própria plataforma. Se isso se mostrar um problema real em produção, os próximos passos seriam um serviço de transcodificação dedicado (Cloudflare Stream/Mux) ou upgrade para o plano Pro da Vercel (até 800s).
- **Agendamento** (ETAPA 8) usa `step.sleepUntil()` do Inngest — sem cron externo, mesma simplificação de antes (o BullMQ usava seu `delay` nativo). O usuário ainda não escolhe um fuso horário diferente do detectado no próprio navegador, porque converter "horário de parede em um fuso arbitrário" para um instante UTC corretamente exige uma biblioteca de timezone (ex.: Luxon) que não foi adicionada nesta etapa.
- **Tempo real por polling**: trocar o SSE+Redis por polling de 3s (`hooks/use-publication-status-polling.ts`) foi uma decisão deliberada de custo/simplicidade para o volume atual — publicar já leva minutos mesmo, então um atraso de até 3s pra atualizar a tela é imperceptível. Se o volume crescer a ponto de valer a pena um push instantâneo, o hook foi desenhado como ponto de extensão único: trocar só a implementação interna por SSE/WebSocket, mantendo a mesma assinatura.
- **Next.js**: atualizado de 14.2.5 para 14.2.35 (última correção dentro da própria 14.2.x) na ETAPA 9 depois de `npm audit` acusar CVEs conhecidos, incluindo um bypass de autorização no middleware — o exato mecanismo em que este projeto se apoia para proteger rotas. Algumas advisories listadas pelo `npm audit` só têm correção completa em Next.js 15/16 (major); não fiz esse upgrade nesta sessão por ser uma mudança grande demais para aplicar sem conseguir testar visualmente no navegador — fica registrado como risco residual conhecido, não como algo ignorado.

## 9. Regra de implementação

Nenhum endpoint, parâmetro ou escopo é implementado "de memória" nas etapas 3-6 (Instagram/Facebook/TikTok/Kwai) sem antes revalidar contra a documentação oficial vigente (via WebFetch/WebSearch) naquela etapa. Até lá, os providers reais ficam com a assinatura do contrato pronta e `MOCK_SOCIAL_APIS=true` cobre todo o fluxo de ponta a ponta em desenvolvimento.

## 10. MediaProcessor (transcodificação)

Implementado em [services/mediaProcessor.ts](../services/mediaProcessor.ts), acionado pela função [transcode-media](../lib/inngest/functions/transcode-media.ts) — uma função Inngest própria, separada da `publish-target`.

**Quando roda**: `createPublication()` decide, a partir do `videoCodec`/`audioCodec` já detectados no upload (via `ffprobe`, logo após `/api/media/upload/[id]/complete`), se o vídeo precisa ser convertido. Só entram nessa conta container/codec — nunca proporção (isso continua só um aviso na pré-validação, não um motivo para cortar/redimensionar o vídeo do usuário sem pedir).

**Fluxo**:
1. `POST /api/media/upload/[id]/complete` já faz um probe rápido (ffprobe lendo a URL do storage via Range HTTP — não baixa o arquivo inteiro) e grava `videoCodec`/`audioCodec` no `MediaFile`.
2. Se `createPublication()` detectar incompatibilidade, marca a mídia como `PROCESSING` e envia **um único evento de transcodificação por `mediaId`** (`id: mediaId` no `inngest.send`, mesma âncora de idempotência usada para os alvos de publicação) — nunca por publicação, então duas publicações usando o mesmo vídeo ao mesmo tempo não disparam duas conversões.
3. A função `transcode-media` lê o vídeo direto da URL do storage (ffmpeg/ffprobe suportam HTTP(S) nativamente — confirmado via `-protocols` nos binários do `ffmpeg-static`/`ffprobe-static`), recodifica para MP4/H.264/AAC preservando resolução e proporção (sem `-vf`/`-aspect`), e sobe o resultado para uma chave **irmã** da original (`.../transcoded.mp4`) — o arquivo original nunca é sobrescrito.
4. Ao terminar (sucesso ou falha definitiva), consulta o banco por **todas** as publicações que estejam esperando aquele `mediaId` (não só a que disparou o evento) e libera/falha os alvos de cada uma — cobre o caso de o mesmo vídeo ser reaproveitado em outra publicação enquanto a conversão ainda está rodando.
5. A função `publish-target` sempre prefere `transcodedStoragePath` quando ele existe.

**Retry**: até 3 tentativas com o mesmo backoff exponencial da função de publicação ([lib/inngest/retry-policy.ts](../lib/inngest/retry-policy.ts)), com `step.sleep()` entre elas; falha definitiva marca só os alvos que dependiam daquele vídeo como `FAILED`, com mensagem clara — nunca marca o `MediaFile` original como inválido (ele pode ainda ser reaproveitado numa tentativa futura).

**Verificado de verdade, não só por tipos**: [tests/integration/media-processor-ffmpeg.test.ts](../tests/integration/media-processor-ffmpeg.test.ts) gera um vídeo sintético com codecs propositalmente incompatíveis (mpeg4/mp3 em AVI), roda o `MediaProcessor` de ponta a ponta com os binários reais do `ffmpeg-static`/`ffprobe-static`, e confirma com `ffprobe` que a saída é H.264/AAC preservando a resolução original.
