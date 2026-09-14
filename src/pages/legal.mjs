import { shell } from "./shell.mjs";
import { header } from "../components/header.mjs";
import { footer } from "../components/footer.mjs";
import { icon } from "../components/icons.mjs";
import { site, securityPillars } from "../data/site.mjs";

const legalShell = ({ file, title, desc, eyebrow, h1, lead, updated, body, current = "" }) =>
  shell({
    title,
    desc,
    canonical: file,
    body: `
${header({ current, cta: { label: "Assinar", href: "index.html#planos" } })}
<main id="conteudo">
  <section class="section" style="padding-bottom:var(--section-y-sm);background:var(--bg-soft)">
    <div class="container container-narrow">
      <p class="eyebrow">${eyebrow}</p>
      <h1 class="display-2" style="margin-top:.75rem">${h1}</h1>
      <p class="lead" style="margin-top:1rem">${lead}</p>
      <p class="text-xs soft" style="margin-top:1.5rem">Última atualização: ${updated}</p>
    </div>
  </section>
  <section class="section">
    <div class="container container-narrow legal-body">${body}</div>
  </section>
</main>
${footer()}`
  });

const H = (id, t) => `<h2 id="${id}" style="margin-top:var(--sp-12);font-size:var(--fs-h3)">${t}</h2>`;
const P = (t) => `<p style="margin-top:var(--sp-4);color:var(--text-muted);max-width:70ch">${t}</p>`;
const UL = (items) =>
  `<ul style="margin-top:var(--sp-4);display:grid;gap:.75rem;max-width:70ch">${items
    .map(
      (i) =>
        `<li style="display:flex;gap:.625rem;align-items:flex-start;color:var(--text-muted)"><span style="width:18px;height:18px;flex:none;margin-top:3px;color:var(--leaf-600)">${icon.checkSolid()}</span><span>${i}</span></li>`
    )
    .join("")}</ul>`;

/* ------------------------------- Segurança ------------------------------- */
const seguranca = () =>
  legalShell({
    file: "seguranca.html",
    current: "seguranca",
    title: "Segurança e privacidade — Nutri&Live",
    desc: "Como o Nutri&Live protege os seus dados de saúde e de pagamento: criptografia, PCI-DSS, LGPD e servidores no Brasil.",
    eyebrow: "Segurança",
    h1: "O que a gente faz para você poder confiar.",
    lead: "Dado de alimentação é dado de saúde. Aqui está, sem jargão, como ele é protegido — e o que você controla.",
    updated: "13 de setembro de 2026",
    body: `
<div class="security-pillars">
  ${securityPillars
    .map(
      (p) => `<article class="card card-lg trust-card">
    <span class="icon-tile" aria-hidden="true">${icon[p.icon]()}</span>
    <h2 class="pillar-title">${p.title}</h2>
    <p>${p.text}</p>
  </article>`
    )
    .join("")}
</div>

${H("infra", "Infraestrutura")}
${UL([
  "Servidores em data centers no Brasil (região São Paulo), com redundância em duas zonas de disponibilidade.",
  "Criptografia AES-256 em repouso e TLS 1.3 em trânsito, com HSTS e certificados renovados automaticamente.",
  "Backups automáticos a cada 6 horas, com retenção de 35 dias e teste de restauração mensal.",
  "Isolamento de ambientes: desenvolvimento, homologação e produção nunca compartilham dados reais."
])}

${H("pagamentos", "Pagamentos")}
${P(
  "O Nutri&Live não recebe, não processa e não armazena o número completo do seu cartão. Os dados vão criptografados diretamente para o nosso parceiro de pagamentos, certificado PCI-DSS nível 1, que devolve apenas um token. O que fica guardado na sua conta são a bandeira e os 4 últimos dígitos, para você reconhecer o cartão."
)}
${UL([
  "Antifraude com análise de risco em cada cobrança recorrente.",
  "3-D Secure 2.0 quando o banco emissor solicita.",
  "Pix com QR dinâmico e identificador único por cobrança.",
  "Estorno integral em até 5 dias úteis no cartão e 1 dia útil no Pix."
])}

${H("lgpd", "LGPD e os seus direitos")}
${P(
  "Tratamos dados pessoais como controladores no serviço para pessoa física, e como operadores quando a controladora é a nutricionista ou a clínica contratante. Em qualquer caso, você tem direitos garantidos pela Lei nº 13.709/2018."
)}
${UL([
  "<b>Acesso e portabilidade:</b> exporte tudo em PDF ou CSV pelo app, a qualquer momento.",
  "<b>Correção:</b> altere qualquer informação do seu perfil sem precisar falar com ninguém.",
  "<b>Eliminação:</b> apague a sua conta e todos os dados vinculados em Menu › Conta › Excluir conta. A exclusão é definitiva em até 30 dias.",
  "<b>Revogação de consentimento:</b> desconecte o seu nutricionista quando quiser, sem perder o seu histórico pessoal.",
  "<b>Oposição:</b> escreva para o nosso DPO e a gente responde em até 15 dias."
])}
<div id="titular" class="notice" style="margin-top:var(--sp-6)">
  ${icon.mail()}
  <span>Encarregado de dados (DPO): <b>dpo@nutrielive.com.br</b> · ${site.razaoSocial}, ${site.endereco}.</span>
</div>

${H("compartilhamento", "Com quem compartilhamos")}
${P(
  "Com ninguém que você não tenha autorizado. Não vendemos, não alugamos e não trocamos dados com anunciantes ou corretoras de dados. Os únicos terceiros que tocam nos seus dados são operadores necessários ao serviço — provedor de nuvem, processador de pagamentos, envio de e-mail transacional — todos sob contrato de tratamento de dados e obrigação de sigilo."
)}

${H("pratica", "Práticas de desenvolvimento")}
${UL([
  "Revisão de código obrigatória e testes automatizados em cada mudança.",
  "Acesso a dados de produção restrito, nominal, com autenticação em dois fatores e registro de auditoria.",
  "Teste de intrusão anual por empresa independente e programa de divulgação responsável de vulnerabilidades.",
  "Monitoramento 24/7 e plano de resposta a incidentes com notificação à ANPD e aos titulares quando aplicável."
])}
${P(
  `Encontrou uma falha? Escreva para <b>seguranca@${site.domain}</b>. A gente responde em até 48 horas e reconhece publicamente quem nos ajuda.`
)}`
  });

