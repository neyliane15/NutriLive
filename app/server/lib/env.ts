/* =========================================================================
   Leitura de ambiente, com padrões que servem para desenvolver e uma
   conferência que roda só em produção.

   A regra: em desenvolvimento tudo tem padrão e o sistema sobe sozinho —
   é o que faz a demonstração rodar sem configurar nada. Em produção, as
   escolhas que derrubam a segurança ou a entrega do produto fazem o
   processo RECUSAR a subir, com o nome da variável que falta.

   Falhar na subida é melhor que subir torto: um deploy que não sobe é
   corrigido em minutos, e um deploy que sobe com segredo de exemplo ou com
   e-mail indo para o log só é descoberto quando um cliente paga e não
   consegue entrar.
   ========================================================================= */
const raw = process.env;

/** Segredo de exemplo que o repositório carrega. Nunca vale em produção. */
export const SEGREDO_DE_EXEMPLO = "desenvolvimento-apenas-troque-em-producao-0001";

const required = (key: string, fallback?: string): string => {
  const v = raw[key] ?? fallback;
  if (v === undefined) throw new Error(`Variável de ambiente ausente: ${key}`);
  return v;
};

export const env = {
  NODE_ENV: raw.NODE_ENV ?? "development",
  PORT: raw.PORT ?? "8787",
  APP_URL: raw.APP_URL ?? "http://localhost:8787",
  SESSION_SECRET: required("SESSION_SECRET", SEGREDO_DE_EXEMPLO),

  DATABASE_URL: raw.DATABASE_URL ?? "",
  /** Sem DATABASE_URL o sistema roda inteiro em memória, com o seed carregado. */
  DB_DRIVER: (raw.DATABASE_URL ? "postgres" : "memory") as "postgres" | "memory",

  MP_ACCESS_TOKEN: raw.MP_ACCESS_TOKEN ?? "",
  MP_PUBLIC_KEY: raw.MP_PUBLIC_KEY ?? "",
  MP_WEBHOOK_SECRET: raw.MP_WEBHOOK_SECRET ?? "",
  /** Sem token do Mercado Pago o checkout usa o provedor simulado. */
  PAY_DRIVER: (raw.MP_ACCESS_TOKEN ? "mercadopago" : "simulado") as "mercadopago" | "simulado",

  EMAIL_PROVIDER: raw.EMAIL_PROVIDER ?? "console",
  RESEND_API_KEY: raw.RESEND_API_KEY ?? "",
  EMAIL_FROM: raw.EMAIL_FROM ?? "Nutri&Live <oi@nutrielive.com.br>",

  N8N_BASE_URL: raw.N8N_BASE_URL ?? "",
  N8N_WEBHOOK_TOKEN: raw.N8N_WEBHOOK_TOKEN ?? "",
  /** Sem n8n a IA responde com um gerador local determinístico. */
  AI_DRIVER: (raw.N8N_BASE_URL ? "n8n" : "local") as "n8n" | "local",

  COMMISSION_RATE_BP: Number(raw.COMMISSION_RATE_BP ?? 2000)
};

/**
 * Está no ar, de verdade?
 *
 * Não é só `NODE_ENV === "production"`. Essa única comparação decidia, de
 * uma vez: se o cookie de sessão leva a flag `Secure`, e se as
 * conferências de produção abaixo rodam. Esquecer de definir a variável no
 * painel desligava TUDO junto — cookie de sessão trafegando sem exigir
 * https, o SESSION_SECRET de exemplo do repositório aceito, e-mail saindo
 * para o log em vez de para o cliente — e nada disso dá erro: o sistema
 * sobe e parece funcionar.
 *
 * `VERCEL` é definida pela própria plataforma em toda execução, inclusive
 * em preview. Preview com dado real é produção para quem vaza.
 *
 * O erro aqui não é simétrico: tratar desenvolvimento como produção faz um
 * teste reclamar na hora; o contrário entrega o sistema aberto sem avisar.
 * Na dúvida, é produção.
 */
/** Assumir por escrito que o pagamento é de mentira. Ver PAY_DRIVER abaixo. */
export const PAGAMENTO_SIMULADO_LIBERADO = raw.PAGAMENTO_SIMULADO_OK === "1";

export const isProd =
  env.NODE_ENV === "production" || Boolean(raw.VERCEL) || Boolean(raw.VERCEL_ENV);

