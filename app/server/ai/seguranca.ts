/* =========================================================================
   Nutri&Live — guardas de segurança clínica da IA

   Este é o módulo mais importante da ponte de IA. Nada sai daqui para o
   usuário sem passar por ele, venha do gerador local ou do n8n.

   Quatro guardas, em ordem de importância:

   1. RESTRIÇÃO E ALERGIA SÃO FILTRO RÍGIDO. Antes de gerar, removemos da base
      tudo que a pessoa bloqueou. Depois de gerar, varremos a saída inteira
      (itens, receitas, lista de compras) e, se um único item escapou, o plano
      é REJEITADO por inteiro. Não existe "corrigir": uma saída que erra numa
      alergia é uma saída em que não se pode confiar.
   2. FAIXA CALÓRICA por perfil. Meta calculada é limitada à faixa segura;
      meta pedida fora da faixa é recusada.
   3. NUTRICIONISTA MANDA. Com vínculo ativo, o plano nasce `rascunho` e só
      chega ao paciente quando ela envia. Sem vínculo, nasce `ativo` e
      explicitamente marcado como material educativo.
   4. SINAIS DE CAUTELA. Gestação, amamentação, menor de idade, histórico de
      transtorno alimentar, doença crônica declarada e IMC crítico não geram
      plano automático: geram orientação para procurar profissional.
   ========================================================================= */
import type { Alimento, Etiqueta } from "./alimentos.js";
import { ALIMENTOS, POR_ID, kcalDe } from "./alimentos.js";
import type {
  ContextoValidacaoBase, ItemRefeicao, Macros, OrientacaoProfissional, PerfilNutricional,
  PlanoAlimentar, Receita, SaidaReceitas
} from "./tipos.js";

export type { ContextoValidacaoBase } from "./tipos.js";

/* ======================================================================== */
/*  Erro de violação                                                        */
/* ======================================================================== */

/** Falha de segurança clínica. O plano inteiro é descartado. */
export class ViolacaoClinica extends Error {
  constructor(
    readonly motivo:
      | "restricao_violada" | "caloria_fora_da_faixa" | "macros_inconsistentes"
      | "saida_malformada" | "sem_alimento_disponivel" | "proteina_fora_da_faixa",
    /** Mensagem pronta para o usuário, em português. */
    readonly mensagem: string,
    /** Detalhes técnicos, para o log e para o admin. */
    readonly detalhes: string[] = []
  ) {
    super(`${motivo}: ${mensagem}${detalhes.length ? ` (${detalhes.join("; ")})` : ""}`);
    this.name = "ViolacaoClinica";
  }
}

/* ======================================================================== */
/*  Normalização de texto                                                   */
/* ======================================================================== */

/** Minúsculas, sem acento, sem pontuação, espaços colapsados. */
export const normalizar = (texto: string): string =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const escapar = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Casa o termo como palavra inteira, aceitando plural simples. */
const contemTermo = (textoNormalizado: string, termo: string): boolean =>
  new RegExp(`\\b${escapar(termo)}(s|es)?\\b`).test(textoNormalizado);

/* ======================================================================== */
/*  Dicionário de bloqueio                                                  */
/* ======================================================================== */

interface VerbeteEtiqueta {
  /** Rótulo em português, para a mensagem ao usuário. */
  rotulo: string;
  /** Termos que denunciam a presença do alimento num texto livre. */
  termos: string[];
  /** Frases que NEUTRALIZAM o termo ("leite de coco" não tem lactose). */
  excecoes: string[];
}

const EXCECOES_LACTEAS = [
  "leite de coco", "leite de amendoa", "leite de castanha", "leite de soja",
  "leite de aveia", "leite de arroz", "leite de inhame", "leite vegetal",
  "bebida vegetal", "sem lactose", "zero lactose", "queijo vegano",
  "iogurte vegetal", "iogurte de coco", "creme de coco", "requeijao vegano"
];

