/* =========================================================================
   Nutri&Live — testes da ponte de IA

   Rode com:
     cd app && node --import tsx --test test/ai.test.ts

   (O `npm test` do projeto usa `node --test --experimental-strip-types`, que
   ainda não aceita propriedade de parâmetro em construtor — e `seguranca.ts`
   usa isso em `ViolacaoClinica`. Por isso o `--import tsx`, que é o mesmo
   `node --test` com o resolvedor de TypeScript do projeto.)

   O que estes testes provam, na ordem do que mais importa:
   1. restrição é filtro rígido — nenhum laticínio para quem tem lactose;
   2. as calorias de cada dia fecham na meta dentro da tolerância;
   3. os macros batem com as calorias em item, refeição e dia (4/4/9);
   4. perfil com sinal de cautela NÃO gera plano automático;
   5. a geração é determinística;
   6. a rota cria job, grava plano e o callback é autenticado e idempotente.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

import { ALIMENTOS, kcalDe } from "../server/ai/alimentos.js";
import {
  montarBloqueio, textoViola, detectarSinaisDeCautela, ViolacaoClinica
} from "../server/ai/seguranca.js";
import {
  gerarPlano, gerarReceitas, metasDoPerfil, baseSegura, TOLERANCIA_KCAL
} from "../server/ai/local.js";
import type {
  ContextoGeracao, PerfilNutricional, PlanoAlimentar
} from "../server/ai/tipos.js";

/* ----------------------------- apoio ----------------------------------- */

const perfilBase = (extra: Partial<PerfilNutricional> = {}): PerfilNutricional => ({
  birthDate: "1991-04-18",
  sex: "feminino",
  heightCm: 164,
  weightKg: 78.4,
  goal: "emagrecer",
  activityLevel: "leve",
  dietStyle: "tradicional",
  restrictions: [],
  dislikes: [],
  ...extra
});

const contexto = (perfil: PerfilNutricional, extra: Partial<ContextoGeracao> = {}): ContextoGeracao => ({
  userId: "11111111-1111-4111-8111-111111111111",
  nomeUsuario: "Mariana Alves Ribeiro",
  perfil,
  solicitanteUserId: "11111111-1111-4111-8111-111111111111",
  temNutricionistaVinculada: false,
  semente: "semente-de-teste",
  dataBase: "2026-10-05",
  ...extra
});

const TOKEN_WEBHOOK = "token-de-teste-1234567890";

const itens = (p: PlanoAlimentar) => p.dias.flatMap((d) => d.refeicoes.flatMap((r) => r.itens));

/* ======================================================================== */
/*  1. restrição é filtro rígido                                            */
/* ======================================================================== */

test("plano de quem tem restrição a lactose não traz nenhum laticínio", () => {
  const perfil = perfilBase({ restrictions: ["intolerância a lactose"] });
  const plano = gerarPlano(contexto(perfil), { kind: "plano", days: 7 });
  const bloq = montarBloqueio(perfil);

  /* a) nenhum alimento do setor Laticínios, nem nada com etiqueta de leite */
  const proibidas = new Set(["lactose", "leite"]);
  for (const item of itens(plano)) {
    const a = ALIMENTOS.find((x) => x.id === item.alimentoId);
    assert.ok(a, `item ${item.nome} não está na base`);
    assert.notEqual(a!.setor, "Laticínios", `laticínio no plano: ${item.nome}`);
    for (const e of a!.etiquetas) {
      assert.ok(!proibidas.has(e), `item com etiqueta ${e}: ${item.nome}`);
    }
  }

  /* b) nem na lista de compras, nas receitas ou nos textos de preparo —
        é o que `validarPlano` varre, e é por isso que o gerador tem de
        recusar até "Couve-manteiga refogada", que não tem etiqueta de leite
        mas tem a palavra "manteiga" no nome. */
  const textos = [
    ...itens(plano).map((i) => i.nome),
    ...plano.dias.flatMap((d) => d.refeicoes.flatMap((r) => [r.titulo, ...r.preparo])),
    ...plano.listaDeCompras.items.map((i) => i.name),
    ...plano.receitas.flatMap((r) => [r.title, ...r.ingredients, ...r.steps])
  ];
  for (const t of textos) {
    const achado = textoViola(t, bloq);
    assert.equal(achado, null, `texto viola a restrição (${achado?.termo}): ${t}`);
  }

  /* c) e a lista de compras não tem seção de laticínios */
  assert.ok(!plano.listaDeCompras.items.some((i) => i.group === "Laticínios"));
});

