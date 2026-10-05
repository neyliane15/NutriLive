/* =========================================================================
   Nutri&Live — área do nosso time

     GET   /api/admin/overview                contract.admin.overview
     GET   /api/admin/users                   contract.admin.listUsers
     PATCH /api/admin/users/:id               contract.admin.updateUser
     POST  /api/admin/users/:id/impersonate   contract.admin.impersonate
     GET   /api/admin/payments                contract.admin.listPayments
     POST  /api/admin/payments/:id/refund     contract.admin.refund
     GET   /api/admin/ai                      contract.admin.listAi
     GET   /api/admin/audit                   contract.admin.audit
     GET   /api/admin/webhooks                contract.admin.webhooks

   Tudo atrás de `requireRole("admin")`. Nada aqui lê cookie na mão.

   Duas coisas são registradas em `audit_log` sem exceção, porque são as duas
   em que o nosso time passa por cima da fronteira do cliente:
     - entrar como um usuário (`impersonate`)
     - devolver dinheiro (`refund`)
   Mudança de papel e suspensão também ficam registradas.

   Os agregados são calculados em memória a partir de buscas simples: a
   camada de dados é propositalmente sem `group by`, e no volume de um painel
   isso é barato. Quando a base crescer, cada agregado destes vira uma
   consulta só — o lugar está isolado em uma função por número.
   ========================================================================= */
import { Hono } from "hono";
import type { Context } from "hono";
import contract from "../../shared/contract.js";
import type { Role } from "../../shared/contract.js";
import type { Ambiente } from "../auth/guard.js";
import { registrarAuditoria, requireRole, usuarioAtual } from "../auth/guard.js";
import { criarSessao } from "../auth/sessao.js";
import { db, schema } from "../db/index.js";
import type { Linha } from "../db/index.js";
import { AppError, body } from "../lib/http.js";
import { conforme } from "../lib/resposta.js";
import { log } from "../lib/log.js";
import { rotaInicial } from "../lib/rotas.js";
import { competencia, diaIso } from "../billing/nucleo.js";
import { provedor } from "../billing/provedor.js";
import { aplicarEstorno } from "../billing/webhook.js";

const r = new Hono<Ambiente>();

/** Só o nosso time entra aqui. */
r.use("*", requireRole("admin"));

const POR_PAGINA = 25;
const DIA_MS = 24 * 60 * 60 * 1000;

/* ------------------------------------------------------------------------ */
/** Mesma validação de `body()`, mas sobre a query string e o caminho.
    `page` chega como texto na URL e o contrato pede número. */
