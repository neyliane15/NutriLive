/* =========================================================================
   Nutri&Live — a regra de ouro do produto

   Pagamento aprovado -> acesso liberado NA HORA -> e-mail com link de
   primeiro acesso para a pessoa definir a senha. Nenhuma espera manual,
   nenhum passo no admin.

   Tudo aqui é idempotente: o mesmo pagamento aprovado chegando duas vezes
   (resposta do checkout + webhook, ou webhook repetido) libera acesso uma
   vez, manda um e-mail e gera uma comissão.
   ========================================================================= */
import { db, schema } from "../db/index.js";
import type { Linha } from "../db/index.js";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import { enviarEmail, emailPrimeiroAcesso } from "./email.js";
import { registrarComissaoSePreciso } from "./comissao.js";
import { fimDoPeriodo, hashToken, novoToken } from "./nucleo.js";
import { emTransacao } from "./unidade.js";

type Usuario = Linha<typeof schema.users>;
type Assinatura = Linha<typeof schema.subscriptions>;
type Pagamento = Linha<typeof schema.payments>;

const VALIDADE_PRIMEIRO_ACESSO_H = 48;

/**
 * Emite o token de primeiro acesso e devolve o link pronto.
 *
 * INTEGRAÇÃO: se `server/auth/tokens.ts` (BE-1) expuser
 * `criarTokenPrimeiroAcesso(userId)`, usamos o dele — é ele quem define o
 * formato que `/api/auth/first-access` sabe ler. Sem esse arquivo, geramos
 * aqui e gravamos o SHA-256 em `auth_tokens` (veja `hashToken` em nucleo.ts).
 */
export async function linkPrimeiroAcesso(userId: string): Promise<string> {
  const caminho = "../auth/tokens.js";
  try {
    const mod: Record<string, unknown> = await import(/* @vite-ignore */ caminho);
    const fn = mod["criarTokenPrimeiroAcesso"];
    if (typeof fn === "function") {
      const token = await (fn as (id: string) => Promise<string> | string)(userId);
      if (typeof token === "string" && token.length >= 20) {
        return `${env.APP_URL}/primeiro-acesso?token=${encodeURIComponent(token)}`;
      }
    }
  } catch { /* módulo de outro agente ainda não existe: seguimos no plano B */ }

  const token = novoToken();
  await db.inserir(schema.authTokens, {
    userId,
    purpose: "primeiro_acesso",
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VALIDADE_PRIMEIRO_ACESSO_H * 3600 * 1000)
  });
  return `${env.APP_URL}/primeiro-acesso?token=${encodeURIComponent(token)}`;
}

/* ------------------------------------------------------------------------ */
export interface ResultadoLiberacao {
  /** `false` quando o pagamento já estava aprovado — nada foi refeito. */
  novidade: boolean;
  acessoLiberado: boolean;
  /** Só preenchido quando o e-mail de primeiro acesso foi enviado agora. */
  linkPrimeiroAcesso?: string;
}

/**
 * Aplica um pagamento aprovado: ativa a assinatura, libera o usuário, manda
 * o e-mail de primeiro acesso (só na primeira vez) e gera a comissão da
 * academia quando a venda veio pelo link dela.
 *
 * A idempotência é no estado, não em memória: se o pagamento já está
 * `aprovado`, sai sem mexer em nada.
 */