/* --------------------------------- Termos -------------------------------- */
const termos = () =>
  legalShell({
    file: "termos.html",
    title: "Termos de uso — Nutri&Live",
    desc: "Termos de uso do Nutri&Live: assinatura mensal, cobrança recorrente, cancelamento, reembolso e programa de parceria.",
    eyebrow: "Jurídico",
    h1: "Termos de uso",
    lead: "Escrito para ser lido. Se alguma parte não estiver clara, fale com a gente antes de assinar.",
    updated: "13 de setembro de 2026",
    body: `
${H("objeto", "1. O que o Nutri&Live é")}
${P(
  "O Nutri&Live é um software de organização e educação alimentar. Ele calcula, organiza, lembra e apresenta informações. <b>Ele não é um serviço médico e não substitui consulta, diagnóstico, prescrição ou acompanhamento de profissional de saúde habilitado.</b> Planos gerados automaticamente são material educativo e devem ser validados por um nutricionista, especialmente em caso de gestação, doença crônica, transtorno alimentar ou uso contínuo de medicamentos."
)}

${H("assinatura", "2. Assinatura e cobrança")}
${UL([
  "A assinatura é mensal, renovada automaticamente no mesmo dia de cada mês até que você cancele. Não trabalhamos com plano anual nem com contrato de permanência.",
  "Enviamos um aviso por e-mail 3 dias antes de cada renovação, com o valor e a data.",
  "No cartão de crédito e no débito recorrente, a cobrança é automática. No Pix, enviamos o código e a renovação só ocorre se você pagar — nada é debitado sem a sua ação.",
  "Se uma cobrança falhar, tentamos novamente em 3, 5 e 7 dias. Depois disso a assinatura é pausada, sem multa e sem dívida.",
  "Preços podem mudar, mas nunca no meio de um ciclo já pago. Avisamos com 30 dias de antecedência e você pode cancelar antes que o novo valor entre em vigor."
])}

${H("cancelamento", "3. Cancelamento")}
${P(
  "Você cancela quando quiser, em Menu › Assinatura › Cancelar, sem falar com ninguém e sem multa. O acesso continua até o fim do período já pago. Não fazemos retenção por telefone nem exigimos justificativa."
)}

${H("reembolso", "4. Arrependimento e reembolso")}
${P(
  "Contratou e se arrependeu? O art. 49 do Código de Defesa do Consumidor garante 7 dias corridos, contados da contratação, para desistir sem justificativa e receber de volta tudo o que pagou. O estorno cai em até 5 dias úteis no cartão e em até 1 dia útil no Pix. Fora desse prazo, o cancelamento interrompe as próximas cobranças e o acesso segue até o fim do período já pago."
)}

${H("uso", "5. Uso aceitável")}
${UL([
  "Você é responsável pela veracidade dos dados que informa — o cálculo depende deles.",
  "A conta é pessoal e intransferível. No plano Família, cada perfil pertence a uma pessoa da mesma residência.",
  "É proibido usar o serviço para prescrever a terceiros sem habilitação profissional, revender acesso sem contrato de parceria assinado, ou extrair dados em massa por meios automatizados."
])}

${H("profissionais", "6. Contas profissionais")}
${P(
  "Na conta de nutricionista, o profissional é o controlador dos dados dos seus pacientes e o Nutri&Live atua como operador. A prescrição é ato privativo do nutricionista, nos termos da Resolução CFN nº 599/2018 — o sistema apenas apoia. Cabe ao profissional coletar o consentimento dos titulares e manter o sigilo profissional."
)}

${H("parceria", "7. Programa de parceria")}
${P(
  "Academias e estúdios participam por indicação: a parceira divulga o Nutri&Live e recebe comissão recorrente sobre as assinaturas originadas pelo seu link, nos termos definidos por escrito no aceite da parceria. A assinatura é contratada pelo próprio aluno, diretamente conosco — a parceira não intermedeia pagamento, não assume obrigação perante o assinante e não adquire direito sobre os dados dele. Não há mensalidade, meta ou exclusividade, e qualquer das partes pode encerrar a parceria a qualquer momento, preservadas as comissões já apuradas."
)}

${H("propriedade", "8. Propriedade e seus dados")}
${P(
  "O software, a marca e o conteúdo editorial são nossos. Os seus dados são seus: você pode exportá-los ou apagá-los a qualquer momento, e mantemos o acesso à exportação por 90 dias após o cancelamento."
)}

${H("responsabilidade", "9. Limitação de responsabilidade")}
${P(
  "Nos esforçamos por disponibilidade contínua, mas o serviço é fornecido no estado em que se encontra. Nossa responsabilidade, quando houver, fica limitada ao valor pago nos 12 meses anteriores ao evento. Nada aqui afasta direitos do consumidor previstos em lei."
)}

${H("foro", "10. Lei aplicável")}
${P(
  `Estes termos são regidos pela lei brasileira. Fica eleito o foro do domicílio do consumidor para dirimir controvérsias. Dúvidas: <b>${site.email}</b>.`
)}`
  });

