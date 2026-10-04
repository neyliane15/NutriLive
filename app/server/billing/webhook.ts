/* =========================================================================
   Nutri&Live — webhook de cobrança, idempotente

   Ordem obrigatória (ARQUITETURA.md, item 6):
     1. valida a assinatura do provedor
     2. GRAVA em `webhook_events` com (provider, provider_event_id) único
     3. só então processa

   O passo 2 é o que garante que o mesmo evento chegando duas vezes não
   libera acesso duas vezes nem cobra comissão duas vezes: a segunda
   inserção estoura a unicidade e a entrega é respondida com ok, sem
   processar nada.

   Exceção pensada: se a primeira tentativa gravou o evento mas FALHOU no
   processamento (`processed_at` nulo e `error` preenchido), a reentrega é
   reprocessada — senão um erro transitório viraria um evento perdido para
   sempre.

   Régua de novas tentativas: 3, 5 e 7 dias, como os termos prometem
   (termos.html, seção "Assinatura e cobrança"). Depois da terceira, a
   assinatura é pausada, sem multa e sem dívida.
   ========================================================================= */
import { db, schema } from "../db/index.js";
import type { Linha } from "../db/index.js";
import { AppError } from "../lib/http.js";
import { log } from "../lib/log.js";
import { env } from "../lib/env.js";
import { provedor } from "./provedor.js";
import type { EventoWebhookValidado, RequisicaoWebhook } from "./provedor.js";
import { aplicarPagamentoAprovado, aplicarPagamentoRecusado } from "./acesso.js";
import { cancelarComissaoDoPagamento } from "./comissao.js";
import { enviarEmail, emailCobrancaFalhou, emailEstorno } from "./email.js";
import { somarDias } from "./nucleo.js";

type Assinatura = Linha<typeof schema.subscriptions>;

/** A régua que os termos prometem: 3, 5 e 7 dias. */
export const REGUA_RETENTATIVAS = [3, 5, 7] as const;

/* ======================================================================== */
/*  Porta de entrada                                                        */
/* ======================================================================== */
export interface ResultadoWebhook {
  ok: true;
  /** `true` quando o evento já havia sido processado antes. */
  repetido: boolean;
  tipo: string;
}

export async function receberWebhook(req: RequisicaoWebhook): Promise<ResultadoWebhook> {
  const prov = await provedor();
  const evento = await prov.validarWebhook(req);

  if (!evento.valido) {
    /* Evento não autenticado não entra no banco: fila de webhook não é
       depósito de requisição anônima. Fica no log e o provedor recebe 401. */
    log.warn(`webhook ${prov.nome} recusado: ${evento.motivo ?? "assinatura inválida"}`);
    throw new AppError("nao_autenticado", "Assinatura do webhook inválida.");
  }
  if (!evento.eventoId) {
    throw new AppError("dados_invalidos", "Notificação sem identificador de evento.");
  }

  /* ---- 2. grava ANTES de processar ----------------------------------- */
  let registro: Linha<typeof schema.webhookEvents>;
  let repetido = false;
  try {
    registro = await db.inserir(schema.webhookEvents, {
      provider: prov.nome,
      providerEventId: evento.eventoId,
      type: evento.tipoCru || evento.tipo,
      payload: (evento.payload ?? {}) as Record<string, unknown>
    });
  } catch (e) {
    if (!(e instanceof AppError) || e.code !== "conflito") throw e;
    const anterior = await db.primeiro(schema.webhookEvents, {
      provider: prov.nome, providerEventId: evento.eventoId
    });
    if (!anterior) throw e;
    if (anterior.processedAt) {
      /* Já processado com sucesso: nada a fazer. É o caso do webhook
         repetido — nenhum acesso novo, nenhuma comissão nova. */
      log.info(`webhook repetido ignorado: ${evento.eventoId}`);
      return { ok: true, repetido: true, tipo: evento.tipo };
    }
    /* Gravado antes, mas o processamento não concluiu: reprocessa. */
    log.warn(`webhook ${evento.eventoId} reentregue após falha; reprocessando`);
    registro = anterior;
    repetido = true;
  }

  /* ---- 3. processa --------------------------------------------------- */
  try {
    await processar(evento);
    await db.atualizar(schema.webhookEvents, { id: registro.id }, {
      processedAt: new Date(), error: null
    });
    return { ok: true, repetido, tipo: evento.tipo };
  } catch (e) {
    const mensagem = e instanceof Error ? e.message : String(e);
    await db.atualizar(schema.webhookEvents, { id: registro.id }, { error: mensagem.slice(0, 2000) });
    log.error(`webhook ${evento.eventoId} falhou no processamento`, e);
    throw e;
  }
}

