/* =========================================================================
   Nutri&Live — renovação do Pix, feita à mão porque não existe outro jeito

   O problema
   ----------
   O Mercado Pago cobra cartão sozinho todo mês: a assinatura recorrente
   (`/preapproval`) existe e funciona. Pix não. No Mercado Pago o Pix é uma
   cobrança AVULSA: ela nasce, é paga, e acabou. Não há nada para renovar.

   O Pix Automático do Banco Central resolveria isso, mas a autorização
   acontece no banco do próprio cliente e os endpoints de assinatura do
   Mercado Pago não atendem a esse fluxo — eles levam para um checkout
   hospedado. Enquanto a conta não tiver a API recebedora de Pix Automático
   habilitada, este módulo é o caminho.

   O que ele faz
   -------------
   Antes de o período pago acabar, emite uma cobrança Pix nova e manda por
   e-mail. A pessoa paga quando quiser; o mesmo webhook que confirma a
   primeira cobrança confirma esta, e `aplicarPagamentoAprovado` estende o
   período a partir do fim do anterior — renovar não encurta o que já foi
   pago.

   Três decisões que custaram pensamento
   -------------------------------------
   1. UMA COBRANÇA ABERTA POR VEZ. Emitir de novo enquanto a anterior está
      pendente daria à pessoa dois QR Codes válidos do mesmo mês, e ela
      pagaria os dois. A trava é a busca por pagamento pendente da
      assinatura: enquanto houver um, nada é emitido.

   2. O LEMBRETE NÃO É COBRANÇA NOVA. No D-3 e no dia do vencimento sai um
      e-mail apontando para a MESMA cobrança. Reemitir a cada lembrete é
      como a pessoa acaba com três Pix diferentes na caixa de entrada sem
      saber qual vale.

   3. QUEM NÃO PAGOU NÃO É CORTADO NO DIA. `auth/guard.ts` dá sete dias de
      folga depois do vencimento, e o último lembrete sai dentro dessa
      janela. Cortar no minuto seguinte é a forma mais rápida de perder
      alguém que ia pagar no fim de semana.
   ========================================================================= */
import { db, schema } from "../db/index.js";
import type { Linha } from "../db/index.js";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import { enviarEmail } from "../lib/email.js";
import { provedor } from "./provedor.js";
import { nomeDoPlano } from "./acesso.js";
import { moeda, normalizarEmail } from "./nucleo.js";

type Assinatura = Linha<typeof schema.subscriptions>;
type Pagamento = Linha<typeof schema.payments>;

/** Quantos dias antes do vencimento a cobrança é emitida. */
export const DIAS_DE_ANTECEDENCIA = 5;

/** Em que dias (contados até o vencimento) sai lembrete da mesma cobrança. */
export const DIAS_DE_LEMBRETE = [3, 0];

const DIA_MS = 86_400_000;

/** Status de pagamento que ainda pode virar dinheiro.
    `payments.status` não tem "em_analise" — isso é estado do PROVEDOR, e o
    nosso banco guarda "pendente" até ele decidir. */
const PENDENTES = ["pendente"] as const;

/* ------------------------------------------------------------------------ */
/*  Quem precisa de cobrança                                                */
/* ------------------------------------------------------------------------ */

/**
 * Assinaturas de Pix cujo período acaba em até `dias`.
 *
 * Só Pix: cartão o provedor cobra sozinho. Só `ativa` e `atrasada`: quem
 * cancelou pediu para sair, e mandar um Pix para essa pessoa é insistência,
 * não serviço.
 */
export async function assinaturasAVencer(dias = DIAS_DE_ANTECEDENCIA, agora = new Date()): Promise<Assinatura[]> {
  const limite = new Date(agora.getTime() + dias * DIA_MS);
  const todas = await db.buscar(schema.subscriptions, { method: "pix", status: { in: ["ativa", "atrasada"] } });
  return todas.filter(cobravel).filter((a) => a.currentPeriodEnd !== null && a.currentPeriodEnd <= limite);
}

/**
 * Esta assinatura é de cobrar?
 *
 * Preço zero é o registro de PARCERIA da academia: ela não paga nada, ganha
 * comissão por aluno. A varredura pegava esse registro (ele é `pix`, está
 * `ativa` e tem data de fim) e mandava um Pix de R$ 0,00 para o parceiro —
 * uma cobrança que não existe, numa conta que nunca é cobrada.
 *
 * Sem data de fim também não há o que renovar: é assinatura esperando o
 * primeiro webhook.
 */