export const DICIONARIO: Record<Etiqueta, VerbeteEtiqueta> = {
  lactose: {
    rotulo: "lactose e derivados do leite",
    termos: [
      "lactose", "leite", "leite condensado", "leite em po", "queijo", "mussarela",
      "muçarela", "minas frescal", "parmesao", "prato", "cottage", "ricota",
      "iogurte", "coalhada", "requeijao", "cream cheese", "manteiga", "nata",
      "creme de leite", "doce de leite", "achocolatado", "whey", "soro do leite",
      "chantilly", "sorvete de massa", "bebida lactea"
    ],
    excecoes: EXCECOES_LACTEAS
  },
  leite: {
    rotulo: "proteína do leite",
    termos: [
      "leite", "queijo", "mussarela", "minas frescal", "iogurte", "requeijao",
      "manteiga", "nata", "creme de leite", "whey", "soro do leite", "caseina",
      "cream cheese", "coalhada", "ricota", "parmesao"
    ],
    excecoes: EXCECOES_LACTEAS
  },
  gluten: {
    rotulo: "glúten",
    termos: [
      "gluten", "trigo", "farinha de trigo", "pao", "macarrao", "massa de trigo",
      "cevada", "centeio", "malte", "semola", "aveia", "biscoito", "bolacha",
      "torrada", "bolo", "cuscuz marroquino", "cerveja", "seitan", "panqueca",
      "pizza", "lasanha", "nhoque", "farofa de farinha de trigo"
    ],
    excecoes: [
      "sem gluten", "pao sem gluten", "pao de queijo", "pao de tapioca",
      "massa de tapioca", "macarrao sem gluten", "macarrao de arroz",
      "macarrao de milho", "farinha de arroz", "farinha de amendoa",
      "farinha de coco", "farinha de mandioca", "aveia sem gluten",
      "biscoito de arroz", "cerveja sem gluten"
    ]
  },
  trigo: {
    rotulo: "trigo",
    termos: [
      "trigo", "farinha de trigo", "pao", "macarrao", "semola", "torrada",
      "biscoito", "bolacha", "bolo", "pizza", "lasanha", "panqueca"
    ],
    excecoes: [
      "pao sem gluten", "pao de queijo", "pao de tapioca", "massa de tapioca",
      "macarrao de arroz", "macarrao de milho", "farinha de arroz",
      "farinha de amendoa", "farinha de coco", "farinha de mandioca"
    ]
  },
  ovo: {
    rotulo: "ovo",
    termos: [
      "ovo", "ovos", "clara de ovo", "gema", "omelete", "maionese", "merengue",
      "ovo cozido", "ovo mexido", "ovo frito", "ovo de galinha", "albumina"
    ],
    excecoes: ["sem ovo", "maionese vegana", "sem ovos"]
  },
  amendoim: {
    rotulo: "amendoim",
    termos: [
      "amendoim", "pasta de amendoim", "pacoca", "pacoquinha", "pe de moleque",
      "manteiga de amendoim", "amendoim torrado"
    ],
    excecoes: ["sem amendoim"]
  },
  oleaginosas: {
    rotulo: "castanhas e nozes",
    termos: [
      "castanha", "castanha de caju", "castanha do para", "noz", "nozes",
      "amendoa", "avela", "pistache", "macadamia", "pecan", "nut mix",
      "mix de castanhas", "farinha de amendoa", "pasta de castanha"
    ],
    excecoes: ["sem castanha", "sem oleaginosas"]
  },
  peixe: {
    rotulo: "peixe",
    termos: [
      "peixe", "tilapia", "salmao", "sardinha", "atum", "merluza", "bacalhau",
      "pescada", "tainha", "cacao", "anchova", "linguado", "robalo", "traira",
      "filé de peixe", "file de peixe", "surimi"
    ],
    excecoes: ["sem peixe"]
  },
  frutos_do_mar: {
    rotulo: "frutos do mar",
    termos: [
      "frutos do mar", "camarao", "lula", "polvo", "marisco", "mexilhao",
      "siri", "caranguejo", "ostra", "vongole", "lagosta", "sururu", "vieira"
    ],
    excecoes: ["sem frutos do mar"]
  },
  soja: {
    rotulo: "soja",
    termos: [
      "soja", "tofu", "shoyu", "shoyo", "edamame", "proteina de soja",
      "proteina texturizada", "misso", "tempeh", "oleo de soja", "lecitina de soja",
      "extrato de soja", "leite de soja"
    ],
    excecoes: ["sem soja"]
  },
  carne_vermelha: {
    rotulo: "carne vermelha",
    termos: [
      "carne vermelha", "carne bovina", "carne moida", "patinho", "acem",
      "alcatra", "coxao mole", "coxao duro", "picanha", "file mignon", "maminha",
      "contra file", "costela", "bife", "boi", "carne de boi", "cordeiro",
      "carneiro", "cupim", "musculo"
    ],
    excecoes: ["sem carne vermelha", "carne de soja", "carne vegetal"]
  },
  carne_suina: {
    rotulo: "carne de porco",
    termos: [
      "porco", "suino", "lombo suino", "bacon", "linguica", "presunto",
      "salsicha", "toucinho", "pernil", "costelinha", "mortadela", "copa",
      "paio", "pancetta"
    ],
    excecoes: ["sem porco", "presunto vegano", "linguica vegana"]
  },
  aves: {
    rotulo: "aves",
    termos: [
      "frango", "galinha", "peito de frango", "coxa de frango", "sobrecoxa",
      "peru", "chester", "ave", "aves", "file de frango", "filé de frango",
      "asa de frango", "peito de peru"
    ],
    excecoes: ["sem frango", "frango vegano", "frango de jaca"]
  },
  mel: { rotulo: "mel", termos: ["mel", "melado", "mel de abelha"], excecoes: ["sem mel"] },
  acucar: {
    rotulo: "açúcar",
    termos: [
      "acucar", "acucar refinado", "acucar mascavo", "rapadura", "melado",
      "refrigerante", "xarope de glicose", "glicose de milho", "sacarose"
    ],
    excecoes: ["sem acucar", "zero acucar", "acucar de coco"]
  },
  milho: {
    rotulo: "milho",
    termos: [
      "milho", "flocao", "cuscuz de milho", "canjica", "pipoca", "fuba",
      "polenta", "maisena", "amido de milho", "creme de milho", "curau"
    ],
    excecoes: ["sem milho"]
  },
  origem_animal: {
    rotulo: "alimentos de origem animal",
    termos: [
      "carne", "frango", "galinha", "peru", "peixe", "atum", "sardinha",
      "tilapia", "salmao", "camarao", "porco", "bacon", "presunto", "linguica",
      "ovo", "ovos", "leite", "queijo", "iogurte", "requeijao", "manteiga",
      "nata", "creme de leite", "mel", "gelatina", "banha", "mussarela", "whey"
    ],
    excecoes: [
      ...EXCECOES_LACTEAS, "carne de soja", "carne vegetal", "frango de jaca",
      "queijo vegano", "presunto vegano", "linguica vegana", "maionese vegana",
      "gelatina vegetal", "manteiga de coco", "manteiga de amendoim"
    ]
  }
};

