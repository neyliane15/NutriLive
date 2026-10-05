/* =========================================================================
   Nutri&Live — a base de alimentos é a tabela oficial, não a opinião de
   ninguém

   A versão anterior deste arquivo não existia, e por isso 61 alimentos
   nasceram com valores escritos à mão "conforme a TACO". Ao conferir contra
   a tabela de verdade, cinco não existiam nela: a TACO só traz macarrão e
   grão-de-bico CRUS, traz polvilho e não goma hidratada, e não tem tilápia
   nem quinoa. Os números estavam lá, mas vinham de alguém.

   Este teste existe para que isso não volte. Ele não confere se a conta
   está "bonita": confere se cada número do produto sai da linha certa da
   planilha oficial.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { ALIMENTOS, POR_ID, kcal100, FONTE_DA_TABELA } from "../server/ai/alimentos.js";
import { CATALOGO } from "../server/ai/catalogo.js";

import TACO_JSON from "../server/ai/dados/taco-4a-edicao.json" with { type: "json" };
import POF_JSON from "../server/ai/dados/pof-medidas-caseiras.json" with { type: "json" };

const TACO = TACO_JSON as unknown as {
  fonte: string;
  alimentos: { numero: number; descricao: string; proteina: number | null;
               carboidrato: number | null; lipideos: number | null; kcal: number | null }[];
};
const POF = POF_JSON as unknown as {
  medidas: { codigo: number; alimento: string; medida: string; gramas: number }[];
};

const porNumero = new Map(TACO.alimentos.map((a) => [a.numero, a]));

test("a tabela oficial está completa e identificada", () => {
  assert.match(FONTE_DA_TABELA, /TACO.*NEPA\/UNICAMP/);
  assert.equal(TACO.alimentos.length, 597, "a TACO 4ª edição tem 597 alimentos");
  assert.ok(POF.medidas.length > 10_000, "a POF tem mais de dez mil medidas caseiras");
});

test("todo alimento do catálogo aponta para uma linha real da TACO", () => {
  for (const c of CATALOGO) {
    assert.ok(
      porNumero.has(c.taco),
      `${c.id} aponta para o número ${c.taco}, que não existe na TACO`
    );
  }
});

test("os macros de CADA alimento são os da linha da TACO, sem desvio", () => {
  for (const a of ALIMENTOS) {
    const linha = porNumero.get(a.fonte.numero)!;
    /* `null` na tabela é "não mediu"; para macro, zero é a leitura certa. */
    assert.equal(a.proteina, linha.proteina ?? 0, `${a.id}: proteína`);
    assert.equal(a.carbo, linha.carboidrato ?? 0, `${a.id}: carboidrato`);
    assert.equal(a.gordura, linha.lipideos ?? 0, `${a.id}: gordura`);
    assert.equal(a.fonte.descricao, linha.descricao, `${a.id}: descrição oficial`);
  }
});

test("nenhum alimento entra sem procedência", () => {
  for (const a of ALIMENTOS) {
    assert.equal(a.fonte.tabela, "TACO 4ª edição", `${a.id} sem tabela`);
    assert.ok(a.fonte.numero > 0, `${a.id} sem número`);
    assert.ok(a.fonte.descricao.length > 2, `${a.id} sem descrição oficial`);
  }
});

test("valores de referência conferidos à mão contra a planilha", () => {
  /* Seis pontos escolhidos por serem usados em quase todo plano. Os valores
     abaixo foram lidos da planilha original Taco_4a_edicao_2011.xls, aba
     "CMVCol taco3", e não daqui. */
  const esperado: Record<string, { p: number; c: number; g: number; taco: number }> = {
    arroz_branco_cozido:   { p: 2.5208166666666667, c: 28.059849999999994, g: 0.22699999999999998, taco: 3 },
    feijao_carioca_cozido: { p: 4.775, c: 13.591033333333334, g: 0.5423333333333334, taco: 561 },
    frango_peito_grelhado: { p: 32.03333333333334, c: 0, g: 2.4836666666666667, taco: 410 },
    ovo_cozido:            { p: 13.29375, c: 0.6149166666666736, g: 9.476333333333333, taco: 488 },
    banana_prata:          { p: 1.2681159420289856, c: 25.956884057971017, g: 0.065, taco: 182 },
    azeite_oliva:          { p: 0, c: 0, g: 100, taco: 260 }
  };
  for (const [id, e] of Object.entries(esperado)) {
    const a = POR_ID.get(id);
    assert.ok(a, `${id} sumiu do catálogo`);
    assert.equal(a.fonte.numero, e.taco, `${id}: número da TACO`);
    assert.ok(Math.abs(a.proteina - e.p) < 1e-9, `${id}: proteína ${a.proteina} ≠ ${e.p}`);
    assert.ok(Math.abs(a.carbo - e.c) < 1e-9, `${id}: carboidrato ${a.carbo} ≠ ${e.c}`);
    assert.ok(Math.abs(a.gordura - e.g) < 1e-9, `${id}: gordura ${a.gordura} ≠ ${e.g}`);
  }
});