function entradaDaUrl<T>(
  c: Context,
  schema: { parse: (v: unknown) => T },
  doCaminho: Record<string, string | undefined> = {}
): T {
  const cru: Record<string, unknown> = { ...c.req.query(), ...doCaminho };
  if (cru["page"] !== undefined) cru["page"] = Number(cru["page"]);
  for (const chave of Object.keys(cru)) if (cru[chave] === "") delete cru[chave];
  try {
    return schema.parse(cru);
  } catch (e: any) {
    const campos: Record<string, string> = {};
    for (const issue of e?.issues ?? []) campos[issue.path.join(".") || "_"] = issue.message;
    throw new AppError("dados_invalidos", "Confira os filtros da consulta.", campos);
  }
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/** Índice id -> linha, para cruzar duas buscas sem join. */
function porId<T extends { id: string }>(linhas: T[]): Map<string, T> {
  return new Map(linhas.map((l) => [l.id, l]));
}

/* ======================================================================== */
/*  GET /api/admin/overview                                                 */
/* ======================================================================== */
r.get("/overview", async (c) => {
  const agora = new Date();
  const assinaturas = await db.buscar(schema.subscriptions);
  const ativas = assinaturas.filter((s) => s.status === "ativa");

  /* Receita recorrente mensal: o que se repete todo mês nas assinaturas
     vivas. "atrasada" não entra — o dinheiro desse mês não entrou. */
  const mrrCents = ativas.reduce((soma, s) => soma + s.priceCents, 0);

  const inicioDoMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const canceladasNoMes = assinaturas.filter(
    (s) => s.canceledAt && s.canceledAt >= inicioDoMes
  ).length;

  const contarUsuarios = (filtro: Parameters<typeof db.contar<typeof schema.users>>[1]) =>
    db.contar(schema.users, { deletedAt: null, ...filtro });

  const [total, pessoal, nutricionista, academia, pacientes, alunos] = await Promise.all([
    contarUsuarios({}),
    contarUsuarios({ role: "pessoal" }),
    contarUsuarios({ role: "nutricionista" }),
    contarUsuarios({ role: "academia" }),
    contarUsuarios({ role: "paciente" }),
    contarUsuarios({ role: "aluno" })
  ]);

  /* Receita por competência: 12 meses, inclusive os meses sem venda, para o
     gráfico não ficar com buraco. */
  const desde12m = new Date(agora.getFullYear(), agora.getMonth() - 11, 1);
  const pagos = await db.buscar(schema.payments, { status: "aprovado", paidAt: { gte: desde12m } });
  const somaPorMes = new Map<string, number>();
  for (let i = 11; i >= 0; i--) {
    somaPorMes.set(competencia(new Date(agora.getFullYear(), agora.getMonth() - i, 1)), 0);
  }
  for (const p of pagos) {
    const chave = competencia(p.paidAt ?? p.createdAt);
    if (somaPorMes.has(chave)) somaPorMes.set(chave, (somaPorMes.get(chave) ?? 0) + p.amountCents);
  }

  /* Cadastros por dia: 30 dias, também sem buraco. */
  const desde30d = new Date(agora.getTime() - 29 * DIA_MS);
  const novos = await db.buscar(schema.users, { createdAt: { gte: desde30d }, deletedAt: null });
  const porDia = new Map<string, number>();
  for (let i = 29; i >= 0; i--) porDia.set(diaIso(new Date(agora.getTime() - i * DIA_MS)), 0);
  for (const u of novos) {
    const chave = diaIso(u.createdAt);
    if (porDia.has(chave)) porDia.set(chave, (porDia.get(chave) ?? 0) + 1);
  }

  const desde24h = new Date(agora.getTime() - DIA_MS);
  const jobs = await db.buscar(schema.aiJobs, { createdAt: { gte: desde24h } });
  const comErro = jobs.filter((j) => j.status === "erro").length;

  return c.json({
    mrrCents,
    activeSubs: ativas.length,
    /* O produto não tem teste grátis: o que existe entre o checkout e o
       pagamento é `pendente` — Pix esperando ou cartão em análise. */
    trialing: assinaturas.filter((s) => s.status === "pendente").length,
    pastDue: assinaturas.filter((s) => s.status === "atrasada").length,
    canceledThisMonth: canceladasNoMes,
    users: { total, pessoal, nutricionista, academia, vinculados: pacientes + alunos },
    revenueByMonth: [...somaPorMes].map(([period, cents]) => ({ period, cents })),
    signupsByDay: [...porDia].map(([day, count]) => ({ day, count })),
    aiJobs: {
      last24h: jobs.length,
      errorRate: jobs.length ? Math.round((comErro / jobs.length) * 1000) / 1000 : 0
    }
  });
});

/* ======================================================================== */
/*  GET /api/admin/users?q=&role=&status=&page=                             */
/* ======================================================================== */
r.get("/users", async (c) => {
  const f = entradaDaUrl(c, contract.admin.listUsers.in);

  /* A busca por texto bate em nome OU e-mail, e a camada de dados não faz
     OR: filtramos em memória. É o único lugar do admin que lê a tabela
     inteira — quando a base crescer, troque por uma consulta com OR. */
  const todos = await db.buscar(
    schema.users,
    { deletedAt: null, ...(f.role ? { role: f.role } : {}), ...(f.status ? { status: f.status as never } : {}) },
    { ordem: { campo: "createdAt", dir: "desc" } }
  );

  const busca = f.q?.trim().toLowerCase();
  const filtrados = busca
    ? todos.filter((u) => u.name.toLowerCase().includes(busca) || u.email.toLowerCase().includes(busca))
    : todos;

  const pagina = filtrados.slice((f.page - 1) * POR_PAGINA, f.page * POR_PAGINA);
  const orgs = porId(await db.buscar(schema.organizations));

  /* Assinatura mais recente de cada um da página. */
  const assinaturas = await db.buscar(
    schema.subscriptions, undefined, { ordem: { campo: "createdAt", dir: "desc" } }
  );
  const ultimaAssinatura = new Map<string, Linha<typeof schema.subscriptions>>();
  for (const s of assinaturas) if (!ultimaAssinatura.has(s.userId)) ultimaAssinatura.set(s.userId, s);

  return c.json({
    total: filtrados.length,
    page: f.page,
    users: pagina.map((u) => {
      const assinatura = ultimaAssinatura.get(u.id) ?? null;
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        status: u.status,
        orgName: (u.orgId ? orgs.get(u.orgId)?.name : null) ?? null,
        planKey: assinatura?.planKey ?? null,
        subStatus: assinatura?.status ?? null,
        createdAt: u.createdAt.toISOString(),
        lastLoginAt: iso(u.lastLoginAt)
      };
    })
  });
});

