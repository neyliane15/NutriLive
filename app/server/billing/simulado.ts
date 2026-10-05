/* =========================================================================
   Nutri&Live — driver de pagamento simulado

   Não é um esqueleto: funciona de verdade, sem rede e sem banco. É o driver
   que a demonstração usa (`PAY_DRIVER=simulado`, que é o padrão quando não há
   MP_ACCESS_TOKEN) e o que o teste exercita.

   O que ele faz de verdade:
   - aprova o cartão de teste e RECUSA cartões específicos, para o caminho de
     erro ser percorrido mesmo sem provedor;
   - gera BR Code de Pix com CRC16 válido e QR de verdade, reaproveitando
     `pix.ts` (que carrega o codificador de `assets/js/qr.js`);
   - confirma o Pix sozinho depois de alguns segundos, emitindo um webhook
     assinado — o mesmo caminho que o Mercado Pago usaria;
   - assina e valida os próprios webhooks com HMAC-SHA256, no mesmo formato
     de cabeçalho do Mercado Pago, para o código de validação ser exercitado.

   ---------------------------- cartões de teste ----------------------------
   O token que o navegador manda tem o formato `sim.<bandeira>.<last4>.<codigo>`
   (ex. `sim.visa.6774.APRO`). O código decide o desfecho, igual à convenção
   do ambiente de teste do Mercado Pago:

     APRO  aprovado
     FUND  recusado — sem limite
     SECU  recusado — código de segurança errado
     EXPI  recusado — validade errada
     FORM  recusado — dado do cartão errado
     OTHE  recusado — banco não informou o motivo
     CALL  em análise — o banco pediu autorização

   Sem código no token, decide pelos quatro últimos dígitos:
     ...0002 sem limite   ...0003 CVV errado
     ...0004 vencido      ...0005 em análise
     qualquer outro: aprovado.
   ========================================================================= */
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import { AppError } from "../lib/http.js";
import { brCode, qrBase64, txidDe } from "./pix.js";
import type {
  ConsultaPagamento, EventoWebhookValidado, PedidoCobranca, ProvedorPagamento,
  RequisicaoWebhook, ResultadoCobranca, StatusProvedor, TipoEventoCobranca
} from "./provedor.js";

/* --------------------------- desfecho do cartão -------------------------- */
type Desfecho = { status: StatusProvedor; motivo?: string };

const POR_CODIGO: Record<string, Desfecho> = {
  APRO: { status: "aprovado" },
  FUND: { status: "recusado", motivo: "o cartão não tem limite suficiente." },
  SECU: { status: "recusado", motivo: "o código de segurança está errado." },
  EXPI: { status: "recusado", motivo: "a validade do cartão está errada." },
  FORM: { status: "recusado", motivo: "algum dado do cartão está errado." },
  OTHE: { status: "recusado", motivo: "o banco recusou sem informar o motivo." },
  CALL: { status: "em_analise", motivo: "o banco pediu que você autorize a compra." }
};

const POR_LAST4: Record<string, Desfecho> = {
  "0002": { status: "recusado", motivo: "o cartão não tem limite suficiente." },
  "0003": { status: "recusado", motivo: "o código de segurança está errado." },
  "0004": { status: "recusado", motivo: "a validade do cartão está errada." },
  "0005": { status: "em_analise", motivo: "o banco pediu que você autorize a compra." }
};

export function lerCartaoSimulado(token: string): { bandeira: string; last4: string; desfecho: Desfecho } {
  const partes = token.split(".");
  const codigo = partes[3]?.toUpperCase() ?? "";
  const bandeira = partes[1]?.toLowerCase() ?? "simulado";
  const digitos = token.replace(/\D/g, "");
  const last4 = (partes[2] && /^\d{4}$/.test(partes[2])) ? partes[2] : digitos.slice(-4).padStart(4, "0");
  const desfecho = POR_CODIGO[codigo] ?? POR_LAST4[last4] ?? { status: "aprovado" as StatusProvedor };
  return { bandeira, last4, desfecho };
}

/* --------------------------- estado do simulado -------------------------- */
interface EstadoPagamento {
  id: string;
  referencia: string;
  metodo: PedidoCobranca["metodo"];
  valorCents: number;
  status: StatusProvedor;
  motivo?: string | undefined;
  pagoEm?: Date | undefined;
  /** Momento em que o Pix "cai" sozinho. */
  confirmaEm?: number | undefined;
  providerSubId?: string | undefined;
}

