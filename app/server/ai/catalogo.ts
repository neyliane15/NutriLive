/* =========================================================================
   Nutri&Live — catálogo: o que o sistema sabe que as tabelas não dizem

   Este arquivo NÃO tem valor nutricional nenhum. Proteína, carboidrato,
   gordura, fibra, sódio e energia vêm todos de `dados/taco-4a-edicao.json`,
   extraído sem alteração da planilha oficial da TACO (NEPA/UNICAMP). A
   gramagem das medidas caseiras, quando `medida.pof` está preenchido, vem
   de `dados/pof-medidas-caseiras.json` (POF 2008-2009, IBGE).

   Aqui mora só o que as tabelas não têm e o produto precisa:

     taco           número do alimento na TACO. É a ligação, e é obrigatório:
                    alimento sem número não entra no sistema.
     papel          que vaga ele preenche numa refeição (proteína, carbo…)
     setor          corredor do mercado, para agrupar a lista de compras
     etiquetas      composição que o filtro de restrição e alergia usa
     min/max/passo  porção plausível em gramas, e de quanto em quanto subir
     medida         medida caseira. `pof` é o código do alimento na POF de
                    onde a gramagem saiu; sem ele, a gramagem é estimada e o
                    sistema diz isso.
     centavosPorKg  preço de referência, para estimar a feira
     compra         nome do produto como se compra
     nota           quando o nome da tabela difere do que a pessoa espera

   Separar as duas coisas é o ponto: quando a TACO for atualizada, troca-se
   o JSON e nada aqui muda. E ninguém consegue "ajustar" uma proteína para
   fechar uma conta, porque não há onde.

   Quatro alimentos mudaram de nome ao casar com a TACO — ela só traz
   macarrão e grão-de-bico CRUS, traz polvilho em vez de goma hidratada, e
   não tem tilápia. O nome e a porção seguem a tabela, não o contrário. A
   quinoa saiu: não existe na TACO, e inventar número para ela seria o
   oposto do que este arquivo existe para impedir.

   As medidas caseiras também mudaram ao encontrar a POF, e algumas muito:
   a colher de sopa de arroz são 25 g e não 30; a concha de feijão, 140 g e
   não 80; a colher de chá de azeite, 2 g e não 5. Isso é cálculo, não
   rótulo — quem serve pela medida comia o que o plano não previa.
   ========================================================================= */
import type { Etiqueta, Papel, Setor } from "./tipos-alimento.js";

export interface ItemCatalogo {
  id: string;
  /** Número do alimento na TACO 4ª edição. A chave de tudo. */
  taco: number;
  /** Nome como a pessoa reconhece. A descrição oficial fica no JSON. */
  nome: string;
  papel: Papel;
  setor: Setor;
  etiquetas: Etiqueta[];
  min: number;
  max: number;
  passo: number;
  medida: {
    gramas: number;
    rotulo: string;
    plural: string;
    /** Código do alimento na POF de onde saiu a gramagem. Ausente = estimada. */
    pof?: number;
  };
  centavosPorKg: number;
  compra?: string;
  /** Mostrado quando o nome da tabela surpreende (peso cru, outro peixe). */
  nota?: string;
}