/** Conjuntos de etiquetas por estilo alimentar declarado. */
const ESTILOS: Record<string, Etiqueta[]> = {
  vegetariano: ["aves", "carne_vermelha", "carne_suina", "peixe", "frutos_do_mar"],
  vegetariana: ["aves", "carne_vermelha", "carne_suina", "peixe", "frutos_do_mar"],
  ovolactovegetariano: ["aves", "carne_vermelha", "carne_suina", "peixe", "frutos_do_mar"],
  vegano: [
    "aves", "carne_vermelha", "carne_suina", "peixe", "frutos_do_mar",
    "ovo", "leite", "lactose", "mel", "origem_animal"
  ],
  vegana: [
    "aves", "carne_vermelha", "carne_suina", "peixe", "frutos_do_mar",
    "ovo", "leite", "lactose", "mel", "origem_animal"
  ],
  sem_lactose: ["lactose", "leite"],
  sem_gluten: ["gluten", "trigo"],
  pescetariano: ["aves", "carne_vermelha", "carne_suina"]
};

/** O que o usuário escreve → etiquetas que isso bloqueia. */
const SINONIMOS: { termos: string[]; etiquetas: Etiqueta[] }[] = [
  { termos: ["lactose", "intolerancia a lactose", "intolerante a lactose", "sem lactose", "lactosa"], etiquetas: ["lactose", "leite"] },
  { termos: ["leite", "laticinios", "lacteos", "derivados do leite", "apln", "alergia a proteina do leite", "proteina do leite", "sem leite"], etiquetas: ["lactose", "leite"] },
  { termos: ["gluten", "sem gluten", "celiaco", "celiaca", "doenca celiaca", "trigo", "farinha de trigo"], etiquetas: ["gluten", "trigo"] },
  { termos: ["ovo", "ovos", "alergia a ovo", "sem ovo"], etiquetas: ["ovo"] },
  { termos: ["amendoim", "alergia a amendoim"], etiquetas: ["amendoim"] },
  { termos: ["oleaginosas", "castanhas", "castanha", "nozes", "amendoas", "frutos secos", "nuts"], etiquetas: ["oleaginosas"] },
  { termos: ["peixe", "peixes", "sem peixe"], etiquetas: ["peixe"] },
  { termos: ["frutos do mar", "camarao", "mariscos", "crustaceos", "moluscos"], etiquetas: ["frutos_do_mar"] },
  { termos: ["soja", "sem soja"], etiquetas: ["soja"] },
  { termos: ["carne vermelha", "carne bovina", "carne de boi", "boi", "bovina"], etiquetas: ["carne_vermelha"] },
  { termos: ["carne de porco", "porco", "suino", "suina"], etiquetas: ["carne_suina"] },
  { termos: ["frango", "aves", "galinha", "carne de frango"], etiquetas: ["aves"] },
  { termos: ["carne", "carnes", "sem carne"], etiquetas: ["aves", "carne_vermelha", "carne_suina"] },
  { termos: ["mel"], etiquetas: ["mel"] },
  { termos: ["milho"], etiquetas: ["milho"] },
  { termos: ["acucar", "sem acucar", "acucar refinado"], etiquetas: ["acucar"] },
  { termos: ["vegetariano", "vegetariana", "ovolactovegetariano"], etiquetas: ESTILOS.vegetariano! },
  { termos: ["vegano", "vegana", "plant based", "vegetalino"], etiquetas: ESTILOS.vegano! },
  { termos: ["pescetariano", "pescetariana"], etiquetas: ESTILOS.pescetariano! }
];

/** O resultado da leitura das restrições. */
export interface Bloqueio {
  /** Etiquetas proibidas. Filtro rígido. */
  etiquetas: Set<Etiqueta>;
  /** Termos literais proibidos (restrição que não mapeou para etiqueta). */
  termos: string[];
  /** Termos que só evitamos quando dá (o que a pessoa não gosta). */
  evitar: string[];
  /** Etiquetas que só evitamos quando dá. */
  evitarEtiquetas: Set<Etiqueta>;
  /** Restrições declaradas, do jeito que a pessoa escreveu. */
  declaradas: string[];
  /** Rótulos em português do que foi bloqueado, para mostrar no plano. */
  rotulos: string[];
}

const resolver = (texto: string): { etiquetas: Etiqueta[]; literal: string | null } => {
  const n = normalizar(texto);
  if (!n) return { etiquetas: [], literal: null };
  const achadas = new Set<Etiqueta>();
  for (const s of SINONIMOS) {
    for (const t of s.termos) {
      if (n === t || contemTermo(n, t)) {
        for (const e of s.etiquetas) achadas.add(e);
      }
    }
  }
  if (achadas.size > 0) return { etiquetas: [...achadas], literal: null };
  /* Restrição que não conhecemos vira bloqueio literal: se a pessoa escreveu
     "quiabo", nenhum item com "quiabo" no nome entra no plano. */
  return { etiquetas: [], literal: n.length >= 3 ? n : null };
};

/** Lê restrições, alergias, estilo alimentar e desgostos do perfil. */
export function montarBloqueio(perfil: PerfilNutricional): Bloqueio {
  const etiquetas = new Set<Etiqueta>();
  const termos: string[] = [];
  const declaradas: string[] = [];
  const rotulos = new Set<string>();

  for (const bruta of perfil.restrictions ?? []) {
    if (typeof bruta !== "string" || !bruta.trim()) continue;
    declaradas.push(bruta.trim());
    const { etiquetas: es, literal } = resolver(bruta);
    for (const e of es) { etiquetas.add(e); rotulos.add(DICIONARIO[e].rotulo); }
    if (literal) { termos.push(literal); rotulos.add(bruta.trim()); }
  }

  const estilo = normalizar(perfil.dietStyle ?? "").replace(/ /g, "_");
  const doEstilo = ESTILOS[estilo];
  if (doEstilo) {
    for (const e of doEstilo) { etiquetas.add(e); rotulos.add(DICIONARIO[e].rotulo); }
    rotulos.add(perfil.dietStyle!.trim());
  }

  const evitar: string[] = [];
  const evitarEtiquetas = new Set<Etiqueta>();
  for (const bruta of perfil.dislikes ?? []) {
    if (typeof bruta !== "string" || !bruta.trim()) continue;
    const { etiquetas: es, literal } = resolver(bruta);
    for (const e of es) evitarEtiquetas.add(e);
    if (literal) evitar.push(literal);
  }

  return {
    etiquetas, termos, evitar, evitarEtiquetas,
    declaradas, rotulos: [...rotulos]
  };
}