/* ======================================================================== */
/*  PATCH /api/admin/users/:id                                              */
/* ======================================================================== */
r.patch("/users/:id", async (c) => {
  const pedido = await body(c, contract.admin.updateUser.in.omit({ id: true }));
  const { id } = entradaDaUrl(c, contract.admin.updateUser.in.pick({ id: true }), {
    id: c.req.param("id")
  });
  const ator = usuarioAtual(c);

  const alvo = await db.primeiro(schema.users, { id, deletedAt: null });
  if (!alvo) throw new AppError("nao_encontrado", "Usuário não encontrado.");
  if (alvo.id === ator.id && pedido.status === "suspenso") {
    throw new AppError("conflito", "Você não pode suspender a sua própria conta.");
  }
  if (pedido.status === undefined && pedido.role === undefined) {
    throw new AppError("dados_invalidos", "Informe o que mudar: status ou papel.");
  }

  await db.atualizar(schema.users, { id: alvo.id }, {
    ...(pedido.status ? { status: pedido.status } : {}),
    ...(pedido.role ? { role: pedido.role } : {})
  });

  /* Suspender tem que tirar a pessoa de dentro do app agora, não no próximo
     login: as sessões abertas morrem junto. */
  if (pedido.status === "suspenso") {
    const { encerrarTodasAsSessoes } = await import("../auth/sessao.js");
    await encerrarTodasAsSessoes(alvo.id);
  }

  await registrarAuditoria(c, ator.id, "admin.usuario_alterado", "users", alvo.id, {
    de: { status: alvo.status, role: alvo.role },
    para: { status: pedido.status ?? alvo.status, role: pedido.role ?? alvo.role }
  });
  return c.json({ ok: true as const });
});

/* ======================================================================== */
/*  POST /api/admin/users/:id/impersonate                                   */
/* ======================================================================== */
/*  Entrar como o usuário: a sessão do admin é substituída pela sessão dele
    neste navegador. Fica registrado em `audit_log` — é a regra 4 da
    arquitetura, e é o que torna esse poder aceitável.                      */
r.post("/users/:id/impersonate", async (c) => {
  const { id } = entradaDaUrl(c, contract.admin.impersonate.in, { id: c.req.param("id") });
  const ator = usuarioAtual(c);

  const alvo = await db.primeiro(schema.users, { id, deletedAt: null });
  if (!alvo) throw new AppError("nao_encontrado", "Usuário não encontrado.");
  if (alvo.id === ator.id) {
    throw new AppError("conflito", "Você já está na sua própria conta.");
  }
  if (alvo.status === "suspenso") {
    throw new AppError("conflito", "Essa conta está suspensa. Reative antes de entrar como ela.");
  }

  /* A auditoria vem ANTES de trocar a sessão: se o registro falhar, a
     passagem não acontece. Ninguém entra como outro sem deixar rastro. */
  await registrarAuditoria(c, ator.id, "admin.impersonate", "users", alvo.id, {
    alvoEmail: alvo.email, alvoPapel: alvo.role, adminEmail: ator.email
  });

  await criarSessao(c, alvo.id);
  log.warn(`admin ${ator.email} entrou como ${alvo.email}`);
  return c.json({ ok: true as const, redirect: rotaInicial(alvo.role as Role) });
});