/* ======================================================================== */
/*  Os tratadores                                                           */
/* ======================================================================== */
async function processar(evento: EventoWebhookValidado): Promise<void> {
  switch (evento.tipo) {
    case "pagamento_aprovado":
      await comPagamento(evento, async (p) => { await aplicarPagamentoAprovado(p.id); });
      return;

    case "pagamento_recusado":
      await comPagamento(evento, async (p) => {
        await aplicarPagamentoRecusado(p.id, "o banco não autorizou a cobrança.");
      });
      return;

    case "pagamento_estornado":
      await comPagamento(evento, async (p) => { await aplicarEstorno(p.id, "estorno no provedor"); });
      return;

    case "assinatura_cancelada":
      await cancelarPorProvedor(evento);
      return;

    case "cobranca_recorrente_paga":
      await registrarCicloPago(evento);
      return;

    case "cobranca_recorrente_falhou":
      await registrarCicloFalhado(evento);
      return;

    case "ignorado":
    default:
      log.debug(`webhook sem tratador: ${evento.tipoCru}`);
      return;
  }
}

/** Resolve o pagamento pelo id do provedor e roda a ação. */
async function comPagamento(
  evento: EventoWebhookValidado,
  acao: (p: Linha<typeof schema.payments>) => Promise<void>
): Promise<void> {
  if (!evento.providerPaymentId) {
    log.warn(`webhook ${evento.eventoId} sem id de pagamento`);
    return;
  }
  const prov = await provedor();
  const pagamento = await db.primeiro(schema.payments, {
    provider: prov.nome, providerPaymentId: evento.providerPaymentId
  });
  if (!pagamento) {
    /* Pagamento que não é nosso (outra integração na mesma conta do
       provedor) ou chegou antes de a nossa linha existir. */
    log.warn(`webhook: pagamento ${evento.providerPaymentId} desconhecido`);
    return;
  }
  await acao(pagamento);
}

/* --------------------------------- estorno ------------------------------ */
/**
 * Estorno: o dinheiro voltou, então o acesso vai embora e a comissão cai.
 * Idempotente pelo estado do pagamento.
 */
export async function aplicarEstorno(pagamentoId: string, motivo: string): Promise<{ novidade: boolean }> {
  const pagamento = await db.primeiro(schema.payments, { id: pagamentoId });
  if (!pagamento) return { novidade: false };
  if (pagamento.status === "estornado") return { novidade: false };

  await db.atualizar(schema.payments, { id: pagamento.id }, {
    status: "estornado", failureReason: motivo
  });
  await cancelarComissaoDoPagamento(pagamento.id);

  if (pagamento.subscriptionId) {
    const assinatura = await db.primeiro(schema.subscriptions, { id: pagamento.subscriptionId });
    /* Devolveu o dinheiro: o período deixa de estar pago agora. */
    if (assinatura && assinatura.status !== "cancelada") {
      await db.atualizar(schema.subscriptions, { id: assinatura.id }, {
        status: "cancelada",
        canceledAt: new Date(),
        currentPeriodEnd: new Date(),
        cancelReason: `estorno: ${motivo}`
      });
    }
  }

  const usuario = await db.primeiro(schema.users, { id: pagamento.userId });
  if (usuario) {
    await enviarEmail({ para: usuario.email, ...emailEstorno(usuario.name, pagamento.amountCents) });
  }
  await db.inserir(schema.auditLog, {
    actorUserId: null, action: "pagamento_estornado", entity: "payment",
    entityId: pagamento.id, meta: { motivo, amountCents: pagamento.amountCents }
  });
  return { novidade: true };
}

/* ------------------------- assinatura cancelada ------------------------- */
async function cancelarPorProvedor(evento: EventoWebhookValidado): Promise<void> {
  const assinatura = await assinaturaDoEvento(evento);
  if (!assinatura) return;
  if (assinatura.status === "cancelada") return;
  await db.atualizar(schema.subscriptions, { id: assinatura.id }, {
    status: "cancelada",
    canceledAt: new Date(),
    cancelReason: "cancelada no provedor"
  });
  await db.inserir(schema.auditLog, {
    actorUserId: null, action: "assinatura_cancelada_provedor", entity: "subscription",
    entityId: assinatura.id, meta: { acessoAte: assinatura.currentPeriodEnd }
  });
}

async function assinaturaDoEvento(evento: EventoWebhookValidado): Promise<Assinatura | null> {
  const prov = await provedor();
  if (evento.providerSubId) {
    const porSub = await db.primeiro(schema.subscriptions, {
      provider: prov.nome, providerSubId: evento.providerSubId
    });
    if (porSub) return porSub;
  }
  if (evento.providerPaymentId) {
    const pagamento = await db.primeiro(schema.payments, {
      provider: prov.nome, providerPaymentId: evento.providerPaymentId
    });
    if (pagamento?.subscriptionId) {
      return db.primeiro(schema.subscriptions, { id: pagamento.subscriptionId });
    }
  }
  return null;
}

