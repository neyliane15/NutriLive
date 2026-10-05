/* =========================================================================
   Nutri&Live — rotas da organização (consultório e academia)

   Esta é a área onde um usuário lê dado de OUTRA pessoa, então é a área
   que mais precisa de guarda. Duas regras valem em todas as rotas:

   1. `canAccessMember(profissionalId, membroId)` antes de qualquer leitura
      ou escrita sobre um membro. É ela que impede a nutricionista A de
      abrir o paciente da nutricionista B — sem `care_links` vivo (dela ou
      da organização dela) a resposta é 403, mesmo que o id exista.

   2. A carteira é listada por `org_id`, nunca por id vindo do cliente.
      O mesmo recorte que `canAccessMember` autoriza é o que a lista mostra.

   O limite de assentos do plano é contado em vínculos vivos: o convidado
   que ainda não aceitou já ocupa a vaga, senão a conta estoura no dia em
   que todos aceitarem.

   Adesão e risco saem de `lib/aderencia.ts`; datas, de `lib/datas.ts`.
   ========================================================================= */
import { Hono } from "hono";
import type { Context } from "hono";
import contract from "../../shared/contract.js";
import { db } from "../db/index.js";
import {
  careLinks, clinicalNotes, commissions, foodLogs, invitations, mealPlans,
  measurements, plans, profiles, subscriptions, users, waterLogs
} from "../db/schema.js";
import type { Linha } from "../db/index.js";
import { AppError, body } from "../lib/http.js";
import { conforme, iso, isoObrigatorio } from "../lib/resposta.js";
import { env } from "../lib/env.js";
import { inicioDoDia, somarDias } from "../lib/datas.js";
import { competencia } from "../billing/nucleo.js";
import { aderenciaPct, aderenciaPorSemana, avaliarRisco, type Nivel } from "../lib/aderencia.js";
import { emailConvite, enviarEmail } from "../lib/email.js";
import { rotaPrimeiroAcesso } from "../lib/rotas.js";
import { digerir } from "../auth/sessao.js";
import type { Usuario } from "../auth/sessao.js";
import { criarToken, horasDeValidade } from "../auth/tokens.js";
import {
  canAccessMember, guardaOrg, orgAtual, registrarAuditoria, usuarioAtual,
  type Ambiente, type Organizacao
} from "../auth/guard.js";

const r = new Hono<Ambiente>();

/* Papel, organização e assinatura em dia: é o guarda composto da arquitetura. */
r.use("*", ...guardaOrg);

/* ======================================================================== */
/*  ajudantes locais                                                        */
/* ======================================================================== */

/** Vínculos que ocupam assento: o convidado já reserva a vaga. */
const VINCULO_VIVO = ["pendente", "ativo"] as const;

/** Janela observada: 12 semanas cobrem a adesão de 28 dias e o gráfico. */
const DIAS_OBSERVADOS = 84;

const assentosUsados = (orgId: string): Promise<number> =>
  db.contar(careLinks, { orgId, status: { in: VINCULO_VIVO } });

const normalizarEmail = (e: string): string => e.trim().toLowerCase();

/** O papel que a organização dá a quem ela cadastra. */
const papelDoMembro = (org: Organizacao): "paciente" | "aluno" =>
  org.type === "academia" ? "aluno" : "paciente";

/**
 * Mesmo trabalho de `body()`, para rotas em que parte da entrada vem do
 * caminho (`/members/:userId`) e parte do corpo. O formato do erro é o
 * mesmo que o formulário já sabe ler.
 */
async function corpoComCaminho<T>(
  c: Context,
  schema: { parse: (v: unknown) => T },
  doCaminho: Record<string, unknown>
): Promise<T> {
  let bruto: unknown = {};
  if (c.req.method !== "GET" && c.req.method !== "DELETE") {
    bruto = await c.req.json().catch(() => ({}));
  }
  const dados = { ...(typeof bruto === "object" && bruto !== null ? bruto : {}), ...doCaminho };
  try {
    return schema.parse(dados);
  } catch (e: any) {
    const fields: Record<string, string> = {};
    for (const issue of e?.issues ?? []) fields[issue.path.join(".") || "_"] = issue.message;
    throw new AppError("dados_invalidos", "Confira os campos destacados.", fields);
  }
}

/* ------------------------------------------------------------------------ */
/*  a carteira, calculada uma vez e usada pela lista e pelo painel          */
/* ------------------------------------------------------------------------ */

