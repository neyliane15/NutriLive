/* =========================================================================
   Nutri&Live — rotas de IA

     POST /api/ai/meal-plan   enfileira a geração do plano
     POST /api/ai/recipes     enfileira a geração de receitas
     GET  /api/ai/jobs/:id    andamento e resultado
     POST /api/ai/callback    o n8n devolve o resultado (sem sessão, com token)

   Por que assíncrono para tudo, mesmo no driver local que responde na hora:
   a tela espera job. O front chama a rota, recebe `jobId` e passa a perguntar
   `GET /api/ai/jobs/:id` (veja `web/islands/base.js`). Se o local respondesse
   o plano direto, a mesma tela precisaria de dois caminhos. Então o job em
   `ai_jobs` é sempre a fonte da verdade do andamento, e trocar `AI_DRIVER`
   não muda uma linha do front.

   Três coisas acontecem aqui e em nenhum outro lugar:

   1. CAUTELA CLÍNICA ANTES DO DRIVER. Se o perfil tem sinal de cautela
      (gestação, menor de idade, doença crônica declarada, IMC crítico…) o job
      é concluído com `orientacao_profissional` e NADA é enviado para o n8n.
      Nenhum plano é gravado.
   2. QUEM PUBLICA O PLANO. Com nutricionista vinculada o plano nasce
      `rascunho`, invisível para o paciente até ela enviar. Sem vínculo nasce
      `ativo` e marcado como material educativo. É `statusInicialDoPlano` que
      decide; aqui a gente só obedece e grava.
   3. CALLBACK AUTENTICADO E IDEMPOTENTE. O token vem no cabeçalho e é
      comparado em tempo constante. Job já concluído responde `ok` sem
      reprocessar: n8n reentrega, e reentrega não pode virar plano duplicado.
   ========================================================================= */
import { Hono } from "hono";
import type { Context } from "hono";
import { timingSafeEqual } from "node:crypto";
import { contract } from "../../shared/contract.js";
import { AppError, body } from "../lib/http.js";
import { log } from "../lib/log.js";
import { env } from "../lib/env.js";
import { chaveDoDia } from "../lib/datas.js";
import { db } from "../db/index.js";
import type { Linha } from "../db/index.js";
import {
  aiJobs, careLinks, measurements, mealPlans, profiles, recipes, shoppingLists, users
} from "../db/schema.js";
import {
  acessoAoMembro, guardaApp, registrarAuditoria, requireUser, usuarioAtual,
  PAPEIS_PROFISSIONAIS, type Ambiente
} from "../auth/guard.js";
import { provedor, orientacaoSePreciso, metasDoPerfil, contextoDeValidacao } from "../ai/provedor.js";
import { CABECALHO_TOKEN } from "../ai/n8n.js";
import { ViolacaoClinica, validarPlano, validarReceitas } from "../ai/seguranca.js";
import type {
  ContextoGeracao, Pedido, PerfilNutricional, PlanoAlimentar, SaidaReceitas
} from "../ai/tipos.js";
import { perfilVazio } from "../ai/tipos.js";
import type { Role } from "../../shared/contract.js";

const r = new Hono<Ambiente>();

type Job = Linha<typeof aiJobs>;

/** O que fica gravado em `ai_jobs.input`: o pedido e o retrato do contexto. */
interface EntradaJob {
  pedido: Pedido;
  contexto: ContextoGeracao;
}

/* ======================================================================== */
/*  Perfil e contexto                                                       */
/* ======================================================================== */

/**
 * Monta o perfil nutricional da pessoa a partir de `profiles` e da última
 * medida de peso. O peso mora em `measurements.weight_g` (gramas inteiras),
 * por isso a divisão por mil.
 */
