/* =========================================================================
   Nutri&Live — a porta do provedor de pagamento

   Um só contrato, dois drivers:
     mercadopago.ts  Checkout Transparente + API de Assinaturas (Preapproval)
     simulado.ts     funciona de verdade, sem rede — é o da demonstração

   Quem escolhe é `env.PAY_DRIVER`, que já olha a presença de MP_ACCESS_TOKEN.
   Nenhuma rota instancia driver na mão: todas chamam `provedor()`.
   ========================================================================= */
import type { PayMethod } from "../../shared/contract.js";
import { env } from "../lib/env.js";

/* --------------------------------- tipos --------------------------------- */
export interface ClienteCobranca {
  nome: string;
  email: string;
  /** Só dígitos, 11 posições. */
  cpf: string;
  /** DDD + número, só dígitos. */
  telefone: string;
}

export interface PedidoCobranca {
  /** Nossa referência externa — o id da assinatura. Vira idempotency key. */
  referencia: string;
  planoKey: string;
  planoNome: string;
  /** Valor da primeira cobrança, em centavos. */
  valorCents: number;
  /** Valor que se repete a cada mês, em centavos. */
  recorrenteCents: number;
  metodo: PayMethod;
  cliente: ClienteCobranca;
  /** Token do cartão gerado no navegador. O PAN nunca chega ao servidor. */
  cardToken?: string | undefined;
  /** Parcelas; a assinatura é mensal, então é sempre 1. */
  parcelas?: number;
}

export type StatusProvedor = "aprovado" | "pendente" | "em_analise" | "recusado" | "estornado" | "cancelado";

export interface DadosPix {
  /** BR Code copia-e-cola. */
  qrCode: string;
  /** Imagem do QR em base64 (SVG no driver simulado, PNG no Mercado Pago). */
  qrCodeBase64?: string | undefined;
  expiraEm: Date;
}

export interface ResultadoCobranca {
  status: StatusProvedor;
  /** Id do pagamento no provedor. Único — é a chave de reconciliação. */
  providerPaymentId: string;
  /** Id da assinatura recorrente no provedor, quando houver. */
  providerSubId?: string | undefined;
  brand?: string | undefined;
  last4?: string | undefined;
  motivo?: string | undefined;
  pix?: DadosPix | undefined;
}

export interface ConsultaPagamento {
  status: StatusProvedor;
  pagoEm?: Date | undefined;
  motivo?: string | undefined;
  valorCents?: number | undefined;
}

/** O que chega no endpoint de webhook, já cru. */
export interface RequisicaoWebhook {
  corpoCru: string;
  cabecalhos: Record<string, string | undefined>;
  /** `data.id` da query string — o Mercado Pago manda nos dois lugares. */
  dataIdQuery?: string | undefined;
}

export type TipoEventoCobranca =
  | "pagamento_aprovado"
  | "pagamento_recusado"
  | "pagamento_estornado"
  | "assinatura_cancelada"
  | "cobranca_recorrente_paga"
  | "cobranca_recorrente_falhou"
  | "ignorado";

export interface EventoWebhookValidado {
  valido: boolean;
  /** Motivo da recusa, quando `valido` é falso. */
  motivo?: string | undefined;
  /** Id do evento no provedor — é o que garante idempotência. */
  eventoId: string;
  /** Tipo cru, como o provedor manda (ex. "payment.updated"). */
  tipoCru: string;
  /** Tipo traduzido para o nosso vocabulário. */
  tipo: TipoEventoCobranca;
  /** Id do pagamento no provedor, quando o evento fala de pagamento. */
  providerPaymentId?: string | undefined;
  /** Id da assinatura no provedor, quando o evento fala de assinatura. */
  providerSubId?: string | undefined;
  payload: unknown;
}

/* ------------------------------- a interface ----------------------------- */
export interface ProvedorPagamento {
  readonly nome: string;

  /** Cobrança recorrente: cartão de crédito ou débito recorrente. */
  criarAssinatura(pedido: PedidoCobranca): Promise<ResultadoCobranca>;

  /** Pix: cobrança única, com BR Code. A renovação gera um Pix novo. */
  criarPixAvulso(pedido: PedidoCobranca): Promise<ResultadoCobranca>;

  /** Estado atual de um pagamento no provedor. */
  consultarPagamento(providerPaymentId: string): Promise<ConsultaPagamento>;

  /** Interrompe a recorrência. O acesso até o fim do período é regra nossa. */
  cancelarAssinatura(providerSubId: string): Promise<void>;

  /** Estorno total (sem valor) ou parcial. */
  estornar(providerPaymentId: string, valorCents?: number): Promise<void>;

  /**
   * Valida assinatura do webhook e traduz o evento.
   * Nunca lança: webhook inválido devolve `valido: false` e o chamador
   * responde 401 sem vazar detalhe.
   */
  validarWebhook(req: RequisicaoWebhook): Promise<EventoWebhookValidado>;
}

/* -------------------------------- a fábrica ------------------------------ */
let instancia: ProvedorPagamento | null = null;

export async function provedor(): Promise<ProvedorPagamento> {
  if (instancia) return instancia;
  if (env.PAY_DRIVER === "mercadopago") {
    const { criarMercadoPago } = await import("./mercadopago.js");
    instancia = criarMercadoPago();
  } else {
    const { criarSimulado } = await import("./simulado.js");
    instancia = criarSimulado();
  }
  return instancia;
}

/** Só o teste usa: troca o driver e desfaz a troca. */
export function trocarProvedor(novo: ProvedorPagamento | null): void {
  instancia = novo;
}
