/* =========================================================================
   Nutri&Live — os fluxos do n8n, testados sem n8n

   Um fluxo do n8n é configuração: um JSON com nós de código dentro. Ele
   quebra calado — ninguém compila JSON — e o jeito de descobrir seria um
   usuário vendo "a IA não conseguiu gerar". Então aqui o nó de código de
   cada fluxo é EXECUTADO fora do n8n, com o payload de verdade que
   `n8n.ts` monta, uma saída de modelo falsa, e o resultado passa pelo
   validador clínico real.

   O que este teste pegou quando foi escrito, e por isso existe:
     1. kcal somada de `kcal100` em vez de derivada dos macros (4P+4C+9G):
        o servidor confere essa igualdade com 1 kcal de tolerância e
        recusava o plano por arredondamento;
     2. título do modelo passando cru — "Iogurte com fruta" num plano sem
        lactose derrubava o plano INTEIRO, mesmo com o alimento certo;
     3. desvio de calorias de 8% a 15% por dia, porque modelo de linguagem
        não fecha conta: sem a calibragem do fluxo, quase todo plano seria
        descartado.

   Os ajudantes do n8n (`$input`, `$`, `$env`, `$execution`) são simulados
   com o mínimo que os nós usam.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { montarBloqueio, termosBloqueados, validarPlano, validarReceitas } from "../server/ai/seguranca.js";
import { baseSegura, macrosMeta, TOLERANCIA_KCAL } from "../server/ai/local.js";
import { metasDoPerfil, contextoDeValidacao } from "../server/ai/provedor.js";
import { kcal100 } from "../server/ai/alimentos.js";
import type { PerfilNutricional } from "../server/ai/tipos.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const fluxo = (arquivo: string) => JSON.parse(readFileSync(join(RAIZ, "n8n", arquivo), "utf8"));

/** Roda o `jsCode` de um nó, com os ajudantes do n8n simulados. */
function rodarNo(
  arquivo: string, nomeNo: string, entradaDoNo: unknown, outrosNos: Record<string, unknown> = {}
): any {
  const f = fluxo(arquivo);
  const no = f.nodes.find((x: any) => x.name === nomeNo);
  assert.ok(no, `o fluxo ${arquivo} não tem o nó "${nomeNo}" — renomear nó quebra o fluxo todo`);
  const contexto = {
    $input: { first: () => ({ json: entradaDoNo }) },
    $: (nome: string) => ({ first: () => ({ json: outrosNos[nome] ?? {} }) }),
    $execution: { id: "exec-de-teste" },
    $env: { NUTRIELIVE_TOKEN: "segredo-de-teste" },
    console, Date, Math, JSON, Map, Set, Array, Object, Number, String, RegExp,
    isNaN, parseInt, parseFloat
  };
  return vm.runInNewContext(`(function(){${no.parameters.jsCode}})()`, contexto);
}

/* --------------------------- pessoa de teste ---------------------------- */
/* Com restrição de lactose de propósito: é a restrição que mais aparece em
   nome de prato brasileiro, então é a que mais testa a higiene de texto. */
const perfil: PerfilNutricional = {
  birthDate: "1992-03-15", sex: "feminino", heightCm: 166, weightKg: 72.5,
  goal: "emagrecer", activityLevel: "moderado", dietStyle: "tudo",
  restrictions: ["lactose"], dislikes: ["berinjela"]
};

const bloq = montarBloqueio(perfil);
const metas = metasDoPerfil(perfil);
const permitidos = baseSegura(bloq);