export async function perfilDoUsuario(userId: string): Promise<PerfilNutricional> {
  const p = await db.primeiro(profiles, { userId });
  const ultima = await db.primeiro(
    measurements, { userId, weightKg: { nulo: false } }, { ordem: { campo: "takenAt", dir: "desc" } }
  );

  const perfil = perfilVazio();
  perfil.birthDate = p?.birthDate ?? null;
  perfil.sex = p?.sex ?? null;
  perfil.heightCm = p?.heightCm ?? null;
  perfil.weightKg = ultima?.weightKg ? Math.round(ultima.weightKg / 100) / 10 : null;
  perfil.goal = p?.goal ?? null;
  perfil.activityLevel = p?.activityLevel ?? null;
  perfil.dietStyle = p?.dietStyle ?? null;
  perfil.restrictions = Array.isArray(p?.restrictions) ? p!.restrictions : [];
  perfil.dislikes = Array.isArray(p?.dislikes) ? p!.dislikes : [];
  perfil.kcalTarget = p?.kcalTarget ?? null;
  perfil.proteinTargetG = p?.proteinTargetG ?? null;
  perfil.waterTargetMl = p?.waterTargetMl ?? null;
  /* `profiles` ainda não tem coluna de condição de saúde: o que a pessoa
     escreveu em restrições é varrido por `detectarSinaisDeCautela`. */
  perfil.conditions = [...perfil.restrictions];
  return perfil;
}

/** Existe nutricionista (ou academia) com vínculo vivo cuidando desta pessoa? */
async function temProfissional(userId: string): Promise<boolean> {
  const vinculo = await db.primeiro(careLinks, {
    memberUserId: userId, status: { in: ["pendente", "ativo"] }
  });
  return !!vinculo;
}

async function montarContexto(alvoId: string, solicitanteId: string): Promise<ContextoGeracao> {
  const alvo = await db.primeiro(users, { id: alvoId, deletedAt: null });
  if (!alvo) throw new AppError("nao_encontrado", "Não encontramos essa pessoa.");
  const perfil = await perfilDoUsuario(alvoId);
  return {
    userId: alvoId,
    nomeUsuario: alvo.name,
    perfil,
    solicitanteUserId: solicitanteId,
    temNutricionistaVinculada: await temProfissional(alvoId),
    /* A semente amarra a saída ao dia e à pessoa: pedir duas vezes no mesmo
       dia devolve o mesmo plano, e amanhã devolve outro. */
    semente: `${alvoId}|${chaveDoDia()}`,
    dataBase: chaveDoDia()
  };
}

/**
 * Aplica os guardas de `guardaApp` (papel + assinatura em dia) em sequência.
 * Cada guarda recebe um `next` vazio: a função deles é validar e deixar o que
 * a rota precisa no contexto, não encadear a resposta.
 */
async function guardarApp(c: Context<Ambiente>): Promise<void> {
  for (const guarda of guardaApp) await guarda(c, async () => {});
}

/** Quem pode pedir/ler geração para outra pessoa. */
async function autorizarAlvo(c: Context<Ambiente>, alvoId: string): Promise<void> {
  const ator = usuarioAtual(c);
  if (alvoId === ator.id) return;
  if (ator.role !== "admin" && !PAPEIS_PROFISSIONAIS.includes(ator.role as Role)) {
    throw new AppError("sem_permissao", "Você só pode gerar plano para a sua própria conta.");
  }
  await acessoAoMembro(c, ator, alvoId);
}

/* ======================================================================== */
/*  Criação do job                                                          */
/* ======================================================================== */

async function criarJob(
  kind: "plano" | "receita", ctx: ContextoGeracao, pedido: Pedido
): Promise<Job> {
  const entrada: EntradaJob = { pedido, contexto: ctx };
  return db.inserir(aiJobs, {
    userId: ctx.userId,
    requestedByUserId: ctx.solicitanteUserId,
    kind,
    status: "fila",
    input: entrada as never
  });
}

/** Dispara o processamento sem segurar a resposta HTTP. */
function emSegundoPlano(jobId: string): void {
  setTimeout(() => {
    void processarJob(jobId).catch((e) => log.error(`IA: job ${jobId} falhou fora do fluxo`, e));
  }, 0);
}