type Membro = {
  vinculo: Linha<typeof careLinks>;
  usuario: Linha<typeof users>;
  registros: Date[];
  ultimoRegistro: Date | null;
  aderencia28d: number;
  nivel: Nivel;
  motivo: string;
};

/**
 * Todos os membros da organização, com adesão e risco já calculados.
 * Três consultas no total, não duas por pessoa: o volume por organização
 * é pequeno, mas uma academia com 300 alunos agradece.
 */
async function carteira(orgId: string): Promise<Membro[]> {
  const vinculos = await db.buscar(
    careLinks,
    { orgId, status: { in: VINCULO_VIVO } },
    { ordem: { campo: "startedAt", dir: "asc" } }
  );
  if (!vinculos.length) return [];

  const ids = vinculos.map((v) => v.memberUserId);
  const pessoas = await db.buscar(users, { id: { in: ids }, deletedAt: null });
  const porId = new Map(pessoas.map((p) => [p.id, p]));

  const desde = somarDias(inicioDoDia(), -(DIAS_OBSERVADOS - 1));
  const [comidas, aguas] = await Promise.all([
    db.buscar(foodLogs, { userId: { in: ids }, loggedAt: { gte: desde } }),
    db.buscar(waterLogs, { userId: { in: ids }, loggedAt: { gte: desde } })
  ]);

  const registrosPor = new Map<string, Date[]>();
  const anotar = (userId: string, quando: Date) => {
    const lista = registrosPor.get(userId);
    if (lista) lista.push(quando);
    else registrosPor.set(userId, [quando]);
  };
  for (const f of comidas) anotar(f.userId, f.loggedAt);
  for (const a of aguas) anotar(a.userId, a.loggedAt);

  const saida: Membro[] = [];
  for (const vinculo of vinculos) {
    const usuario = porId.get(vinculo.memberUserId);
    if (!usuario) continue;                              /* pessoa removida: o vínculo cai com ela */

    const registros = registrosPor.get(usuario.id) ?? [];
    const ultimoRegistro = registros.length
      ? registros.reduce((a, b) => (a.getTime() >= b.getTime() ? a : b))
      : null;
    const aderencia28d = aderenciaPct(registros, 28);
    const { nivel, motivo } = avaliarRisco({
      ultimoRegistro,
      aderencia28d,
      proximoRetorno: vinculo.nextReturnAt
    });
    saida.push({ vinculo, usuario, registros, ultimoRegistro, aderencia28d, nivel, motivo });
  }
  return saida;
}

/* ======================================================================== */
/*  GET /api/org/members?status=&q=                                         */
/* ======================================================================== */

r.get("/members", async (c) => {
  const org = orgAtual(c);
  const filtro = contract.org.listMembers.in.safeParse({
    status: c.req.query("status") || "todos",
    q: c.req.query("q") || undefined
  });
  if (!filtro.success) {
    throw new AppError("dados_invalidos", "Filtro inválido.", { status: "Filtro inválido." });
  }

  const busca = (filtro.data.q ?? "").trim().toLowerCase();
  let membros = await carteira(org.id);

  if (filtro.data.status === "risco") membros = membros.filter((m) => m.nivel === "risco");
  else if (filtro.data.status !== "todos") membros = membros.filter((m) => m.usuario.status === filtro.data.status);

  if (busca) {
    membros = membros.filter(
      (m) => m.usuario.name.toLowerCase().includes(busca) || m.usuario.email.toLowerCase().includes(busca)
    );
  }

  return c.json(conforme(contract.org.listMembers.out, {
    seatLimit: org.seatLimit,
    seatsUsed: await assentosUsados(org.id),
    members: membros.map((m) => ({
      userId: m.usuario.id,
      name: m.usuario.name,
      email: m.usuario.email,
      status: m.usuario.status,
      linkStatus: m.vinculo.status,
      /* Sem nenhum registro não existe adesão: `null` é honesto, 0 % não. */
      adherencePct: m.registros.length ? m.aderencia28d : null,
      lastLogAt: iso(m.ultimoRegistro),
      nextReturnAt: iso(m.vinculo.nextReturnAt),
      riskLevel: m.nivel
    }))
  }));
});

/* ======================================================================== */
/*  POST /api/org/members — convida uma pessoa                              */
/* ======================================================================== */

type ResultadoConvite = { userId: string; invitationId: string };

/**
 * Cadastra (ou reaproveita) a pessoa, abre o vínculo, emite o token de
 * convite e manda o e-mail. É o mesmo caminho do convite avulso e do CSV.
 */