/* ======================================================================== */
/*  Filtro rígido                                                           */
/* ======================================================================== */

/** Remove as frases-exceção antes de procurar os termos proibidos. */
const limpar = (textoNormalizado: string, excecoes: string[]): string => {
  let t = ` ${textoNormalizado} `;
  for (const e of [...excecoes].sort((a, b) => b.length - a.length)) {
    t = t.split(` ${e} `).join("  ");
    t = t.replace(new RegExp(`\\b${escapar(e)}\\b`, "g"), " ");
  }
  return t.replace(/\s+/g, " ").trim();
};

export interface Achado {
  /** Etiqueta violada, quando o termo veio do dicionário. */
  etiqueta: Etiqueta | null;
  /** Termo encontrado no texto. */
  termo: string;
  /** Texto em que o termo apareceu. */
  onde: string;
}

/**
 * Procura, num texto livre, qualquer coisa que o bloqueio proíbe.
 * Usado contra a saída do modelo: é a última linha de defesa.
 */
export function textoViola(texto: string, bloq: Bloqueio): Achado | null {
  if (!texto) return null;
  const n = normalizar(texto);
  if (!n) return null;

  for (const etiqueta of bloq.etiquetas) {
    const verbete = DICIONARIO[etiqueta];
    const limpo = limpar(n, verbete.excecoes);
    for (const termo of verbete.termos) {
      const tn = normalizar(termo);
      if (tn && contemTermo(limpo, tn)) return { etiqueta, termo: tn, onde: texto };
    }
  }
  for (const termo of bloq.termos) {
    if (contemTermo(n, termo)) return { etiqueta: null, termo, onde: texto };
  }
  return null;
}

/**
 * Todos os termos que `textoViola` procura, numa lista só.
 *
 * Existe para o payload do n8n poder carregar essa lista: um fluxo externo
 * que não sabe quais palavras são proibidas escreve "Iogurte com fruta" no
 * título de uma refeição sem lactose — escolhendo um substituto correto — e
 * o plano inteiro é recusado por causa do título. Com a lista em mão, o
 * fluxo troca o título antes de mandar, e o prompt diz ao modelo o que
 * nunca escrever.
 *
 * É a mesma fonte que a validação usa, então as duas nunca divergem.
 */
export function termosBloqueados(bloq: Bloqueio): string[] {
  const fora = new Set<string>();
  for (const etiqueta of bloq.etiquetas) {
    for (const termo of DICIONARIO[etiqueta].termos) {
      const n = normalizar(termo);
      if (n) fora.add(n);
    }
  }
  for (const termo of bloq.termos) {
    const n = normalizar(termo);
    if (n) fora.add(n);
  }
  return [...fora].sort();
}

/** O alimento da base pode entrar no plano desta pessoa? */
export function alimentoPermitido(a: Alimento, bloq: Bloqueio): boolean {
  for (const e of a.etiquetas) if (bloq.etiquetas.has(e)) return false;
  const nomes = [a.nome, a.compra ?? "", a.id.replace(/_/g, " ")];
  for (const nome of nomes) {
    const n = normalizar(nome);
    for (const termo of bloq.termos) if (contemTermo(n, termo)) return false;
  }
  return true;
}

/** É melhor evitar este alimento (a pessoa disse que não gosta)? */
export function alimentoEvitado(a: Alimento, bloq: Bloqueio): boolean {
  for (const e of a.etiquetas) if (bloq.evitarEtiquetas.has(e)) return true;
  const n = normalizar(`${a.nome} ${a.compra ?? ""}`);
  for (const termo of bloq.evitar) if (contemTermo(n, termo)) return true;
  return false;
}

/** A base de alimentos já filtrada pelo que a pessoa não pode comer. */
export function baseFiltrada(bloq: Bloqueio, base: Alimento[] = ALIMENTOS): Alimento[] {
  return base.filter((a) => alimentoPermitido(a, bloq));
}

/* ======================================================================== */
/*  Sinais de cautela                                                       */
/* ======================================================================== */

export interface SinalCautela {
  id: string;
  rotulo: string;
  orientacao: string;
  termos: string[];
}

/**
 * Situações em que o sistema NÃO gera plano automático. A lista é propositalmente
 * conservadora: nestes casos a conduta alimentar é individualizada e exige
 * avaliação de nutricionista ou médico.
 */