/* ======================================================================== */
/*  GET /api/admin/payments?status=&page=                                   */
/* ======================================================================== */
r.get("/payments", async (c) => {
  const f = entradaDaUrl(c, contract.admin.listPayments.in);

  const filtro = f.status ? { status: f.status as never } : undefined;
  const total = await db.contar(schema.payments, filtro);
  const pagamentos = await db.buscar(schema.payments, filtro, {
    ordem: { campo: "createdAt", dir: "desc" },
    limite: POR_PAGINA,
    deslocamento: (f.page - 1) * POR_PAGINA
  });

  const usuarios = porId(await db.buscar(schema.users));
  return c.json({
    total,
    payments: pagamentos.map((p) => {
      const u = usuarios.get(p.userId);
      return {
        id: p.id,
        userName: u?.name ?? "(usuário removido)",
        userEmail: u?.email ?? "removido@nutrielive.com.br",
        amountCents: p.amountCents,
        method: p.method,
        status: p.status,
        paidAt: iso(p.paidAt),
        createdAt: p.createdAt.toISOString()
      };
    })
  });
});

/* ======================================================================== */
/*  POST /api/admin/payments/:id/refund                                     */
/* ======================================================================== */
/*  Estornar é devolver dinheiro: primeiro no provedor, depois aqui. Se o
    provedor recusar, nada muda do nosso lado — não existe estorno que só
    existe no nosso banco. `aplicarEstorno` derruba o acesso, cancela a
    comissão e avisa a pessoa, e é idempotente: o webhook de estorno que o
    provedor manda depois não repete nada.                                  */
r.post("/payments/:id/refund", async (c) => {
  const { reason } = await body(c, contract.admin.refund.in.omit({ id: true }));
  const { id } = entradaDaUrl(c, contract.admin.refund.in.pick({ id: true }), { id: c.req.param("id") });
  const ator = usuarioAtual(c);

  const pagamento = await db.primeiro(schema.payments, { id });
  if (!pagamento) throw new AppError("nao_encontrado", "Pagamento não encontrado.");
  if (pagamento.status === "estornado") {
    return c.json({ ok: true as const });        /* já estornado: idempotente */
  }
  if (pagamento.status !== "aprovado") {
    throw new AppError("conflito", "Só dá para estornar um pagamento aprovado.");
  }

  if (pagamento.providerPaymentId) {
    const prov = await provedor();
    await prov.estornar(pagamento.providerPaymentId);
  } else {
    log.warn(`estorno de ${pagamento.id} sem id no provedor: aplicado só no nosso lado`);
  }

  await aplicarEstorno(pagamento.id, reason);
  await registrarAuditoria(c, ator.id, "admin.estorno", "payment", pagamento.id, {
    motivo: reason, amountCents: pagamento.amountCents, userId: pagamento.userId
  });
  return c.json({ ok: true as const });
});

/* ======================================================================== */
/*  GET /api/admin/audit?page=                                              */
/* ======================================================================== */
r.get("/audit", async (c) => {
  const f = entradaDaUrl(c, contract.admin.audit.in);
  const entradas = await db.buscar(schema.auditLog, undefined, {
    ordem: { campo: "createdAt", dir: "desc" },
    limite: POR_PAGINA,
    deslocamento: (f.page - 1) * POR_PAGINA
  });
  const usuarios = porId(await db.buscar(schema.users));

  return c.json({
    entries: entradas.map((e) => ({
      id: e.id,
      actorName: (e.actorUserId ? usuarios.get(e.actorUserId)?.name : null) ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      createdAt: e.createdAt.toISOString(),
      meta: e.meta ?? null
    }))
  });
});