export async function aplicarPagamentoAprovado(
  pagamentoId: string,
  opcoes: { pagoEm?: Date; renovacao?: boolean } = {}
): Promise<ResultadoLiberacao> {
  const pagamento = await db.primeiro(schema.payments, { id: pagamentoId });
  if (!pagamento) return { novidade: false, acessoLiberado: false };

  if (pagamento.status === "aprovado") {
    /* Já processado. Mesmo assim garantimos a comissão, que pode ter falhado
       depois do pagamento numa execução anterior. */
    await registrarComissaoSePreciso(pagamento);
    return { novidade: false, acessoLiberado: true };
  }
  if (pagamento.status === "estornado") {
    log.warn(`cobrança: pagamento ${pagamentoId} já estornado, aprovação ignorada`);
    return { novidade: false, acessoLiberado: false };
  }

  const assinatura = pagamento.subscriptionId
    ? await db.primeiro(schema.subscriptions, { id: pagamento.subscriptionId })
    : null;
  const usuario = await db.primeiro(schema.users, { id: pagamento.userId });
  if (!usuario) return { novidade: false, acessoLiberado: false };

  /* Primeira cobrança da conta: é aqui que a senha ainda não existe. */
  const primeiraVez = usuario.passwordHash === null && !opcoes.renovacao;
  const agora = opcoes.pagoEm ?? new Date();

  await emTransacao(async (u) => {
    await u.atualizar(schema.payments, { id: pagamento.id }, {
      status: "aprovado", paidAt: agora, failureReason: null
    });

    if (assinatura) {
      const base = assinatura.currentPeriodEnd && assinatura.currentPeriodEnd > agora
        ? assinatura.currentPeriodEnd            /* renovação não encurta o período pago */
        : agora;
      await u.atualizar(schema.subscriptions, { id: assinatura.id }, {
        status: "ativa",
        currentPeriodEnd: fimDoPeriodo(base),
        canceledAt: null,
        cancelReason: null
      });
    }

    if (usuario.status !== "ativo") {
      await u.atualizar(schema.users, { id: usuario.id }, { status: "ativo" });
    }
  });

  let link: string | undefined;
  if (primeiraVez) {
    link = await linkPrimeiroAcesso(usuario.id);
    const planoNome = assinatura ? await nomeDoPlano(assinatura.planKey) : "Nutri&Live";
    const msg = emailPrimeiroAcesso(usuario.name, planoNome, link);
    await enviarEmail({ para: usuario.email, ...msg });
    log.info(`cobrança: acesso liberado para ${usuario.email} — link de primeiro acesso enviado`);
  }

  await registrarComissaoSePreciso({ ...pagamento, status: "aprovado", paidAt: agora });

  await db.inserir(schema.auditLog, {
    actorUserId: null,
    action: opcoes.renovacao ? "renovacao_paga" : "pagamento_aprovado",
    entity: "payment",
    entityId: pagamento.id,
    meta: { amountCents: pagamento.amountCents, method: pagamento.method, userId: usuario.id }
  });

  return { novidade: true, acessoLiberado: true, ...(link ? { linkPrimeiroAcesso: link } : {}) };
}

/** Pagamento recusado: nada de acesso, e a pessoa fica sabendo por que. */
export async function aplicarPagamentoRecusado(
  pagamentoId: string, motivo: string
): Promise<{ novidade: boolean }> {
  const pagamento = await db.primeiro(schema.payments, { id: pagamentoId });
  if (!pagamento) return { novidade: false };
  if (pagamento.status === "recusado") return { novidade: false };
  if (pagamento.status === "aprovado") {
    log.warn(`cobrança: recusa chegou depois da aprovação em ${pagamentoId}, ignorada`);
    return { novidade: false };
  }

  await db.atualizar(schema.payments, { id: pagamento.id }, {
    status: "recusado", failureReason: motivo
  });
  await db.inserir(schema.auditLog, {
    actorUserId: null, action: "pagamento_recusado", entity: "payment",
    entityId: pagamento.id, meta: { motivo }
  });
  return { novidade: true };
}

export async function nomeDoPlano(planKey: string): Promise<string> {
  const plano = await db.primeiro(schema.plans, { key: planKey });
  return plano?.name ?? planKey;
}

/** Acesso continua enquanto o período pago não terminou. */
export const acessoVigente = (assinatura: Assinatura | null, agora = new Date()): boolean => {
  if (!assinatura) return false;
  if (assinatura.status === "ativa" || assinatura.status === "atrasada") return true;
  if (assinatura.status === "cancelada") {
    return !!assinatura.currentPeriodEnd && assinatura.currentPeriodEnd > agora;
  }
  return false;
};

export type { Assinatura, Pagamento, Usuario };