/* ======================================================================== */
/*  Processamento                                                           */
/* ======================================================================== */

const mensagemDeErro = (e: unknown): string => {
  if (e instanceof ViolacaoClinica) return e.mensagem;
  if (e instanceof AppError) return e.message;
  return "A geração não terminou. Tente de novo em alguns minutos.";
};

async function marcarErro(jobId: string, e: unknown): Promise<void> {
  await db.atualizar(aiJobs, { id: jobId }, {
    status: "erro", error: mensagemDeErro(e).slice(0, 2000), finishedAt: new Date()
  });
  if (e instanceof ViolacaoClinica) {
    log.warn(`IA: job ${jobId} barrado pela guarda clínica — ${e.motivo}`, e);
  } else {
    log.error(`IA: job ${jobId} com erro`, e);
  }
}

/**
 * Processa um job da fila. Exportada porque os testes chamam direto, sem
 * esperar o `setTimeout` da rota.
 */
export async function processarJob(jobId: string): Promise<Job | null> {
  const job = await db.primeiro(aiJobs, { id: jobId });
  if (!job) return null;

  /* Pega o job de forma condicional: a atualização só casa se ele ainda
     estiver na fila. Assim duas chamadas para o mesmo job (o `setTimeout` da
     rota e uma chamada direta, por exemplo) não geram plano em duplicidade. */
  const tomados = await db.atualizar(aiJobs, { id: jobId, status: "fila" }, { status: "processando" });
  if (tomados.length === 0) return job;

  const entrada = job.input as unknown as EntradaJob;
  const p = provedor();

  try {
    if (entrada.pedido.kind === "plano") {
      const disparo = await p.gerarPlano(entrada.contexto, entrada.pedido, jobId);
      if (disparo.modo === "pronto") return await concluirJob(jobId, disparo.saida);
      await db.atualizar(aiJobs, { id: jobId }, { n8nExecutionId: disparo.executionId });
      return await db.primeiro(aiJobs, { id: jobId });
    }
    const disparo = await p.gerarReceitas(entrada.contexto, entrada.pedido, jobId);
    if (disparo.modo === "pronto") return await concluirJob(jobId, disparo.saida);
    await db.atualizar(aiJobs, { id: jobId }, { n8nExecutionId: disparo.executionId });
    return await db.primeiro(aiJobs, { id: jobId });
  } catch (e) {
    await marcarErro(jobId, e);
    return await db.primeiro(aiJobs, { id: jobId });
  }
}

/* ======================================================================== */
/*  Gravação do resultado                                                   */
/* ======================================================================== */

async function gravarPlano(job: Job, ctx: ContextoGeracao, plano: PlanoAlimentar): Promise<void> {
  const criado = await db.inserir(mealPlans, {
    userId: job.userId,
    createdByUserId: job.requestedByUserId ?? null,
    title: plano.titulo,
    days: plano.dias.length,
    kcalTarget: plano.metas.kcal,
    macros: plano.resumo.macrosMedia,
    content: plano as never,
    source: "ia",
    status: plano.status
  });

  /* Lista de compras da semana: uma por semana, então atualiza se já existe. */
  const semana = plano.listaDeCompras.weekStart;
  const existente = await db.primeiro(shoppingLists, { userId: job.userId, weekStart: semana });
  if (existente) {
    await db.atualizar(shoppingLists, { id: existente.id }, {
      items: plano.listaDeCompras.items, estimatedCents: plano.listaDeCompras.estimatedCents
    });
  } else {
    await db.inserir(shoppingLists, {
      userId: job.userId, weekStart: semana,
      items: plano.listaDeCompras.items, estimatedCents: plano.listaDeCompras.estimatedCents
    });
  }

  await gravarReceitas(job.userId, plano.receitas);
  log.info(`IA: plano ${criado.id} gravado para ${job.userId} como ${plano.status}`);
}

