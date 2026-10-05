/* =========================================================================
   Nutri&Live — driver do Mercado Pago
   Checkout Transparente (/v1/payments) + Assinaturas (/preapproval)

   ===================== LEIA ANTES DE IR PARA PRODUÇÃO =====================
   Este contêiner NÃO TEM REDE EXTERNA. Nada aqui foi executado contra a API
   do Mercado Pago: o código foi escrito a partir da documentação conhecida
   da API, com os campos, caminhos e formatos que ela usa, mas **nenhuma
   requisição real foi feita e nenhuma resposta real foi observada**.

   Cada ponto que precisa de conferência está marcado com `CONFERIR:`.
   O roteiro de conferência está em `docs/COBRANCA.md` (seção "Conferir
   contra a API real"). Até alguém rodar esse roteiro com credencial de
   teste, trate este driver como NÃO VERIFICADO.

   O que é estrutural e não muda:
   - todo acesso à rede passa por `chamar()`, que é injetável — dá para
     testar cada método com respostas gravadas, sem rede;
   - o PAN nunca chega aqui: só `cardToken`, gerado no navegador;
   - MP_ACCESS_TOKEN nunca sai do servidor.
   ========================================================================= */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import { AppError } from "../lib/http.js";
import type {
  ConsultaPagamento, EventoWebhookValidado, PedidoCobranca, ProvedorPagamento,
  RequisicaoWebhook, ResultadoCobranca, StatusProvedor, TipoEventoCobranca
} from "./provedor.js";

const BASE = "https://api.mercadopago.com";

/** Resposta crua da API, sem fingir tipo que não conferimos. */
type Json = Record<string, any>;

export interface OpcoesMercadoPago {
  accessToken?: string;
  webhookSecret?: string;
  /** Injetável para teste: recebe caminho, método e corpo, devolve JSON. */
  chamar?: (caminho: string, init: { metodo: string; corpo?: unknown; idempotencia?: string }) => Promise<Json>;
}

/* ------------------------- tradução de status ---------------------------- */
/** CONFERIR: lista de `status` de /v1/payments e o mapeamento para o nosso. */
function traduzirStatus(status: string | undefined): StatusProvedor {
  switch (status) {
    case "approved": return "aprovado";
    case "authorized": return "aprovado";
    case "pending": return "pendente";
    case "in_process": return "em_analise";
    case "in_mediation": return "em_analise";
    case "rejected": return "recusado";
    case "refunded": return "estornado";
    case "charged_back": return "estornado";
    case "cancelled": return "cancelado";
    default: return "pendente";
  }
}

/**
 * Mensagem em português para o `status_detail` do Mercado Pago.
 * CONFERIR: a lista completa de `status_detail` muda com o tempo; o `default`
 * garante que a pessoa sempre recebe uma frase legível.
 */
const MOTIVOS: Record<string, string> = {
  cc_rejected_insufficient_amount: "o cartão não tem limite suficiente.",
  cc_rejected_bad_filled_security_code: "o código de segurança está errado.",
  cc_rejected_bad_filled_date: "a validade do cartão está errada.",
  cc_rejected_bad_filled_other: "algum dado do cartão está errado.",
  cc_rejected_bad_filled_card_number: "o número do cartão está errado.",
  cc_rejected_high_risk: "o banco não autorizou por suspeita de risco.",
  cc_rejected_call_for_authorize: "o banco pediu que você autorize a compra.",
  cc_rejected_card_disabled: "o cartão está desativado.",
  cc_rejected_card_error: "o banco não conseguiu processar o cartão.",
  cc_rejected_duplicated_payment: "esse pagamento já foi feito.",
  cc_rejected_max_attempts: "muitas tentativas com esse cartão.",
  cc_rejected_blacklist: "o banco recusou o cartão.",
  cc_rejected_invalid_installments: "o cartão não aceita esse parcelamento.",
  cc_rejected_other_reason: "o banco recusou sem informar o motivo."
};
export const motivoEmPortugues = (detalhe: string | undefined): string =>
  (detalhe && MOTIVOS[detalhe]) ?? "o banco não autorizou a cobrança.";

/* --------------------------- valor em reais ------------------------------ */
/**
 * O nosso dinheiro é centavo inteiro; `transaction_amount` é número em reais.
 * Duas casas, arredondado — nunca float arrastado.
 * CONFERIR: o Mercado Pago rejeita valor com mais de 2 casas decimais.
 */