test("a energia de Atwater não se afasta demais da energia da tabela", () => {
  /* O produto calcula kcal pelos macros (4/4/9) para a tela ficar coerente
     consigo mesma: as calorias que mostramos sempre fecham com os macros ao
     lado delas.

     A diferença contra a tabela tem uma causa conhecida e uma suspeita.
     A conhecida é a FIBRA: a TACO conta carboidrato "por diferença", então
     a fibra está dentro dele, e Atwater cobra 4 kcal por grama de uma coisa
     que o corpo quase não aproveita. Quanto mais fibra, maior o excesso —
     brócolis (3,4 g) dá 20%, feijão (8,5 g) dá mais.

     A suspeita é alimento casado com a linha ERRADA da tabela, que foi
     exatamente como o abadejo apareceu no lugar da tilápia.

     Por isso o teste separa as duas: desvio grande só passa quando a fibra
     explica. Sem fibra para explicar, é casamento errado. */
  for (const a of ALIMENTOS) {
    if (!a.kcalTaco) continue;
    /* Em alimento quase sem energia (chá, café, alface) a diferença é de
       arredondamento: 3 kcal contra 2 kcal são 26% e não significam nada.
       A porcentagem só diz algo quando há energia para medir. */
    if (Math.abs(kcal100(a) - a.kcalTaco) <= 3) continue;
    const desvio = (kcal100(a) - a.kcalTaco) / a.kcalTaco;
    const fibra = a.fibra ?? 0;
    /* A fibra só justifica excesso PARA MAIS, e no tamanho dela: 4 kcal por
       grama de fibra, sobre a energia da tabela. */
    const folgaDaFibra = (fibra * 4) / a.kcalTaco;
    const limite = 0.15 + folgaDaFibra;
    assert.ok(
      desvio <= limite && desvio >= -0.15,
      `${a.id}: Atwater ${kcal100(a).toFixed(0)} vs TACO ${a.kcalTaco} ` +
      `(${(desvio * 100).toFixed(1)}%), fibra ${fibra.toFixed(1)} g — ` +
      `o desvio passa do que a fibra explica, suspeite do casamento com a tabela`
    );
  }
});

test("a gramagem marcada como POF é mesmo a da POF", () => {
  const porCodigo = new Map<number, typeof POF.medidas>();
  for (const m of POF.medidas) {
    const lista = porCodigo.get(m.codigo) ?? [];
    lista.push(m);
    porCodigo.set(m.codigo, lista);
  }
  const semAcento = (t: string) =>
    t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  let conferidas = 0;
  for (const c of CATALOGO) {
    if (!c.medida.pof) continue;                 /* estimada, e assumida como tal */
    const lista = porCodigo.get(c.medida.pof);
    assert.ok(lista, `${c.id}: código POF ${c.medida.pof} não existe`);
    const base = semAcento(c.medida.rotulo)
      .replace(/ (media|grossa|cheia|grande)$/, "");
    const casam = lista.filter((m) => semAcento(m.medida) === base);
    assert.ok(casam.length, `${c.id}: a POF não tem "${base}" para o código ${c.medida.pof}`);
    assert.ok(
      casam.some((m) => Math.round(m.gramas) === c.medida.gramas),
      `${c.id}: ${c.medida.gramas} g não está entre as gramagens da POF ` +
      `(${[...new Set(casam.map((m) => Math.round(m.gramas)))].join(", ")})`
    );
    conferidas++;
  }
  assert.ok(conferidas >= 40, `só ${conferidas} medidas vieram da POF`);
});

test("o catálogo não repete id nem número da TACO sem motivo", () => {
  const ids = new Set<string>();
  for (const c of CATALOGO) {
    assert.ok(!ids.has(c.id), `id repetido: ${c.id}`);
    ids.add(c.id);
  }
  /* Número repetido é permitido (feijão carioca e preto dividem a medida da
     POF, não a linha da TACO), mas não deve passar de um punhado. */
  const numeros = CATALOGO.map((c) => c.taco);
  const repetidos = numeros.filter((n, i) => numeros.indexOf(n) !== i);
  assert.ok(repetidos.length <= 2, `números da TACO repetidos demais: ${repetidos.join(", ")}`);
});