export const SINAIS_CAUTELA: SinalCautela[] = [
  {
    id: "gestacao",
    rotulo: "gestação",
    orientacao: "Na gravidez a necessidade de energia, ferro, ácido fólico e cálcio muda a cada trimestre. O acompanhamento tem que ser individual.",
    termos: ["gestante", "gestacao", "gravida", "gravidez", "estou gravida", "primeiro trimestre", "segundo trimestre", "terceiro trimestre", "pre natal"]
  },
  {
    id: "amamentacao",
    rotulo: "amamentação",
    orientacao: "Quem amamenta precisa de um acréscimo calórico e hídrico calculado caso a caso, sem risco para a produção de leite.",
    termos: ["amamentando", "amamentacao", "lactante", "puerperio", "pos parto", "aleitamento"]
  },
  {
    id: "menor_de_idade",
    rotulo: "menor de 18 anos",
    orientacao: "Criança e adolescente estão em crescimento: a conduta usa curvas de crescimento, não meta de calorias de adulto.",
    termos: ["menor de idade", "adolescente", "crianca"]
  },
  {
    id: "transtorno_alimentar",
    rotulo: "histórico de transtorno alimentar",
    orientacao: "Com histórico de transtorno alimentar, contagem de calorias e plano rígido podem piorar o quadro. O cuidado é multiprofissional.",
    termos: ["transtorno alimentar", "anorexia", "bulimia", "compulsao alimentar", "tcap", "anorexia nervosa", "bulimia nervosa", "ortorexia", "purgacao", "distorcao de imagem"]
  },
  {
    id: "doenca_renal",
    rotulo: "doença renal",
    orientacao: "Na doença renal, proteína, potássio, fósforo e sódio são controlados por prescrição. Um plano genérico pode fazer mal.",
    termos: ["doenca renal", "insuficiencia renal", "renal cronica", "dialise", "hemodialise", "transplante renal", "nefropatia", "calculo renal"]
  },
  {
    id: "diabetes",
    rotulo: "diabetes",
    orientacao: "Com diabetes, a distribuição de carboidrato ao longo do dia caminha junto com a medicação. Isso é prescrição, não sugestão.",
    termos: ["diabetes", "diabetico", "diabetica", "diabetes tipo 1", "diabetes tipo 2", "insulina", "dm1", "dm2", "pre diabetes"]
  },
  {
    id: "doenca_hepatica",
    rotulo: "doença hepática",
    orientacao: "Hepatopatia muda a tolerância a proteína e a sódio. A conduta é individual e acompanhada.",
    termos: ["cirrose", "hepatopatia", "doenca hepatica", "esteatose avancada", "hepatite cronica", "transplante de figado"]
  },
  {
    id: "doenca_cardiaca",
    rotulo: "doença cardíaca",
    orientacao: "Insuficiência cardíaca pede controle rigoroso de sódio e de líquidos, feito com a equipe que acompanha o caso.",
    termos: ["insuficiencia cardiaca", "cardiopatia", "infarto", "pos infarto", "arritmia grave", "anticoagulante", "varfarina", "marevan"]
  },
  {
    id: "cancer",
    rotulo: "tratamento oncológico",
    orientacao: "Em tratamento oncológico a prioridade é manter peso e massa magra, com ajuste por efeito colateral. Precisa de nutricionista.",
    termos: ["cancer", "oncologico", "quimioterapia", "radioterapia", "neoplasia", "tumor"]
  },
  {
    id: "cirurgia_bariatrica",
    rotulo: "cirurgia bariátrica",
    orientacao: "Depois da bariátrica a progressão de consistência e a suplementação seguem protocolo da equipe cirúrgica.",
    termos: ["bariatrica", "bypass gastrico", "sleeve", "gastroplastia", "balao gastrico", "reducao de estomago"]
  },
  {
    id: "doenca_inflamatoria_intestinal",
    rotulo: "doença inflamatória intestinal",
    orientacao: "Crohn e retocolite têm fases de atividade e remissão, cada uma com conduta própria.",
    termos: ["crohn", "retocolite", "colite ulcerativa", "doenca inflamatoria intestinal", "dii"]
  }
];

export interface SinalDetectado {
  id: string;
  rotulo: string;
  orientacao: string;
  /** De onde veio o sinal, para a nutricionista conferir. */
  origem: string;
}

/** Idade em anos a partir da data de nascimento ISO. */
export const idadeEmAnos = (birthDate: string | null | undefined, hoje = new Date()): number | null => {
  if (!birthDate) return null;
  const d = new Date(`${birthDate}`.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return null;
  let anos = hoje.getUTCFullYear() - d.getUTCFullYear();
  const m = hoje.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && hoje.getUTCDate() < d.getUTCDate())) anos--;
  return anos >= 0 && anos < 130 ? anos : null;
};

export const imc = (perfil: PerfilNutricional): number | null => {
  const kg = perfil.weightKg ?? null;
  const cm = perfil.heightCm ?? null;
  if (!kg || !cm || cm < 80) return null;
  const m = cm / 100;
  return Math.round((kg / (m * m)) * 10) / 10;
};

/**
 * Procura sinais que exigem cautela. Qualquer sinal encontrado impede a
 * geração automática de plano.
 *
 * Fontes: campos explícitos (`conditions`, `pregnant`, `breastfeeding`), o
 * texto livre de `restrictions` e `dislikes` — que é onde isso chega hoje,
 * porque `profiles` ainda não tem coluna de condição de saúde — a data de
 * nascimento e o IMC.
 */
export function detectarSinaisDeCautela(
  perfil: PerfilNutricional, hoje = new Date()
): SinalDetectado[] {
  const achados = new Map<string, SinalDetectado>();
  const anotar = (sinal: SinalCautela, origem: string) => {
    if (!achados.has(sinal.id)) {
      achados.set(sinal.id, {
        id: sinal.id, rotulo: sinal.rotulo, orientacao: sinal.orientacao, origem
      });
    }
  };

  const textos: string[] = [
    ...(perfil.conditions ?? []),
    ...(perfil.restrictions ?? []),
    ...(perfil.dislikes ?? [])
  ].filter((t): t is string => typeof t === "string" && t.trim().length > 0);

  for (const texto of textos) {
    const n = normalizar(texto);
    for (const sinal of SINAIS_CAUTELA) {
      for (const termo of sinal.termos) {
        if (contemTermo(n, normalizar(termo))) { anotar(sinal, texto.trim()); break; }
      }
    }
  }

  const porId = (id: string) => SINAIS_CAUTELA.find((s) => s.id === id)!;
  if (perfil.pregnant) anotar(porId("gestacao"), "gestação informada no perfil");
  if (perfil.breastfeeding) anotar(porId("amamentacao"), "amamentação informada no perfil");

  const idade = idadeEmAnos(perfil.birthDate, hoje);
  if (idade !== null && idade < 18) {
    anotar(porId("menor_de_idade"), `${idade} anos pela data de nascimento`);
  }

  const i = imc(perfil);
  if (i !== null && (i < 17 || i > 40)) {
    achados.set("imc_critico", {
      id: "imc_critico",
      rotulo: i < 17 ? "IMC muito baixo" : "obesidade grave",
      orientacao: i < 17
        ? "Com IMC abaixo de 17 o objetivo é recuperar peso com segurança, e isso é acompanhamento, não plano automático."
        : "Com IMC acima de 40 a conduta é multiprofissional e costuma envolver avaliação médica.",
      origem: `IMC calculado: ${i}`
    });
  }

  return [...achados.values()];
}

