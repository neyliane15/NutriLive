/* =========================================================================
   Nutri&Live — gatilhos agendados

   Rotas que um agendador externo chama. Hoje só uma: emitir as cobranças de
   renovação do Pix.

   Por que não um `setInterval` dentro do processo
   -----------------------------------------------
   Em servidor sem estado — e a Vercel é um — o processo some entre
   requisições, e o intervalo nunca dispara. Mesmo num processo que fica de
   pé, duas instâncias emitiriam a mesma cobrança duas vezes. O agendador é
   de fora, e aqui só mora o que ele chama.

   A proteção é um segredo no cabeçalho, comparado em tempo constante. Sem
   `CRON_SECRET` configurado, a rota recusa TUDO: uma varredura de cobrança
   aberta a qualquer um seria um jeito de mandar e-mail em nome da marca.
   ========================================================================= */
import { Hono } from "hono";
import { timingSafeEqual } from "node:crypto";
import type { Ambiente } from "../auth/guard.js";
import { AppError } from "../lib/http.js";
import { log } from "../lib/log.js";
import { rodarRenovacoes } from "../billing/renovacao.js";

const r = new Hono<Ambiente>();

export const CABECALHO_CRON = "x-nutrielive-cron";

/** Comparação em tempo constante, como nos outros segredos do sistema. */
function segredoConfere(recebido: string | undefined): boolean {
  const esperado = process.env.CRON_SECRET ?? "";
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

r.use("*", async (c, next) => {
  if (!process.env.CRON_SECRET) {
    throw new AppError("indisponivel", "Gatilhos agendados desativados neste ambiente.");
  }
  /* A Vercel manda `Authorization: Bearer <CRON_SECRET>` nos Cron Jobs dela;
     o cabeçalho próprio serve para qualquer outro agendador. */
  const doCabecalho = c.req.header(CABECALHO_CRON);
  const daAutorizacao = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!segredoConfere(doCabecalho) && !segredoConfere(daAutorizacao)) {
    log.warn("cron: chamada recusada por segredo inválido");
    throw new AppError("nao_autenticado", "Segredo do agendador inválido.");
  }
  await next();
});

/* ======================================================================== */
/*  POST /api/cron/renovacoes                                               */
/* ======================================================================== */
/*  Idempotente por desenho: `renovarAssinatura` não emite segunda cobrança
    enquanto houver uma aberta, e o lembrete sai só nos dias combinados.
    Chamar duas vezes no mesmo dia não cobra ninguém duas vezes. */
r.post("/renovacoes", async (c) => {
  const resumo = await rodarRenovacoes();
  return c.json({
    ok: true as const,
    olhadas: resumo.olhadas,
    emitidas: resumo.emitidas,
    lembretes: resumo.lembretes,
    jaAbertas: resumo.jaAbertas,
    erros: resumo.erros
  });
});

/* A Vercel chama Cron Jobs com GET. Mesmo trabalho, mesma guarda. */
r.get("/renovacoes", async (c) => {
  const resumo = await rodarRenovacoes();
  return c.json({ ok: true as const, olhadas: resumo.olhadas, emitidas: resumo.emitidas,
                  lembretes: resumo.lembretes, jaAbertas: resumo.jaAbertas, erros: resumo.erros });
});

export default r;
