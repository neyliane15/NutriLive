/* =========================================================================
   Nutri&Live — rotas do app da pessoa

   Tudo aqui é sobre o usuário da sessão e só sobre ele: o `userId` nunca
   vem do corpo da requisição, vem de `usuarioAtual(c)`. É o que garante
   que ninguém lê o diário de outra pessoa trocando um id na mão.

   A conta das metas e do score mora em `lib/metas.ts`, a de adesão em
   `lib/aderencia.ts` e a de calendário em `lib/datas.ts` — esta camada só
   lê o banco, chama essas funções e devolve no formato do contrato.

   Unidades: o banco guarda inteiro na unidade pequena (peso em gramas,
   medidas em milímetros) e o contrato fala em kg e cm. A conversão
   acontece só aqui, nas duas pontas.
   ========================================================================= */
import { Hono } from "hono";
import contract from "../../shared/contract.js";
import { db } from "../db/index.js";
import { foodLogs, mealPlans, measurements, profiles, shoppingLists, waterLogs } from "../db/schema.js";
import type { Linha } from "../db/index.js";
import { AppError, body } from "../lib/http.js";
import { conforme, iso, isoObrigatorio } from "../lib/resposta.js";
import {
  chaveDoDia, faixa, fimDoDia, inicioDaSemana, inicioDoDia, somarDias
} from "../lib/datas.js";
import { aderenciaPct, sequenciaAtual } from "../lib/aderencia.js";
import { calcularMetas, estimarRefeicao, scoreDoDia } from "../lib/metas.js";
import { guardaApp, usuarioAtual, type Ambiente } from "../auth/guard.js";
import type { Usuario } from "../auth/sessao.js";

const r = new Hono<Ambiente>();

/* Sessão E acesso pago em dia. Era só `requireUser`, e isso significava que
   estorno, cancelamento e cobrança vencida não fechavam NADA do que o
   cliente usa: diário, água, progresso, medidas, lista de compras e perfil
   seguiam abertos para sempre depois do primeiro mês. A tela de Conta dizia
   "Escolha um plano para liberar o app completo" enquanto o app completo
   estava aberto. `guardaApp` é o mesmo guarda que a área de IA já usava. */
r.use("*", ...guardaApp);

/* ======================================================================== */
/*  unidades e tabelas de apoio                                             */
/* ======================================================================== */

/** `weight_g` -> kg, com uma casa. */
const gramasParaKg = (g: number | null): number | null => (g === null ? null : Math.round(g / 100) / 10);
/** `waist_mm` -> cm, com uma casa. */
const mmParaCm = (mm: number | null): number | null => (mm === null ? null : Math.round(mm) / 10);