export const AVISO_EDUCATIVO =
  "Este é material educativo gerado por cálculo, não uma prescrição. " +
  "O Nutri&Live organiza e calcula; o julgamento clínico é de um nutricionista habilitado. " +
  "Procure um profissional antes de mudanças importantes na sua alimentação.";

/** Monta a resposta de orientação para quando não se deve gerar plano. */
export function orientacaoProfissional(
  sinais: SinalDetectado[], nome: string
): OrientacaoProfissional {
  const lista = sinais.map((s) => s.rotulo);
  return {
    tipo: "orientacao_profissional",
    versao: 1,
    titulo: "Aqui a gente para e te encaminha",
    mensagem:
      `${nome ? `${nome.split(" ")[0]}, ` : ""}` +
      `pelo que você informou (${lista.join(", ")}), o certo não é um plano gerado por cálculo. ` +
      "Nessas situações a conduta alimentar é individual e precisa de avaliação profissional. " +
      "O app continua todo seu para registrar o dia, a hidratação e a evolução — o que a gente não faz é " +
      "montar o plano sozinho.",
    sinais: sinais.map((s) => ({ id: s.id, rotulo: s.rotulo, orientacao: s.orientacao })),
    comoProsseguir: [
      "Se você já tem nutricionista, conecte o seu perfil ao painel dela em Menu › Conta › Minha nutricionista: ela monta e envia o plano por aqui.",
      "Se ainda não tem, procure um nutricionista com registro ativo no CRN. A consulta pode ser presencial ou on-line.",
      "Enquanto isso, use o diário alimentar e o registro de medidas: é material valioso para a primeira consulta.",
      "Se houver doença em acompanhamento, leve também a orientação do médico responsável."
    ]
  };
}

/* ======================================================================== */
/*  Faixa calórica segura                                                   */
/* ======================================================================== */

export interface FaixaCalorica {
  min: number;
  max: number;
  motivo: string;
}

/** Piso e teto absolutos: abaixo/acima disso não existe cenário aceitável. */
export const PISO_ABSOLUTO = 1000;
export const TETO_ABSOLUTO = 5000;

/**
 * Faixa calórica aceitável para o perfil. Abaixo do piso há risco de
 * desnutrição e de perda de massa magra; acima do teto o plano deixa de ser
 * plausível para um adulto sem supervisão.
 */
export function faixaCalorica(perfil: PerfilNutricional, tmb?: number | null): FaixaCalorica {
  const sexo = normalizar(perfil.sex ?? "");
  const feminino = sexo.startsWith("f") || sexo.includes("mulher");
  const masculino = sexo.startsWith("m") && !sexo.includes("mulher");

  let min = feminino ? 1200 : masculino ? 1500 : 1200;
  let max = feminino ? 3500 : masculino ? 4200 : 4000;
  const motivos: string[] = [feminino ? "faixa para mulher adulta" : masculino ? "faixa para homem adulto" : "faixa adulta genérica"];

  const idade = idadeEmAnos(perfil.birthDate);
  if (idade !== null && idade >= 65) {
    min = Math.max(min, feminino ? 1400 : 1600);
    motivos.push("piso elevado por idade acima de 65 anos");
  }

  if (tmb && tmb > 0) {
    min = Math.max(min, Math.round(tmb * 0.8));
    max = Math.min(max, Math.round(tmb * 2.2));
    motivos.push(`limitado pela taxa metabólica basal estimada (${Math.round(tmb)} kcal)`);
  }

  min = Math.max(min, PISO_ABSOLUTO);
  max = Math.min(max, TETO_ABSOLUTO);
  if (max <= min) max = min + 400;

  return { min, max, motivo: motivos.join("; ") };
}

/** Limita uma meta CALCULADA à faixa segura, avisando quando precisou cortar. */
export function ajustarParaFaixa(
  kcal: number, perfil: PerfilNutricional, tmb?: number | null
): { kcal: number; aviso: string | null; faixa: FaixaCalorica } {
  const faixa = faixaCalorica(perfil, tmb);
  if (kcal < faixa.min) {
    return {
      kcal: faixa.min, faixa,
      aviso: `A meta calculada ficaria em ${Math.round(kcal)} kcal, abaixo do mínimo seguro para o seu perfil. Subimos para ${faixa.min} kcal.`
    };
  }
  if (kcal > faixa.max) {
    return {
      kcal: faixa.max, faixa,
      aviso: `A meta calculada ficaria em ${Math.round(kcal)} kcal, acima do máximo que geramos sem supervisão. Limitamos a ${faixa.max} kcal.`
    };
  }
  return { kcal: Math.round(kcal), aviso: null, faixa };
}

