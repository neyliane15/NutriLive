/* =========================================================================
   Nutri&Live — base de alimentos brasileiros

   Composição por 100 g de alimento **pronto para consumo**, com valores da
   TACO (Tabela Brasileira de Composição de Alimentos, Unicamp, 4ª edição).

   Atenção a uma decisão importante de cálculo:
   o campo `kcalTaco` é apenas REFERÊNCIA documental. Todo o cálculo do plano
   usa `kcalDe()`, que deriva a energia dos macronutrientes pelos fatores de
   Atwater arredondados (4 kcal/g de proteína, 4 kcal/g de carboidrato,
   9 kcal/g de gordura). Assim a saída é internamente consistente: as calorias
   que mostramos ao usuário sempre fecham com os macros que mostramos ao lado
   delas. A diferença contra o `kcalTaco` vem de fibra, álcool e arredondamento
   da própria tabela, e é de poucos por cento.
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
}

export interface Alimento {
  id: string;
  nome: string;
  setor: Setor;
  papel: Papel;
  /** Gramas de proteína por 100 g. */
  proteina: number;
  /** Gramas de carboidrato por 100 g. */
  carbo: number;
  /** Gramas de gordura por 100 g. */
  gordura: number;
  /** kcal por 100 g conforme a TACO — referência, não entra no cálculo. */
  kcalTaco: number;
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
}

/** Energia em kcal a partir dos macros, pelos fatores de Atwater arredondados. */
export const kcalDe = (proteina: number, carbo: number, gordura: number): number =>
  proteina * 4 + carbo * 4 + gordura * 9;

/** Energia por 100 g do alimento, derivada dos macros. */
export const kcal100 = (a: Alimento): number => kcalDe(a.proteina, a.carbo, a.gordura);

/* ------------------------------------------------------------------------ */
/*  A base                                                                   */
/* ------------------------------------------------------------------------ */