const REFEICOES = ["cafe", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"] as const;
type TipoRefeicao = (typeof REFEICOES)[number];

/** Horário habitual de cada refeição e fatia da meta calórica do dia. */
const AGENDA: { meal: TipoRefeicao; hora: number; rotulo: string; fatia: number }[] = [
  { meal: "cafe", hora: 7, rotulo: "Café da manhã", fatia: 0.20 },
  { meal: "lanche_manha", hora: 10, rotulo: "Lanche da manhã", fatia: 0.08 },
  { meal: "almoco", hora: 12, rotulo: "Almoço", fatia: 0.32 },
  { meal: "lanche_tarde", hora: 16, rotulo: "Lanche da tarde", fatia: 0.10 },
  { meal: "jantar", hora: 20, rotulo: "Jantar", fatia: 0.25 },
  { meal: "ceia", hora: 22, rotulo: "Ceia", fatia: 0.05 }
];

/** Hora do dia (0-23) no fuso do Brasil. */
const horaBrasileira = (agora = new Date()): number =>
  Math.floor((agora.getTime() - inicioDoDia(agora).getTime()) / 3_600_000);

/* ======================================================================== */
/*  leituras compartilhadas pelas rotas                                     */
/* ======================================================================== */

/** Última medida registrada, de onde sai o peso usado nas metas. */
const ultimaMedida = (usuarioId: string): Promise<Linha<typeof measurements> | null> =>
  db.primeiro(measurements, { userId: usuarioId }, { ordem: { campo: "takenAt", dir: "desc" } });

/**
 * As três metas do dia. O perfil manda quando já tem meta gravada (a
 * nutricionista pode ter ajustado na mão); senão a conta de `lib/metas.ts`
 * resolve com o que houver de perfil e a última pesagem.
 */
async function metasDe(usuario: Usuario): Promise<{ kcal: number; proteinaG: number; aguaMl: number }> {
  const perfil = await db.primeiro(profiles, { userId: usuario.id });
  const medida = await ultimaMedida(usuario.id);
  const calculadas = calcularMetas({
    sexo: perfil?.sex,
    nascimento: perfil?.birthDate ?? null,
    alturaCm: perfil?.heightCm ?? null,
    pesoKg: gramasParaKg(medida?.weightKg ?? null),
    objetivo: perfil?.goal,
    atividade: perfil?.activityLevel
  });
  return {
    kcal: perfil?.kcalTarget ?? calculadas.kcal,
    proteinaG: perfil?.proteinTargetG ?? calculadas.proteinaG,
    aguaMl: perfil?.waterTargetMl ?? calculadas.aguaMl
  };
}

const refeicoesDeHoje = (usuarioId: string) =>
  db.buscar(
    foodLogs,
    { userId: usuarioId, loggedAt: { gte: inicioDoDia(), lt: fimDoDia() } },
    { ordem: { campo: "loggedAt", dir: "asc" } }
  );

async function aguaDeHoje(usuarioId: string): Promise<number> {
  const copos = await db.buscar(waterLogs, { userId: usuarioId, loggedAt: { gte: inicioDoDia(), lt: fimDoDia() } });
  return copos.reduce((t, c) => t + c.ml, 0);
}

/** Datas de todo registro (refeição ou água) dos últimos N dias. */
async function datasDeRegistro(usuarioId: string, dias: number): Promise<Date[]> {
  const desde = somarDias(inicioDoDia(), -(dias - 1));
  const [comidas, aguas] = await Promise.all([
    db.buscar(foodLogs, { userId: usuarioId, loggedAt: { gte: desde } }),
    db.buscar(waterLogs, { userId: usuarioId, loggedAt: { gte: desde } })
  ]);
  return [...comidas.map((f) => f.loggedAt), ...aguas.map((a) => a.loggedAt)];
}

/* ======================================================================== */
/*  GET /api/me/today                                                       */
/* ======================================================================== */

/**
 * A próxima refeição do dia: o primeiro horário da agenda que ainda não
 * chegou (ou cujo registro ainda não existe). O título sai do plano ativo
 * quando há um; sem plano, cai no rótulo genérico com a fatia da meta.
 */
async function proximaRefeicao(
  usuarioId: string,
  jaRegistradas: Set<string>,
  kcalMeta: number
): Promise<{ at: string; title: string; kcal: number } | null> {
  const agora = horaBrasileira();
  const alvo = AGENDA.find((a) => !jaRegistradas.has(a.meal) && a.hora >= agora)
    ?? AGENDA.find((a) => !jaRegistradas.has(a.meal));
  if (!alvo) return null;

  /* O plano ativo guarda `content.dias[].refeicoes[]` (veja db/seed.ts). */
  const plano = await db.primeiro(
    mealPlans,
    { userId: usuarioId, status: { in: ["ativo", "enviado"] } },
    { ordem: { campo: "createdAt", dir: "desc" } }
  );

  let titulo = alvo.rotulo;
  let kcal = Math.round((kcalMeta * alvo.fatia) / 10) * 10;

  const conteudo = plano?.content as { dias?: { refeicoes?: { refeicao?: string; descricao?: string; kcal?: number }[] }[] } | null;
  const diaDoPlano = conteudo?.dias?.[0];
  const doPlano = diaDoPlano?.refeicoes?.find((x) => x.refeicao === alvo.meal);
  if (doPlano?.descricao) titulo = doPlano.descricao;
  if (typeof doPlano?.kcal === "number") kcal = Math.round(doPlano.kcal);

  return { at: `${String(alvo.hora).padStart(2, "0")}:00`, title: titulo, kcal };
}

r.get("/today", async (c) => {
  const usuario = usuarioAtual(c);
  const metas = await metasDe(usuario);
  const refeicoes = await refeicoesDeHoje(usuario.id);
  const aguaMl = await aguaDeHoje(usuario.id);

  const kcal = refeicoes.reduce((t, f) => t + f.kcal, 0);
  const proteina = refeicoes.reduce((t, f) => t + f.proteinG, 0);

  const score = scoreDoDia({
    kcal, kcalMeta: metas.kcal,
    proteinaG: proteina, proteinaMetaG: metas.proteinaG,
    aguaMl, aguaMetaMl: metas.aguaMl,
    refeicoes: refeicoes.length
  });

  const registradas = new Set(refeicoes.map((f) => f.meal));

  return c.json(conforme(contract.me.today.out, {
    score,
    kcal: { consumed: kcal, target: metas.kcal },
    protein: { consumed: proteina, target: metas.proteinaG },
    waterMl: { consumed: aguaMl, target: metas.aguaMl },
    meals: refeicoes.map((f) => ({
      id: f.id,
      meal: f.meal,
      description: f.description,
      kcal: f.kcal,
      loggedAt: isoObrigatorio(f.loggedAt)
    })),
    nextMeal: await proximaRefeicao(usuario.id, registradas, metas.kcal)
  }));
});

/* ======================================================================== */
/*  POST /api/me/food-log                                                   */
/* ======================================================================== */

r.post("/food-log", async (c) => {
  const entrada = await body(c, contract.me.logFood.in);
  const usuario = usuarioAtual(c);

  /* Sem kcal informada, estimamos pelo texto: a tela não pode ficar em
     zero esperando a IA. A estimativa é grosseira de propósito. */
  const estimado = estimarRefeicao(entrada.meal, entrada.description);
  const kcal = entrada.kcal ?? estimado.kcal;
  const macros = {
    protein: Math.round(entrada.macros?.protein ?? estimado.protein),
    carb: Math.round(entrada.macros?.carb ?? estimado.carb),
    fat: Math.round(entrada.macros?.fat ?? estimado.fat)
  };

  const linha = await db.inserir(foodLogs, {
    userId: usuario.id,
    loggedAt: new Date(),
    meal: entrada.meal,
    description: entrada.description.trim(),
    kcal,
    proteinG: macros.protein,
    carbG: macros.carb,
    fatG: macros.fat
  });

  return c.json(conforme(contract.me.logFood.out, { id: linha.id, kcal, macros }));
});

/* ======================================================================== */
/*  POST /api/me/water                                                      */
/* ======================================================================== */

r.post("/water", async (c) => {
  const entrada = await body(c, contract.me.logWater.in);
  const usuario = usuarioAtual(c);

  await db.inserir(waterLogs, { userId: usuario.id, loggedAt: new Date(), ml: entrada.ml });

  return c.json(conforme(contract.me.logWater.out, { totalMl: await aguaDeHoje(usuario.id) }));
});

/* ======================================================================== */
/*  GET /api/me/progress?range=                                             */
/* ======================================================================== */

r.get("/progress", async (c) => {
  const usuario = usuarioAtual(c);
  const entrada = contract.me.progress.in.safeParse({ range: c.req.query("range") ?? "30d" });
  if (!entrada.success) {
    throw new AppError("dados_invalidos", "Período inválido. Use 7d, 30d, 3m, 6m ou 1y.", { range: "Período inválido." });
  }

  const janela = faixa(entrada.data.range);
  const medidas = await db.buscar(
    measurements,
    { userId: usuario.id, takenAt: { gte: janela.inicio, lt: janela.fim } },
    { ordem: { campo: "takenAt", dir: "asc" } }
  );

  /* A sequência olha mais para trás do que a janela pedida: quem abre o
     gráfico de 7 dias continua querendo ver a sequência verdadeira. */
  const registros = await datasDeRegistro(usuario.id, Math.max(janela.dias, 400));

  return c.json(conforme(contract.me.progress.out, {
    weight: medidas
      .filter((m) => m.weightKg !== null)
      .map((m) => ({ at: isoObrigatorio(m.takenAt), kg: gramasParaKg(m.weightKg) as number })),
    measurements: medidas.map((m) => ({
      at: isoObrigatorio(m.takenAt),
      waist: mmParaCm(m.waistCm),
      hip: mmParaCm(m.hipCm),
      arm: mmParaCm(m.armCm)
    })),
    streakDays: sequenciaAtual(registros),
    /* `aderenciaPct` já é dias-com-registro ÷ dias da janela. */
    loggedDays: Math.round((aderenciaPct(registros, janela.dias) / 100) * janela.dias),
    totalDays: janela.dias
  }));
});

/* ======================================================================== */
/*  POST /api/me/measurements                                               */
/* ======================================================================== */

r.post("/measurements", async (c) => {
  const entrada = await body(c, contract.me.addMeasurement.in);
  const usuario = usuarioAtual(c);

  const nada = entrada.weightKg === undefined && entrada.waistCm === undefined
    && entrada.hipCm === undefined && entrada.armCm === undefined;
  if (nada) {
    throw new AppError("dados_invalidos", "Informe pelo menos uma medida.", { weightKg: "Informe o peso ou uma medida." });
  }

  const linha = await db.inserir(measurements, {
    userId: usuario.id,
    takenAt: new Date(),
    weightKg: entrada.weightKg === undefined ? null : Math.round(entrada.weightKg * 1000),   /* gramas */
    waistCm: entrada.waistCm === undefined ? null : Math.round(entrada.waistCm * 10),        /* milímetros */
    hipCm: entrada.hipCm === undefined ? null : Math.round(entrada.hipCm * 10),
    armCm: entrada.armCm === undefined ? null : Math.round(entrada.armCm * 10),
    note: entrada.note ?? null
  });

  /* Peso novo muda as metas: recalcula o perfil para a tela "Hoje" não
     ficar com a meta da pesagem anterior. */
  if (entrada.weightKg !== undefined) await recalcularMetasDoPerfil(usuario);

  return c.json(conforme(contract.me.addMeasurement.out, { id: linha.id }));
});

/* ======================================================================== */
/*  GET /api/me/shopping-list  |  PATCH /api/me/shopping-list               */
/* ======================================================================== */

type ItemCompra = { group: string; name: string; qty: string; cents: number; done: boolean };

const semanaCorrente = (): string => chaveDoDia(inicioDaSemana());

r.get("/shopping-list", async (c) => {
  const usuario = usuarioAtual(c);
  const weekStart = semanaCorrente();
  const lista = await db.primeiro(shoppingLists, { userId: usuario.id, weekStart });

  const itens = (lista?.items ?? []) as ItemCompra[];
  return c.json(conforme(contract.me.shoppingList.out, {
    id: lista?.id ?? null,
    weekStart,
    estimatedCents: lista?.estimatedCents ?? 0,
    items: itens.map((i) => ({
      group: i.group ?? "Outros",
      name: i.name ?? "",
      qty: i.qty ?? "",
      cents: Math.max(0, Math.round(i.cents ?? 0)),
      done: Boolean(i.done)
    }))
  }));
});

r.patch("/shopping-list", async (c) => {
  const entrada = await body(c, contract.me.toggleShoppingItem.in);
  const usuario = usuarioAtual(c);
  const weekStart = semanaCorrente();

  const lista = await db.primeiro(shoppingLists, { userId: usuario.id, weekStart });
  if (!lista) throw new AppError("nao_encontrado", "Você ainda não tem lista de compras desta semana.");

  const itens = [...((lista.items ?? []) as ItemCompra[])];
  const item = itens[entrada.index];
  if (!item) {
    throw new AppError("dados_invalidos", "Este item não está na lista.", { index: "Item inexistente." });
  }

  itens[entrada.index] = { ...item, done: entrada.done };
  await db.atualizar(shoppingLists, { id: lista.id }, { items: itens });

  return c.json(conforme(contract.me.toggleShoppingItem.out, { ok: true as const }));
});

/* ======================================================================== */
/*  GET /api/me/profile  |  PUT /api/me/profile                             */
/* ======================================================================== */

/** Recalcula e grava as três metas a partir do perfil e da última pesagem. */
async function recalcularMetasDoPerfil(usuario: Usuario): Promise<{ kcal: number; proteinaG: number; aguaMl: number }> {
  const perfil = await db.primeiro(profiles, { userId: usuario.id });
  const medida = await ultimaMedida(usuario.id);
  const metas = calcularMetas({
    sexo: perfil?.sex,
    nascimento: perfil?.birthDate ?? null,
    alturaCm: perfil?.heightCm ?? null,
    pesoKg: gramasParaKg(medida?.weightKg ?? null),
    objetivo: perfil?.goal,
    atividade: perfil?.activityLevel
  });
  const patch = {
    kcalTarget: metas.kcal,
    proteinTargetG: metas.proteinaG,
    waterTargetMl: metas.aguaMl,
    updatedAt: new Date()
  };
  if (perfil) await db.atualizar(profiles, { userId: usuario.id }, patch);
  else await db.inserir(profiles, { userId: usuario.id, restrictions: [], dislikes: [], ...patch });
  return { kcal: metas.kcal, proteinaG: metas.proteinaG, aguaMl: metas.aguaMl };
}

r.get("/profile", async (c) => {
  const usuario = usuarioAtual(c);
  const perfil = await db.primeiro(profiles, { userId: usuario.id });
  const medida = await ultimaMedida(usuario.id);
  const metas = await metasDe(usuario);

  return c.json(conforme(contract.me.getProfile.out, {
    name: usuario.name,
    email: usuario.email,
    role: usuario.role,
    birthDate: perfil?.birthDate ?? null,
    sex: perfil?.sex ?? null,
    heightCm: perfil?.heightCm ?? null,
    goal: perfil?.goal ?? null,
    activityLevel: perfil?.activityLevel ?? null,
    dietStyle: perfil?.dietStyle ?? null,
    restrictions: perfil?.restrictions ?? [],
    dislikes: perfil?.dislikes ?? [],
    kcalTarget: metas.kcal,
    proteinTargetG: metas.proteinaG,
    waterTargetMl: metas.aguaMl,
    weightKg: gramasParaKg(medida?.weightKg ?? null),
    lastMeasuredAt: iso(medida?.takenAt ?? null),
    updatedAt: iso(perfil?.updatedAt ?? null)
  }));
});

r.put("/profile", async (c) => {
  const entrada = await body(c, contract.me.saveProfile.in);
  const usuario = usuarioAtual(c);

  /* Só o que veio no corpo é tocado: salvar "objetivo" não apaga a altura. */
  const patch = {
    birthDate: entrada.birthDate,
    sex: entrada.sex,
    heightCm: entrada.heightCm,
    goal: entrada.goal,
    activityLevel: entrada.activityLevel,
    dietStyle: entrada.dietStyle,
    restrictions: entrada.restrictions,
    dislikes: entrada.dislikes,
    updatedAt: new Date()
  };

  const existe = await db.primeiro(profiles, { userId: usuario.id });
  if (existe) {
    await db.atualizar(profiles, { userId: usuario.id }, patch);
  } else {
    await db.inserir(profiles, {
      userId: usuario.id,
      ...patch,
      restrictions: entrada.restrictions ?? [],
      dislikes: entrada.dislikes ?? []
    });
  }

  const metas = await recalcularMetasDoPerfil(usuario);
  return c.json(conforme(contract.me.saveProfile.out, {
    ok: true as const,
    kcalTarget: metas.kcal,
    proteinTargetG: metas.proteinaG,
    waterTargetMl: metas.aguaMl
  }));
});

export default r;