/* ------------------------------------------------------------------------ */
/**
 * O que não pode ficar no padrão quando NODE_ENV é "production".
 *
 * Cada item aqui é um caso em que o padrão de desenvolvimento, levado para
 * produção, quebra o produto em silêncio:
 *
 * SESSION_SECRET  o `required` acima nunca lançava, porque tinha fallback.
 *                 Esse segredo está no repositório e é a chave do HMAC da
 *                 sessão, do HMAC dos tokens de e-mail (primeiro acesso e
 *                 redefinição de senha) e, sem MP_WEBHOOK_SECRET, da
 *                 assinatura dos webhooks.
 *
 * EMAIL_PROVIDER  "console" não manda e-mail: escreve o CORPO INTEIRO da
 *                 mensagem no log e devolve sem erro. O cliente paga, o
 *                 checkout diz "enviamos o link para o seu e-mail", e o
 *                 único lugar onde o link existe é o log do servidor. Pagou
 *                 e não entra. E quem lê o log tem credencial de uso único
 *                 viva para assumir qualquer conta.
 *
 * DATABASE_URL    sem ela o motor é o de MEMÓRIA, com os dados de
 *                 demonstração carregados: cliente de verdade entraria num
 *                 banco que some no próximo reinício, ao lado de 23
 *                 usuários fictícios.
 *
 * APP_URL         é o que monta o link do e-mail de primeiro acesso.
 *                 Apontando para localhost, o link não abre em lugar nenhum.
 *
 * PAY_DRIVER      sem MP_ACCESS_TOKEN o provedor é o SIMULADO, e ele
 *                 APROVA QUALQUER CARTÃO: `lerCartaoSimulado` cai em
 *                 `{ status: "aprovado" }` para todo número que não esteja
 *                 na lista de recusa, e o Pix pendente vira aprovado só
 *                 pela passagem do tempo. Em produção isso é o produto de
 *                 graça para quem digitar um número qualquer — inclusive o
 *                 plano de nutricionista, com gestão de pacientes. Quem
 *                 quiser mesmo subir sem cobrar (para só ver o sistema)
 *                 define PAGAMENTO_SIMULADO_OK=1 e assume isso por
 *                 escrito; o log avisa em toda subida.
 *
 * MP_WEBHOOK_SECRET  com Mercado Pago e sem ele, `conferirAssinatura`
 *                 recusa TODA notificação em produção. O cliente paga, o
 *                 dinheiro entra, e a assinatura nunca é ativada porque o
 *                 aviso do provedor é rejeitado na porta. Falha fechada —
 *                 ninguém ganha acesso de graça — mas o cliente pagou e
 *                 não entrou, e nada no sistema reclama.
 */
/**
 * O que está no ar e é perigoso, mas foi liberado de propósito.
 *
 * Diferente de `conferirAmbienteDeProducao`: isto não impede a subida,
 * avisa em toda subida. Existe porque uma liberação consciente de hoje
 * vira um esquecimento de três meses atrás, e nessa hora o único lugar
 * onde a verdade aparece é o log.
 */
export function avisosDeProducao(): string[] {
  if (!isProd) return [];
  const avisos: string[] = [];
  if (env.PAY_DRIVER === "simulado" && PAGAMENTO_SIMULADO_LIBERADO) {
    avisos.push(
      "MODO DEMONSTRAÇÃO LIGADO EM PRODUÇÃO: qualquer cartão é aprovado e " +
      "qualquer visitante assina de graça. Isto é para mostrar o sistema, " +
      "não para vender. Preencha MP_ACCESS_TOKEN e remova PAGAMENTO_SIMULADO_OK " +
      "antes de divulgar o endereço."
    );
    if (env.EMAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY) {
      avisos.push(
        "E-mail em modo console: nenhuma mensagem sai do sistema. O link de " +
        "primeiro acesso aparece no log da Vercel, não na caixa de entrada. " +
        "Entre com as contas de demonstração (senha Nutri@2025)."
      );
    }
  }
  return avisos;
}

export function conferirAmbienteDeProducao(): string[] {
  if (!isProd) return [];
  const faltas: string[] = [];

  if (env.SESSION_SECRET === SEGREDO_DE_EXEMPLO) {
    faltas.push("SESSION_SECRET está com o segredo de exemplo do repositório. Gere um novo (32+ bytes aleatórios).");
  } else if (env.SESSION_SECRET.length < 32) {
    faltas.push("SESSION_SECRET tem menos de 32 caracteres.");
  }

  /* A exigência de e-mail existe por UM motivo: o cliente que pagou precisa
     receber o link de primeiro acesso. Em modo de demonstração não há
     cliente pagando — o pagamento é simulado e as contas já existem — então
     a exigência não protege ninguém e só impede a demonstração de subir.
     O mesmo PAGAMENTO_SIMULADO_OK governa as duas coisas, de propósito:
     é uma decisão só, tomada uma vez. */
  const modoDemonstracao = env.PAY_DRIVER === "simulado" && PAGAMENTO_SIMULADO_LIBERADO;
  if (!modoDemonstracao && (env.EMAIL_PROVIDER !== "resend" || !env.RESEND_API_KEY)) {
    faltas.push(
      'EMAIL_PROVIDER precisa ser "resend" com RESEND_API_KEY preenchida. ' +
      'Com "console" o link de primeiro acesso vai para o log e o cliente que pagou não entra.'
    );
  }

  if (!env.DATABASE_URL) {
    faltas.push("DATABASE_URL está vazia: o sistema subiria no banco em memória, com os dados de demonstração.");
  }

  if (/localhost|127\.0\.0\.1/.test(env.APP_URL)) {
    faltas.push(`APP_URL aponta para ${env.APP_URL}: o link do e-mail de primeiro acesso não abriria.`);
  }

  if (env.PAY_DRIVER === "simulado" && !PAGAMENTO_SIMULADO_LIBERADO) {
    faltas.push(
      "MP_ACCESS_TOKEN está vazia, então o provedor de pagamento é o SIMULADO, que aprova " +
      "qualquer cartão: qualquer visitante assina de graça. Preencha MP_ACCESS_TOKEN, ou " +
      "defina PAGAMENTO_SIMULADO_OK=1 se a intenção for mesmo subir sem cobrar."
    );
  }
  if (env.PAY_DRIVER === "mercadopago" && !env.MP_WEBHOOK_SECRET) {
    faltas.push(
      "MP_WEBHOOK_SECRET está vazia: toda notificação do Mercado Pago será recusada, " +
      "então o cliente paga e a assinatura nunca é ativada. A chave está em " +
      "Suas integrações › Webhooks, no painel do Mercado Pago."
    );
  }

  return faltas;
}