/** Recusa uma meta PEDIDA fora da faixa segura. */
export function validarMetaCalorica(
  kcal: number, perfil: PerfilNutricional, tmb?: number | null
): void {
  const faixa = faixaCalorica(perfil, tmb);
  if (!Number.isFinite(kcal) || kcal <= 0) {
    throw new ViolacaoClinica(
      "caloria_fora_da_faixa", "A meta calórica informada não é um número válido.",
      [`kcal=${kcal}`]
    );
  }
  if (kcal < faixa.min) {
    throw new ViolacaoClinica(
      "caloria_fora_da_faixa",
      `Não geramos plano com ${Math.round(kcal)} kcal por dia: o mínimo seguro para o seu perfil é ${faixa.min} kcal. ` +
      "Uma meta tão baixa precisa de acompanhamento de nutricionista.",
      [faixa.motivo]
    );
  }
  if (kcal > faixa.max) {
    throw new ViolacaoClinica(
      "caloria_fora_da_faixa",
      `Não geramos plano com ${Math.round(kcal)} kcal por dia: o máximo que calculamos para o seu perfil é ${faixa.max} kcal.`,
      [faixa.motivo]
    );
  }
}

/* ======================================================================== */
/*  Quem publica o plano                                                    */
/* ======================================================================== */

export interface StatusInicial {
  status: "rascunho" | "ativo";
  materialEducativo: boolean;
  visivelParaOPaciente: boolean;
  avisos: string[];
}

/**
 * Com nutricionista vinculada, o plano gerado nasce rascunho e só vai para o
 * paciente quando ela envia (`POST /api/org/members/:userId/plan`). Sem
 * nutricionista, nasce ativo, mas marcado como material educativo.
 */
export function statusInicialDoPlano(temNutricionistaVinculada: boolean): StatusInicial {
  if (temNutricionistaVinculada) {
    return {
      status: "rascunho",
      materialEducativo: false,
      visivelParaOPaciente: false,
      avisos: [
        "Este plano é um rascunho calculado pelo sistema. Ele fica visível para a sua nutricionista revisar e só chega até você quando ela enviar.",
        "A prescrição é ato do profissional, com o CRN dele. O sistema só adianta o cálculo."
      ]
    };
  }
  return {
    status: "ativo",
    materialEducativo: true,
    visivelParaOPaciente: true,
    avisos: [AVISO_EDUCATIVO]
  };
}

/* ======================================================================== */
/*  Validação da saída — a última linha de defesa                           */
/* ======================================================================== */

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const perto = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

const macrosValidos = (m: unknown): m is Macros =>
  !!m && typeof m === "object" &&
  ["protein", "carb", "fat"].every((k) => {
    const v = (m as Record<string, unknown>)[k];
    return typeof v === "number" && Number.isFinite(v) && v >= 0;
  });

/**
 * Valida o plano INTEIRO. Qualquer violação derruba o plano todo — não
 * tentamos consertar: uma saída que escapou numa alergia não é confiável.
 *
 * Serve tanto para a saída do gerador local (cinto e suspensório) quanto para
 * o que o n8n devolve no callback, que é a razão principal deste código
 * existir.
 */