async function convidar(
  c: Context<Ambiente>,
  org: Organizacao,
  profissional: Usuario,
  dados: { name: string; email: string; note?: string }
): Promise<ResultadoConvite> {
  const email = normalizarEmail(dados.email);
  const nome = dados.name.trim();
  const papel = papelDoMembro(org);

  let pessoa = await db.primeiro(users, { email, deletedAt: null });

  if (pessoa) {
    /* Quem já é de outra organização não pode ser puxado para esta: isso
       mexeria em quem paga pelo acesso dela. */
    if (pessoa.orgId && pessoa.orgId !== org.id) {
      throw new AppError("conflito", `${nome} já tem conta vinculada a outra organização.`, {
        email: "Este e-mail já está em outra conta."
      });
    }
    const vivo = await db.primeiro(careLinks, {
      orgId: org.id, memberUserId: pessoa.id, status: { in: VINCULO_VIVO }
    });
    if (vivo) {
      throw new AppError("conflito", `${pessoa.name} já está na sua carteira.`, {
        email: "Esta pessoa já está na sua lista."
      });
    }
  } else {
    pessoa = await db.inserir(users, {
      email,
      passwordHash: null,                       /* a senha nasce no primeiro acesso */
      name: nome,
      role: papel,
      status: "convidado",
      orgId: org.id,
      mustChangePassword: true
    });
  }

  /* `care_links` é único por (profissional, membro): vínculo encerrado é
     reaberto em vez de duplicado. */
  const anterior = await db.primeiro(careLinks, {
    professionalUserId: profissional.id, memberUserId: pessoa.id
  });
  const vinculo = anterior
    ? (await db.atualizar(careLinks, { id: anterior.id }, {
        orgId: org.id, status: "pendente", startedAt: new Date(), endedAt: null
      }))[0]!
    : await db.inserir(careLinks, {
        orgId: org.id,
        professionalUserId: profissional.id,
        memberUserId: pessoa.id,
        status: "pendente"
      });

  /* Token de uso único lido por POST /api/auth/first-access. */
  const { token, expiraEm } = await criarToken(pessoa.id, "convite");
  const convite = await db.inserir(invitations, {
    orgId: org.id,
    invitedByUserId: profissional.id,
    email,
    name: nome,
    role: papel,
    tokenHash: digerir(token),
    expiresAt: expiraEm
  });

  if (dados.note?.trim()) {
    await db.inserir(clinicalNotes, {
      careLinkId: vinculo.id,
      authorUserId: profissional.id,
      body: dados.note.trim()
    });
  }

  const m = emailConvite(nome, org.name, `${env.APP_URL}${rotaPrimeiroAcesso(token)}`, horasDeValidade("convite"));
  await enviarEmail({
    para: email,
    assunto: `${org.name} criou seu acesso ao Nutri&Live`,
    texto: m.texto,
    html: m.html,
    tipo: "convite"
  });

  await registrarAuditoria(c, profissional.id, "org.convidou", "users", pessoa.id, { orgId: org.id, papel });
  return { userId: pessoa.id, invitationId: convite.id };
}

r.post("/members", async (c) => {
  const entrada = await body(c, contract.org.invite.in);
  const org = orgAtual(c);
  const profissional = usuarioAtual(c);

  if (await assentosUsados(org.id) >= org.seatLimit) {
    throw new AppError(
      "limite_atingido",
      `Seu plano tem ${org.seatLimit} assentos e todos estão ocupados. Encerre um vínculo ou mude de plano.`
    );
  }

  const feito = await convidar(c, org, profissional, entrada);
  return c.json(conforme(contract.org.invite.out, {
    userId: feito.userId,
    invitationId: feito.invitationId,
    seatsUsed: await assentosUsados(org.id)
  }));
});

/* ======================================================================== */
/*  POST /api/org/members/bulk — importa por CSV colado                     */
/* ======================================================================== */

