/* =========================================================================
   Nutri&Live — assinatura da própria conta

     POST /api/subscription/cancel      contract.billing.cancel
     GET  /api/subscription/invoices    contract.billing.invoices

   Cancelar NÃO corta o acesso: a recorrência é interrompida no provedor e o
   acesso segue até `current_period_end`, o fim do período que a pessoa já
   pagou (é `acessoVigente` em `billing/acesso.ts` que mantém a porta aberta,
   e `assinaturaDeAcesso` em `auth/guard.ts` que a respeita). A regra inteira
   está em `cancelarAssinatura`; aqui só passamos quem pediu.
   ========================================================================= */
import { Hono } from "hono";
import contract from "../../shared/contract.js";
import type { Ambiente } from "../auth/guard.js";
import { requireUser, usuarioAtual } from "../auth/guard.js";
import { AppError, body } from "../lib/http.js";
import { db } from "../db/index.js";
import { subscriptions } from "../db/schema.js";
import { cancelarAssinatura, faturasDoUsuario } from "../billing/assinatura.js";
import { cobrancaEmAberto } from "../billing/renovacao.js";
import { nomeDoPlano } from "../billing/acesso.js";
import { conforme } from "../lib/resposta.js";

const r = new Hono<Ambiente>();

/* ======================================================================== */
/*  POST /api/subscription/cancel                                           */
/* ======================================================================== */
/*  Quem cancela é QUEM PAGA, e isso é uma pergunta sobre a assinatura, não
    sobre o papel.

    A regra era por papel (`pessoal`, `nutricionista`, `academia`, `admin`) e
    discordava da tela, que decide pelo dono da assinatura. Um aluno que
    assinou pelo link da própria academia tem assinatura própria, é cobrado
    todo mês, via o botão "Cancelar assinatura" na tela — e recebia 403
    "Sua conta não tem acesso a esta área". Não havia caminho no produto
    para ele parar de pagar. Mesma armadilha para o paciente que compra
    plano pessoal: o checkout permite e não troca o papel dele.

    Quem não paga nada continua sem cancelar — mas agora com o motivo certo:
    não é falta de permissão, é que não existe assinatura dele para cancelar. */
r.post("/cancel", requireUser, async (c) => {
  const { reason } = await body(c, contract.billing.cancel.in);
  const usuario = usuarioAtual(c);

  const propria = await db.primeiro(subscriptions, {
    userId: usuario.id, status: { in: ["pendente", "ativa", "atrasada"] }
  });
  if (!propria) {
    throw new AppError(
      "nao_encontrado",
      "Não há assinatura sua para cancelar. Se o seu acesso vem de um consultório ou de uma academia, fale com quem cuida dele.",
      { _: "Nenhuma assinatura própria." }
    );
  }

  const { accessUntil } = await cancelarAssinatura(usuario.id, reason);
  return c.json({ ok: true as const, accessUntil });
});

/* ======================================================================== */
/*  GET /api/subscription/invoices                                          */
/* ======================================================================== */
r.get("/invoices", requireUser, async (c) => {
  const usuario = usuarioAtual(c);
  return c.json({ invoices: await faturasDoUsuario(usuario.id) });
});

/* ======================================================================== */
/*  GET /api/subscription/renewal                                           */
/* ======================================================================== */
/*  Pix no Mercado Pago é cobrança AVULSA: não existe recorrência para o
    provedor cobrar sozinho. Então a renovação é emitida por nós antes do
    vencimento (`billing/renovacao.ts`) e esta rota é onde a pessoa busca o
    código para pagar. Sem cobrança aberta, devolve null — e a tela diz que
    não há nada a pagar, em vez de inventar um QR. */
r.get("/renewal", requireUser, async (c) => {
  const usuario = usuarioAtual(c);
  const assinatura = await db.primeiro(subscriptions, {
    userId: usuario.id, method: "pix", status: { in: ["ativa", "atrasada"] }
  });
  if (!assinatura) return c.json(conforme(contract.billing.renewal.out, { renewal: null }));

  const aberta = await cobrancaEmAberto(assinatura.id);
  if (!aberta?.pixQr) return c.json(conforme(contract.billing.renewal.out, { renewal: null }));

  return c.json(conforme(contract.billing.renewal.out, {
    renewal: {
      paymentId: aberta.id,
      amountCents: aberta.amountCents,
      planName: await nomeDoPlano(assinatura.planKey),
      qrCode: aberta.pixQr,
      expiresAt: aberta.pixExpiresAt ? aberta.pixExpiresAt.toISOString() : null,
      accessUntil: assinatura.currentPeriodEnd ? assinatura.currentPeriodEnd.toISOString() : null
    }
  }));
});

export default r;