test("restrição vegana tira todo alimento de origem animal", () => {
  const perfil = perfilBase({ dietStyle: "vegana", weightKg: 64, heightCm: 168 });
  const plano = gerarPlano(contexto(perfil), { kind: "plano", days: 3 });
  for (const item of itens(plano)) {
    const a = ALIMENTOS.find((x) => x.id === item.alimentoId)!;
    assert.ok(
      !a.etiquetas.includes("origem_animal"),
      `alimento de origem animal no plano vegano: ${item.nome}`
    );
  }
});

/* ======================================================================== */
/*  2. as calorias fecham na meta                                           */
/* ======================================================================== */

test("as calorias de cada dia fecham na meta dentro da tolerância", () => {
  const casos: PerfilNutricional[] = [
    perfilBase(),
    perfilBase({ sex: "masculino", heightCm: 183, weightKg: 71.5, goal: "ganhar_massa", activityLevel: "intenso", birthDate: "1996-02-09" }),
    perfilBase({ goal: "manter", activityLevel: "sedentario" }),
    perfilBase({ restrictions: ["glúten", "lactose"] }),
    perfilBase({ dietStyle: "vegetariana", weightKg: 59.8, heightCm: 161 }),
    perfilBase({ sex: "masculino", weightKg: 101.3, heightCm: 170, goal: "emagrecer", activityLevel: "leve", birthDate: "1988-04-04" })
  ];

  for (const perfil of casos) {
    const metas = metasDoPerfil(perfil);
    const plano = gerarPlano(contexto(perfil), { kind: "plano", days: 3 });
    assert.equal(plano.metas.kcal, metas.kcal);

    for (const dia of plano.dias) {
      const desvio = Math.abs(dia.kcal - metas.kcal) / metas.kcal;
      assert.ok(
        desvio <= TOLERANCIA_KCAL,
        `dia ${dia.dia}: ${dia.kcal} kcal contra meta ${metas.kcal} (${(desvio * 100).toFixed(2)}% > ${TOLERANCIA_KCAL * 100}%)`
      );
      /* e a soma das refeições é exatamente o total do dia */
      const somaRefeicoes = dia.refeicoes.reduce((s, r) => s + r.kcal, 0);
      assert.equal(somaRefeicoes, dia.kcal, `dia ${dia.dia}: soma das refeições ≠ total`);
    }
  }
});

/* ======================================================================== */
/*  3. os macros batem com as calorias                                      */
/* ======================================================================== */

test("macros batem com as calorias em item, refeição e dia (4/4/9)", () => {
  const perfil = perfilBase({ restrictions: ["lactose"], dislikes: ["jiló"] });
  const plano = gerarPlano(contexto(perfil), { kind: "plano", days: 7 });

  for (const dia of plano.dias) {
    for (const r of dia.refeicoes) {
      for (const i of r.itens) {
        assert.equal(i.kcal, kcalDe(i.macros.protein, i.macros.carb, i.macros.fat), `item ${i.nome}`);
      }
      assert.equal(r.kcal, kcalDe(r.macros.protein, r.macros.carb, r.macros.fat), `refeição ${r.titulo}`);
      assert.equal(r.kcal, r.itens.reduce((s, i) => s + i.kcal, 0), `soma dos itens de ${r.titulo}`);
      for (const chave of ["protein", "carb", "fat"] as const) {
        assert.equal(
          r.macros[chave],
          r.itens.reduce((s, i) => s + i.macros[chave], 0),
          `${chave} da refeição ${r.titulo}`
        );
      }
    }
    assert.equal(dia.kcal, kcalDe(dia.macros.protein, dia.macros.carb, dia.macros.fat), `dia ${dia.dia}`);
  }

  /* proteína plausível por quilo — a guarda clínica recusa fora de 0,5 a 3,0 */
  for (const dia of plano.dias) {
    const porKg = dia.macros.protein / perfil.weightKg!;
    assert.ok(porKg >= 0.5 && porKg <= 3.0, `dia ${dia.dia}: ${porKg.toFixed(2)} g/kg de proteína`);
  }

  /* as receitas também fecham */
  for (const r of plano.receitas) {
    assert.equal(r.kcal, kcalDe(r.macros.protein, r.macros.carb, r.macros.fat), `receita ${r.title}`);
  }
});

/* ======================================================================== */
/*  4. sinal de cautela não gera plano automático                           */
/* ======================================================================== */