r.post("/members/bulk", async (c) => {
  const entrada = await body(c, contract.org.inviteBulk.in);
  const org = orgAtual(c);
  const profissional = usuarioAtual(c);

  let created = 0;
  let skipped = 0;
  const errors: { email: string; reason: string }[] = [];
  const vistos = new Set<string>();

  for (const linha of entrada.rows) {
    const email = normalizarEmail(linha.email ?? "");
    const nome = (linha.name ?? "").trim();

    if (vistos.has(email)) {
      skipped++;
      errors.push({ email, reason: "E-mail repetido na própria lista." });
      continue;
    }
    vistos.add(email);

    if (nome.length < 2) {
      skipped++;
      errors.push({ email, reason: "Nome com menos de 2 letras." });
      continue;
    }

    /* O assento é conferido a cada linha: a importação enche até o limite
       e avisa o resto, em vez de recusar o arquivo inteiro. */
    if (await assentosUsados(org.id) >= org.seatLimit) {
      skipped++;
      errors.push({ email, reason: `Sem assento livre no plano (${org.seatLimit}).` });
      continue;
    }

    try {
      await convidar(c, org, profissional, { name: nome, email });
      created++;
    } catch (e) {
      skipped++;
      errors.push({ email, reason: e instanceof AppError ? e.message : "Não foi possível convidar." });
    }
  }

  return c.json(conforme(contract.org.inviteBulk.out, { created, skipped, errors }));
});

/* ======================================================================== */
/*  DELETE /api/org/members/:userId — encerra o vínculo                     */
/* ======================================================================== */

r.delete("/members/:userId", async (c) => {
  const entrada = await corpoComCaminho(c, contract.org.removeMember.in, { userId: c.req.param("userId") });
  const org = orgAtual(c);
  const profissional = usuarioAtual(c);

  /* 403 antes de qualquer escrita: ninguém encerra vínculo de carteira alheia. */
  await canAccessMember(profissional.id, entrada.userId);

  /* Encerra todos os vínculos vivos desta pessoa NESTA organização — a
   * pessoa continua existindo, com o histórico dela intacto. */
  await db.atualizar(
    careLinks,
    { orgId: org.id, memberUserId: entrada.userId, status: { in: VINCULO_VIVO } },
    { status: "encerrado", endedAt: new Date() }
  );
  await registrarAuditoria(c, profissional.id, "org.encerrou_vinculo", "users", entrada.userId, { orgId: org.id });

  return c.json(conforme(contract.org.removeMember.out, {
    ok: true as const,
    seatsUsed: await assentosUsados(org.id)
  }));
});

/* ======================================================================== */
/*  GET /api/org/members/:userId — ficha completa                           */
/* ======================================================================== */

r.get("/members/:userId", async (c) => {
  const entrada = await corpoComCaminho(c, contract.org.member.in, { userId: c.req.param("userId") });
  const org = orgAtual(c);
  const profissional = usuarioAtual(c);

  await canAccessMember(profissional.id, entrada.userId);

  const pessoa = await db.primeiro(users, { id: entrada.userId, deletedAt: null });
  if (!pessoa) throw new AppError("nao_encontrado", "Esta pessoa não existe mais.");

  const perfil = await db.primeiro(profiles, { userId: pessoa.id });

  const desde = somarDias(inicioDoDia(), -(DIAS_OBSERVADOS - 1));
  const [comidas, aguas, medidas, planos] = await Promise.all([
    db.buscar(foodLogs, { userId: pessoa.id, loggedAt: { gte: desde } }),
    db.buscar(waterLogs, { userId: pessoa.id, loggedAt: { gte: desde } }),
    db.buscar(measurements, { userId: pessoa.id }, { ordem: { campo: "takenAt", dir: "asc" } }),
    db.buscar(mealPlans, { userId: pessoa.id }, { ordem: { campo: "createdAt", dir: "desc" } })
  ]);
  const registros = [...comidas.map((f) => f.loggedAt), ...aguas.map((a) => a.loggedAt)];

  /* O prontuário é da organização, não de um profissional só: o colega que
     atendeu nas férias também escreveu aqui. */
  const vinculosDaOrg = await db.buscar(careLinks, { orgId: org.id, memberUserId: pessoa.id });
  const notas = vinculosDaOrg.length
    ? await db.buscar(
        clinicalNotes,
        { careLinkId: { in: vinculosDaOrg.map((v) => v.id) } },
        { ordem: { campo: "createdAt", dir: "desc" } }
      )
    : [];
  const autores = notas.length
    ? await db.buscar(users, { id: { in: [...new Set(notas.map((n) => n.authorUserId))] } })
    : [];
  const nomeDoAutor = new Map(autores.map((a) => [a.id, a.name]));

  return c.json(conforme(contract.org.member.out, {
    user: { id: pessoa.id, name: pessoa.name, email: pessoa.email, status: pessoa.status },
    profile: perfil
      ? {
          birthDate: perfil.birthDate,
          sex: perfil.sex,
          heightCm: perfil.heightCm,
          goal: perfil.goal,
          activityLevel: perfil.activityLevel,
          dietStyle: perfil.dietStyle,
          restrictions: perfil.restrictions,
          dislikes: perfil.dislikes,
          kcalTarget: perfil.kcalTarget,
          proteinTargetG: perfil.proteinTargetG,
          waterTargetMl: perfil.waterTargetMl,
          updatedAt: iso(perfil.updatedAt)
        }
      : null,
    adherence: aderenciaPorSemana(registros, DIAS_OBSERVADOS),
    weight: medidas
      .filter((m) => m.weightKg !== null)
      .map((m) => ({ at: isoObrigatorio(m.takenAt), kg: Math.round((m.weightKg as number) / 100) / 10 })),
    plans: planos.map((p) => ({
      id: p.id, title: p.title, status: p.status, createdAt: isoObrigatorio(p.createdAt)
    })),
    notes: notas.map((n) => ({
      id: n.id,
      body: n.body,
      authorName: nomeDoAutor.get(n.authorUserId) ?? "Equipe",
      createdAt: isoObrigatorio(n.createdAt)
    }))
  }));
});