/** O mesmo payload que `montarPayload` em `ai/n8n.ts` entrega ao fluxo. */
const payload = (extra: Record<string, unknown> = {}) => ({
  jobId: "11111111-1111-4111-8111-111111111111",
  kind: "plano",
  callbackUrl: "http://localhost:8787/api/ai/callback",
  usuario: { id: "u1", primeiroNome: "Camila" },
  perfil: {
    sexo: perfil.sex, idadeAnos: 34, alturaCm: perfil.heightCm, pesoKg: perfil.weightKg,
    objetivo: metas.objetivo, atividade: perfil.activityLevel, estiloAlimentar: perfil.dietStyle
  },
  metas: {
    kcal: metas.kcal, proteinaG: metas.proteinaG, aguaMl: metas.aguaMl,
    macros: macrosMeta(metas.kcal, metas.proteinaG),
    toleranciaKcalPct: Math.round(TOLERANCIA_KCAL * 100)
  },
  restricoes: {
    declaradas: bloq.declaradas, etiquetasBloqueadas: [...bloq.etiquetas],
    rotulos: bloq.rotulos, evitar: bloq.evitar, termosProibidos: termosBloqueados(bloq)
  },
  alimentosPermitidos: permitidos.map((a) => ({
    id: a.id, nome: a.nome, papel: a.papel, setor: a.setor,
    kcal100: Math.round(kcal100(a)),
    proteina100: a.proteina, carbo100: a.carbo, gordura100: a.gordura,
    min: a.min, max: a.max, passo: a.passo,
    medida: `${a.medida.gramas} g = 1 ${a.medida.rotulo}`,
    nomeDeCompra: a.compra ?? a.nome, centavosPorKg: a.centavosPorKg
  })),
  pedido: { dias: 3, observacoes: null, temNutricionistaVinculada: false },
  dataBase: "2026-10-05",
  semente: "teste",
  ...extra
});

/* ------------------------ modelo de linguagem falso --------------------- */
/* Escolhe por papel e chuta a quantidade — que é exatamente o que um modelo
   de verdade faz. O título de um lanche diz "Iogurte" DE PROPÓSITO, para
   provar que a higiene do fluxo salva o plano de quem não pode lactose. */
const porPapel = (p: any, papel: string) => p.alimentosPermitidos.filter((a: any) => a.papel === papel);
const um = (lista: any[], i: number) => lista[i % lista.length];

function diaFalso(p: any, n: number) {
  const vagas: [string, string, [string, number][]][] = [
    ["cafe", "Pão com ovo e fruta", [["carboidrato", 0.22], ["proteina", 0.5], ["fruta", 0.9]]],
    ["lanche_manha", "Fruta com castanha", [["fruta", 0.4], ["gordura", 0.1]]],
    ["almoco", "Frango com arroz, feijão e salada", [["carboidrato", 0.6], ["proteina", 0.9], ["leguminosa", 0.3], ["vegetal", 0.5]]],
    ["lanche_tarde", "Iogurte com fruta", [["proteina", 0.2], ["fruta", 0.6]]],
    ["jantar", "Peixe com legumes", [["proteina", 0.7], ["vegetal", 0.8], ["carboidrato", 0.4]]]
  ];
  return {
    refeicoes: vagas.map(([tipo, titulo, escolhas]) => ({
      tipo, titulo, preparo: ["Tempere", "Cozinhe", "Sirva"],
      itens: escolhas.map(([papel, frac]) => {
        const lista = porPapel(p, papel);
        if (!lista.length) return null;
        const a = um(lista, Math.round(frac * 97) + n);
        return { alimentoId: a.id, gramas: Math.round((a.min + (a.max - a.min) * frac) / a.passo) * a.passo };
      }).filter(Boolean)
    }))
  };
}

const saidaDoModelo = (p: any) => ({
  titulo: "Plano de 3 dias — semana leve",
  dias: [1, 2, 3].map((n) => diaFalso(p, n))
});

const PLANO = "01-plano-alimentar.json";
const RECEITAS = "02-receitas.json";

/* ======================================================================== */
test("fluxo do plano: o que o nó monta é aceito pelo validador clínico", () => {
  const p = payload();
  const r = rodarNo(PLANO, "Montar plano", saidaDoModelo(p), {
    "Conferir token": p, Modelo: { tokenUsage: { promptTokens: 900, completionTokens: 400 } }
  });
  const plano = r[0].json.output;

  /* Não é "não lançou": é o validador de produção aceitando. */
  const validado = validarPlano(plano, contextoDeValidacao(perfil, metas));
  assert.equal(validado.dias.length, 3);

  /* A calibragem do fluxo é o que torna isto possível: sem ela o desvio
     ficava entre 8% e 15% e o plano inteiro era recusado. */
  assert.ok(
    Math.abs(validado.resumo.desvioKcalPct) <= Math.round(TOLERANCIA_KCAL * 100),
    `desvio de ${validado.resumo.desvioKcalPct}% passou da tolerância`
  );
});

