export const metadata = { title: 'Termos de Uso — PostaFácil' };

export default function TermsOfServicePage() {
  return (
    <article className="prose-content space-y-6 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">Termos de Uso</h1>
        <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Última atualização: 10 de setembro de 2026</p>
      </div>

      <p>
        O PostaFácil é operado por Alan Sales (&quot;nós&quot;). Ao criar uma conta ou usar o PostaFácil, você concorda com
        estes termos. Se não concordar, não utilize o serviço.
      </p>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">1. O que é o PostaFácil</h2>
        <p>
          O PostaFácil é um painel que permite publicar vídeos simultaneamente no Instagram, Facebook, TikTok e Kwai,
          usando exclusivamente as APIs oficiais de cada plataforma — nunca automação de navegador, scraping ou
          simulação de cliques.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">2. Sua conta</h2>
        <p>
          Você é responsável por manter a confidencialidade da senha da sua conta e por toda atividade realizada
          nela. Avise-nos imediatamente se suspeitar de acesso não autorizado.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">3. Conexão com redes sociais</h2>
        <p>
          Ao conectar uma conta do Instagram, Facebook, TikTok ou Kwai, você autoriza o PostaFácil, através da API
          oficial de cada plataforma, a publicar conteúdo em seu nome — exatamente o vídeo, a legenda e o horário que
          você configurar. Você pode revogar essa autorização a qualquer momento, desconectando a conta pelo
          PostaFácil e/ou removendo o acesso diretamente nas configurações daquela rede social.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">4. Seu conteúdo e sua responsabilidade</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>Você é o único responsável pelos vídeos, legendas e demais conteúdos que publica através do PostaFácil;</li>
          <li>Você declara ter os direitos necessários sobre o conteúdo que envia (ou autorização para publicá-lo);</li>
          <li>
            Você concorda em cumprir os termos de uso e as políticas de conteúdo de cada rede social em que publicar
            (Instagram, Facebook, TikTok, Kwai) — o PostaFácil não modera nem aprova o que você publica antes do
            envio;
          </li>
          <li>É proibido usar o PostaFácil para publicar conteúdo ilegal, ou que viole direitos de terceiros, ou as regras da própria plataforma de destino.</li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">5. Disponibilidade do serviço</h2>
        <p>
          O PostaFácil é fornecido &quot;como está&quot;. Fazemos o possível para manter o serviço disponível e funcionando
          corretamente, mas não garantimos operação ininterrupta ou livre de erros. Publicações podem falhar por
          instabilidade, mudanças ou limites impostos pelas próprias redes sociais — nesses casos, o PostaFácil
          informa o erro e permite tentar novamente.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">6. Limitação de responsabilidade</h2>
        <p>
          Na máxima medida permitida por lei, não nos responsabilizamos por danos indiretos decorrentes do uso do
          serviço, incluindo perda de conteúdo, de audiência ou de resultados esperados nas redes sociais conectadas
          — cujas próprias políticas e disponibilidade estão fora do nosso controle.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">7. Encerramento</h2>
        <p>
          Você pode parar de usar o PostaFácil e pedir o encerramento da sua conta a qualquer momento (ver nossa{' '}
          <a href="/privacidade" className="text-brand-600 hover:underline dark:text-brand-400">
            Política de Privacidade
          </a>
          ). Podemos suspender ou encerrar contas que violem estes termos.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">8. Alterações destes termos</h2>
        <p>
          Podemos atualizar estes termos ocasionalmente. A data no topo desta página reflete a versão vigente.
          Mudanças relevantes serão comunicadas por e-mail ou dentro do próprio PostaFácil.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">9. Lei aplicável</h2>
        <p>Estes termos são regidos pelas leis do Brasil.</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">10. Contato</h2>
        <p>
          Dúvidas sobre estes termos? Escreva para{' '}
          <a href="mailto:salealan@gmail.com" className="text-brand-600 hover:underline dark:text-brand-400">
            salealan@gmail.com
          </a>
          .
        </p>
      </section>
    </article>
  );
}