export const ALIMENTOS: Alimento[] = [
  /* ---------------------- cereais, raízes e tubérculos ------------------- */
  {
    id: "arroz_branco_cozido", nome: "Arroz branco cozido", setor: "Mercearia",
    papel: "carboidrato", proteina: 2.5, carbo: 28.1, gordura: 0.2, kcalTaco: 128,
    etiquetas: [], min: 50, max: 300, passo: 10,
    medida: { gramas: 30, rotulo: "colher de sopa", plural: "colheres de sopa" },
    centavosPorKg: 240, compra: "Arroz branco"
  },
  {
    id: "arroz_integral_cozido", nome: "Arroz integral cozido", setor: "Mercearia",
    papel: "carboidrato", proteina: 2.6, carbo: 25.8, gordura: 1.0, kcalTaco: 124,
    etiquetas: [], min: 50, max: 300, passo: 10,
    medida: { gramas: 30, rotulo: "colher de sopa", plural: "colheres de sopa" },
    centavosPorKg: 320, compra: "Arroz integral"
  },
  {
    id: "feijao_carioca_cozido", nome: "Feijão carioca cozido", setor: "Mercearia",
    papel: "carboidrato", proteina: 4.8, carbo: 13.6, gordura: 0.5, kcalTaco: 76,
    etiquetas: [], min: 60, max: 260, passo: 20,
    medida: { gramas: 80, rotulo: "concha", plural: "conchas" },
    centavosPorKg: 330, compra: "Feijão carioca"
  },
  {
    id: "feijao_preto_cozido", nome: "Feijão preto cozido", setor: "Mercearia",
    papel: "carboidrato", proteina: 4.5, carbo: 14.0, gordura: 0.5, kcalTaco: 77,
    etiquetas: [], min: 60, max: 260, passo: 20,
    medida: { gramas: 80, rotulo: "concha", plural: "conchas" },
    centavosPorKg: 330, compra: "Feijão preto"
  },
  {
    id: "macarrao_cozido", nome: "Macarrão cozido", setor: "Mercearia",
    papel: "carboidrato", proteina: 5.8, carbo: 30.9, gordura: 1.1, kcalTaco: 157,
    etiquetas: ["gluten", "trigo"], min: 60, max: 260, passo: 10,
    medida: { gramas: 100, rotulo: "pegador", plural: "pegadores" },
    centavosPorKg: 420, compra: "Macarrão"
  },
  {
    id: "batata_cozida", nome: "Batata cozida", setor: "Hortifrúti",
    papel: "carboidrato", proteina: 1.2, carbo: 11.9, gordura: 0.1, kcalTaco: 52,
    etiquetas: [], min: 80, max: 360, passo: 10,
    medida: { gramas: 85, rotulo: "unidade média", plural: "unidades médias" },
    centavosPorKg: 450, compra: "Batata inglesa"
  },
  {
    id: "batata_doce_cozida", nome: "Batata-doce cozida", setor: "Hortifrúti",
    papel: "carboidrato", proteina: 0.6, carbo: 18.4, gordura: 0.1, kcalTaco: 77,
    etiquetas: [], min: 60, max: 320, passo: 10,
    medida: { gramas: 100, rotulo: "fatia grossa", plural: "fatias grossas" },
    centavosPorKg: 500, compra: "Batata-doce"
  },
  {
    id: "mandioca_cozida", nome: "Mandioca cozida", setor: "Hortifrúti",
    papel: "carboidrato", proteina: 0.6, carbo: 30.1, gordura: 0.3, kcalTaco: 125,
    etiquetas: [], min: 50, max: 240, passo: 10,
    medida: { gramas: 90, rotulo: "pedaço", plural: "pedaços" },
    centavosPorKg: 420, compra: "Mandioca"
  },
  {
    id: "pao_frances", nome: "Pão francês", setor: "Padaria",
    papel: "carboidrato", proteina: 8.0, carbo: 58.6, gordura: 3.1, kcalTaco: 300,
    etiquetas: ["gluten", "trigo"], min: 25, max: 150, passo: 25,
    medida: { gramas: 50, rotulo: "unidade", plural: "unidades" },
    centavosPorKg: 1400, compra: "Pão francês"
  },
  {
    id: "pao_integral", nome: "Pão de forma integral", setor: "Padaria",
    papel: "carboidrato", proteina: 9.4, carbo: 49.9, gordura: 3.7, kcalTaco: 253,
    etiquetas: ["gluten", "trigo"], min: 25, max: 125, passo: 25,
    medida: { gramas: 25, rotulo: "fatia", plural: "fatias" },
    centavosPorKg: 1800, compra: "Pão de forma integral"
  },
  {
    id: "aveia_flocos", nome: "Aveia em flocos", setor: "Mercearia",
    papel: "carboidrato", proteina: 13.9, carbo: 66.6, gordura: 8.5, kcalTaco: 394,
    etiquetas: ["gluten"], min: 10, max: 80, passo: 5,
    medida: { gramas: 15, rotulo: "colher de sopa", plural: "colheres de sopa" },
    centavosPorKg: 1600, compra: "Aveia em flocos"
  },
  {
    id: "tapioca_goma", nome: "Goma de tapioca hidratada", setor: "Mercearia",
    papel: "carboidrato", proteina: 0.2, carbo: 59.0, gordura: 0.1, kcalTaco: 236,
    etiquetas: [], min: 30, max: 140, passo: 10,
    medida: { gramas: 60, rotulo: "disco", plural: "discos" },
    centavosPorKg: 900, compra: "Goma de tapioca"
  },
  {
    id: "cuscuz_milho", nome: "Cuscuz de milho cozido", setor: "Mercearia",
    papel: "carboidrato", proteina: 2.2, carbo: 25.3, gordura: 0.5, kcalTaco: 113,
    etiquetas: ["milho"], min: 50, max: 280, passo: 10,
    medida: { gramas: 80, rotulo: "porção", plural: "porções" },
    centavosPorKg: 600, compra: "Flocão de milho"
  },
  {
    id: "quinoa_cozida", nome: "Quinoa cozida", setor: "Mercearia",
    papel: "carboidrato", proteina: 4.4, carbo: 21.3, gordura: 1.9, kcalTaco: 120,
    etiquetas: [], min: 50, max: 240, passo: 10,
    medida: { gramas: 60, rotulo: "colher de servir", plural: "colheres de servir" },
    centavosPorKg: 2800, compra: "Quinoa em grãos"
  },

  /* ----------------------------- leguminosas ---------------------------- */
  {
    id: "lentilha_cozida", nome: "Lentilha cozida", setor: "Mercearia",
    papel: "proteina", proteina: 6.3, carbo: 16.3, gordura: 0.5, kcalTaco: 93,
    etiquetas: [], min: 60, max: 280, passo: 20,
    medida: { gramas: 80, rotulo: "concha", plural: "conchas" },
    centavosPorKg: 900, compra: "Lentilha"
  },
  {
    id: "grao_de_bico_cozido", nome: "Grão-de-bico cozido", setor: "Mercearia",
    papel: "proteina", proteina: 8.9, carbo: 27.4, gordura: 2.6, kcalTaco: 164,
    etiquetas: [], min: 50, max: 220, passo: 10,
    medida: { gramas: 70, rotulo: "concha", plural: "conchas" },
    centavosPorKg: 1400, compra: "Grão-de-bico"
  },
  {
    id: "tofu", nome: "Tofu", setor: "Mercearia",
    papel: "proteina", proteina: 8.1, carbo: 1.9, gordura: 4.8, kcalTaco: 76,
    etiquetas: ["soja"], min: 60, max: 250, passo: 10,
    medida: { gramas: 100, rotulo: "fatia grossa", plural: "fatias grossas" },
    centavosPorKg: 2500, compra: "Tofu"
  },

  /* --------------------------- carnes, aves, ovo ------------------------- */
  {
    id: "frango_peito_grelhado", nome: "Peito de frango grelhado", setor: "Açougue e ovos",
    papel: "proteina", proteina: 31.5, carbo: 0, gordura: 2.5, kcalTaco: 159,
    etiquetas: ["aves", "origem_animal"], min: 60, max: 260, passo: 10,
    medida: { gramas: 120, rotulo: "filé", plural: "filés" },
    centavosPorKg: 2200, compra: "Peito de frango"
  },
  {
    id: "frango_coxa_assada", nome: "Coxa de frango assada sem pele", setor: "Açougue e ovos",
    papel: "proteina", proteina: 28.5, carbo: 0, gordura: 10.3, kcalTaco: 215,
    etiquetas: ["aves", "origem_animal"], min: 60, max: 220, passo: 10,
    medida: { gramas: 100, rotulo: "coxa", plural: "coxas" },
    centavosPorKg: 1400, compra: "Coxa de frango"
  },
  {
    id: "patinho_moido_cozido", nome: "Patinho moído cozido", setor: "Açougue e ovos",
    papel: "proteina", proteina: 35.9, carbo: 0, gordura: 7.3, kcalTaco: 219,
    etiquetas: ["carne_vermelha", "origem_animal"], min: 50, max: 200, passo: 10,
    medida: { gramas: 100, rotulo: "porção", plural: "porções" },
    centavosPorKg: 3800, compra: "Patinho moído"
  },
  {
    id: "acem_cozido", nome: "Acém bovino cozido", setor: "Açougue e ovos",
    papel: "proteina", proteina: 26.7, carbo: 0, gordura: 11.9, kcalTaco: 215,
    etiquetas: ["carne_vermelha", "origem_animal"], min: 50, max: 200, passo: 10,
    medida: { gramas: 100, rotulo: "porção", plural: "porções" },
    centavosPorKg: 3400, compra: "Acém"
  },
  {
    id: "lombo_suino_assado", nome: "Lombo suíno assado", setor: "Açougue e ovos",
    papel: "proteina", proteina: 35.7, carbo: 0, gordura: 6.4, kcalTaco: 210,
    etiquetas: ["carne_suina", "origem_animal"], min: 50, max: 200, passo: 10,
    medida: { gramas: 100, rotulo: "porção", plural: "porções" },
    centavosPorKg: 2600, compra: "Lombo suíno"
  },
  {
    id: "ovo_cozido", nome: "Ovo de galinha cozido", setor: "Açougue e ovos",
    papel: "proteina", proteina: 13.3, carbo: 0.6, gordura: 9.5, kcalTaco: 146,
    etiquetas: ["ovo", "origem_animal"], min: 50, max: 150, passo: 50,
    medida: { gramas: 50, rotulo: "unidade", plural: "unidades" },
    centavosPorKg: 1600, compra: "Ovos"
  },

  /* -------------------------------- peixes ------------------------------ */
  {
    id: "tilapia_grelhada", nome: "Filé de tilápia grelhado", setor: "Peixaria",
    papel: "proteina", proteina: 26.0, carbo: 0, gordura: 2.0, kcalTaco: 128,
    etiquetas: ["peixe", "origem_animal"], min: 70, max: 260, passo: 10,
    medida: { gramas: 130, rotulo: "filé", plural: "filés" },
    centavosPorKg: 3200, compra: "Filé de tilápia"
  },
  {
    id: "sardinha_assada", nome: "Sardinha assada", setor: "Peixaria",
    papel: "proteina", proteina: 32.2, carbo: 0, gordura: 3.0, kcalTaco: 164,
    etiquetas: ["peixe", "origem_animal"], min: 60, max: 200, passo: 10,
    medida: { gramas: 90, rotulo: "porção", plural: "porções" },
    centavosPorKg: 2400, compra: "Sardinha fresca"
  },
  {
    id: "atum_conserva", nome: "Atum em conserva escorrido", setor: "Mercearia",
    papel: "proteina", proteina: 26.2, carbo: 0, gordura: 6.0, kcalTaco: 166,
    etiquetas: ["peixe", "origem_animal"], min: 60, max: 180, passo: 20,
    medida: { gramas: 80, rotulo: "lata", plural: "latas" },
    centavosPorKg: 5000, compra: "Atum em lata"
  },

  /* ------------------------------ laticínios ---------------------------- */
  {
    id: "leite_desnatado", nome: "Leite desnatado", setor: "Laticínios",
    papel: "proteina", proteina: 3.4, carbo: 5.0, gordura: 0.2, kcalTaco: 35,
    etiquetas: ["lactose", "leite", "origem_animal"], min: 100, max: 350, passo: 50,
    medida: { gramas: 200, rotulo: "copo", plural: "copos" },
    centavosPorKg: 450, compra: "Leite desnatado"
  },
  {
    id: "leite_integral", nome: "Leite integral", setor: "Laticínios",
    papel: "proteina", proteina: 3.2, carbo: 4.7, gordura: 3.3, kcalTaco: 61,
    etiquetas: ["lactose", "leite", "origem_animal"], min: 100, max: 350, passo: 50,
    medida: { gramas: 200, rotulo: "copo", plural: "copos" },
    centavosPorKg: 500, compra: "Leite integral"
  },
  {
    id: "iogurte_natural_desnatado", nome: "Iogurte natural desnatado", setor: "Laticínios",
    papel: "proteina", proteina: 3.8, carbo: 4.6, gordura: 0.2, kcalTaco: 41,
    etiquetas: ["lactose", "leite", "origem_animal"], min: 100, max: 300, passo: 10,
    medida: { gramas: 170, rotulo: "pote", plural: "potes" },
    centavosPorKg: 1200, compra: "Iogurte natural desnatado"
  },
  {
    id: "iogurte_natural_integral", nome: "Iogurte natural integral", setor: "Laticínios",
    papel: "proteina", proteina: 4.1, carbo: 1.9, gordura: 3.0, kcalTaco: 51,
    etiquetas: ["lactose", "leite", "origem_animal"], min: 100, max: 300, passo: 10,
    medida: { gramas: 170, rotulo: "pote", plural: "potes" },
    centavosPorKg: 1100, compra: "Iogurte natural integral"
  },
  {
    id: "queijo_minas_frescal", nome: "Queijo minas frescal", setor: "Laticínios",
    papel: "proteina", proteina: 17.4, carbo: 3.2, gordura: 20.2, kcalTaco: 264,
    etiquetas: ["lactose", "leite", "origem_animal"], min: 20, max: 100, passo: 10,
    medida: { gramas: 30, rotulo: "fatia", plural: "fatias" },
    centavosPorKg: 3800, compra: "Queijo minas frescal"
  },
  {
    id: "queijo_mussarela", nome: "Queijo mussarela", setor: "Laticínios",
    papel: "proteina", proteina: 22.6, carbo: 3.0, gordura: 25.2, kcalTaco: 330,
    etiquetas: ["lactose", "leite", "origem_animal"], min: 15, max: 75, passo: 15,
    medida: { gramas: 15, rotulo: "fatia", plural: "fatias" },
    centavosPorKg: 4500, compra: "Queijo mussarela"
  },
  {
    id: "requeijao", nome: "Requeijão cremoso", setor: "Laticínios",
    papel: "gordura", proteina: 9.6, carbo: 2.9, gordura: 22.4, kcalTaco: 257,
    etiquetas: ["lactose", "leite", "origem_animal"], min: 5, max: 45, passo: 5,
    medida: { gramas: 15, rotulo: "colher de sopa", plural: "colheres de sopa" },
    centavosPorKg: 3000, compra: "Requeijão"
  },

  /* --------------------------- verduras e legumes ----------------------- */
  {
    id: "brocolis_cozido", nome: "Brócolis cozido", setor: "Hortifrúti",
    papel: "vegetal", proteina: 2.1, carbo: 4.4, gordura: 0.5, kcalTaco: 25,
    etiquetas: [], min: 50, max: 220, passo: 10,
    medida: { gramas: 80, rotulo: "porção", plural: "porções" },
    centavosPorKg: 1200, compra: "Brócolis"
  },
  {
    id: "cenoura_crua", nome: "Cenoura crua ralada", setor: "Hortifrúti",
    papel: "vegetal", proteina: 1.3, carbo: 7.7, gordura: 0.2, kcalTaco: 34,
    etiquetas: [], min: 30, max: 160, passo: 10,
    medida: { gramas: 70, rotulo: "unidade média", plural: "unidades médias" },
    centavosPorKg: 600, compra: "Cenoura"
  },
  {
    id: "abobrinha_cozida", nome: "Abobrinha cozida", setor: "Hortifrúti",
    papel: "vegetal", proteina: 1.1, carbo: 3.0, gordura: 0.2, kcalTaco: 19,
    etiquetas: [], min: 50, max: 220, passo: 10,
    medida: { gramas: 80, rotulo: "porção", plural: "porções" },
    centavosPorKg: 700, compra: "Abobrinha"
  },
  {
    id: "alface_crespa", nome: "Alface crespa", setor: "Hortifrúti",
    papel: "vegetal", proteina: 1.3, carbo: 1.7, gordura: 0.2, kcalTaco: 11,
    etiquetas: [], min: 20, max: 100, passo: 10,
    medida: { gramas: 40, rotulo: "prato de folhas", plural: "pratos de folhas" },
    centavosPorKg: 1000, compra: "Alface crespa"
  },
  {
    id: "tomate_cru", nome: "Tomate cru", setor: "Hortifrúti",
    papel: "vegetal", proteina: 1.1, carbo: 3.1, gordura: 0.2, kcalTaco: 15,
    etiquetas: [], min: 30, max: 160, passo: 10,
    medida: { gramas: 60, rotulo: "unidade", plural: "unidades" },
    centavosPorKg: 800, compra: "Tomate"
  },
  {
    id: "couve_manteiga", nome: "Couve-manteiga refogada", setor: "Hortifrúti",
    papel: "vegetal", proteina: 2.9, carbo: 4.3, gordura: 0.5, kcalTaco: 27,
    etiquetas: [], min: 30, max: 160, passo: 10,
    medida: { gramas: 50, rotulo: "porção", plural: "porções" },
    centavosPorKg: 900, compra: "Couve-manteiga"
  },
  {
    id: "beterraba_cozida", nome: "Beterraba cozida", setor: "Hortifrúti",
    papel: "vegetal", proteina: 1.3, carbo: 7.2, gordura: 0.1, kcalTaco: 32,
    etiquetas: [], min: 30, max: 160, passo: 10,
    medida: { gramas: 60, rotulo: "porção", plural: "porções" },
    centavosPorKg: 700, compra: "Beterraba"
  },
  {
    id: "chuchu_cozido", nome: "Chuchu cozido", setor: "Hortifrúti",
    papel: "vegetal", proteina: 0.4, carbo: 4.8, gordura: 0.1, kcalTaco: 19,
    etiquetas: [], min: 50, max: 220, passo: 10,
    medida: { gramas: 80, rotulo: "porção", plural: "porções" },
    centavosPorKg: 500, compra: "Chuchu"
  },
  {
    id: "repolho_cru", nome: "Repolho cru fatiado", setor: "Hortifrúti",
    papel: "vegetal", proteina: 1.0, carbo: 5.8, gordura: 0.1, kcalTaco: 25,
    etiquetas: [], min: 30, max: 160, passo: 10,
    medida: { gramas: 50, rotulo: "porção", plural: "porções" },
    centavosPorKg: 500, compra: "Repolho"
  },
  {
    id: "espinafre_refogado", nome: "Espinafre refogado", setor: "Hortifrúti",
    papel: "vegetal", proteina: 2.0, carbo: 2.6, gordura: 0.3, kcalTaco: 16,
    etiquetas: [], min: 40, max: 180, passo: 10,
    medida: { gramas: 60, rotulo: "porção", plural: "porções" },
    centavosPorKg: 1400, compra: "Espinafre"
  },
  {
    id: "abobora_cozida", nome: "Abóbora cabotiá cozida", setor: "Hortifrúti",
    papel: "vegetal", proteina: 1.4, carbo: 11.1, gordura: 0.5, kcalTaco: 48,
    etiquetas: [], min: 50, max: 240, passo: 10,
    medida: { gramas: 80, rotulo: "porção", plural: "porções" },
    centavosPorKg: 500, compra: "Abóbora cabotiá"
  },
  {
    id: "pepino_cru", nome: "Pepino cru", setor: "Hortifrúti",
    papel: "vegetal", proteina: 0.9, carbo: 2.0, gordura: 0.0, kcalTaco: 10,
    etiquetas: [], min: 30, max: 160, passo: 10,
    medida: { gramas: 60, rotulo: "porção", plural: "porções" },
    centavosPorKg: 700, compra: "Pepino"
  },

  /* -------------------------------- frutas ------------------------------ */
  {
    id: "banana_prata", nome: "Banana prata", setor: "Hortifrúti",
    papel: "fruta", proteina: 1.3, carbo: 26.0, gordura: 0.1, kcalTaco: 98,
    etiquetas: [], min: 40, max: 180, passo: 10,
    medida: { gramas: 70, rotulo: "unidade", plural: "unidades" },
    centavosPorKg: 700, compra: "Banana prata"
  },
  {
    id: "maca_fuji", nome: "Maçã fuji com casca", setor: "Hortifrúti",
    papel: "fruta", proteina: 0.3, carbo: 15.2, gordura: 0.0, kcalTaco: 56,
    etiquetas: [], min: 60, max: 200, passo: 10,
    medida: { gramas: 130, rotulo: "unidade", plural: "unidades" },
    centavosPorKg: 900, compra: "Maçã fuji"
  },
  {
    id: "mamao_formosa", nome: "Mamão formosa", setor: "Hortifrúti",
    papel: "fruta", proteina: 0.8, carbo: 11.6, gordura: 0.1, kcalTaco: 45,
    etiquetas: [], min: 80, max: 300, passo: 10,
    medida: { gramas: 150, rotulo: "fatia", plural: "fatias" },
    centavosPorKg: 600, compra: "Mamão formosa"
  },
  {
    id: "laranja_pera", nome: "Laranja pera", setor: "Hortifrúti",
    papel: "fruta", proteina: 1.0, carbo: 8.9, gordura: 0.1, kcalTaco: 37,
    etiquetas: [], min: 80, max: 260, passo: 10,
    medida: { gramas: 130, rotulo: "unidade", plural: "unidades" },
    centavosPorKg: 500, compra: "Laranja pera"
  },
  {
    id: "melancia", nome: "Melancia", setor: "Hortifrúti",
    papel: "fruta", proteina: 0.9, carbo: 8.1, gordura: 0.0, kcalTaco: 33,
    etiquetas: [], min: 100, max: 350, passo: 10,
    medida: { gramas: 200, rotulo: "fatia", plural: "fatias" },
    centavosPorKg: 300, compra: "Melancia"
  },
  {
    id: "morango", nome: "Morango", setor: "Hortifrúti",
    papel: "fruta", proteina: 0.9, carbo: 6.8, gordura: 0.3, kcalTaco: 30,
    etiquetas: [], min: 60, max: 250, passo: 10,
    medida: { gramas: 100, rotulo: "porção", plural: "porções" },
    centavosPorKg: 2500, compra: "Morango"
  },
  {
    id: "manga_palmer", nome: "Manga palmer", setor: "Hortifrúti",
    papel: "fruta", proteina: 0.4, carbo: 19.4, gordura: 0.2, kcalTaco: 72,
    etiquetas: [], min: 60, max: 220, passo: 10,
    medida: { gramas: 110, rotulo: "porção", plural: "porções" },
    centavosPorKg: 800, compra: "Manga palmer"
  },
  {
    id: "abacate", nome: "Abacate", setor: "Hortifrúti",
    papel: "gordura", proteina: 1.2, carbo: 6.0, gordura: 8.4, kcalTaco: 96,
    etiquetas: [], min: 20, max: 140, passo: 10,
    medida: { gramas: 50, rotulo: "colher de sopa", plural: "colheres de sopa" },
    centavosPorKg: 900, compra: "Abacate"
  },

  /* -------------------------- gorduras e oleaginosas -------------------- */
  {
    id: "azeite_oliva", nome: "Azeite de oliva extravirgem", setor: "Mercearia",
    papel: "gordura", proteina: 0, carbo: 0, gordura: 100, kcalTaco: 884,
    etiquetas: [], min: 2, max: 28, passo: 1,
    medida: { gramas: 5, rotulo: "colher de chá", plural: "colheres de chá" },
    centavosPorKg: 7000, compra: "Azeite de oliva extravirgem"
  },
  {
    id: "oleo_soja", nome: "Óleo de soja", setor: "Mercearia",
    papel: "gordura", proteina: 0, carbo: 0, gordura: 100, kcalTaco: 884,
    etiquetas: ["soja"], min: 2, max: 24, passo: 1,
    medida: { gramas: 5, rotulo: "colher de chá", plural: "colheres de chá" },
    centavosPorKg: 1200, compra: "Óleo de soja"
  },
  {
    id: "castanha_do_para", nome: "Castanha-do-pará", setor: "Mercearia",
    papel: "gordura", proteina: 14.5, carbo: 15.1, gordura: 63.5, kcalTaco: 643,
    etiquetas: ["oleaginosas"], min: 5, max: 40, passo: 5,
    medida: { gramas: 5, rotulo: "unidade", plural: "unidades" },
    centavosPorKg: 12000, compra: "Castanha-do-pará"
  },
  {
    id: "amendoim_torrado", nome: "Amendoim torrado", setor: "Mercearia",
    papel: "gordura", proteina: 22.5, carbo: 20.3, gordura: 43.9, kcalTaco: 544,
    etiquetas: ["amendoim"], min: 10, max: 45, passo: 5,
    medida: { gramas: 10, rotulo: "colher de sopa", plural: "colheres de sopa" },
    centavosPorKg: 2200, compra: "Amendoim torrado"
  },
  {
    id: "linhaca", nome: "Semente de linhaça", setor: "Mercearia",
    papel: "gordura", proteina: 14.1, carbo: 43.3, gordura: 32.3, kcalTaco: 495,
    etiquetas: [], min: 5, max: 20, passo: 5,
    medida: { gramas: 10, rotulo: "colher de sopa", plural: "colheres de sopa" },
    centavosPorKg: 2000, compra: "Linhaça"
  },

  /* ------------------------------- extras ------------------------------- */
  {
    id: "cafe_sem_acucar", nome: "Café sem açúcar", setor: "Bebidas",
    papel: "livre", proteina: 0.1, carbo: 0.3, gordura: 0, kcalTaco: 2,
    etiquetas: [], min: 100, max: 300, passo: 50,
    medida: { gramas: 150, rotulo: "xícara", plural: "xícaras" },
    centavosPorKg: 120, compra: "Café torrado e moído"
  },
  {
    id: "cha_sem_acucar", nome: "Chá de erva-cidreira sem açúcar", setor: "Bebidas",
    papel: "livre", proteina: 0, carbo: 0.2, gordura: 0, kcalTaco: 1,
    etiquetas: [], min: 150, max: 300, passo: 50,
    medida: { gramas: 200, rotulo: "xícara", plural: "xícaras" },
    centavosPorKg: 80, compra: "Chá de erva-cidreira"
  },
  {
    id: "mel", nome: "Mel", setor: "Mercearia",
    papel: "carboidrato", proteina: 0.4, carbo: 84.0, gordura: 0, kcalTaco: 309,
    etiquetas: ["mel", "acucar", "origem_animal"], min: 5, max: 25, passo: 5,
    medida: { gramas: 10, rotulo: "colher de chá", plural: "colheres de chá" },
    centavosPorKg: 4000, compra: "Mel"
  }
];

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