/** O estado vive no processo e é compartilhado entre as rotas. */
const pagamentos = new Map<string, EstadoPagamento>();
const assinaturas = new Map<string, { id: string; referencia: string; status: "ativa" | "cancelada"; valorCents: number }>();
const ouvintes: ((req: RequisicaoWebhook) => void)[] = [];

/** Só o teste e o reinício da demonstração usam. */
export function limparSimulado(): void {
  pagamentos.clear();
  assinaturas.clear();
  ouvintes.length = 0;
}

/** Quem quiser receber os webhooks que o simulado emite se inscreve aqui. */
export function aoNotificar(cb: (req: RequisicaoWebhook) => void): void {
  if (!ouvintes.includes(cb)) ouvintes.push(cb);
}

/** Quantos segundos até o Pix "cair". Curto no teste, alguns segundos na demo. */
const esperaPix = (): number => Number(process.env.PIX_SIM_CONFIRMA_MS ?? 8000);

/* ------------------------- webhook do simulado --------------------------- */
export type AcaoSimulada =
  | "payment.approved" | "payment.rejected" | "payment.refunded"
  | "preapproval.cancelled"
  | "authorized_payment.paid" | "authorized_payment.failed";

const TIPO_DA_ACAO: Record<AcaoSimulada, string> = {
  "payment.approved": "payment",
  "payment.rejected": "payment",
  "payment.refunded": "payment",
  "preapproval.cancelled": "subscription_preapproval",
  "authorized_payment.paid": "subscription_authorized_payment",
  "authorized_payment.failed": "subscription_authorized_payment"
};

const TRADUCAO: Record<AcaoSimulada, TipoEventoCobranca> = {
  "payment.approved": "pagamento_aprovado",
  "payment.rejected": "pagamento_recusado",
  "payment.refunded": "pagamento_estornado",
  "preapproval.cancelled": "assinatura_cancelada",
  "authorized_payment.paid": "cobranca_recorrente_paga",
  "authorized_payment.failed": "cobranca_recorrente_falhou"
};

const segredoSimulado = (): string => env.MP_WEBHOOK_SECRET || env.SESSION_SECRET;

/** Mesmo formato de cabeçalho do Mercado Pago: ts=...,v1=HMAC-SHA256. */
export function assinarSimulado(dataId: string, requestId: string, ts: string): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return createHmac("sha256", segredoSimulado()).update(manifest).digest("hex");
}

/**
 * Monta uma notificação pronta para ser entregue em POST /api/webhooks/mercadopago.
 * `eventoId` repetido de propósito é como se testa idempotência.
 */
export function eventoSimulado(
  acao: AcaoSimulada,
  recursoId: string,
  eventoId: string = randomUUID()
): RequisicaoWebhook {
  const corpo = {
    id: eventoId,
    type: TIPO_DA_ACAO[acao],
    action: acao,
    live_mode: false,
    date_created: new Date().toISOString(),
    data: { id: recursoId }
  };
  const corpoCru = JSON.stringify(corpo);
  const ts = String(Date.now());
  const requestId = randomUUID();
  return {
    corpoCru,
    cabecalhos: {
      "content-type": "application/json",
      "x-request-id": requestId,
      "x-signature": `ts=${ts},v1=${assinarSimulado(recursoId, requestId, ts)}`
    },
    dataIdQuery: recursoId
  };
}

function notificar(acao: AcaoSimulada, recursoId: string): void {
  const req = eventoSimulado(acao, recursoId);
  for (const ouvinte of [...ouvintes]) {
    try {
      ouvinte(req);
    } catch (e) {
      log.error("simulado: ouvinte de webhook falhou", e);
    }
  }
}