test("perfil com sinal de cautela não gera plano automático", async () => {
  const { orientacaoSePreciso } = await import("../server/ai/provedor.js");

  const casos: { nome: string; perfil: PerfilNutricional; sinal: string }[] = [
    { nome: "gestante", perfil: perfilBase({ pregnant: true }), sinal: "gestacao" },
    { nome: "amamentando", perfil: perfilBase({ breastfeeding: true }), sinal: "amamentacao" },
    { nome: "menor de idade", perfil: perfilBase({ birthDate: "2012-03-01" }), sinal: "menor_de_idade" },
    { nome: "diabetes declarada", perfil: perfilBase({ restrictions: ["sou diabética tipo 2"] }), sinal: "diabetes" },
    { nome: "histórico de transtorno alimentar", perfil: perfilBase({ conditions: ["histórico de bulimia"] }), sinal: "transtorno_alimentar" },
    { nome: "doença renal", perfil: perfilBase({ conditions: ["insuficiência renal crônica"] }), sinal: "doenca_renal" },
    { nome: "IMC crítico", perfil: perfilBase({ weightKg: 125, heightCm: 164 }), sinal: "imc_critico" }
  ];

  for (const caso of casos) {
    const sinais = detectarSinaisDeCautela(caso.perfil);
    assert.ok(sinais.length > 0, `${caso.nome}: nenhum sinal detectado`);
    assert.ok(sinais.some((s) => s.id === caso.sinal), `${caso.nome}: esperava o sinal ${caso.sinal}`);

    const orientacao = orientacaoSePreciso(contexto(caso.perfil));
    assert.ok(orientacao, `${caso.nome}: deveria vir orientação profissional`);
    assert.equal(orientacao!.tipo, "orientacao_profissional");
    assert.ok(orientacao!.mensagem.length > 40);
    assert.ok(orientacao!.comoProsseguir.length >= 3);
  }

  /* contraprova: perfil adulto saudável não dispara cautela */
  assert.equal(detectarSinaisDeCautela(perfilBase()).length, 0);
  assert.equal(orientacaoSePreciso(contexto(perfilBase())), null);
});

/* ======================================================================== */
/*  5. determinismo e recusa honesta                                        */
/* ======================================================================== */

test("mesma entrada gera exatamente a mesma saída", () => {
  const perfil = perfilBase({ restrictions: ["lactose"] });
  const a = gerarPlano(contexto(perfil), { kind: "plano", days: 3 });
  const b = gerarPlano(contexto(perfil), { kind: "plano", days: 3 });
  assert.deepEqual(a, b);

  const r1 = gerarReceitas(contexto(perfil), { kind: "receita", ingredients: "frango, arroz, brócolis" });
  const r2 = gerarReceitas(contexto(perfil), { kind: "receita", ingredients: "frango, arroz, brócolis" });
  assert.deepEqual(r1, r2);

  /* semente diferente, plano diferente */
  const c = gerarPlano(contexto(perfil, { semente: "outra-semente" }), { kind: "plano", days: 3 });
  assert.notDeepEqual(a.dias, c.dias);
});

test("restrição que zera a base recusa com mensagem em português, sem plano pela metade", () => {
  const perfil = perfilBase({
    restrictions: ["vegano", "soja", "oleaginosas", "amendoim", "milho", "glúten", "açúcar"]
  });
  const bloq = montarBloqueio(perfil);
  const sobrou = baseSegura(bloq);
  assert.ok(sobrou.every((a) => !a.etiquetas.includes("origem_animal")));
  try {
    const plano = gerarPlano(contexto(perfil), { kind: "plano", days: 1 });
    /* Se conseguiu montar, tem de estar correto do mesmo jeito. */
    for (const i of itens(plano)) {
      assert.equal(textoViola(i.nome, bloq), null, `item proibido: ${i.nome}`);
    }
  } catch (e) {
    assert.ok(e instanceof ViolacaoClinica, `erro inesperado: ${String(e)}`);
    assert.match(e.mensagem, /[a-zçãé]/i);
    assert.ok(e.mensagem.length > 30, "mensagem de recusa precisa explicar o motivo");
  }
});

test("receitas respeitam a restrição e marcam o que não deu para usar", () => {
  const perfil = perfilBase({ restrictions: ["lactose"] });
  const bloq = montarBloqueio(perfil);
  const saida = gerarReceitas(contexto(perfil), {
    kind: "receita",
    ingredients: "queijo, leite, frango, arroz, tomate, foguete"
  });
  assert.ok(saida.receitas.length > 0);
  for (const r of saida.receitas) {
    for (const t of [r.title, ...r.ingredients, ...r.steps]) {
      assert.equal(textoViola(t, bloq), null, `receita viola a restrição: ${t}`);
    }
    assert.equal(r.kcal, kcalDe(r.macros.protein, r.macros.carb, r.macros.fat));
  }
  const ignorados = saida.ignorados.map((i) => i.termo);
  assert.ok(ignorados.includes("queijo"), "queijo deveria ter sido recusado pela restrição");
  assert.ok(ignorados.includes("foguete"), "ingrediente fora da base deveria ser avisado");
  assert.ok(saida.usados.includes("frango"));
});

