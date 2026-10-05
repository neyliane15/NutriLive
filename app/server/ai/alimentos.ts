/* =========================================================================
   Nutri&Live — base de alimentos

   Esta base não é digitada à mão. Ela é MONTADA, na subida do processo, a
   partir de duas coisas separadas de propósito:

     dados/taco-4a-edicao.json   os números, extraídos sem alteração da
                                 planilha oficial da TACO (NEPA/UNICAMP,
                                 4ª edição revisada e ampliada, 2011)
     catalogo.ts                 o que a tabela não diz: papel na refeição,
                                 setor do mercado, etiquetas de restrição,
                                 porção plausível, medida caseira, preço

   Por que montar em vez de digitar
   --------------------------------
   A versão anterior tinha 61 alimentos com os valores escritos à mão
   "conforme a TACO". Ao casar cada um com a tabela de verdade, cinco não
   casavam com nada: a TACO só traz macarrão e grão-de-bico CRUS, traz
   polvilho e não goma hidratada, e não tem tilápia nem quinoa. Aqueles
   números existiam, mas não vinham da tabela — vinham de alguém.

   Agora é impossível repetir isso. Um alimento só entra se tiver número na
   TACO, e o número dele é lido do JSON toda vez. Não há onde "ajustar" uma
   proteína para fechar uma conta.

   A energia do plano continua saindo de `kcalDe()` — Atwater arredondado,
   4/4/9 — e não do `kcalTaco`. É o que mantém a tela internamente coerente:
   as calorias que mostramos sempre fecham com os macros ao lado delas. A
   diferença contra a tabela vem de fibra, álcool e do arredondamento dela,
   e `kcalTaco` fica guardado para quem quiser conferir.

   Atualizar a tabela: trocar o JSON e rodar `npm run tabelas:conferir`.
   Nada neste arquivo muda.
   ========================================================================= */
import TABELA_TACO from "./dados/taco-4a-edicao.json" with { type: "json" };
import { CATALOGO } from "./catalogo.js";
import type { Alimento, FonteNutricional } from "./tipos-alimento.js";

export type {
  Alimento, Etiqueta, Setor, Papel, TipoRefeicao, MedidaCaseira, FonteNutricional
} from "./tipos-alimento.js";

/** Energia em kcal a partir dos macros, pelos fatores de Atwater arredondados. */
export const kcalDe = (proteina: number, carbo: number, gordura: number): number =>
  proteina * 4 + carbo * 4 + gordura * 9;

/** Energia por 100 g do alimento, derivada dos macros. */
export const kcal100 = (a: Alimento): number => kcalDe(a.proteina, a.carbo, a.gordura);

/* ------------------------------------------------------------------------ */
/*  A tabela oficial                                                        */
/* ------------------------------------------------------------------------ */

interface LinhaTaco {
  numero: number;
  descricao: string;
  categoria: string;
  proteina: number | null;
  carboidrato: number | null;
  lipideos: number | null;
  kcal: number | null;
  fibra: number | null;
  sodio: number | null;
}

/* Importação ESTÁTICA do JSON, e não `createRequire`.

   `require` resolve no disco em tempo de execução: funciona num servidor
   comum e some num empacotador, que não tem como saber que o arquivo é
   necessário. Numa função sem estado, isso quer dizer a tabela nutricional
   inteira faltando em produção — e a base de alimentos vazia é o tipo de
   falha que só aparece quando alguém pede um plano.

   Estático, qualquer empacotador inclui o arquivo. */
const TABELA = TABELA_TACO as unknown as { fonte: string; alimentos: LinhaTaco[] };

export const FONTE_DA_TABELA = TABELA.fonte;

const porNumero = new Map<number, LinhaTaco>(TABELA.alimentos.map((a) => [a.numero, a]));

/* ------------------------------------------------------------------------ */
/*  A junção                                                                */
/* ------------------------------------------------------------------------ */

/**
 * `null` na TACO quer dizer "a tabela não mediu", e isso é diferente de
 * zero. Para proteína, carboidrato e gordura, zero é a leitura correta —
 * óleo não tem proteína, e a tabela deixa a célula vazia em vez de escrever
 * 0,0. Para fibra e sódio o `null` é preservado, porque ali a ausência de
 * medida é informação: a tela mostra "—", não "0 mg".
 */
const macro = (v: number | null): number => (v === null ? 0 : v);

export const ALIMENTOS: Alimento[] = CATALOGO.map((c) => {
  const linha = porNumero.get(c.taco);
  if (!linha) {
    /* Falha na subida, e não em silêncio: um alimento sem número válido
       voltaria a ser um número sem procedência. */
    throw new Error(
      `catalogo.ts: o alimento "${c.id}" aponta para o número ${c.taco}, que não existe na TACO.`
    );
  }

  const fonte: FonteNutricional = {
    tabela: "TACO 4ª edição",
    numero: linha.numero,
    descricao: linha.descricao,
    categoria: linha.categoria
  };

  return {
    id: c.id,
    nome: c.nome,
    setor: c.setor,
    papel: c.papel,
    proteina: macro(linha.proteina),
    carbo: macro(linha.carboidrato),
    gordura: macro(linha.lipideos),
    kcalTaco: linha.kcal === null ? Math.round(kcalDe(macro(linha.proteina), macro(linha.carboidrato), macro(linha.lipideos))) : Math.round(linha.kcal),
    fibra: linha.fibra,
    sodio: linha.sodio,
    etiquetas: c.etiquetas,
    min: c.min,
    max: c.max,
    passo: c.passo,
    medida: c.medida,
    centavosPorKg: c.centavosPorKg,
    ...(c.compra ? { compra: c.compra } : {}),
    ...(c.nota ? { nota: c.nota } : {}),
    fonte
  };
});

/** Índice por id, para busca rápida. */
export const POR_ID: ReadonlyMap<string, Alimento> = new Map(
  ALIMENTOS.map((a) => [a.id, a])
);

export const alimento = (id: string): Alimento => {
  const a = POR_ID.get(id);
  if (!a) throw new Error(`Alimento desconhecido na base: ${id}`);
  return a;
};

/** Descreve a porção em medida caseira + gramas: "2 fatias (50 g)". */
export const descreverPorcao = (a: Alimento, gramas: number): string => {
  const qtd = gramas / a.medida.gramas;
  const arred = qtd >= 1 ? Math.round(qtd * 2) / 2 : Math.round(qtd * 4) / 4;
  const rotulo = arred === 1 ? a.medida.rotulo : (a.medida.plural ?? `${a.medida.rotulo}s`);
  const num = Number.isInteger(arred) ? String(arred) : String(arred).replace(".", ",");
  if (arred <= 0) return `${gramas} g`;
  return `${num} ${rotulo} (${gramas} g)`;
};