/* ======================================================================== */
/*  GET /api/admin/webhooks — fila e falhas                                 */
/* ======================================================================== */
/*  É por aqui que se descobre pagamento que não virou acesso: evento com
    `error` preenchido e `processedAt` nulo é entrega que ainda não concluiu. */
r.get("/webhooks", async (c) => {
  const eventos = await db.buscar(schema.webhookEvents, undefined, {
    ordem: { campo: "receivedAt", dir: "desc" },
    limite: 100
  });
  return c.json({
    events: eventos.map((e) => ({
      id: e.id,
      type: e.type,
      processedAt: iso(e.processedAt),
      error: e.error,
      receivedAt: e.receivedAt.toISOString()
    }))
  });
});

/* ======================================================================== */
/*  GET /api/admin/ai?page= — execuções da IA                               */
/* ======================================================================== */
/*  Esta tela existe para responder uma pergunta só: a IA está entregando?
    Por isso o `error` já vem na linha, inteiro, sem um segundo clique — e
    por isso `summary` e `byKind` olham só as últimas 24 horas, enquanto
    `jobs` lista o mais recente sem recorte de tempo: a média de ontem não
    serve para decidir agora, mas o erro de ontem é exatamente o que se
    procura quando alguém reclama.

    `avgMs` é medido só sobre o que terminou (`finishedAt` preenchido): job
    ainda na fila entraria como duração zero e derrubaria a média justo
    quando a fila está travada, que é quando o número precisa acusar. */
r.get("/ai", async (c) => {
  const f = entradaDaUrl(c, contract.admin.listAi.in);
  const desde = new Date(Date.now() - DIA_MS);

  const total = await db.contar(schema.aiJobs);
  const pagina = await db.buscar(schema.aiJobs, undefined, {
    ordem: { campo: "createdAt", dir: "desc" },
    limite: POR_PAGINA,
    deslocamento: (f.page - 1) * POR_PAGINA
  });

  /* A janela de 24h é contada sobre tudo, não sobre a página: o resumo
     mede o serviço, a página só mostra onde o olho está. */
  const janela = (await db.buscar(schema.aiJobs, undefined, {
    ordem: { campo: "createdAt", dir: "desc" },
    limite: 5000
  })).filter((j) => j.createdAt >= desde);

  const duracao = (j: Linha<typeof schema.aiJobs>): number | null =>
    j.finishedAt ? Math.max(0, j.finishedAt.getTime() - j.createdAt.getTime()) : null;

  const media = (linhas: Linha<typeof schema.aiJobs>[]): number => {
    const ms = linhas.map(duracao).filter((v): v is number => v !== null);
    return ms.length ? Math.round(ms.reduce((t, v) => t + v, 0) / ms.length) : 0;
  };

  const porTipo = new Map<string, Linha<typeof schema.aiJobs>[]>();
  for (const j of janela) {
    const lista = porTipo.get(j.kind) ?? [];
    lista.push(j);
    porTipo.set(j.kind, lista);
  }

  const usuarios = porId(await db.buscar(schema.users));

  return c.json(conforme(contract.admin.listAi.out, {
    total,
    page: f.page,
    summary: {
      runs: janela.length,
      errors: janela.filter((j) => j.status === "erro").length,
      avgMs: media(janela),
      tokensIn: janela.reduce((t, j) => t + (j.tokensIn ?? 0), 0),
      tokensOut: janela.reduce((t, j) => t + (j.tokensOut ?? 0), 0)
    },
    byKind: [...porTipo.entries()]
      .map(([kind, linhas]) => ({
        kind,
        runs: linhas.length,
        errors: linhas.filter((j) => j.status === "erro").length,
        avgMs: media(linhas)
      }))
      .sort((a, b) => b.runs - a.runs),
    jobs: pagina.map((j) => ({
      id: j.id,
      kind: j.kind,
      userName: usuarios.get(j.userId)?.name ?? null,
      status: j.status,
      createdAt: j.createdAt.toISOString(),
      finishedAt: iso(j.finishedAt),
      durationMs: duracao(j),
      tokensIn: j.tokensIn,
      tokensOut: j.tokensOut,
      error: j.error
    }))
  }));
});

export default r;