/* --------------------------- cobrança recorrente ------------------------ */
async function registrarCicloPago(evento: EventoWebhookValidado): Promise<void> {
  const assinatura = await assinaturaDoEvento(evento);
  if (!assinatura) {
    log.warn(`webhook: ciclo pago sem assinatura conhecida (${evento.eventoId})`);
    return;
  }
  const prov = await provedor();
  const providerPaymentId = evento.providerPaymentId ?? null;

  /* A linha de pagamento do ciclo pode já existir (reentrega). A unicidade
     de `payments.provider_payment_id` é a trava. */
  let pagamento = providerPaymentId
    ? await db.primeiro(schema.payments, { provider: prov.nome, providerPaymentId })
    : null;

  if (!pagamento) {
    pagamento = await db.inserir(schema.payments, {
      subscriptionId: assinatura.id,
      userId: assinatura.userId,
      provider: prov.nome,
      providerPaymentId,
      amountCents: assinatura.priceCents,
      method: assinatura.method,
      status: "pendente"
    });
  }
  await aplicarPagamentoAprovado(pagamento.id, { renovacao: true });
}

async function registrarCicloFalhado(evento: EventoWebhookValidado): Promise<void> {
  const assinatura = await assinaturaDoEvento(evento);
  if (!assinatura) {
    log.warn(`webhook: ciclo falhado sem assinatura conhecida (${evento.eventoId})`);
    return;
  }
  const prov = await provedor();
  const providerPaymentId = evento.providerPaymentId ?? null;

  let pagamento = providerPaymentId
    ? await db.primeiro(schema.payments, { provider: prov.nome, providerPaymentId })
    : null;
  if (!pagamento) {
    pagamento = await db.inserir(schema.payments, {
      subscriptionId: assinatura.id,
      userId: assinatura.userId,
      provider: prov.nome,
      providerPaymentId,
      amountCents: assinatura.priceCents,
      method: assinatura.method,
      status: "recusado",
      failureReason: "cobrança recorrente recusada"
    });
  } else if (pagamento.status === "recusado") {
    return;                               /* já contabilizado */
  } else {
    await db.atualizar(schema.payments, { id: pagamento.id }, {
      status: "recusado", failureReason: "cobrança recorrente recusada"
    });
  }

  await agendarRetentativa(assinatura);
}

/**
 * Régua de 3, 5 e 7 dias. A tentativa é contada pelas recusas seguidas da
 * assinatura desde a última cobrança aprovada.
 *
 * DEPENDE DE OUTRO AGENTE / DO EXECUTOR: a data da próxima tentativa fica em
 * `audit_log` porque `subscriptions` não tem coluna para ela. Uma coluna
 * `next_retry_at` no schema (dono: executor) deixaria isso consultável e
 * permitiria um cron de cobrança. Veja o relatório.
 */
export async function agendarRetentativa(assinatura: Assinatura): Promise<{ tentativa: number; proximaEm: Date | null }> {
  const pagamentos = await db.buscar(
    schema.payments, { subscriptionId: assinatura.id }, { ordem: { campo: "createdAt", dir: "desc" } }
  );
  let recusasSeguidas = 0;
  for (const p of pagamentos) {
    if (p.status === "recusado") recusasSeguidas++;
    else if (p.status === "aprovado") break;
  }
  const tentativa = Math.max(1, recusasSeguidas);
  const dias = REGUA_RETENTATIVAS[tentativa - 1];
  const proximaEm = dias === undefined ? null : somarDias(new Date(), dias);

  await db.atualizar(schema.subscriptions, { id: assinatura.id }, {
    /* Enquanto há tentativa pela frente o acesso segue: "atrasada".
       Esgotada a régua, a assinatura é pausada — sem multa e sem dívida. */
    status: proximaEm ? "atrasada" : "expirada"
  });

  await db.inserir(schema.auditLog, {
    actorUserId: null,
    action: proximaEm ? "cobranca_retentativa_agendada" : "assinatura_pausada",
    entity: "subscription",
    entityId: assinatura.id,
    meta: { tentativa, de: REGUA_RETENTATIVAS, proximaEm: proximaEm?.toISOString() ?? null }
  });

  const usuario = await db.primeiro(schema.users, { id: assinatura.userId });
  if (usuario) {
    await enviarEmail({ para: usuario.email, ...emailCobrancaFalhou(usuario.name, tentativa, proximaEm) });
  }

  log.info(
    proximaEm
      ? `cobrança: tentativa ${tentativa} de ${REGUA_RETENTATIVAS.length} falhou; próxima em ${proximaEm.toISOString()}`
      : `cobrança: régua esgotada; assinatura ${assinatura.id} pausada`
  );
  return { tentativa, proximaEm };
}

/* ======================================================================== */
/*  Ponte com o driver simulado                                             */
/* ======================================================================== */
let simuladoLigado = false;

/**
 * No driver simulado o "banco" avisa por webhook, igual ao real: o Pix cai
 * sozinho depois de alguns segundos e a notificação entra pelo MESMO caminho
 * de `receberWebhook`. Assim a demonstração exercita a idempotência de
 * verdade, sem rede.
 */
export function ligarWebhookSimulado(): void {
  if (simuladoLigado || env.PAY_DRIVER !== "simulado") return;
  simuladoLigado = true;
  void import("./simulado.js").then(({ aoNotificar }) => {
    aoNotificar((req) => {
      void receberWebhook(req).catch((e) => log.error("webhook simulado falhou", e));
    });
  });
}

/** Só o teste usa: solta a ponte para o próximo caso montar a sua. */
export function desligarWebhookSimulado(): void {
  simuladoLigado = false;
}
