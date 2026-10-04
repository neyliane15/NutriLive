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
import { requireRole, requireUser, usuarioAtual } from "../auth/guard.js";
import { body } from "../lib/http.js";
import { cancelarAssinatura, faturasDoUsuario } from "../billing/assinatura.js";

const r = new Hono<Ambiente>();

/* Só quem assina cancela. Paciente e aluno não pagam: quem paga é a
   organização que os cadastrou, e quem cancela é ela. */
const PAGANTES = requireRole("pessoal", "nutricionista", "academia", "admin");

/* ======================================================================== */
/*  POST /api/subscription/cancel                                           */
/* ======================================================================== */
r.post("/cancel", PAGANTES, async (c) => {
  const { reason } = await body(c, contract.billing.cancel.in);
  const usuario = usuarioAtual(c);
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

export default r;