/* ======================================================================== */
/*  6. status inicial e rotas                                               */
/* ======================================================================== */

test("com nutricionista vinculada o plano nasce rascunho; sem ela, ativo e educativo", () => {
  const perfil = perfilBase();
  const comNutri = gerarPlano(contexto(perfil, { temNutricionistaVinculada: true }), { kind: "plano", days: 1 });
  assert.equal(comNutri.status, "rascunho");
  assert.equal(comNutri.materialEducativo, false);

  const sozinha = gerarPlano(contexto(perfil, { temNutricionistaVinculada: false }), { kind: "plano", days: 1 });
  assert.equal(sozinha.status, "ativo");
  assert.equal(sozinha.materialEducativo, true);
  assert.ok(sozinha.avisos.some((a) => a.includes("material educativo")));
});

test("rotas: job de plano é criado, processado e gravado; callback exige token e é idempotente", async () => {
  /* `env` é lido uma vez, na carga do módulo; aqui a gente injeta o segredo
     do webhook direto no objeto, que é o que a rota consulta. */
  const { env } = await import("../server/lib/env.js");
  (env as { N8N_WEBHOOK_TOKEN: string }).N8N_WEBHOOK_TOKEN = TOKEN_WEBHOOK;

  const { db, bancoPronto } = await import("../server/db/index.js");
  const { aiJobs, mealPlans, profiles, sessions, shoppingLists, users } = await import("../server/db/schema.js");
  const { digerir, COOKIE_SESSAO } = await import("../server/auth/sessao.js");
  const app = (await import("../server/index.js")).default;
  await bancoPronto();

  /* usuário pessoal, assinatura ativa, restrição a lactose */
  const { subscriptions, plans } = await import("../server/db/schema.js");
  const catalogo = (await db.buscar(plans, { segment: "pessoal" }, { limite: 1 }))[0]
    ?? (await db.buscar(plans, {}, { limite: 1 }))[0]!;
  const usuario = await db.inserir(users, {
    email: `teste.ia.${Date.now()}@exemplo.com.br`, name: "Mariana de Teste",
    role: "pessoal", status: "ativo", passwordHash: "x"
  });
  await db.inserir(profiles, {
    userId: usuario.id, birthDate: "1991-04-18", sex: "feminino", heightCm: 164,
    goal: "emagrecer", activityLevel: "leve", dietStyle: "tradicional",
    restrictions: ["lactose"], dislikes: []
  });
  await db.inserir(subscriptions, {
    userId: usuario.id, planKey: catalogo.key, status: "ativa", method: "credito",
    priceCents: catalogo.priceCents,
    currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000)
  });

  const token = `sessao-de-teste-${Date.now()}`;
  await db.inserir(sessions, {
    userId: usuario.id, tokenHash: digerir(token),
    expiresAt: new Date(Date.now() + 86_400_000)
  });
  const cabecalhos = { "content-type": "application/json", cookie: `${COOKIE_SESSAO}=${token}` };

  /* --- pedido de plano ------------------------------------------------- */
  const resposta = await app.fetch(new Request("http://local/api/ai/meal-plan", {
    method: "POST", headers: cabecalhos, body: JSON.stringify({ days: 3 })
  }));
  assert.equal(resposta.status, 200);
  const criado = await resposta.json() as { jobId: string; status: string };
  assert.ok(criado.jobId);
  assert.ok(["fila", "processando", "concluido"].includes(criado.status));

  /* --- o front consulta o job até terminar ----------------------------- */
  let job: { status: string; output: PlanoAlimentar | null; error: string | null } | null = null;
  for (let i = 0; i < 200; i++) {
    const r = await app.fetch(new Request(`http://local/api/ai/jobs/${criado.jobId}`, { headers: cabecalhos }));
    assert.equal(r.status, 200);
    job = await r.json() as typeof job;
    if (job!.status === "concluido" || job!.status === "erro") break;
    await new Promise((f) => setTimeout(f, 25));
  }
  assert.equal(job!.error, null);
  assert.equal(job!.status, "concluido");
  assert.equal(job!.output!.tipo, "plano_alimentar");
  assert.equal(job!.output!.dias.length, 3);

  /* --- o plano foi gravado, com lista de compras ------------------------ */
  const gravados = await db.buscar(mealPlans, { userId: usuario.id });
  assert.equal(gravados.length, 1);
  assert.equal(gravados[0]!.status, "ativo");       /* sem nutricionista vinculada */
  assert.equal(gravados[0]!.source, "ia");
  const listas = await db.buscar(shoppingLists, { userId: usuario.id });
  assert.equal(listas.length, 1);
  assert.ok(listas[0]!.items.length > 0);
  assert.ok(!listas[0]!.items.some((i) => i.group === "Laticínios"));

  /* --- job de outra pessoa não é legível ------------------------------- */
  const intruso = await db.inserir(users, {
    email: `intruso.${Date.now()}@exemplo.com.br`, name: "Intruso",
    role: "pessoal", status: "ativo", passwordHash: "x"
  });
  const tokenIntruso = `intruso-${Date.now()}`;
  await db.inserir(sessions, {
    userId: intruso.id, tokenHash: digerir(tokenIntruso), expiresAt: new Date(Date.now() + 86_400_000)
  });
  const espiada = await app.fetch(new Request(`http://local/api/ai/jobs/${criado.jobId}`, {
    headers: { cookie: `${COOKIE_SESSAO}=${tokenIntruso}` }
  }));
  assert.equal(espiada.status, 403);

  /* --- callback: sem token, recusa ------------------------------------- */
  const semToken = await app.fetch(new Request("http://local/api/ai/callback", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jobId: criado.jobId, status: "concluido", output: {} })
  }));
  assert.equal(semToken.status, 401);

  /* --- callback: com token, idempotente -------------------------------- */
  const antes = (await db.buscar(mealPlans, { userId: usuario.id })).length;
  const repetido = await app.fetch(new Request("http://local/api/ai/callback", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nutrielive-token": TOKEN_WEBHOOK },
    body: JSON.stringify({ jobId: criado.jobId, status: "concluido", output: { tipo: "lixo" }, tokensIn: 10, tokensOut: 20 })
  }));
  assert.equal(repetido.status, 200);
  assert.deepEqual(await repetido.json(), { ok: true });
  assert.equal((await db.buscar(mealPlans, { userId: usuario.id })).length, antes, "callback repetido não pode duplicar plano");
  const depois = await db.primeiro(aiJobs, { id: criado.jobId });
  assert.equal(depois!.status, "concluido");
  assert.equal(depois!.tokensIn, 10);

  /* --- callback com saída reprovada vira erro, sem gravar nada --------- */
  const outro = await db.inserir(aiJobs, {
    userId: usuario.id, requestedByUserId: usuario.id, kind: "plano", status: "fila",
    input: {
      pedido: { kind: "plano", days: 1 },
      contexto: {
        userId: usuario.id, nomeUsuario: usuario.name,
        perfil: { restrictions: ["lactose"], dislikes: [], sex: "feminino", heightCm: 164, weightKg: 78.4, goal: "emagrecer", activityLevel: "leve", birthDate: "1991-04-18" },
        solicitanteUserId: usuario.id, temNutricionistaVinculada: false,
        semente: "callback", dataBase: "2026-10-05"
      }
    } as never
  });
  const reprovado = await app.fetch(new Request("http://local/api/ai/callback", {
    method: "POST",
    headers: { "content-type": "application/json", "x-nutrielive-token": TOKEN_WEBHOOK },
    body: JSON.stringify({
      jobId: outro.id, status: "concluido",
      output: {
        tipo: "plano_alimentar", versao: 1, titulo: "Plano torto",
        dias: [{ dia: 1, data: "2026-10-05", kcal: 1700, macros: { protein: 100, carb: 200, fat: 55 },
          refeicoes: [{ tipo: "cafe", rotulo: "Café da manhã", horario: "07:00", titulo: "Pão com requeijão",
            kcal: 1700, macros: { protein: 100, carb: 200, fat: 55 },
            itens: [{ alimentoId: "requeijao", nome: "Requeijão cremoso", gramas: 30, porcao: "2 colheres", kcal: 1700, macros: { protein: 100, carb: 200, fat: 55 } }],
            preparo: [] }] }],
        receitas: [], listaDeCompras: { weekStart: "2026-10-05", estimatedCents: 0, items: [] }
      }
    })
  }));
  assert.equal(reprovado.status, 200);
  const jobReprovado = await db.primeiro(aiJobs, { id: outro.id });
  assert.equal(jobReprovado!.status, "erro");
  assert.match(jobReprovado!.error ?? "", /restri/i);
  assert.equal((await db.buscar(mealPlans, { userId: usuario.id })).length, antes, "saída reprovada não pode gravar plano");
});