test("fluxo do plano: título proibido pelo modelo não derruba o plano", () => {
  const p = payload();
  const r = rodarNo(PLANO, "Montar plano", saidaDoModelo(p), { "Conferir token": p, Modelo: {} });
  const plano = r[0].json.output;

  const titulos = plano.dias.flatMap((d: any) => d.refeicoes.map((x: any) => x.titulo));
  assert.ok(
    !titulos.some((t: string) => /iogurte/i.test(t)),
    `o fluxo deixou passar um título com termo proibido: ${titulos.join(" | ")}`
  );
  /* E o lanche continua existindo: higiene troca o texto, não apaga a refeição. */
  assert.ok(plano.dias[0].refeicoes.some((x: any) => x.tipo === "lanche_tarde"));
});

test("fluxo do plano: alimento inventado pelo modelo é descartado, não quebra o plano", () => {
  const p = payload();
  const sujo = JSON.parse(JSON.stringify(saidaDoModelo(p)));
  sujo.dias[0].refeicoes[0].itens.push({ alimentoId: "requeijao_cremoso_inventado", gramas: 30 });
  sujo.dias[0].refeicoes[0].itens.push({ alimentoId: "nao_existe_nada", gramas: 50 });

  const r = rodarNo(PLANO, "Montar plano", sujo, { "Conferir token": p, Modelo: {} });
  const plano = r[0].json.output;
  const ids = plano.dias.flatMap((d: any) => d.refeicoes.flatMap((x: any) => x.itens.map((i: any) => i.alimentoId)));
  assert.ok(!ids.includes("nao_existe_nada"));
  assert.ok(!ids.some((i: string) => i.includes("inventado")));
  validarPlano(plano, contextoDeValidacao(perfil, metas));   /* ainda válido */
});

test("fluxo do plano: a lista de compras sai com preço e na semana certa", () => {
  const p = payload();
  const r = rodarNo(PLANO, "Montar plano", saidaDoModelo(p), { "Conferir token": p, Modelo: {} });
  const lista = r[0].json.output.listaDeCompras;

  assert.ok(lista.items.length > 0);
  /* Sem `centavosPorKg` no payload a única saída do fluxo seria `cents: 0`,
     e a tela de compras diria "R$ 0,00" como se a feira fosse de graça. */
  assert.ok(lista.estimatedCents > 0, "lista de compras sem preço");
  assert.equal(lista.estimatedCents, lista.items.reduce((s: number, i: any) => s + i.cents, 0));
  assert.equal(lista.weekStart, "2026-10-05");   /* segunda da semana da dataBase */
  assert.ok(lista.items.every((i: any) => i.done === false));
});

test("fluxo do plano: as datas vêm da dataBase, não do relógio do n8n", () => {
  const p = payload();
  const r = rodarNo(PLANO, "Montar plano", saidaDoModelo(p), { "Conferir token": p, Modelo: {} });
  assert.deepEqual(r[0].json.output.dias.map((d: any) => d.data), ["2026-10-05", "2026-10-06", "2026-10-07"]);
});

test("fluxo do plano: com nutricionista vinculada nasce rascunho; sem ela, ativo e educativo", () => {
  const semNutri = payload();
  const comNutri = payload({ pedido: { dias: 3, observacoes: null, temNutricionistaVinculada: true } });

  const a = rodarNo(PLANO, "Montar plano", saidaDoModelo(semNutri), { "Conferir token": semNutri, Modelo: {} });
  assert.equal(a[0].json.output.status, "ativo");
  assert.equal(a[0].json.output.materialEducativo, true);

  const b = rodarNo(PLANO, "Montar plano", saidaDoModelo(comNutri), { "Conferir token": comNutri, Modelo: {} });
  assert.equal(b[0].json.output.status, "rascunho");
  assert.equal(b[0].json.output.materialEducativo, false);
});