/* ======================================================================== */
/*  POST /api/org/members/:userId/notes                                     */
/* ======================================================================== */

r.post("/members/:userId/notes", async (c) => {
  const entrada = await corpoComCaminho(c, contract.org.addNote.in, { userId: c.req.param("userId") });
  const profissional = usuarioAtual(c);

  const vinculo = await canAccessMember(profissional.id, entrada.userId);

  const nota = await db.inserir(clinicalNotes, {
    careLinkId: vinculo.id,
    authorUserId: profissional.id,
    body: entrada.body.trim()
  });
  await registrarAuditoria(c, profissional.id, "org.anotou", "clinical_notes", nota.id, { membro: entrada.userId });

  return c.json(conforme(contract.org.addNote.out, { id: nota.id }));
});

/* ======================================================================== */
/*  POST /api/org/members/:userId/plan — envia um plano                     */
/* ======================================================================== */

r.post("/members/:userId/plan", async (c) => {
  const entrada = await corpoComCaminho(c, contract.org.sendPlan.in, { userId: c.req.param("userId") });
  const profissional = usuarioAtual(c);

  await canAccessMember(profissional.id, entrada.userId);

  const plano = await db.primeiro(mealPlans, { id: entrada.planId });
  if (!plano) throw new AppError("nao_encontrado", "Este plano não existe mais.");
  /* Plano é de uma pessoa só: não se envia o plano de um paciente a outro. */
  if (plano.userId !== entrada.userId) {
    throw new AppError("sem_permissao", "Este plano não pertence a esta pessoa.");
  }

  /* Um plano vigente por vez: o anterior vai para o arquivo. */
  await db.atualizar(
    mealPlans,
    { userId: entrada.userId, status: { in: ["ativo", "enviado"] } },
    { status: "arquivado" }
  );
  await db.atualizar(mealPlans, { id: plano.id }, { status: "enviado" });
  await registrarAuditoria(c, profissional.id, "org.enviou_plano", "meal_plans", plano.id, { membro: entrada.userId });

  return c.json(conforme(contract.org.sendPlan.out, { ok: true as const }));
});

/* ======================================================================== */
/*  GET /api/org/dashboard                                                  */
/* ======================================================================== */

r.get("/dashboard", async (c) => {
  const org = orgAtual(c);
  const membros = await carteira(org.id);

  /* A média é sobre quem já aceitou o convite: contar o convidado como 0 %
     faria o painel acusar queda sempre que entrasse gente nova. */
  const ativos = membros.filter((m) => m.usuario.status === "ativo");
  const avgAdherencePct = ativos.length
    ? Math.round(ativos.reduce((t, m) => t + m.aderencia28d, 0) / ativos.length)
    : 0;

  /* Série semanal da organização: média das séries de cada pessoa ativa. */
  const series = ativos.map((m) => aderenciaPorSemana(m.registros, DIAS_OBSERVADOS));
  const modelo = series[0] ?? aderenciaPorSemana([], DIAS_OBSERVADOS);
  const adherenceByWeek = modelo.map((semana, i) => ({
    weekStart: semana.weekStart,
    pct: series.length
      ? Math.round(series.reduce((t, s) => t + (s[i]?.pct ?? 0), 0) / series.length)
      : 0
  }));

  const precisamDeOlho = membros
    .filter((m) => m.nivel !== "ok")
    .sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "risco" ? -1 : 1));

  return c.json(conforme(contract.org.dashboard.out, {
    seatsUsed: await assentosUsados(org.id),
    seatLimit: org.seatLimit,
    avgAdherencePct,
    atRisk: membros.filter((m) => m.nivel === "risco").length,
    adherenceByWeek,
    needsAttention: precisamDeOlho.map((m) => ({
      userId: m.usuario.id,
      name: m.usuario.name,
      reason: m.motivo,
      level: m.nivel as "atencao" | "risco"
    }))
  }));
});

