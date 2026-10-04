/* =========================================================================
   Nutri&Live — catálogo e contratação (público)

     GET  /api/plans?segment=                 contract.billing.listPlans
     POST /api/checkout                       contract.billing.checkout
     GET  /api/checkout/:paymentId/status     contract.billing.paymentStatus

   Esta rota não implementa cobrança: ela só liga o HTTP ao que já existe em
   `server/billing/`. Toda a regra — preço, cupom, criação de usuário,
   organização, assinatura, pagamento, liberação de acesso e e-mail de
   primeiro acesso — mora em `billing/assinatura.ts` e `billing/acesso.ts`.

   Sem MP_ACCESS_TOKEN o provedor simulado assume (env.PAY_DRIVER), e é com
   ele que o fluxo inteiro roda nesta máquina: cartão aprovado/recusado e Pix
   que cai sozinho avisando por webhook, pelo mesmo caminho do real.
   ========================================================================= */
import { Hono } from "hono";
import type { Context } from "hono";
import contract from "../../shared/contract.js";
import type { Ambiente } from "../auth/guard.js";
import { AppError, body, clientIp } from "../lib/http.js";
import { contratar, listarPlanos, situacaoDoPagamento } from "../billing/assinatura.js";
import { ligarWebhookSimulado } from "../billing/webhook.js";

const r = new Hono<Ambiente>();

/* ------------------------------------------------------------------------ */
/** Mesma validação de `body()`, mas lendo a query string e o caminho. */
function entradaDaUrl<T>(
  c: Context,
  schema: { parse: (v: unknown) => T },
  doCaminho: Record<string, string | undefined> = {}
): T {
  const cru: Record<string, unknown> = { ...c.req.query(), ...doCaminho };
  try {
    return schema.parse(cru);
  } catch (e: any) {
    const campos: Record<string, string> = {};
    for (const issue of e?.issues ?? []) campos[issue.path.join(".") || "_"] = issue.message;
    throw new AppError("dados_invalidos", "Confira os dados da consulta.", campos);
  }
}

/* ======================================================================== */
/*  GET /api/plans?segment=pessoal|nutricionista|academia                    */
/* ======================================================================== */
r.get("/plans", async (c) => {
  const { segment } = entradaDaUrl(c, contract.billing.listPlans.in);
  const planos = await listarPlanos(segment);
  return c.json({
    plans: planos.map((p) => ({
      key: p.key,
      name: p.name,
      description: p.description,
      priceCents: p.priceCents,
      seatLimit: p.seatLimit,
      features: p.features ?? [],
      featured: p.featured
    }))
  });
});

/* ======================================================================== */
/*  POST /api/checkout — público                                            */
/* ======================================================================== */
/*  Aprovado -> usuário e organização criados, assinatura ativa e e-mail de
    primeiro acesso enviado na hora. Quem faz isso é `aplicarPagamentoAprovado`,
    chamado de dentro de `contratar`.                                        */
r.post("/checkout", async (c) => {
  const entrada = await body(c, contract.billing.checkout.in);

  /* O Pix simulado avisa por webhook: a ponte tem que estar de pé antes da
     cobrança sair, senão a confirmação cai no vazio. `contratar` também
     chama, e ligar duas vezes não tem efeito. */
  ligarWebhookSimulado();

  const saida = await contratar(entrada, clientIp(c));
  return c.json(saida, saida.nextStep === "recusado" ? 200 : 201);
});

/* ======================================================================== */
/*  GET /api/checkout/:paymentId/status — a tela do Pix consulta em laço     */
/* ======================================================================== */
r.get("/checkout/:paymentId/status", async (c) => {
  const { paymentId } = entradaDaUrl(c, contract.billing.paymentStatus.in, {
    paymentId: c.req.param("paymentId")
  });
  const situacao = await situacaoDoPagamento(paymentId);
  return c.json({ status: situacao.status, accessGranted: situacao.accessGranted });
});

export default r;