/* ------------------------------ Privacidade ------------------------------ */
const privacidade = () =>
  legalShell({
    file: "privacidade.html",
    title: "Política de privacidade — Nutri&Live",
    desc: "Quais dados o Nutri&Live coleta, por que, por quanto tempo e como você controla tudo isso.",
    eyebrow: "Jurídico",
    h1: "Política de privacidade",
    lead: "Quais dados coletamos, por quê, por quanto tempo — e como você tira tudo de lá quando quiser.",
    updated: "13 de setembro de 2026",
    body: `
${H("coleta", "1. O que coletamos")}
${UL([
  "<b>Cadastro:</b> nome, e-mail, CPF e celular — necessários para criar a conta e emitir nota fiscal.",
  "<b>Saúde:</b> peso, medidas, restrições, registros alimentares, hidratação e fotos de evolução que você adicionar. São dados sensíveis e recebem proteção reforçada.",
  "<b>Pagamento:</b> bandeira e 4 últimos dígitos do cartão, status das cobranças. O número completo nunca chega aos nossos servidores.",
  "<b>Uso:</b> páginas acessadas, dispositivo e erros, para manter o serviço funcionando. Usamos analytics próprio, sem cookies de publicidade."
])}

${H("bases", "2. Por que podemos tratar esses dados")}
${UL([
  "<b>Execução de contrato</b> (art. 7º, V) para tudo que faz a assinatura funcionar.",
  "<b>Consentimento específico</b> (art. 11, I) para os dados de saúde e para compartilhar com o seu nutricionista.",
  "<b>Obrigação legal</b> (art. 7º, II) para registros fiscais e contábeis.",
  "<b>Legítimo interesse</b> (art. 7º, IX) para segurança, prevenção a fraude e melhoria do produto, sempre com avaliação de impacto."
])}

${H("prazo", "3. Por quanto tempo guardamos")}
${UL([
  "Dados de saúde: enquanto a conta existir. Após a exclusão, apagamos em até 30 dias, incluindo backups no ciclo seguinte.",
  "Dados fiscais: 5 anos, por exigência legal, isolados do restante.",
  "Prontuários em contas de nutricionista: pelo prazo que o CFN determina ao profissional responsável.",
  "Logs de segurança: 6 meses, conforme o Marco Civil da Internet."
])}

${H("cookies", "4. Cookies")}
${P(
  "Usamos apenas cookies essenciais (sessão e preferências) e medição própria agregada. Não há pixel de rede social, não há remarketing e não vendemos audiência. Por isso este site não te persegue com banner de consentimento a cada visita."
)}

${H("titular", "5. Exercer os seus direitos")}
${P(
  `Tudo pode ser feito no app, em Menu › Conta › Privacidade: exportar, corrigir, revogar consentimento ou excluir. Prefere falar com gente? Escreva para o nosso DPO em <b>dpo@${site.domain}</b> — respondemos em até 15 dias, conforme o art. 19 da LGPD. Você também pode reclamar diretamente à ANPD.`
)}

${H("criancas", "6. Crianças e adolescentes")}
${P(
  "O uso por menores de 18 anos exige consentimento de um responsável, coletado no cadastro. O perfil infantil do plano Família só é criado a partir da conta de um adulto responsável, e não recebe comunicações de marketing."
)}

${H("mudancas", "7. Mudanças nesta política")}
${P(
  "Se algo mudar de forma relevante, avisamos por e-mail e dentro do app com 30 dias de antecedência — não escondemos alteração em rodapé."
)}`
  });

export const pages = () => ({
  "seguranca.html": seguranca(),
  "termos.html": termos(),
  "privacidade.html": privacidade()
});