const cobravel = (a: Assinatura): boolean => a.priceCents > 0 && a.currentPeriodEnd !== null;

/** A cobrança de renovação em aberto desta assinatura, se houver. */
export async function cobrancaEmAberto(assinaturaId: string): Promise<Pagamento | null> {
  const pagamentos = await db.buscar(
    schema.payments,
    { subscriptionId: assinaturaId, method: "pix", status: { in: PENDENTES } },
    { ordem: { campo: "createdAt", dir: "desc" } }
  );
  const agora = Date.now();
  /* Pix vencido não serve para pagar: conta como se não houvesse. */
  return pagamentos.find((p) => !p.pixExpiresAt || p.pixExpiresAt.getTime() > agora) ?? null;
}

/* ------------------------------------------------------------------------ */
/*  Emitir                                                                  */
/* ------------------------------------------------------------------------ */

export interface ResultadoRenovacao {
  assinaturaId: string;
  /** "emitida" | "lembrete" | "ja_aberta" | "sem_email" | "erro" */
  desfecho: string;
  pagamentoId?: string;
  detalhe?: string;
}

/**
 * Emite a cobrança de renovação, ou manda lembrete da que já existe.
 * Idempotente por desenho: chamar duas vezes no mesmo dia não gera duas
 * cobranças nem dois e-mails do mesmo tipo.
 */
export async function renovarAssinatura(
  assinatura: Assinatura, agora = new Date()
): Promise<ResultadoRenovacao> {
  const base = { assinaturaId: assinatura.id };
  const usuario = await db.primeiro(schema.users, { id: assinatura.userId, deletedAt: null });
  if (!usuario?.email) return { ...base, desfecho: "sem_email" };

  const diasQueFaltam = assinatura.currentPeriodEnd
    ? Math.ceil((assinatura.currentPeriodEnd.getTime() - agora.getTime()) / DIA_MS)
    : 0;

  const aberta = await cobrancaEmAberto(assinatura.id);
  if (aberta) {
    /* Já existe cobrança válida: no máximo um lembrete, e só nos dias
       combinados, para a caixa de entrada não virar perseguição. */
    if (!DIAS_DE_LEMBRETE.includes(diasQueFaltam)) {
      return { ...base, desfecho: "ja_aberta", pagamentoId: aberta.id };
    }
    await avisar(usuario, assinatura, aberta, diasQueFaltam);
    return { ...base, desfecho: "lembrete", pagamentoId: aberta.id };
  }

  try {
    const prov = await provedor();
    const planoNome = await nomeDoPlano(assinatura.planKey);
    const cobranca = await prov.criarPixAvulso({
      referencia: `renov-${assinatura.id}-${agora.toISOString().slice(0, 7)}`,
      planoKey: assinatura.planKey,
      planoNome,
      valorCents: assinatura.priceCents,
      recorrenteCents: assinatura.priceCents,
      metodo: "pix",
      cliente: {
        nome: usuario.name,
        email: normalizarEmail(usuario.email),
        cpf: usuario.cpf ?? "",
        telefone: usuario.phone ?? ""
      }
    });

    const pagamento = await db.inserir(schema.payments, {
      subscriptionId: assinatura.id,
      userId: usuario.id,
      provider: cobranca.providerPaymentId.startsWith("sim") ? "simulado" : "mercadopago",
      providerPaymentId: cobranca.providerPaymentId,
      amountCents: assinatura.priceCents,
      method: "pix",
      status: "pendente",
      pixQr: cobranca.pix?.qrCode ?? null,
      pixExpiresAt: cobranca.pix?.expiraEm ?? new Date(agora.getTime() + 7 * DIA_MS)
    });

    await avisar(usuario, assinatura, pagamento, diasQueFaltam);
    log.info(`renovação: cobrança ${pagamento.id} emitida para a assinatura ${assinatura.id}`);
    return { ...base, desfecho: "emitida", pagamentoId: pagamento.id };
  } catch (e) {
    log.error(`renovação: falha ao emitir cobrança da assinatura ${assinatura.id}`, e);
    return { ...base, desfecho: "erro", detalhe: e instanceof Error ? e.message : String(e) };
  }
}

