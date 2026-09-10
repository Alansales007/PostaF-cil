export const metadata = { title: 'Política de Privacidade — PostaFácil' };

export default function PrivacyPolicyPage() {
  return (
    <article className="prose-content space-y-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Política de Privacidade</h1>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Última atualização: 10 de setembro de 2026</p>
      </div>

      <p>
        O PostaFácil (&quot;nós&quot;) é um painel que permite publicar vídeos simultaneamente no Instagram, Facebook, TikTok e
        Kwai a partir de um único lugar. Esta política explica quais dados coletamos, para que usamos, e quais
        direitos você tem sobre eles.
      </p>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. Quem é o responsável pelos seus dados</h2>
        <p>
          O PostaFácil é operado por Alan Sales. Para qualquer dúvida, solicitação ou pedido relacionado a esta
          política, entre em contato por{' '}
          <a href="mailto:salealan@gmail.com" className="text-brand-600 hover:underline dark:text-brand-400">
            salealan@gmail.com
          </a>
          .
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Quais dados coletamos</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada apenas como hash — nunca em texto
            puro) usados para criar e acessar sua conta no PostaFácil.
          </li>
          <li>
            <strong>Dados das contas sociais conectadas:</strong> quando você conecta Instagram, Facebook, TikTok ou
            Kwai, recebemos e guardamos o token de acesso concedido por aquela plataforma (cifrado em repouso com
            AES-256-GCM), além do nome de usuário, nome de exibição e foto de perfil públicos daquela conta — apenas
            o necessário para publicar em seu nome e mostrar qual conta está conectada.
          </li>
          <li>
            <strong>Vídeos e legendas:</strong> os vídeos que você envia e as legendas que escreve, para que possam
            ser publicados nas redes selecionadas.
          </li>
          <li>
            <strong>Histórico de publicações:</strong> status, horários e eventuais mensagens de erro de cada
            publicação, para que você possa acompanhar o que foi publicado, agendado ou falhou.
          </li>
          <li>
            <strong>Registros de auditoria e segurança:</strong> ações como conexão/desconexão de contas e tentativas
            de nova publicação, com data e hora — usados só para segurança, suporte e diagnóstico de problemas.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Para que usamos seus dados</h2>
        <p>Usamos seus dados exclusivamente para operar o PostaFácil:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Autenticar seu acesso à sua própria conta;</li>
          <li>Publicar os vídeos que você enviar nas redes sociais que você conectar e selecionar, exatamente como você configurar (legenda, horário, redes);</li>
          <li>Mostrar o status e o histórico das suas publicações;</li>
          <li>Renovar automaticamente tokens de acesso perto do vencimento, para evitar que sua publicação falhe sem aviso;</li>
          <li>Investigar problemas técnicos e prevenir abuso/uso indevido.</li>
        </ul>
        <p>
          <strong>Não vendemos seus dados, não os usamos para publicidade, e não os compartilhamos com terceiros</strong>{' '}
          fora das próprias redes sociais que você explicitamente conectar — e, mesmo assim, só para executar a
          publicação que você pediu.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Onde seus dados ficam armazenados</h2>
        <p>
          Seus dados de cadastro e o histórico de publicações ficam num banco de dados PostgreSQL. Os vídeos enviados
          ficam num serviço de armazenamento de objetos compatível com S3 (Cloudflare R2). Ambos são hospedados em
          infraestrutura de nuvem que pode estar fora do Brasil. Os vídeos são mantidos apenas pelo tempo necessário
          para viabilizar a publicação nas redes selecionadas; você pode pedir a exclusão a qualquer momento (ver
          seção 6).
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Cookies</h2>
        <p>
          Usamos apenas um cookie de sessão, necessário para manter você conectado à sua conta do PostaFácil. Não
          usamos cookies de rastreamento, publicidade ou analytics de terceiros.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">6. Seus direitos</h2>
        <p>Nos termos da Lei Geral de Proteção de Dados (LGPD), você pode a qualquer momento:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong>Desconectar</strong> qualquer conta social diretamente pela tela de Configurações do PostaFácil —
            isso remove o token de acesso guardado imediatamente;
          </li>
          <li>Solicitar acesso, correção ou exclusão dos seus dados, ou o encerramento completo da sua conta, escrevendo para <a href="mailto:salealan@gmail.com" className="text-brand-600 hover:underline dark:text-brand-400">salealan@gmail.com</a>.</li>
        </ul>
        <p>
          Desconectar uma conta pelo PostaFácil remove o acesso do nosso lado, mas não revoga automaticamente a
          autorização do lado da rede social — para isso, revise também os apps conectados diretamente nas
          configurações do Instagram/Facebook/TikTok/Kwai.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">7. Segurança</h2>
        <p>
          Senhas são armazenadas como hash (bcrypt), nunca em texto puro. Tokens de acesso das redes sociais são
          cifrados em repouso (AES-256-GCM). Toda comunicação com o PostaFácil acontece por HTTPS.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">8. Menores de idade</h2>
        <p>O PostaFácil não é direcionado a menores de 18 anos.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">9. Alterações desta política</h2>
        <p>
          Se esta política mudar, a data no topo desta página será atualizada. Mudanças relevantes serão comunicadas
          por e-mail ou dentro do próprio PostaFácil.
        </p>
      </section>
    </article>
  );
}