export const CATALOGO: ItemCatalogo[] = [
  {
    id: "arroz_branco_cozido", taco: 3, nome: "Arroz branco cozido",
    papel: "carboidrato", setor: "Mercearia", etiquetas: [],
    min: 50, max: 300, passo: 10,
    medida: { gramas: 25, rotulo: "colher de sopa", plural: "colheres de sopa", pof: 6300101 },
    centavosPorKg: 240, compra: "Arroz branco",
  },
  {
    id: "arroz_integral_cozido", taco: 1, nome: "Arroz integral cozido",
    papel: "carboidrato", setor: "Mercearia", etiquetas: [],
    min: 50, max: 300, passo: 10,
    medida: { gramas: 20, rotulo: "colher de sopa", plural: "colheres de sopa", pof: 6300201 },
    centavosPorKg: 320, compra: "Arroz integral",
  },
  {
    id: "feijao_carioca_cozido", taco: 561, nome: "Feijão carioca cozido",
    papel: "carboidrato", setor: "Mercearia", etiquetas: [],
    min: 60, max: 260, passo: 20,
    medida: { gramas: 140, rotulo: "concha", plural: "conchas", pof: 6303102 },
    centavosPorKg: 330, compra: "Feijão carioca",
  },
  {
    id: "feijao_preto_cozido", taco: 567, nome: "Feijão preto cozido",
    papel: "carboidrato", setor: "Mercearia", etiquetas: [],
    min: 60, max: 260, passo: 20,
    medida: { gramas: 140, rotulo: "concha", plural: "conchas", pof: 6303102 },
    centavosPorKg: 330, compra: "Feijão preto",
  },
  {
    id: "macarrao_cru", taco: 40, nome: "Macarrão (peso cru)",
    papel: "carboidrato", setor: "Mercearia", etiquetas: ["gluten", "trigo"],
    min: 60, max: 150, passo: 10,
    medida: { gramas: 105, rotulo: "porção", plural: "porções", pof: 6503401 },
    centavosPorKg: 420, compra: "Macarrão",
    nota: "A TACO só traz o macarrão cru. Pesa-se cru, antes de cozinhar.",
  },
  {
    id: "batata_cozida", taco: 91, nome: "Batata cozida",
    papel: "carboidrato", setor: "Hortifrúti", etiquetas: [],
    min: 80, max: 360, passo: 10,
    medida: { gramas: 140, rotulo: "unidade média", plural: "unidades médias", pof: 6400101 },
    centavosPorKg: 450, compra: "Batata inglesa",
  },
  {
    id: "batata_doce_cozida", taco: 88, nome: "Batata-doce cozida",
    papel: "carboidrato", setor: "Hortifrúti", etiquetas: [],
    min: 60, max: 320, passo: 10,
    medida: { gramas: 70, rotulo: "fatia grossa", plural: "fatias grossas", pof: 6400401 },
    centavosPorKg: 500, compra: "Batata-doce",
  },
  {
    id: "mandioca_cozida", taco: 129, nome: "Mandioca cozida",
    papel: "carboidrato", setor: "Hortifrúti", etiquetas: [],
    min: 50, max: 240, passo: 10,
    medida: { gramas: 100, rotulo: "pedaço", plural: "pedaços", pof: 6400601 },
    centavosPorKg: 420, compra: "Mandioca",
  },
  {
    id: "pao_frances", taco: 53, nome: "Pão francês",
    papel: "carboidrato", setor: "Padaria", etiquetas: ["gluten", "trigo"],
    min: 25, max: 150, passo: 25,
    medida: { gramas: 50, rotulo: "unidade", plural: "unidades", pof: 8000105 },
    centavosPorKg: 1400, compra: "Pão francês",
  },
  {
    id: "pao_integral", taco: 52, nome: "Pão de forma integral",
    papel: "carboidrato", setor: "Padaria", etiquetas: ["gluten", "trigo"],
    min: 25, max: 125, passo: 25,
    medida: { gramas: 25, rotulo: "fatia", plural: "fatias" },
    centavosPorKg: 1800, compra: "Pão de forma integral",
  },
  {
    id: "aveia_flocos", taco: 7, nome: "Aveia em flocos",
    papel: "carboidrato", setor: "Mercearia", etiquetas: ["gluten"],
    min: 10, max: 80, passo: 5,
    medida: { gramas: 15, rotulo: "colher de sopa", plural: "colheres de sopa", pof: 6500401 },
    centavosPorKg: 1600, compra: "Aveia em flocos",
  },
  {
    id: "polvilho_doce", taco: 146, nome: "Goma de tapioca (polvilho doce)",
    papel: "carboidrato", setor: "Mercearia", etiquetas: [],
    min: 20, max: 60, passo: 5,
    medida: { gramas: 25, rotulo: "colher de sopa cheia", plural: "colheres de sopa cheias" },
    centavosPorKg: 900, compra: "Polvilho doce",
    nota: "Peso do polvilho seco, antes de hidratar.",
  },
  {
    id: "cuscuz_milho", taco: 533, nome: "Cuscuz de milho cozido",
    papel: "carboidrato", setor: "Mercearia", etiquetas: ["milho"],
    min: 50, max: 280, passo: 10,
    medida: { gramas: 42, rotulo: "porção", plural: "porções", pof: 6902901 },
    centavosPorKg: 600, compra: "Flocão de milho",
  },
  {
    id: "lentilha_cozida", taco: 577, nome: "Lentilha cozida",
    papel: "proteina", setor: "Mercearia", etiquetas: [],
    min: 60, max: 280, passo: 20,
    medida: { gramas: 160, rotulo: "concha", plural: "conchas", pof: 6302901 },
    centavosPorKg: 900, compra: "Lentilha",
  },
  {
    id: "grao_de_bico_cru", taco: 575, nome: "Grão-de-bico (peso cru)",
    papel: "proteina", setor: "Mercearia", etiquetas: [],
    min: 25, max: 80, passo: 5,
    medida: { gramas: 36, rotulo: "porção", plural: "porções", pof: 6302801 },
    centavosPorKg: 1400, compra: "Grão-de-bico",
    nota: "A TACO só traz o grão-de-bico cru. Pesa-se cru, antes de cozinhar.",
  },
  {
    id: "tofu", taco: 584, nome: "Tofu",
    papel: "proteina", setor: "Mercearia", etiquetas: ["soja"],
    min: 60, max: 250, passo: 10,
    medida: { gramas: 20, rotulo: "fatia grossa", plural: "fatias grossas", pof: 7903402 },
    centavosPorKg: 2500, compra: "Tofu",
  },
  {
    id: "frango_peito_grelhado", taco: 410, nome: "Peito de frango grelhado",
    papel: "proteina", setor: "Açougue e ovos", etiquetas: ["aves", "origem_animal"],
    min: 60, max: 260, passo: 10,
    medida: { gramas: 120, rotulo: "filé", plural: "filés" },
    centavosPorKg: 2200, compra: "Peito de frango",
  },
  {
    id: "frango_coxa_cozida", taco: 398, nome: "Coxa de frango sem pele cozida",
    papel: "proteina", setor: "Açougue e ovos", etiquetas: ["aves", "origem_animal"],
    min: 60, max: 220, passo: 10,
    medida: { gramas: 55, rotulo: "coxa", plural: "coxas", pof: 7800103 },
    centavosPorKg: 1400, compra: "Coxa de frango",
  },
  {
    id: "patinho_grelhado", taco: 377, nome: "Patinho grelhado",
    papel: "proteina", setor: "Açougue e ovos", etiquetas: ["carne_vermelha", "origem_animal"],
    min: 50, max: 200, passo: 10,
    medida: { gramas: 75, rotulo: "porção", plural: "porções", pof: 7100501 },
    centavosPorKg: 3800, compra: "Patinho",
  },
  {
    id: "acem_cozido", taco: 328, nome: "Acém bovino cozido",
    papel: "proteina", setor: "Açougue e ovos", etiquetas: ["carne_vermelha", "origem_animal"],
    min: 50, max: 200, passo: 10,
    medida: { gramas: 75, rotulo: "porção", plural: "porções", pof: 7100801 },
    centavosPorKg: 3400, compra: "Acém",
  },
  {
    id: "lombo_suino_assado", taco: 432, nome: "Lombo suíno assado",
    papel: "proteina", setor: "Açougue e ovos", etiquetas: ["carne_suina", "origem_animal"],
    min: 50, max: 200, passo: 10,
    medida: { gramas: 100, rotulo: "porção", plural: "porções" },
    centavosPorKg: 2600, compra: "Lombo suíno",
  },
  {
    id: "ovo_cozido", taco: 488, nome: "Ovo de galinha cozido",
    papel: "proteina", setor: "Açougue e ovos", etiquetas: ["ovo", "origem_animal"],
    min: 50, max: 150, passo: 50,
    medida: { gramas: 45, rotulo: "unidade", plural: "unidades", pof: 7803301 },
    centavosPorKg: 1600, compra: "Ovos",
  },
  {
    id: "abadejo_grelhado", taco: 276, nome: "Filé de abadejo grelhado",
    papel: "proteina", setor: "Peixaria", etiquetas: ["peixe", "origem_animal"],
    min: 70, max: 260, passo: 10,
    medida: { gramas: 120, rotulo: "filé", plural: "filés", pof: 7200101 },
    centavosPorKg: 3200, compra: "Filé de abadejo",
    nota: "A TACO não tem tilápia. O abadejo é o peixe branco magro que ela traz.",
  },
  {
    id: "sardinha_assada", taco: 318, nome: "Sardinha assada",
    papel: "proteina", setor: "Peixaria", etiquetas: ["peixe", "origem_animal"],
    min: 60, max: 200, passo: 10,
    medida: { gramas: 90, rotulo: "porção", plural: "porções" },
    centavosPorKg: 2400, compra: "Sardinha fresca",
  },
  {
    id: "atum_conserva", taco: 277, nome: "Atum em conserva escorrido",
    papel: "proteina", setor: "Mercearia", etiquetas: ["peixe", "origem_animal"],
    min: 60, max: 180, passo: 20,
    medida: { gramas: 80, rotulo: "lata", plural: "latas" },
    centavosPorKg: 5000, compra: "Atum em lata",
  },
  {
    id: "leite_desnatado", taco: 457, nome: "Leite desnatado",
    papel: "proteina", setor: "Laticínios", etiquetas: ["lactose", "leite", "origem_animal"],
    min: 100, max: 350, passo: 50,
    medida: { gramas: 200, rotulo: "copo", plural: "copos" },
    centavosPorKg: 450, compra: "Leite desnatado",
  },
  {
    id: "leite_integral", taco: 458, nome: "Leite integral",
    papel: "proteina", setor: "Laticínios", etiquetas: ["lactose", "leite", "origem_animal"],
    min: 100, max: 350, passo: 50,
    medida: { gramas: 200, rotulo: "copo", plural: "copos" },
    centavosPorKg: 500, compra: "Leite integral",
  },
  {
    id: "iogurte_natural_desnatado", taco: 449, nome: "Iogurte natural desnatado",
    papel: "proteina", setor: "Laticínios", etiquetas: ["lactose", "leite", "origem_animal"],
    min: 100, max: 300, passo: 10,
    medida: { gramas: 200, rotulo: "pote", plural: "potes", pof: 7901203 },
    centavosPorKg: 1200, compra: "Iogurte natural desnatado",
  },
  {
    id: "iogurte_natural_integral", taco: 448, nome: "Iogurte natural integral",
    papel: "proteina", setor: "Laticínios", etiquetas: ["lactose", "leite", "origem_animal"],
    min: 100, max: 300, passo: 10,
    medida: { gramas: 200, rotulo: "pote", plural: "potes", pof: 7901204 },
    centavosPorKg: 1100, compra: "Iogurte natural integral",
  },
  {
    id: "queijo_minas_frescal", taco: 461, nome: "Queijo minas frescal",
    papel: "proteina", setor: "Laticínios", etiquetas: ["lactose", "leite", "origem_animal"],
    min: 20, max: 100, passo: 10,
    medida: { gramas: 30, rotulo: "fatia", plural: "fatias" },
    centavosPorKg: 3800, compra: "Queijo minas frescal",
  },
  {
    id: "queijo_mussarela", taco: 463, nome: "Queijo mussarela",
    papel: "proteina", setor: "Laticínios", etiquetas: ["lactose", "leite", "origem_animal"],
    min: 15, max: 75, passo: 15,
    medida: { gramas: 20, rotulo: "fatia", plural: "fatias", pof: 7901801 },
    centavosPorKg: 4500, compra: "Queijo mussarela",
  },
  {
    id: "requeijao", taco: 468, nome: "Requeijão cremoso",
    papel: "gordura", setor: "Laticínios", etiquetas: ["lactose", "leite", "origem_animal"],
    min: 5, max: 45, passo: 5,
    medida: { gramas: 30, rotulo: "colher de sopa", plural: "colheres de sopa", pof: 7902901 },
    centavosPorKg: 3000, compra: "Requeijão",
  },
  {
    id: "brocolis_cozido", taco: 100, nome: "Brócolis cozido",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 50, max: 220, passo: 10,
    medida: { gramas: 60, rotulo: "porção", plural: "porções", pof: 6701704 },
    centavosPorKg: 1200, compra: "Brócolis",
  },
  {
    id: "cenoura_crua", taco: 110, nome: "Cenoura crua ralada",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 30, max: 160, passo: 10,
    medida: { gramas: 100, rotulo: "unidade média", plural: "unidades médias", pof: 6401201 },
    centavosPorKg: 600, compra: "Cenoura",
  },
  {
    id: "abobrinha_cozida", taco: 70, nome: "Abobrinha cozida",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 50, max: 220, passo: 10,
    medida: { gramas: 57, rotulo: "porção", plural: "porções", pof: 6703701 },
    centavosPorKg: 700, compra: "Abobrinha",
  },
  {
    id: "alface_crespa", taco: 78, nome: "Alface crespa",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 20, max: 100, passo: 10,
    medida: { gramas: 40, rotulo: "prato de folhas", plural: "pratos de folhas" },
    centavosPorKg: 1000, compra: "Alface crespa",
  },
  {
    id: "tomate_cru", taco: 157, nome: "Tomate cru",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 30, max: 160, passo: 10,
    medida: { gramas: 100, rotulo: "unidade", plural: "unidades", pof: 6705101 },
    centavosPorKg: 800, compra: "Tomate",
  },
  {
    id: "couve_manteiga", taco: 116, nome: "Couve-manteiga refogada",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 30, max: 160, passo: 10,
    medida: { gramas: 42, rotulo: "porção", plural: "porções", pof: 6700501 },
    centavosPorKg: 900, compra: "Couve-manteiga",
  },
  {
    id: "beterraba_cozida", taco: 97, nome: "Beterraba cozida",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 30, max: 160, passo: 10,
    medida: { gramas: 43, rotulo: "porção", plural: "porções", pof: 6401101 },
    centavosPorKg: 700, compra: "Beterraba",
  },
  {
    id: "chuchu_cozido", taco: 112, nome: "Chuchu cozido",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 50, max: 220, passo: 10,
    medida: { gramas: 57, rotulo: "porção", plural: "porções", pof: 6704101 },
    centavosPorKg: 500, compra: "Chuchu",
  },
  {
    id: "repolho_cru", taco: 149, nome: "Repolho cru fatiado",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 30, max: 160, passo: 10,
    medida: { gramas: 75, rotulo: "porção", plural: "porções", pof: 6700901 },
    centavosPorKg: 500, compra: "Repolho",
  },
  {
    id: "espinafre_refogado", taco: 120, nome: "Espinafre refogado",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 40, max: 180, passo: 10,
    medida: { gramas: 67, rotulo: "porção", plural: "porções", pof: 6700701 },
    centavosPorKg: 1400, compra: "Espinafre",
  },
  {
    id: "abobora_cozida", taco: 64, nome: "Abóbora cabotiá cozida",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 50, max: 240, passo: 10,
    medida: { gramas: 70, rotulo: "porção", plural: "porções", pof: 6703901 },
    centavosPorKg: 500, compra: "Abóbora cabotiá",
  },
  {
    id: "pepino_cru", taco: 142, nome: "Pepino cru",
    papel: "vegetal", setor: "Hortifrúti", etiquetas: [],
    min: 30, max: 160, passo: 10,
    medida: { gramas: 36, rotulo: "porção", plural: "porções", pof: 6704001 },
    centavosPorKg: 700, compra: "Pepino",
  },
  {
    id: "banana_prata", taco: 182, nome: "Banana prata",
    papel: "fruta", setor: "Hortifrúti", etiquetas: [],
    min: 40, max: 180, passo: 10,
    medida: { gramas: 75, rotulo: "unidade", plural: "unidades", pof: 6801101 },
    centavosPorKg: 700, compra: "Banana prata",
  },
  {
    id: "maca_fuji", taco: 222, nome: "Maçã fuji com casca",
    papel: "fruta", setor: "Hortifrúti", etiquetas: [],
    min: 60, max: 200, passo: 10,
    medida: { gramas: 130, rotulo: "unidade", plural: "unidades" },
    centavosPorKg: 900, compra: "Maçã fuji",
  },
  {
    id: "mamao_formosa", taco: 225, nome: "Mamão formosa",
    papel: "fruta", setor: "Hortifrúti", etiquetas: [],
    min: 80, max: 300, passo: 10,
    medida: { gramas: 170, rotulo: "fatia", plural: "fatias", pof: 6803101 },
    centavosPorKg: 600, compra: "Mamão formosa",
  },
  {
    id: "laranja_pera", taco: 214, nome: "Laranja pera",
    papel: "fruta", setor: "Hortifrúti", etiquetas: [],
    min: 80, max: 260, passo: 10,
    medida: { gramas: 180, rotulo: "unidade", plural: "unidades", pof: 6801801 },
    centavosPorKg: 500, compra: "Laranja pera",
  },
  {
    id: "melancia", taco: 235, nome: "Melancia",
    papel: "fruta", setor: "Hortifrúti", etiquetas: [],
    min: 100, max: 350, passo: 10,
    medida: { gramas: 200, rotulo: "fatia", plural: "fatias", pof: 6803401 },
    centavosPorKg: 300, compra: "Melancia",
  },
  {
    id: "morango", taco: 239, nome: "Morango",
    papel: "fruta", setor: "Hortifrúti", etiquetas: [],
    min: 60, max: 250, passo: 10,
    medida: { gramas: 120, rotulo: "porção", plural: "porções", pof: 6805201 },
    centavosPorKg: 2500, compra: "Morango",
  },
  {
    id: "manga_palmer", taco: 229, nome: "Manga palmer",
    papel: "fruta", setor: "Hortifrúti", etiquetas: [],
    min: 60, max: 220, passo: 10,
    medida: { gramas: 110, rotulo: "porção", plural: "porções", pof: 6803201 },
    centavosPorKg: 800, compra: "Manga palmer",
  },
  {
    id: "abacate", taco: 163, nome: "Abacate",
    papel: "gordura", setor: "Hortifrúti", etiquetas: [],
    min: 20, max: 140, passo: 10,
    medida: { gramas: 45, rotulo: "colher de sopa", plural: "colheres de sopa", pof: 6802701 },
    centavosPorKg: 900, compra: "Abacate",
  },
  {
    id: "azeite_oliva", taco: 260, nome: "Azeite de oliva extravirgem",
    papel: "gordura", setor: "Mercearia", etiquetas: [],
    min: 2, max: 28, passo: 1,
    medida: { gramas: 2, rotulo: "colher de chá", plural: "colheres de chá", pof: 8400101 },
    centavosPorKg: 7000, compra: "Azeite de oliva extravirgem",
  },
  {
    id: "oleo_soja", taco: 272, nome: "Óleo de soja",
    papel: "gordura", setor: "Mercearia", etiquetas: ["soja"],
    min: 2, max: 24, passo: 1,
    medida: { gramas: 2, rotulo: "colher de chá", plural: "colheres de chá", pof: 8400301 },
    centavosPorKg: 1200, compra: "Óleo de soja",
  },
  {
    id: "castanha_do_para", taco: 589, nome: "Castanha-do-pará",
    papel: "gordura", setor: "Mercearia", etiquetas: ["oleaginosas"],
    min: 5, max: 40, passo: 5,
    medida: { gramas: 4, rotulo: "unidade", plural: "unidades", pof: 6600701 },
    centavosPorKg: 12000, compra: "Castanha-do-pará",
  },
  {
    id: "amendoim_torrado", taco: 558, nome: "Amendoim torrado",
    papel: "gordura", setor: "Mercearia", etiquetas: ["amendoim"],
    min: 10, max: 45, passo: 5,
    medida: { gramas: 17, rotulo: "colher de sopa", plural: "colheres de sopa", pof: 6301001 },
    centavosPorKg: 2200, compra: "Amendoim torrado",
  },
  {
    id: "linhaca", taco: 594, nome: "Semente de linhaça",
    papel: "gordura", setor: "Mercearia", etiquetas: [],
    min: 5, max: 20, passo: 5,
    medida: { gramas: 10, rotulo: "colher de sopa", plural: "colheres de sopa" },
    centavosPorKg: 2000, compra: "Linhaça",
  },
  {
    id: "cafe_sem_acucar", taco: 471, nome: "Café sem açúcar",
    papel: "livre", setor: "Bebidas", etiquetas: [],
    min: 100, max: 300, passo: 50,
    medida: { gramas: 150, rotulo: "xícara", plural: "xícaras" },
    centavosPorKg: 120, compra: "Café torrado e moído",
  },
  {
    id: "cha_preto", taco: 477, nome: "Chá preto sem açúcar",
    papel: "livre", setor: "Bebidas", etiquetas: [],
    min: 150, max: 300, passo: 50,
    medida: { gramas: 200, rotulo: "xícara", plural: "xícaras" },
    centavosPorKg: 80, compra: "Chá preto",
  },
  {
    id: "mel", taco: 507, nome: "Mel",
    papel: "carboidrato", setor: "Mercearia", etiquetas: ["mel", "acucar", "origem_animal"],
    min: 5, max: 25, passo: 5,
    medida: { gramas: 3, rotulo: "colher de chá", plural: "colheres de chá", pof: 6901602 },
    centavosPorKg: 4000, compra: "Mel",
  }
];