export const emReais = (cents: number): number => Math.round(cents) / 100;

const nomeESobrenome = (nome: string): { first_name: string; last_name: string } => {
  const partes = nome.trim().split(/\s+/);
  const primeiro = partes[0] ?? nome;
  return { first_name: primeiro, last_name: partes.slice(1).join(" ") || primeiro };
};

/* ======================================================================== */
export function criarMercadoPago(opcoes: OpcoesMercadoPago = {}): ProvedorPagamento {
  const token = opcoes.accessToken ?? env.MP_ACCESS_TOKEN;
  const segredo = opcoes.webhookSecret ?? env.MP_WEBHOOK_SECRET;

  /* --------------------------- a única porta de rede -------------------- */
  const chamar = opcoes.chamar ?? (async (caminho, init) => {
    if (!token) throw new AppError("indisponivel", "Pagamento indisponível: credencial do provedor ausente.");
    const cabecalhos: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    };
    /* Idempotência: o Mercado Pago aceita X-Idempotency-Key em POST, e é o
       que impede cobrança dobrada quando a rede cai no meio.
       CONFERIR: validade da chave (documentada como 24h) e comportamento
       exato quando a mesma chave chega com corpo diferente. */
    if (init.idempotencia) cabecalhos["X-Idempotency-Key"] = init.idempotencia;

    const resposta = await fetch(`${BASE}${caminho}`, {
      method: init.metodo,
      headers: cabecalhos,
      body: init.corpo === undefined ? undefined : JSON.stringify(init.corpo)
    });
    const texto = await resposta.text();
    const corpo: Json = texto ? (JSON.parse(texto) as Json) : {};
    if (!resposta.ok) {
      log.error(`Mercado Pago ${init.metodo} ${caminho} -> ${resposta.status}`, corpo);
      /* 4xx de dado do cliente não é erro nosso; 5xx e rede são indisponibilidade. */
      if (resposta.status >= 400 && resposta.status < 500) {
        throw new AppError("pagamento_recusado", corpo["message"] ?? "O provedor recusou a cobrança.");
      }
      throw new AppError("indisponivel", "O provedor de pagamento está indisponível. Tente em instantes.");
    }
    return corpo;
  });

  /* ------------------------------- cartão ------------------------------- */
  async function pagarComCartao(pedido: PedidoCobranca): Promise<ResultadoCobranca> {
    if (!pedido.cardToken) {
      throw new AppError("dados_invalidos", "Faltou o token do cartão.", { cardToken: "Token do cartão ausente." });
    }
    const { first_name, last_name } = nomeESobrenome(pedido.cliente.nome);
    /* CONFERIR: nomes dos campos de /v1/payments e se `payment_method_id`
       pode ser omitido quando o token já carrega a bandeira. */
    const corpo = {
      transaction_amount: emReais(pedido.valorCents),
      token: pedido.cardToken,
      description: `Nutri&Live — plano ${pedido.planoNome}`,
      installments: pedido.parcelas ?? 1,
      statement_descriptor: "NUTRIELIVE",
      external_reference: pedido.referencia,
      /* Débito recorrente também entra por aqui; a recorrência quem comanda
         é o /preapproval criado em seguida.
         CONFERIR: no débito o Mercado Pago exige payment_method_id explícito
         (ex. "debelo", "maestro") — o token do SDK traz essa informação. */
      payer: {
        email: pedido.cliente.email,
        first_name,
        last_name,
        identification: { type: "CPF", number: pedido.cliente.cpf }
      },
      notification_url: `${env.APP_URL}/api/webhooks/mercadopago`
    };
    const r = await chamar("/v1/payments", {
      metodo: "POST", corpo, idempotencia: `pay-${pedido.referencia}`
    });

    const status = traduzirStatus(r["status"]);
    return {
      status,
      providerPaymentId: String(r["id"] ?? ""),
      brand: r["payment_method_id"] ?? undefined,
      last4: r["card"]?.["last_four_digits"] ?? undefined,
      motivo: status === "recusado" ? motivoEmPortugues(r["status_detail"]) : undefined
    };
  }

  /* --------------------------- recorrência ------------------------------ */
  /**
   * Preapproval: a assinatura em si. Mensal, sem data de fim.
   * CONFERIR: `/preapproval` aceita `card_token_id` para já autorizar na
   * criação; se a conta não tiver isso habilitado, o fluxo vira
   * criar preapproval "pending" + redirecionar para `init_point`, o que
   * quebraria o nosso checkout transparente. Isso TEM que ser confirmado
   * com a conta do cliente antes de ligar o driver real.
   */
  async function criarPreapproval(pedido: PedidoCobranca, cartaoJaCobrado: boolean): Promise<string | undefined> {
    const corpo = {
      reason: `Nutri&Live — plano ${pedido.planoNome}`,
      external_reference: pedido.referencia,
      payer_email: pedido.cliente.email,
      back_url: `${env.APP_URL}/conta`,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: emReais(pedido.recorrenteCents),
        currency_id: "BRL",
        /* A primeira cobrança já foi feita no /v1/payments, então a
           recorrência começa no mês seguinte.
           CONFERIR: formato aceito em `start_date` (ISO com fuso). */
        ...(cartaoJaCobrado ? { start_date: proximoMes().toISOString() } : {})
      },
      card_token_id: pedido.cardToken,
      status: "authorized"
    };
    try {
      const r = await chamar("/preapproval", {
        metodo: "POST", corpo, idempotencia: `sub-${pedido.referencia}`
      });
      return r["id"] ? String(r["id"]) : undefined;
    } catch (e) {
      /* A primeira cobrança já passou: não derrubamos a contratação por
         causa da recorrência.

         Antes isto só ia para o log, e o comentário dizia "fica registrado
         para o admin resolver" — sem lugar nenhum onde resolver: a tela de
         webhooks lista eventos de webhook, a visão geral não tem contador
         disso, e nenhuma tela lê `audit_log` filtrando por isso. O
         resultado: assinatura `ativa` sem `provider_sub_id`, que nunca é
         cobrada de novo e (antes da conferência de vencimento) nunca
         vencia. O cliente pagava um mês e usava de graça; ninguém
         descobria.

         Agora vira linha de auditoria, com tom de risco em /admin/auditoria.
         A importação é dinâmica porque esta camada não conhece o banco de
         propósito — ela fala HTTP com o provedor e nada mais. */
      log.error("Mercado Pago: falha ao criar a assinatura recorrente", e);
      try {
        const { db, schema } = await import("../db/index.js");
        await db.inserir(schema.auditLog, {
          actorUserId: null,
          action: "recorrencia_nao_criada",
          entity: "subscription",
          entityId: pedido.referencia,
          meta: {
            motivo: "o provedor recusou criar a assinatura recorrente; a primeira cobrança já foi feita",
            erro: e instanceof Error ? e.message.slice(0, 400) : String(e).slice(0, 400),
            acao: "cobrar o próximo ciclo na mão ou refazer a recorrência"
          }
        });
      } catch (falhaAuditoria) {
        log.error("Mercado Pago: não deu nem para registrar a falha de recorrência", falhaAuditoria);
      }
      return undefined;
    }
  }

  const proximoMes = (): Date => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d;
  };

  /* ---------------------------------- Pix -------------------------------- */
  async function pagarComPix(pedido: PedidoCobranca): Promise<ResultadoCobranca> {
    const { first_name, last_name } = nomeESobrenome(pedido.cliente.nome);
    const expiraEm = new Date(Date.now() + 30 * 60 * 1000);
    /* CONFERIR: `date_of_expiration` tem formato próprio
       (yyyy-MM-dd'T'HH:mm:ss.SSSZZZZZ) e mínimo/máximo de validade. */
    const corpo = {
      transaction_amount: emReais(pedido.valorCents),
      description: `Nutri&Live — plano ${pedido.planoNome}`,
      payment_method_id: "pix",
      external_reference: pedido.referencia,
      date_of_expiration: expiraEm.toISOString(),
      payer: {
        email: pedido.cliente.email,
        first_name,
        last_name,
        identification: { type: "CPF", number: pedido.cliente.cpf }
      },
      notification_url: `${env.APP_URL}/api/webhooks/mercadopago`
    };
    const r = await chamar("/v1/payments", {
      metodo: "POST", corpo, idempotencia: `pix-${pedido.referencia}`
    });
    /* CONFERIR: caminho do BR Code na resposta
       (point_of_interaction.transaction_data.qr_code / qr_code_base64). */
    const dados = r["point_of_interaction"]?.["transaction_data"] ?? {};
    const qrCode: string = dados["qr_code"] ?? "";
    if (!qrCode) throw new AppError("indisponivel", "O provedor não devolveu o código do Pix. Tente de novo.");
    return {
      status: traduzirStatus(r["status"]),
      providerPaymentId: String(r["id"] ?? ""),
      pix: {
        qrCode,
        qrCodeBase64: dados["qr_code_base64"] ?? undefined,
        expiraEm: r["date_of_expiration"] ? new Date(r["date_of_expiration"]) : expiraEm
      }
    };
  }

  /* ------------------------------- webhook ------------------------------ */
  /**
   * Assinatura do webhook, algoritmo publicado pelo Mercado Pago:
   *   x-signature: "ts=<timestamp>,v1=<hash>"
   *   manifest = "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
   *   hash = HMAC-SHA256(manifest, MP_WEBHOOK_SECRET) em hexadecimal
   * O `data.id` entra em minúsculas.
   * CONFERIR: presença de `x-request-id` em todos os tipos de notificação e
   * se o manifest omite o trecho "request-id;" quando o cabeçalho falta.
   */
  function conferirAssinatura(req: RequisicaoWebhook, dataId: string): { ok: boolean; motivo?: string } {
    if (!segredo) {
      /* Sem segredo configurado não há como validar. Em produção isso é
         recusa; em desenvolvimento deixa passar para dar para testar. */
      return env.NODE_ENV === "production"
        ? { ok: false, motivo: "MP_WEBHOOK_SECRET não configurado." }
        : { ok: true };
    }
    const assinatura = req.cabecalhos["x-signature"];
    const requestId = req.cabecalhos["x-request-id"] ?? "";
    if (!assinatura) return { ok: false, motivo: "Cabeçalho x-signature ausente." };

    let ts = "", v1 = "";
    for (const parte of assinatura.split(",")) {
      const pedaco = parte.split("=");
      const chave = (pedaco[0] ?? "").trim();
      const valor = (pedaco[1] ?? "").trim();
      if (chave === "ts") ts = valor;
      if (chave === "v1") v1 = valor;
    }
    if (!ts || !v1) return { ok: false, motivo: "x-signature malformado." };

    /* Janela de 5 minutos contra repetição de requisição antiga. */
    const idade = Math.abs(Date.now() - Number(ts) * (String(ts).length > 11 ? 1 : 1000));
    if (Number.isFinite(idade) && idade > 5 * 60 * 1000) {
      return { ok: false, motivo: "Assinatura fora da janela de tempo." };
    }

    const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
    const esperado = createHmac("sha256", segredo).update(manifest).digest("hex");
    const a = Buffer.from(esperado, "utf8");
    const b = Buffer.from(v1, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, motivo: "Assinatura não confere." };
    }
    return { ok: true };
  }

  /**
   * Traduz a notificação. O Mercado Pago manda pouco no corpo: tipo e id.
   * O estado de verdade vem da consulta ao recurso — é assim que a
   * documentação manda fazer, e é o que evita confiar em corpo forjado.
   */
  async function validarWebhook(req: RequisicaoWebhook): Promise<EventoWebhookValidado> {
    let corpo: Json = {};
    try {
      corpo = req.corpoCru ? (JSON.parse(req.corpoCru) as Json) : {};
    } catch {
      return { valido: false, motivo: "Corpo não é JSON.", eventoId: "", tipoCru: "", tipo: "ignorado", payload: null };
    }

    const tipoCru: string = corpo["type"] ?? corpo["topic"] ?? "";
    const dataId = String(corpo["data"]?.["id"] ?? corpo["resource"] ?? req.dataIdQuery ?? "");
    /* `id` da notificação é o que identifica o EVENTO; `data.id` identifica o
       RECURSO. Para idempotência usamos os dois: o mesmo recurso no mesmo
       tipo com o mesmo id de notificação é um evento repetido. */
    const idNotificacao = String(corpo["id"] ?? "");
    const eventoId = idNotificacao ? `${tipoCru}:${idNotificacao}` : `${tipoCru}:${dataId}:${corpo["action"] ?? ""}`;

    const conferida = conferirAssinatura(req, dataId);
    if (!conferida.ok) {
      return { valido: false, motivo: conferida.motivo, eventoId, tipoCru, tipo: "ignorado", payload: corpo };
    }

    const base = { valido: true, eventoId, tipoCru, payload: corpo };

    /* ---- pagamento ---- */
    if (tipoCru === "payment" || tipoCru.startsWith("payment")) {
      const consulta = await consultarPagamento(dataId);
      const tipo: TipoEventoCobranca =
        consulta.status === "aprovado" ? "pagamento_aprovado" :
        consulta.status === "recusado" ? "pagamento_recusado" :
        consulta.status === "estornado" ? "pagamento_estornado" : "ignorado";
      return { ...base, tipo, providerPaymentId: dataId };
    }

    /* ---- assinatura recorrente ---- */
    if (tipoCru === "subscription_preapproval" || tipoCru === "preapproval") {
      /* CONFERIR: valores de `status` em /preapproval/{id}
         (authorized, paused, cancelled). */
      const r = await chamar(`/preapproval/${dataId}`, { metodo: "GET" });
      const status: string = r["status"] ?? "";
      const tipo: TipoEventoCobranca = status === "cancelled" ? "assinatura_cancelada" : "ignorado";
      return { ...base, tipo, providerSubId: dataId };
    }

    /* ---- cobrança de um ciclo da assinatura ---- */
    if (tipoCru === "subscription_authorized_payment" || tipoCru === "authorized_payment") {
      /* CONFERIR: caminho /authorized_payments/{id} e nomes dos campos
         `status`, `payment.id` e `preapproval_id`. */
      const r = await chamar(`/authorized_payments/${dataId}`, { metodo: "GET" });
      const status = traduzirStatus(r["status"] ?? r["payment"]?.["status"]);
      const tipo: TipoEventoCobranca =
        status === "aprovado" ? "cobranca_recorrente_paga" :
        status === "recusado" ? "cobranca_recorrente_falhou" : "ignorado";
      return {
        ...base, tipo,
        providerPaymentId: r["payment"]?.["id"] ? String(r["payment"]["id"]) : dataId,
        providerSubId: r["preapproval_id"] ? String(r["preapproval_id"]) : undefined
      };
    }

    return { ...base, tipo: "ignorado" };
  }

  /* --------------------------- consulta e estorno ----------------------- */
  async function consultarPagamento(providerPaymentId: string): Promise<ConsultaPagamento> {
    const r = await chamar(`/v1/payments/${providerPaymentId}`, { metodo: "GET" });
    const status = traduzirStatus(r["status"]);
    return {
      status,
      pagoEm: r["date_approved"] ? new Date(r["date_approved"]) : undefined,
      motivo: status === "recusado" ? motivoEmPortugues(r["status_detail"]) : undefined,
      valorCents: typeof r["transaction_amount"] === "number"
        ? Math.round(r["transaction_amount"] * 100)
        : undefined
    };
  }

  return {
    nome: "mercadopago",

    async criarAssinatura(pedido) {
      /* Primeira cobrança no Checkout Transparente, para o acesso sair na
         hora, e a recorrência logo depois. Se a primeira recusa, não existe
         recorrência para criar. */
      const primeira = await pagarComCartao(pedido);
      if (primeira.status !== "aprovado" && primeira.status !== "em_analise") return primeira;
      const providerSubId = await criarPreapproval(pedido, true);
      return { ...primeira, providerSubId };
    },

    criarPixAvulso: pagarComPix,
    consultarPagamento,

    async cancelarAssinatura(providerSubId) {
      /* CONFERIR: PUT /preapproval/{id} com {status:"cancelled"}. */
      await chamar(`/preapproval/${providerSubId}`, { metodo: "PUT", corpo: { status: "cancelled" } });
    },

    async estornar(providerPaymentId, valorCents) {
      /* CONFERIR: POST /v1/payments/{id}/refunds — corpo vazio estorna tudo,
         `{amount}` em reais estorna parcial. Exige X-Idempotency-Key. */
      await chamar(`/v1/payments/${providerPaymentId}/refunds`, {
        metodo: "POST",
        corpo: valorCents === undefined ? {} : { amount: emReais(valorCents) },
        idempotencia: `refund-${providerPaymentId}-${valorCents ?? "total"}-${randomUUID().slice(0, 8)}`
      });
    },

    validarWebhook
  };
}
