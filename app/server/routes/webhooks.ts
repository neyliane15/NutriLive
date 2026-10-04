/* =========================================================================
   Nutri&Live — webhook de cobrança (público, validado por assinatura)

     POST /api/webhooks/mercadopago            contract.billing.webhook

   A rota é fina de propósito. Ela faz três coisas e nada mais:
     1. lê o corpo CRU (string), porque a assinatura HMAC do provedor é
        calculada sobre o byte que veio, não sobre o JSON reserializado;
     2. repassa cabeçalhos e `data.id` da query a `receberWebhook`;
     3. traduz o resultado em HTTP.

   A idempotência é de `billing/webhook.ts`: o evento é GRAVADO em
   `webhook_events` (unicidade de provider + provider_event_id) ANTES de ser
   processado. O mesmo evento duas vezes responde `ok` na segunda sem liberar
   acesso de novo nem gerar comissão de novo. Evento gravado cuja primeira
   tentativa falhou no meio é reprocessado — senão um erro passageiro viraria
   um pagamento perdido.

   Resposta:
     200  processado, ou repetido e ignorado
     401  assinatura inválida (o provedor não repete o que é lixo)
     5xx  falhou no processamento — e aí o provedor TEM que repetir, porque
          o evento ficou gravado com `error` e será reprocessado na volta.
   ========================================================================= */
import { Hono } from "hono";
import type { Context } from "hono";
import type { Ambiente } from "../auth/guard.js";
import { log } from "../lib/log.js";
import { receberWebhook } from "../billing/webhook.js";
import type { RequisicaoWebhook } from "../billing/provedor.js";

const r = new Hono<Ambiente>();

/** Monta a requisição crua que o driver do provedor sabe validar. */
async function requisicaoDe(c: Context): Promise<RequisicaoWebhook> {
  const cabecalhos: Record<string, string | undefined> = {};
  c.req.raw.headers.forEach((valor, nome) => { cabecalhos[nome.toLowerCase()] = valor; });

  /* O Mercado Pago manda `data.id` no corpo E na query (`?data.id=` ou
     `?id=`), e a assinatura é calculada sobre esse valor. */
  const daQuery = c.req.query("data.id") ?? c.req.query("id");

  return {
    corpoCru: await c.req.text(),
    cabecalhos,
    ...(daQuery ? { dataIdQuery: daQuery } : {})
  };
}

/* ======================================================================== */
r.post("/mercadopago", async (c) => {
  const resultado = await receberWebhook(await requisicaoDe(c));
  if (resultado.repetido) {
    log.debug(`webhook ${resultado.tipo}: entrega repetida respondida sem reprocessar`);
  }
  return c.json({ ok: true as const });
});

/* O Mercado Pago faz um GET de verificação ao cadastrar a URL. */
r.get("/mercadopago", (c) => c.json({ ok: true as const }));

export default r;