/* ======================================================================== */
/*  GET /api/org/commissions?period=AAAA-MM — só academia                   */
/* ======================================================================== */
/*  Comissão é do programa de parceria, que existe só para academia. Pedir
    isto sendo consultório não é "lista vazia", é rota que não lhe pertence —
    então é 403, igual a qualquer outra fronteira daqui.

    A linha de `commissions` guarda a base e o valor, mas não guarda o nome
    de quem gerou: isso vem da assinatura (`subscription_id` -> aluno, plano).
    Comissão cuja assinatura já foi apagada ainda aparece, com o nome em
    branco preenchido por "Aluno removido" — esconder a linha mudaria o total
    e faria o parceiro desconfiar do número, que é o pior resultado possível
    para esta tela. */
r.get("/commissions", async (c) => {
  const org = orgAtual(c);
  if (org.type !== "academia") {
    throw new AppError("sem_permissao", "Comissão existe no programa de parceria, que é só para academia.");
  }

  /* `period` vem da query. Vazio é "sem filtro", não é formato inválido:
     o seletor da tela manda `?period=` quando ninguém escolheu nada. */
  const cru = { ...c.req.query() };
  if (!cru["period"]) delete cru["period"];
  const filtro = await corpoComCaminho(c, contract.org.commissions.in, cru);

  /* Toda a competência da academia de uma vez: é o volume de um mês de
     repasse, e dele saem tanto o seletor quanto os totais. */
  const todas = await db.buscar(commissions, { orgId: org.id }, {
    ordem: { campo: "createdAt", dir: "desc" }
  });

  const periodos = [...new Set(todas.map((l) => l.period))].sort().reverse();
  const periodo = filtro.period ?? periodos[0] ?? competencia();
  const doPeriodo = todas.filter((l) => l.period === periodo);

  /* Nome do aluno e do plano: duas buscas, cruzadas em memória. */
  const idsAssinatura = [...new Set(doPeriodo.map((l) => l.subscriptionId).filter((v): v is string => !!v))];
  const assinaturas = idsAssinatura.length
    ? await db.buscar(subscriptions, { id: { in: idsAssinatura } })
    : [];
  const porAssinatura = new Map(assinaturas.map((a) => [a.id, a]));

  const idsAluno = [...new Set(assinaturas.map((a) => a.userId))];
  const alunos = idsAluno.length ? await db.buscar(users, { id: { in: idsAluno } }) : [];
  const nomeDoAluno = new Map(alunos.map((u) => [u.id, u.name]));

  const planos = await db.buscar(plans);
  const nomeDoPlano = new Map(planos.map((p) => [p.key, p.name]));

  const totais = { baseCents: 0, previstaCents: 0, apuradaCents: 0, pagaCents: 0 };
  for (const l of doPeriodo) {
    totais.baseCents += l.baseCents;
    if (l.status === "paga") totais.pagaCents += l.amountCents;
    else if (l.status === "apurada") totais.apuradaCents += l.amountCents;
    else totais.previstaCents += l.amountCents;
  }

  return c.json(conforme(contract.org.commissions.out, {
    periods: periodos.length ? periodos : [periodo],
    period: periodo,
    totals: totais,
    items: doPeriodo.map((l) => {
      const assinatura = l.subscriptionId ? porAssinatura.get(l.subscriptionId) : undefined;
      return {
        userId: assinatura?.userId ?? org.id,
        userName: (assinatura && nomeDoAluno.get(assinatura.userId)) ?? "Aluno removido",
        planName: (assinatura && nomeDoPlano.get(assinatura.planKey)) ?? "—",
        baseCents: l.baseCents,
        rateBp: l.rateBp,
        amountCents: l.amountCents,
        status: l.status,
        paidAt: iso(l.paidAt)
      };
    })
  }));
});

export default r;