/* ======================================================================== */
export function criarSimulado(): ProvedorPagamento {
  const novoId = (prefixo: string): string =>
    `${prefixo}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;

  /** Pix pendente que já passou da hora vira aprovado na leitura. */
  function amadurecer(estado: EstadoPagamento): EstadoPagamento {
    if (estado.status === "pendente" && estado.confirmaEm && Date.now() >= estado.confirmaEm) {
      estado.status = "aprovado";
      estado.pagoEm = new Date();
    }
    return estado;
  }

  return {
    nome: "simulado",

    async criarAssinatura(pedido: PedidoCobranca): Promise<ResultadoCobranca> {
      if (!pedido.cardToken) {
        throw new AppError("dados_invalidos", "Faltou o token do cartão.", {
          cardToken: "Informe os dados do cartão."
        });
      }
      const { bandeira, last4, desfecho } = lerCartaoSimulado(pedido.cardToken);
      const id = novoId("simpay");
      const estado: EstadoPagamento = {
        id,
        referencia: pedido.referencia,
        metodo: pedido.metodo,
        valorCents: pedido.valorCents,
        status: desfecho.status,
        motivo: desfecho.motivo,
        pagoEm: desfecho.status === "aprovado" ? new Date() : undefined
      };
      pagamentos.set(id, estado);

      if (desfecho.status === "recusado") {
        log.info(`simulado: cartão recusado (${last4}) — ${desfecho.motivo}`);
        return { status: "recusado", providerPaymentId: id, brand: bandeira, last4, motivo: desfecho.motivo };
      }

      /* Aprovado ou em análise: a recorrência é criada do mesmo jeito. */
      const subId = novoId("simsub");
      assinaturas.set(subId, {
        id: subId, referencia: pedido.referencia, status: "ativa", valorCents: pedido.recorrenteCents
      });
      estado.providerSubId = subId;

      return {
        status: desfecho.status,
        providerPaymentId: id,
        providerSubId: subId,
        brand: bandeira,
        last4,
        motivo: desfecho.motivo
      };
    },

    async criarPixAvulso(pedido: PedidoCobranca): Promise<ResultadoCobranca> {
      const id = novoId("simpix");
      const codigo = brCode(pedido.valorCents, txidDe(pedido.referencia.replace(/-/g, "")));
      const espera = esperaPix();
      const expiraEm = new Date(Date.now() + 30 * 60 * 1000);

      pagamentos.set(id, {
        id,
        referencia: pedido.referencia,
        metodo: "pix",
        valorCents: pedido.valorCents,
        status: "pendente",
        confirmaEm: Date.now() + espera
      });

      /* O Pix cai sozinho: o banco "avisa" por webhook, igual ao real.
         O temporizador é unref para não segurar o processo nem o teste. */
      const t = setTimeout(() => {
        const estado = pagamentos.get(id);
        if (!estado || estado.status !== "pendente") return;
        estado.status = "aprovado";
        estado.pagoEm = new Date();
        log.info(`simulado: Pix ${id} confirmado`);
        notificar("payment.approved", id);
      }, espera);
      if (typeof t === "object" && typeof t.unref === "function") t.unref();

      return {
        status: "pendente",
        providerPaymentId: id,
        pix: {
          qrCode: codigo,
          qrCodeBase64: qrBase64(codigo, `QR Code do Pix no valor de R$ ${(pedido.valorCents / 100).toFixed(2)}`),
          expiraEm
        }
      };
    },

    async consultarPagamento(providerPaymentId: string): Promise<ConsultaPagamento> {
      const estado = pagamentos.get(providerPaymentId);
      if (!estado) return { status: "pendente" };
      amadurecer(estado);
      return {
        status: estado.status,
        pagoEm: estado.pagoEm,
        motivo: estado.motivo,
        valorCents: estado.valorCents
      };
    },

    async cancelarAssinatura(providerSubId: string): Promise<void> {
      const assinatura = assinaturas.get(providerSubId);
      if (!assinatura) return;            /* já não existe: cancelar é idempotente */
      assinatura.status = "cancelada";
      notificar("preapproval.cancelled", providerSubId);
    },

    async estornar(providerPaymentId: string, valorCents?: number): Promise<void> {
      const estado = pagamentos.get(providerPaymentId);

      /* Pagamento que este processo não viu nascer NÃO é pagamento
         inexistente. O mapa acima vive na memória do processo, então ele
         esquece tudo a cada reinício — e o seed grava pagamentos sem passar
         por aqui. Recusar com "não encontrado no provedor" quebrava todo
         estorno da demonstração e todo estorno de cobrança feita antes do
         último reinício, que é a coisa mais comum de se querer estornar.
         Quem manda sobre o que existe é o nosso banco; a rota já conferiu
         que o pagamento está aprovado antes de chegar aqui. Então o
         provedor simulado registra e segue. */
      if (!estado) {
        pagamentos.set(providerPaymentId, {
          id: providerPaymentId,
          referencia: providerPaymentId,
          metodo: "credito",
          valorCents: valorCents ?? 0,
          status: "estornado",
          pagoEm: undefined
        });
        log.warn(`estorno de ${providerPaymentId}: cobrança anterior a este processo, registrada como estornada`);
        notificar("payment.refunded", providerPaymentId);
        return;
      }

      if (estado.status !== "aprovado" && estado.status !== "estornado") {
        throw new AppError("conflito", "Só dá para estornar um pagamento aprovado.");
      }
      estado.status = "estornado";
      if (valorCents !== undefined) estado.valorCents = Math.max(0, estado.valorCents - valorCents);
      notificar("payment.refunded", providerPaymentId);
    },

    async validarWebhook(req: RequisicaoWebhook): Promise<EventoWebhookValidado> {
      let corpo: Record<string, any> = {};
      try {
        corpo = req.corpoCru ? JSON.parse(req.corpoCru) : {};
      } catch {
        return { valido: false, motivo: "Corpo não é JSON.", eventoId: "", tipoCru: "", tipo: "ignorado", payload: null };
      }

      const acao = String(corpo["action"] ?? "") as AcaoSimulada;
      const tipoCru = String(corpo["type"] ?? TIPO_DA_ACAO[acao] ?? "");
      const recursoId = String(corpo["data"]?.["id"] ?? req.dataIdQuery ?? "");
      const eventoId = String(corpo["id"] ?? `${tipoCru}:${recursoId}:${acao}`);
      const base = { eventoId, tipoCru, payload: corpo };

      /* Mesma validação de assinatura do driver real, com o mesmo formato. */
      const assinatura = req.cabecalhos["x-signature"];
      if (!assinatura) {
        return { ...base, valido: false, motivo: "Cabeçalho x-signature ausente.", tipo: "ignorado" };
      }
      let ts = "", v1 = "";
      for (const parte of assinatura.split(",")) {
        const pedaco = parte.split("=");
        const chave = (pedaco[0] ?? "").trim();
        const valor = (pedaco[1] ?? "").trim();
        if (chave === "ts") ts = valor;
        if (chave === "v1") v1 = valor;
      }
      const esperado = assinarSimulado(recursoId, req.cabecalhos["x-request-id"] ?? "", ts);
      const a = Buffer.from(esperado, "utf8");
      const b = Buffer.from(v1, "utf8");
      if (a.length !== b.length || !timingSafeEqual(a, b)) {
        return { ...base, valido: false, motivo: "Assinatura não confere.", tipo: "ignorado" };
      }

      const tipo = TRADUCAO[acao] ?? "ignorado";
      const ehAssinatura = tipoCru === "subscription_preapproval";
      return {
        ...base,
        valido: true,
        tipo,
        providerPaymentId: ehAssinatura ? undefined : recursoId,
        providerSubId: ehAssinatura ? recursoId : pagamentos.get(recursoId)?.providerSubId
      };
    }
  };
}

/* ------------------- gatilhos para a demonstração ----------------------- */
/** Força a confirmação de um Pix agora, sem esperar o relógio. */
export function confirmarPixAgora(providerPaymentId: string): boolean {
  const estado = pagamentos.get(providerPaymentId);
  if (!estado || estado.status !== "pendente") return false;
  estado.status = "aprovado";
  estado.pagoEm = new Date();
  notificar("payment.approved", providerPaymentId);
  return true;
}

/** Simula a cobrança mensal de uma assinatura: paga ou falha. */
export function cobrarCicloSimulado(providerSubId: string, pago: boolean): string {
  const assinatura = assinaturas.get(providerSubId);
  const valorCents = assinatura?.valorCents ?? 0;
  const id = `simpay-ciclo-${randomUUID().slice(0, 8)}`;
  pagamentos.set(id, {
    id,
    referencia: assinatura?.referencia ?? "",
    metodo: "credito",
    valorCents,
    status: pago ? "aprovado" : "recusado",
    motivo: pago ? undefined : "o cartão não tem limite suficiente.",
    pagoEm: pago ? new Date() : undefined,
    providerSubId
  });
  notificar(pago ? "authorized_payment.paid" : "authorized_payment.failed", id);
  return id;
}