/* ------------------------------------------------------------------------ */
/*  O e-mail                                                                */
/* ------------------------------------------------------------------------ */

async function avisar(
  usuario: Linha<typeof schema.users>,
  assinatura: Assinatura,
  pagamento: Pagamento,
  diasQueFaltam: number
): Promise<void> {
  const plano = await nomeDoPlano(assinatura.planKey);
  const valor = moeda(pagamento.amountCents);
  const link = `${env.APP_URL.replace(/\/+$/, "")}/renovar`;
  const primeiro = usuario.name.split(" ")[0] ?? usuario.name;

  const quando =
    diasQueFaltam > 1 ? `Faltam ${diasQueFaltam} dias para o seu acesso vencer.`
    : diasQueFaltam === 1 ? "O seu acesso vence amanhã."
    : diasQueFaltam === 0 ? "O seu acesso vence hoje."
    : `O seu acesso venceu há ${Math.abs(diasQueFaltam)} ${Math.abs(diasQueFaltam) === 1 ? "dia" : "dias"}.`;

  const titulo = diasQueFaltam >= 1
    ? `${primeiro}, seu Pix do ${plano} está pronto`
    : `${primeiro}, seu acesso ao ${plano} vence hoje`;

  const linhas = [
    `${quando} Como você assinou por Pix, a cobrança não é automática — a gente gera e você paga quando puder.`,
    `Plano ${plano}, ${valor} por mês.`,
    "Abra o link abaixo para copiar o código ou ler o QR Code. Assim que o pagamento cair, seu acesso continua sem interrupção."
  ];

  await enviarEmail({
    para: usuario.email,
    assunto: titulo,
    texto: [titulo, "", ...linhas, "", `Pagar: ${link}`].join("\n"),
    html: `<div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.6;color:#1a2b23">
  <h2 style="color:#126e4e">${escaparHtml(titulo)}</h2>
  ${linhas.map((l) => `<p>${escaparHtml(l)}</p>`).join("")}
  <p><a href="${escaparHtml(link)}" style="display:inline-block;background:#1aa06d;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">Pagar com Pix</a></p>
  <hr style="border:none;border-top:1px solid #e3ebe7">
  <p style="font-size:12px;color:#5b6b64">Nutri&amp;Live · comer bem virou a parte fácil do seu dia</p>
</div>`,
    tipo: "renovacao"
  });
}

const escaparHtml = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/* ------------------------------------------------------------------------ */
/*  A varredura                                                             */
/* ------------------------------------------------------------------------ */

export interface ResumoVarredura {
  olhadas: number;
  emitidas: number;
  lembretes: number;
  jaAbertas: number;
  erros: number;
  detalhes: ResultadoRenovacao[];
}

/**
 * Passa por todas as assinaturas de Pix a vencer e resolve cada uma.
 * É o que a rota de cron chama. Roda inteira mesmo se uma falhar: uma
 * cobrança que não saiu não pode impedir as outras.
 */
export async function rodarRenovacoes(agora = new Date()): Promise<ResumoVarredura> {
  /* A janela inclui quem já venceu: dentro da folga de sete dias do guarda,
     essa pessoa ainda entra no app e ainda pode pagar. */
  const aVencer = await assinaturasAVencer(DIAS_DE_ANTECEDENCIA, agora);
  const vencidas = (await db.buscar(schema.subscriptions, { method: "pix", status: { in: ["ativa", "atrasada"] } }))
    .filter(cobravel)
    .filter((a) => a.currentPeriodEnd !== null && a.currentPeriodEnd < agora);

  const alvos = [...new Map([...aVencer, ...vencidas].map((a) => [a.id, a])).values()];
  const detalhes: ResultadoRenovacao[] = [];
  for (const a of alvos) detalhes.push(await renovarAssinatura(a, agora));

  const conta = (d: string) => detalhes.filter((x) => x.desfecho === d).length;
  const resumo: ResumoVarredura = {
    olhadas: alvos.length,
    emitidas: conta("emitida"),
    lembretes: conta("lembrete"),
    jaAbertas: conta("ja_aberta"),
    erros: conta("erro") + conta("sem_email"),
    detalhes
  };
  log.info(
    `renovação: ${resumo.olhadas} assinaturas olhadas, ${resumo.emitidas} cobranças emitidas, ` +
    `${resumo.lembretes} lembretes, ${resumo.erros} com problema`
  );
  return resumo;
}