async function gravarReceitas(userId: string, lista: SaidaReceitas["receitas"]): Promise<void> {
  for (const rec of lista.slice(0, 6)) {
    const jaTem = await db.primeiro(recipes, { userId, title: rec.title });
    if (jaTem) continue;
    await db.inserir(recipes, {
      userId, title: rec.title, timeMin: rec.timeMin, kcal: rec.kcal,
      macros: rec.macros, ingredients: rec.ingredients, steps: rec.steps,
      matchPct: Math.round(rec.matchPct)
    });
  }
}

/**
 * Valida a saída (venha do local ou do n8n), grava o que tem que gravar e
 * conclui o job. É o único caminho para um plano chegar ao banco.
 */
async function concluirJob(jobId: string, bruto: unknown): Promise<Job> {
  const job = await db.primeiro(aiJobs, { id: jobId });
  if (!job) throw new AppError("nao_encontrado", "Job não encontrado.");
  const entrada = job.input as unknown as EntradaJob;
  const ctx = entrada.contexto;

  let saida: unknown = bruto;

  if (job.kind === "plano") {
    const tipo = (bruto as { tipo?: string } | null)?.tipo;
    if (tipo === "orientacao_profissional") {
      saida = bruto;                                   /* encaminhamento, sem plano */
    } else {
      const metas = metasDoPerfil(ctx.perfil);
      const plano = validarPlano(bruto, contextoDeValidacao(ctx.perfil, metas));
      await gravarPlano(job, ctx, plano);
      saida = plano;
    }
  } else if (job.kind === "receita") {
    const receitas = validarReceitas(bruto, contextoDeValidacao(ctx.perfil, metasDoPerfil(ctx.perfil)));
    await gravarReceitas(job.userId, receitas.receitas);
    saida = receitas;
  }

  await db.atualizar(aiJobs, { id: jobId }, {
    status: "concluido", output: saida as never, error: null, finishedAt: new Date()
  });
  return (await db.primeiro(aiJobs, { id: jobId }))!;
}

/* ======================================================================== */
/*  POST /api/ai/meal-plan                                                  */
/* ======================================================================== */

r.post("/meal-plan", async (c) => {
  await guardarApp(c);
  const entrada = await body(c, contract.ai.mealPlan.in);
  const ator = usuarioAtual(c);
  const alvoId = entrada.forUserId ?? ator.id;
  await autorizarAlvo(c, alvoId);

  const ctx = await montarContexto(alvoId, ator.id);
  const pedido: Pedido = { kind: "plano", days: entrada.days, ...(entrada.notes ? { notes: entrada.notes } : {}) };
  const job = await criarJob("plano", ctx, pedido);

  /* Sinal de cautela: o sistema não gera plano, encaminha. Decidido aqui,
     antes de qualquer driver, para nada sair do nosso servidor. */
  const orientacao = orientacaoSePreciso(ctx);
  if (orientacao) {
    await db.atualizar(aiJobs, { id: job.id }, {
      status: "concluido", output: orientacao as never, finishedAt: new Date()
    });
    await registrarAuditoria(c, ator.id, "ia.plano_bloqueado", "ai_jobs", job.id, {
      sinais: orientacao.sinais.map((s) => s.id)
    });
    return c.json({ jobId: job.id, status: "concluido" as const });
  }

  await registrarAuditoria(c, ator.id, "ia.plano_pedido", "ai_jobs", job.id, {
    alvo: alvoId, dias: entrada.days, driver: provedor().nome
  });
  emSegundoPlano(job.id);
  return c.json({ jobId: job.id, status: "fila" as const });
});

/* ======================================================================== */
/*  POST /api/ai/recipes                                                    */
/* ======================================================================== */