test("fluxo das receitas: o que o nó monta é aceito pelo validador", () => {
  const p = payload({ kind: "receita", pedido: { ingredientes: "frango, arroz, tomate", maxMinutos: 30 } });
  const doModelo = {
    receitas: [1, 2, 3].map((n) => ({
      title: "Receita com iogurte",        /* proibido de propósito */
      timeMin: 20 + n,
      steps: ["Tempere o frango", "Refogue", "Sirva com arroz"],
      itens: [
        { alimentoId: porPapel(p, "proteina")[n]?.id, gramas: 120 },
        { alimentoId: porPapel(p, "carboidrato")[n]?.id, gramas: 100 },
        { alimentoId: porPapel(p, "vegetal")[n]?.id, gramas: 80 }
      ].filter((i) => i.alimentoId)
    }))
  };

  const r = rodarNo(RECEITAS, "Montar receitas", doModelo, { "Conferir token": p, Modelo: {} });
  const saida = r[0].json.output;

  validarReceitas(saida, contextoDeValidacao(perfil, metas));
  assert.ok(saida.receitas.length >= 1);
  assert.ok(!saida.receitas.some((x: any) => /iogurte/i.test(x.title)), "título proibido passou");

  for (const rec of saida.receitas) {
    /* O servidor exige `kcal === 4P + 4C + 9G` com 2 de tolerância. */
    const esperado = Math.round(rec.macros.protein * 4 + rec.macros.carb * 4 + rec.macros.fat * 9);
    assert.ok(Math.abs(rec.kcal - esperado) <= 2, `${rec.title}: ${rec.kcal} != ${esperado}`);
    /* Ingrediente é montado do nome permitido, nunca do texto do modelo:
       uma palavra inventada ali derrubaria o lote por restrição. */
    assert.ok(rec.ingredients.every((i: string) => /— \d+ g$/.test(i)), JSON.stringify(rec.ingredients));
  }
  /* Ingrediente pedido que a base não tem é explicado, não omitido. */
  assert.ok(saida.ignorados.some((i: any) => i.termo === "tomate"));
});

test("nó de segurança: o token do webhook é exigido nos dois fluxos", () => {
  for (const arquivo of [PLANO, RECEITAS]) {
    const corpo = payload();
    assert.doesNotThrow(() =>
      rodarNo(arquivo, "Conferir token", { headers: { "x-nutrielive-token": "segredo-de-teste" }, body: corpo }));
    assert.throws(
      () => rodarNo(arquivo, "Conferir token", { headers: { "x-nutrielive-token": "errado" }, body: corpo }),
      /Token do webhook inválido/,
      `${arquivo} aceitou token errado`
    );
    assert.throws(
      () => rodarNo(arquivo, "Conferir token", { headers: {}, body: corpo }),
      /Token do webhook inválido/,
      `${arquivo} aceitou chamada sem token`
    );
  }
});

test("os caminhos dos webhooks são os mesmos que o driver chama", async () => {
  /* Mudar o `path` de um nó Webhook sem mudar `CAMINHOS` em ai/n8n.ts faz o
     app bater numa URL que não existe, e a pessoa vê "a IA não respondeu". */
  const { CAMINHOS } = await import("../server/ai/n8n.js");
  const esperado: Record<string, string> = {
    [PLANO]: CAMINHOS.plano.replace(/^webhook\//, ""),
    [RECEITAS]: CAMINHOS.receita.replace(/^webhook\//, "")
  };
  for (const [arquivo, caminho] of Object.entries(esperado)) {
    const no = fluxo(arquivo).nodes.find((x: any) => x.name === "Webhook");
    assert.equal(no.parameters.path, caminho, `${arquivo}: path do webhook divergiu de CAMINHOS`);
  }
});
