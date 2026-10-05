/* =========================================================================
   Tipos do domínio de alimentos.

   Em arquivo separado porque `catalogo.ts` e `alimentos.ts` precisam dos
   mesmos tipos e um importa o outro: sem esta quebra, o ciclo.
   ========================================================================= */

/** Etiquetas de composição usadas pelo filtro rígido de restrição e alergia. */
export type Etiqueta =
  | "lactose" | "leite"
  | "gluten" | "trigo"
  | "ovo"
  | "amendoim" | "oleaginosas"
  | "peixe" | "frutos_do_mar"
  | "soja"
  | "carne_vermelha" | "carne_suina" | "aves"
  | "mel" | "acucar" | "milho"
  | "origem_animal";

/** Setor do mercado — usado para agrupar a lista de compras. */
export type Setor =
  | "Hortifrúti" | "Açougue e ovos" | "Peixaria" | "Mercearia"
  | "Laticínios" | "Padaria" | "Bebidas";

/** Papel do alimento na montagem da refeição. */
export type Papel = "proteina" | "carboidrato" | "gordura" | "vegetal" | "fruta" | "livre";

export type TipoRefeicao =
  | "cafe" | "lanche_manha" | "almoco" | "lanche_tarde" | "jantar" | "ceia";

export interface MedidaCaseira {
  /** Quantos gramas tem uma medida. */
  gramas: number;
  /** Rótulo no singular. */
  rotulo: string;
  /** Rótulo no plural; se ausente, usa o singular + "s". */
  plural?: string;
  /**
   * Código do alimento na POF 2008-2009 (IBGE) de onde a gramagem saiu.
   * Ausente quer dizer estimada: a POF não traz esse rótulo para esse
   * alimento. A tela pode dizer qual é qual.
   */
  pof?: number;
}

/** De onde vieram os números deste alimento. Vai junto com ele até a tela. */
export interface FonteNutricional {
  tabela: "TACO 4ª edição";
  /** Número do alimento na tabela. */
  numero: number;
  /** Descrição exatamente como a tabela escreve. */
  descricao: string;
  categoria: string;
}

export interface Alimento {
  id: string;
  nome: string;
  setor: Setor;
  papel: Papel;
  /** Gramas de proteína por 100 g. Da TACO, sem arredondar. */
  proteina: number;
  /** Gramas de carboidrato por 100 g. Da TACO. */
  carbo: number;
  /** Gramas de gordura por 100 g. Da TACO. */
  gordura: number;
  /** kcal por 100 g conforme a TACO — referência, não entra no cálculo. */
  kcalTaco: number;
  /** Gramas de fibra alimentar por 100 g, quando a tabela traz. */
  fibra: number | null;
  /** Miligramas de sódio por 100 g, quando a tabela traz. */
  sodio: number | null;
  etiquetas: Etiqueta[];
  /** Porção mínima, máxima e passo de ajuste, em gramas. */
  min: number;
  max: number;
  passo: number;
  medida: MedidaCaseira;
  /** Preço estimado em centavos por quilo do alimento pronto. */
  centavosPorKg: number;
  /** Nome como aparece na lista de compras (produto cru, do jeito que se compra). */
  compra?: string;
  /** Mostrado quando o nome da tabela surpreende (peso cru, outro peixe). */
  nota?: string;
  /** A procedência do número. Todo alimento tem uma. */
  fonte: FonteNutricional;
}
