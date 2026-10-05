/* =========================================================================
   Nutri&Live — comissão da academia parceira

   O programa de parceria (academias.html) é de INDICAÇÃO: a academia não
   paga e não assina; quem assina é o aluno, pelo link exclusivo da unidade.
   Cada pagamento aprovado de uma assinatura originada por esse link gera
   uma linha em `commissions`, recorrente enquanto a assinatura durar.

   Como a origem é reconhecida, sem inventar campo fora do contrato:
   `CheckoutIn.coupon` carrega o código do link da academia (que é o `slug`
   da organização). O checkout, ao reconhecer esse slug, aponta
   `subscriptions.org_id` para a academia indicadora. Daí em diante a regra é
   só esta: assinatura cujo `org_id` é uma organização do tipo `academia` e
   cujo assinante NÃO é o dono dessa organização = venda indicada.

   `rate_bp` vem de `env.COMMISSION_RATE_BP` (pontos-base: 2000 = 20%), como
   o briefing pede. O percentual real é combinado por contrato com cada
   parceiro — quando houver percentual por organização, é só ler dali.
   ========================================================================= */
import { db, schema } from "../db/index.js";
import type { Linha } from "../db/index.js";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import { aplicarBp, competencia } from "./nucleo.js";

type Pagamento = Linha<typeof schema.payments>;
type Comissao = Linha<typeof schema.commissions>;

/** Decide se o pagamento gera comissão e para qual organização. */
export async function organizacaoIndicadora(pagamento: Pagamento): Promise<string | null> {
  if (!pagamento.subscriptionId) return null;
  const assinatura = await db.primeiro(schema.subscriptions, { id: pagamento.subscriptionId });
  if (!assinatura?.orgId) return null;

  const org = await db.primeiro(schema.organizations, { id: assinatura.orgId });
  if (!org || org.type !== "academia") return null;

  /* A academia assinando o próprio plano não gera comissão para ela mesma. */
  if (org.ownerUserId && org.ownerUserId === assinatura.userId) return null;

  return org.id;
}

/**
 * Gera a linha de comissão, uma única vez por pagamento.
 * A trava é `commissions.payment_id`: se já existe linha para o pagamento,
 * sai sem fazer nada. É o que garante que webhook repetido não paga comissão
 * duas vezes.
 */
export async function registrarComissaoSePreciso(pagamento: Pagamento): Promise<Comissao | null> {
  if (pagamento.status !== "aprovado") return null;

  const existente = await db.primeiro(schema.commissions, { paymentId: pagamento.id });
  if (existente) return existente;

  const orgId = await organizacaoIndicadora(pagamento);
  if (!orgId) return null;

  const rateBp = Number.isFinite(env.COMMISSION_RATE_BP) ? Math.trunc(env.COMMISSION_RATE_BP) : 0;
  if (rateBp <= 0) return null;

  const baseCents = pagamento.amountCents;
  const amountCents = aplicarBp(baseCents, rateBp);

  const comissao = await db.inserir(schema.commissions, {
    orgId,
    subscriptionId: pagamento.subscriptionId,
    paymentId: pagamento.id,
    period: competencia(pagamento.paidAt ?? new Date()),
    baseCents,
    rateBp,
    amountCents,
    status: "prevista"
  });

  log.info(`comissão: ${amountCents} centavos (${rateBp / 100}%) para a organização ${orgId}`);
  await db.inserir(schema.auditLog, {
    actorUserId: null, action: "comissao_gerada", entity: "commission",
    entityId: comissao.id, meta: { orgId, baseCents, rateBp, amountCents }
  });
  return comissao;
}

/**
 * Estorno derruba a comissão junto: o dinheiro voltou.
 *
 * Com uma exceção que é decisão de negócio e não bug: comissão `paga` NÃO é
 * apagada, porque o repasse já saiu da nossa conta e entrou na do parceiro.
 * Apagar a linha faria o histórico dele mudar sozinho.
 *
 * Mas sair em silêncio era errado. O cliente recebia o dinheiro de volta, a
 * academia ficava com os 20%, e não havia linha, marca nem registro dizendo
 * que aquele repasse ficou descasado do pagamento — a tela de Comissões
 * seguia mostrando o período fechado como se nada tivesse acontecido.
 * Agora fica em `audit_log`, com o valor e a competência, que é onde se
 * procura quando a conta não fecha no fim do mês.
 */
export async function cancelarComissaoDoPagamento(pagamentoId: string): Promise<void> {
  const comissao = await db.primeiro(schema.commissions, { paymentId: pagamentoId });
  if (!comissao) return;

  if (comissao.status === "paga") {
    log.warn(
      `estorno de ${pagamentoId}: comissão ${comissao.id} já foi PAGA (${comissao.amountCents} centavos) — ` +
      "repasse mantido e descasado do pagamento"
    );
    await db.inserir(schema.auditLog, {
      actorUserId: null, action: "comissao_descasada", entity: "commission",
      entityId: comissao.id,
      meta: {
        motivo: "pagamento estornado depois de a comissão já ter sido repassada",
        orgId: comissao.orgId,
        period: comissao.period,
        amountCents: comissao.amountCents,
        paymentId: pagamentoId
      }
    });
    return;
  }

  await db.remover(schema.commissions, { id: comissao.id });
  await db.inserir(schema.auditLog, {
    actorUserId: null, action: "comissao_cancelada", entity: "commission",
    entityId: comissao.id, meta: { motivo: "pagamento estornado", amountCents: comissao.amountCents }
  });
}