r.post("/recipes", async (c) => {
  await guardarApp(c);
  const entrada = await body(c, contract.ai.recipes.in);
  const ator = usuarioAtual(c);
  const ctx = await montarContexto(ator.id, ator.id);
  const pedido: Pedido = {
    kind: "receita",
    ingredients: entrada.ingredients,
    ...(entrada.maxMinutes ? { maxMinutes: entrada.maxMinutes } : {})
  };
  const job = await criarJob("receita", ctx, pedido);
  emSegundoPlano(job.id);
  return c.json({ jobId: job.id, status: "fila" });
});

/* ======================================================================== */
/*  GET /api/ai/jobs/:id                                                    */
/* ======================================================================== */

r.get("/jobs/:id", requireUser, async (c) => {
  const { id } = contract.ai.job.in.parse({ id: c.req.param("id") });
  const job = await db.primeiro(aiJobs, { id });
  if (!job) throw new AppError("nao_encontrado", "Não encontramos essa geração.");

  const ator = usuarioAtual(c);
  if (job.userId !== ator.id && job.requestedByUserId !== ator.id) {
    await autorizarAlvo(c, job.userId);
  }

  return c.json({
    id: job.id,
    kind: job.kind,
    status: job.status,
    output: job.output ?? null,
    error: job.error ?? null
  });
});

/* ======================================================================== */
/*  POST /api/ai/callback                                                   */
/* ======================================================================== */

/** Comparação em tempo constante: o tamanho do segredo não vaza pelo tempo. */
function tokenConfere(recebido: string | undefined): boolean {
  const esperado = env.N8N_WEBHOOK_TOKEN;
  if (!esperado || !recebido) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

r.post("/callback", async (c) => {
  const doCabecalho = c.req.header(CABECALHO_TOKEN);
  const daAutorizacao = c.req.header("authorization")?.replace(/^Bearer\s+/i, "");
  if (!env.N8N_WEBHOOK_TOKEN) {
    throw new AppError("indisponivel", "Callback de IA desativado neste ambiente.");
  }
  if (!tokenConfere(doCabecalho) && !tokenConfere(daAutorizacao)) {
    log.warn("IA: callback recusado por token inválido");
    throw new AppError("nao_autenticado", "Token do webhook inválido.");
  }

  const entrada = await body(c, contract.ai.callback.in);
  const job = await db.primeiro(aiJobs, { id: entrada.jobId });
  if (!job) throw new AppError("nao_encontrado", "Job não encontrado.");

  const medicao = {
    ...(entrada.executionId ? { n8nExecutionId: entrada.executionId.slice(0, 64) } : {}),
    ...(typeof entrada.tokensIn === "number" ? { tokensIn: Math.round(entrada.tokensIn) } : {}),
    ...(typeof entrada.tokensOut === "number" ? { tokensOut: Math.round(entrada.tokensOut) } : {})
  };

  /* Idempotência: o n8n reentrega em caso de dúvida. Job já fechado só
     recebe a medição de tokens e responde ok. */
  if (job.status === "concluido" || job.status === "erro") {
    if (Object.keys(medicao).length > 0) await db.atualizar(aiJobs, { id: job.id }, medicao);
    log.info(`IA: callback repetido para o job ${job.id} (${job.status}) — ignorado`);
    return c.json({ ok: true as const });
  }

  if (Object.keys(medicao).length > 0) await db.atualizar(aiJobs, { id: job.id }, medicao);

  if (entrada.status === "erro") {
    await db.atualizar(aiJobs, { id: job.id }, {
      status: "erro",
      error: (entrada.error ?? "A geração por IA não terminou. Tente de novo.").slice(0, 2000),
      finishedAt: new Date()
    });
    return c.json({ ok: true as const });
  }

  try {
    await concluirJob(job.id, entrada.output);
  } catch (e) {
    /* Saída reprovada pelas guardas clínicas: o job vira erro com a mensagem
       pronta para o usuário, e o conteúdo rejeitado NÃO é gravado. */
    await marcarErro(job.id, e);
  }
  return c.json({ ok: true as const });
});

export default r;