export function validarPlano(
  bruto: unknown, ctx: ContextoValidacaoBase
): PlanoAlimentar {
  const problemas: string[] = [];
  const p = bruto as PlanoAlimentar;

  if (!p || typeof p !== "object" || p.tipo !== "plano_alimentar" || !Array.isArray(p.dias) || p.dias.length === 0) {
    throw new ViolacaoClinica(
      "saida_malformada",
      "A geração voltou num formato que não conseguimos ler. Não vamos te mostrar um plano pela metade.",
      ["esperado tipo=plano_alimentar com dias[]"]
    );
  }

  const tolItem = 1.0, tolRefeicao = 2.0, tolDia = 6.0;
  const toleranciaKcal = ctx.toleranciaKcal ?? 0.05;

  /* --------- 1. filtro rígido: nada bloqueado em nenhum lugar ----------- */
  const violacoes: Achado[] = [];
  const checar = (texto: string) => {
    const a = textoViola(texto, ctx.bloqueio);
    if (a) violacoes.push(a);
  };

  for (const dia of p.dias) {
    if (!dia || !Array.isArray(dia.refeicoes) || dia.refeicoes.length === 0) {
      problemas.push(`dia ${dia?.dia ?? "?"} sem refeições`);
      continue;
    }
    for (const r of dia.refeicoes) {
      if (!r || !Array.isArray(r.itens)) { problemas.push("refeição sem itens"); continue; }
      checar(r.titulo ?? "");
      for (const passo of r.preparo ?? []) checar(passo);
      for (const it of r.itens) {
        checar(it?.nome ?? "");
        const base = it?.alimentoId ? POR_ID.get(it.alimentoId) : undefined;
        if (base && !alimentoPermitido(base, ctx.bloqueio)) {
          violacoes.push({ etiqueta: base.etiquetas[0] ?? null, termo: base.nome, onde: `item ${base.nome}` });
        }
      }
    }
  }
  for (const rec of p.receitas ?? []) {
    checar(rec?.title ?? "");
    for (const ing of rec?.ingredients ?? []) checar(ing);
    for (const st of rec?.steps ?? []) checar(st);
  }
  for (const item of p.listaDeCompras?.items ?? []) checar(item?.name ?? "");

  if (violacoes.length > 0) {
    const nomes = [...new Set(violacoes.map((v) => v.termo))].slice(0, 6);
    throw new ViolacaoClinica(
      "restricao_violada",
      "A geração sugeriu um alimento que está nas suas restrições, então descartamos o plano inteiro e não vamos te mostrar nada arriscado. " +
      "Pode pedir de novo: a tentativa foi registrada.",
      [`termos encontrados: ${nomes.join(", ")}`, `restrições: ${ctx.bloqueio.declaradas.join(", ") || "(estilo alimentar)"}`]
    );
  }

  /* ------------- 2. macros fecham com as calorias (4/4/9) --------------- */
  for (const dia of p.dias) {
    for (const r of dia.refeicoes) {
      for (const it of r.itens) {
        if (!macrosValidos(it.macros) || typeof it.kcal !== "number") {
          problemas.push(`item "${it?.nome ?? "?"}" sem macros válidos`);
          continue;
        }
        const esperado = kcalDe(it.macros.protein, it.macros.carb, it.macros.fat);
        if (!perto(it.kcal, esperado, tolItem)) {
          problemas.push(`item "${it.nome}": ${it.kcal} kcal declaradas contra ${esperado.toFixed(1)} kcal dos macros`);
        }
      }
      if (!macrosValidos(r.macros)) { problemas.push(`refeição "${r.titulo}" sem macros`); continue; }
      const esperadoRef = kcalDe(r.macros.protein, r.macros.carb, r.macros.fat);
      if (!perto(r.kcal, esperadoRef, tolRefeicao)) {
        problemas.push(`refeição "${r.titulo}": ${r.kcal} kcal contra ${esperadoRef.toFixed(1)} kcal dos macros`);
      }
      const somaItens = soma(r.itens.map((i: ItemRefeicao) => i.kcal ?? 0));
      if (!perto(r.kcal, somaItens, Math.max(tolRefeicao, somaItens * 0.01))) {
        problemas.push(`refeição "${r.titulo}": total ${r.kcal} kcal diferente da soma dos itens (${somaItens.toFixed(1)})`);
      }
    }
    if (!macrosValidos(dia.macros)) { problemas.push(`dia ${dia.dia} sem macros`); continue; }
    const esperadoDia = kcalDe(dia.macros.protein, dia.macros.carb, dia.macros.fat);
    if (!perto(dia.kcal, esperadoDia, tolDia)) {
      problemas.push(`dia ${dia.dia}: ${dia.kcal} kcal contra ${esperadoDia.toFixed(1)} kcal dos macros`);
    }
  }

  if (problemas.length > 0) {
    throw new ViolacaoClinica(
      "macros_inconsistentes",
      "Os números do plano não fecharam entre si, então não vamos publicá-lo. Tente gerar de novo.",
      problemas.slice(0, 10)
    );
  }

  /* --------------- 3. calorias do dia batem com a meta ------------------ */
  const meta = ctx.kcalMeta;
  const fora: string[] = [];
  for (const dia of p.dias) {
    const desvio = Math.abs(dia.kcal - meta) / meta;
    if (desvio > toleranciaKcal) {
      fora.push(`dia ${dia.dia}: ${Math.round(dia.kcal)} kcal, meta ${meta} kcal (${(desvio * 100).toFixed(1)}% de desvio)`);
    }
  }
  if (fora.length > 0) {
    throw new ViolacaoClinica(
      "macros_inconsistentes",
      `O plano não fechou na sua meta de ${meta} kcal por dia. Não vamos publicar um plano com a conta errada.`,
      fora.slice(0, 7)
    );
  }

  /* ------------ 4. a meta em si está na faixa segura do perfil ---------- */
  validarMetaCalorica(meta, ctx.perfil, ctx.tmb ?? null);
  for (const dia of p.dias) validarMetaCalorica(dia.kcal, ctx.perfil, ctx.tmb ?? null);

  /* ------------------- 5. proteína plausível por quilo ------------------ */
  const kg = ctx.perfil.weightKg ?? null;
  if (kg && kg > 0) {
    for (const dia of p.dias) {
      const porKg = dia.macros.protein / kg;
      if (porKg < 0.5 || porKg > 3.0) {
        throw new ViolacaoClinica(
          "proteina_fora_da_faixa",
          `O plano ficou com ${porKg.toFixed(1)} g de proteína por quilo de peso, fora do que consideramos seguro sem acompanhamento.`,
          [`dia ${dia.dia}: ${dia.macros.protein} g para ${kg} kg`]
        );
      }
    }
  }

  return p;
}

/** Valida a saída de receitas com o mesmo filtro rígido. */
export function validarReceitas(
  bruto: unknown, ctx: Pick<ContextoValidacaoBase, "bloqueio">
): SaidaReceitas {
  const s = bruto as SaidaReceitas;
  if (!s || typeof s !== "object" || s.tipo !== "receitas" || !Array.isArray(s.receitas) || s.receitas.length === 0) {
    throw new ViolacaoClinica(
      "saida_malformada",
      "A geração de receitas voltou num formato que não conseguimos ler.",
      ["esperado tipo=receitas com receitas[]"]
    );
  }
  const achados: Achado[] = [];
  const checar = (t: string) => { const a = textoViola(t, ctx.bloqueio); if (a) achados.push(a); };
  for (const r of s.receitas) {
    checar(r?.title ?? "");
    for (const i of r?.ingredients ?? []) checar(i);
    for (const p of r?.steps ?? []) checar(p);
  }
  if (achados.length > 0) {
    throw new ViolacaoClinica(
      "restricao_violada",
      "As receitas sugeridas incluíam um ingrediente que está nas suas restrições, então descartamos todas. Pode pedir de novo.",
      [`termos: ${[...new Set(achados.map((a) => a.termo))].slice(0, 6).join(", ")}`]
    );
  }
  for (const r of s.receitas) {
    if (!macrosValidos(r.macros) || typeof r.kcal !== "number") {
      throw new ViolacaoClinica("macros_inconsistentes", "Uma das receitas voltou sem macros válidos.", [r?.title ?? "?"]);
    }
    const esperado = kcalDe(r.macros.protein, r.macros.carb, r.macros.fat);
    if (!perto(r.kcal, esperado, 2)) {
      throw new ViolacaoClinica(
        "macros_inconsistentes",
        "Os números de uma das receitas não fecharam entre si.",
        [`${r.title}: ${r.kcal} kcal contra ${esperado.toFixed(1)} dos macros`]
      );
    }
  }
  return s;
}

/** Verificação isolada de uma receita, usada também pelo gerador. */
export const receitaPermitida = (r: Receita, bloq: Bloqueio): boolean => {
  if (textoViola(r.title, bloq)) return false;
  return !r.ingredients.some((i: string) => textoViola(i, bloq));
};
