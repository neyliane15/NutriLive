/* =========================================================================
   Nutri&Live — gerador local de IA (driver `local`)

   Este arquivo é o que faz a IA do produto funcionar SEM REDE. Ele não
   conversa com modelo nenhum: monta plano alimentar, receitas e lista de
   compras por cálculo determinístico sobre a base brasileira de
   `alimentos.ts`, passando por todas as guardas de `seguranca.ts`.

   Três promessas que este módulo cumpre e os testes conferem:

   1. OS NÚMEROS FECHAM. Toda porção virá em gramas; os macros de cada item
      são inteiros derivados da porção, e a energia de QUALQUER nível
      (item, refeição, dia) é sempre `4·proteína + 4·carboidrato + 9·gordura`
      dos macros daquele nível. Como a soma de inteiros é exata, a soma dos
      itens é exatamente a refeição e a soma das refeições é exatamente o
      dia — sem arredondamento perdido pelo caminho. O total do dia cai na
      meta dentro da tolerância pedida.
   2. NADA BLOQUEADO ENTRA. A base é filtrada por `baseFiltrada` e, além
      disso, por `textoViola` sobre o NOME e o nome de compra do alimento.
      Esse segundo filtro não é redundante: "Couve-manteiga refogada" não
      tem etiqueta de lactose, mas a palavra "manteiga" no nome faz a última
      linha de defesa (`validarPlano`) derrubar o plano inteiro. Melhor não
      escolher o alimento do que gerar um plano que será descartado.
   3. MESMA ENTRADA, MESMA SAÍDA. Todo sorteio sai de um gerador
      pseudoaleatório semeado por `ctx.semente`. Nada de `Math.random`,
      nada de `Date.now()` dentro da geração.

   Ordem de montagem: metas -> bloqueio -> base segura -> refeições do dia
   -> ajuste fino para fechar na meta -> lista de compras -> receitas ->
   `validarPlano` (cinto e suspensório) -> saída.
   ========================================================================= */
import {
  ALIMENTOS, kcal100, kcalDe, descreverPorcao,
  type Alimento, type Papel, type TipoRefeicao
} from "./alimentos.js";
import {
  AVISO_EDUCATIVO, ViolacaoClinica, ajustarParaFaixa, alimentoEvitado, baseFiltrada,
  detectarSinaisDeCautela, montarBloqueio, normalizar, orientacaoProfissional,
  statusInicialDoPlano, textoViola, validarPlano, validarReceitas,
  type Bloqueio
} from "./seguranca.js";
import { calcularMetas, normalizarObjetivo, FATOR_ATIVIDADE, normalizarAtividade } from "../lib/metas.js";
import { chaveDoDia, inicioDaSemana, somarDias } from "../lib/datas.js";
import type {
  ContextoGeracao, ContextoValidacaoBase, DiaDoPlano, ItemCompra, ItemRefeicao,
  ListaDeCompras, Macros, MetasDiarias, ObjetivoNutricional, PedidoPlano, PedidoReceitas,
  PerfilNutricional, PlanoAlimentar, Receita, Refeicao, SaidaReceitas
} from "./tipos.js";

export const DRIVER = "local";

/** Tolerância padrão do desvio calórico do dia contra a meta (4 %). */
export const TOLERANCIA_KCAL = 0.04;

/* ======================================================================== */
/*  Sorteio determinístico                                                  */
/* ======================================================================== */

const hash32 = (texto: string): number => {
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** mulberry32: pequeno, rápido e sempre igual para a mesma semente. */
function sorteador(semente: string): () => number {
  let a = hash32(semente) || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ======================================================================== */
/*  Metas do dia                                                            */
/* ======================================================================== */

export interface MetasCalculadas {
  kcal: number;
  proteinaG: number;
  aguaMl: number;
  tmb: number;
  fatorAtividade: number;
  objetivo: ObjetivoNutricional;
  metodo: string;
  avisos: string[];
}

const objetivoNutricional = (goal: unknown): ObjetivoNutricional => {
  const n = normalizar(String(goal ?? ""));
  if (n.includes("saude") || n.includes("qualidade de vida")) return "saude";
  return normalizarObjetivo(goal);
};

/**
 * Metas do dia a partir do perfil. Respeita meta já definida no perfil
 * (`kcalTarget`), mas NUNCA sem passar pela faixa segura de `seguranca.ts`.
 */
export function metasDoPerfil(perfil: PerfilNutricional): MetasCalculadas {
  const base = calcularMetas({
    sexo: perfil.sex,
    nascimento: perfil.birthDate ?? null,
    alturaCm: perfil.heightCm ?? null,
    pesoKg: perfil.weightKg ?? null,
    objetivo: perfil.goal,
    atividade: perfil.activityLevel
  });

  const avisos: string[] = [];
  const pedida = perfil.kcalTarget && perfil.kcalTarget > 0 ? perfil.kcalTarget : base.kcal;
  const ajuste = ajustarParaFaixa(pedida, perfil, base.tmb);
  if (ajuste.aviso) avisos.push(ajuste.aviso);

  const kg = base.pesoUsadoKg;
  let proteinaG = perfil.proteinTargetG && perfil.proteinTargetG > 0 ? perfil.proteinTargetG : base.proteinaG;
  /* A guarda clínica recusa plano fora de 0,5 a 3,0 g/kg. Mantemos a meta
     dentro de uma faixa mais estreita para o plano nunca chegar na borda. */
  const piso = Math.round(kg * 0.8);
  const teto = Math.round(kg * 2.4);
  if (proteinaG < piso) {
    avisos.push(`A meta de proteína informada (${proteinaG} g) é baixa para ${kg} kg; usamos ${piso} g.`);
    proteinaG = piso;
  } else if (proteinaG > teto) {
    avisos.push(`A meta de proteína informada (${proteinaG} g) é alta para ${kg} kg; limitamos a ${teto} g.`);
    proteinaG = teto;
  }
  /* Proteína nunca pode comer a cota calórica inteira. */
  const tetoEnergetico = Math.floor((ajuste.kcal * 0.40) / 4);
  if (proteinaG > tetoEnergetico) proteinaG = tetoEnergetico;

  const aguaMl = perfil.waterTargetMl && perfil.waterTargetMl > 0 ? perfil.waterTargetMl : base.aguaMl;
  const atividade = normalizarAtividade(perfil.activityLevel);

  return {
    kcal: ajuste.kcal,
    proteinaG,
    aguaMl,
    tmb: base.tmb,
    fatorAtividade: FATOR_ATIVIDADE[atividade],
    objetivo: objetivoNutricional(perfil.goal),
    metodo:
      `Mifflin-St Jeor (TMB ${base.tmb} kcal) × fator de atividade ${FATOR_ATIVIDADE[atividade]} ` +
      `ajustado para o objetivo "${base.objetivo}", limitado à faixa segura do perfil (${ajuste.faixa.min}–${ajuste.faixa.max} kcal).`,
    avisos
  };
}

/** Macros-meta do dia: proteína da meta, 28 % de gordura, resto carboidrato. */
export function macrosMeta(kcal: number, proteinaG: number): Macros {
  const fat = Math.max(20, Math.round((kcal * 0.28) / 9));
  const carb = Math.max(0, Math.round((kcal - proteinaG * 4 - fat * 9) / 4));
  return { protein: proteinaG, carb, fat };
}

/** Contexto que as guardas de `seguranca.ts` esperam. */
export function contextoDeValidacao(
  perfil: PerfilNutricional, metas: MetasCalculadas, bloqueio?: Bloqueio
): ContextoValidacaoBase {
  return {
    perfil,
    bloqueio: bloqueio ?? montarBloqueio(perfil),
    kcalMeta: metas.kcal,
    tmb: metas.tmb,
    toleranciaKcal: TOLERANCIA_KCAL
  };
}

/* ======================================================================== */
/*  Base segura                                                             */
/* ======================================================================== */

/**
 * Base de alimentos que esta pessoa pode comer. Dois filtros:
 * etiqueta/termo (via `alimentoPermitido`, dentro de `baseFiltrada`) e o
 * próprio NOME do alimento contra o dicionário clínico — porque é o nome que
 * `validarPlano` vai varrer depois.
 */
export function baseSegura(bloq: Bloqueio, base: Alimento[] = ALIMENTOS): Alimento[] {
  return baseFiltrada(bloq, base).filter(
    (a) => !textoViola(a.nome, bloq) && !textoViola(a.compra ?? "", bloq)
  );
}

const porPapel = (base: Alimento[], papel: Papel): Alimento[] =>
  base.filter((a) => a.papel === papel);

/* ======================================================================== */
/*  Desenho das refeições                                                   */
/* ======================================================================== */

interface Vaga {
  papel: Papel;
  /** Fatia da energia da refeição que esta vaga deve cobrir. */
  peso: number;
  /** Ids preferidos, em ordem. Só entram se estiverem na base segura. */
  preferir?: string[];
  /** Vaga que pode ficar vazia quando a base não tem candidato. */
  opcional?: boolean;
}

interface Modelo {
  tipo: TipoRefeicao;
  rotulo: string;
  horario: string;
  /** Fatia da meta do dia. */
  fatia: number;
  vagas: Vaga[];
}

const PROTEINAS_PRINCIPAIS = [
  "frango_peito_grelhado", "tilapia_grelhada", "patinho_moido_cozido", "ovo_cozido",
  "lombo_suino_assado", "frango_coxa_assada", "sardinha_assada", "acem_cozido",
  "atum_conserva", "lentilha_cozida", "grao_de_bico_cozido", "tofu"
];
const PROTEINAS_LEVES = [
  "iogurte_natural_desnatado", "ovo_cozido", "leite_desnatado", "queijo_minas_frescal",
  "iogurte_natural_integral", "leite_integral", "tofu", "queijo_mussarela", "atum_conserva",
  "grao_de_bico_cozido"
];
const CARBOS_PRINCIPAIS = [
  "arroz_branco_cozido", "arroz_integral_cozido", "batata_doce_cozida", "batata_cozida",
  "macarrao_cozido", "mandioca_cozida", "quinoa_cozida", "cuscuz_milho"
];
const LEGUMINOSAS = ["feijao_carioca_cozido", "feijao_preto_cozido", "lentilha_cozida", "grao_de_bico_cozido"];
const CARBOS_MATINAIS = [
  "pao_integral", "tapioca_goma", "aveia_flocos", "pao_frances", "cuscuz_milho", "batata_doce_cozida"
];
const GORDURAS_BOAS = ["azeite_oliva", "abacate", "castanha_do_para", "linhaca", "amendoim_torrado", "oleo_soja"];

/**
 * Modelos de refeição. A soma das fatias é 1 em cada combinação.
 *
 * O número de vagas cresce com a meta, e isso não é enfeite: com 3.500 kcal
 * por dia e só um carboidrato por refeição, as porções batem no máximo do
 * alimento (ninguém come 600 g de arroz numa sentada) e o único jeito de
 * fechar a conta seria empilhar proteína — o que a guarda clínica recusa, com
 * razão. Mais vagas = mais lugar para a energia caber em medida realista.
 */
function modelosDoDia(kcalMeta: number): Modelo[] {
  const comCeia = kcalMeta >= 2500;
  const reforcado = kcalMeta >= 2600;
  const base: Modelo[] = [
    {
      tipo: "cafe", rotulo: "Café da manhã", horario: "07:00", fatia: comCeia ? 0.19 : 0.21,
      vagas: [
        { papel: "carboidrato", peso: 0.42, preferir: CARBOS_MATINAIS },
        { papel: "proteina", peso: 0.36, preferir: PROTEINAS_LEVES },
        { papel: "fruta", peso: 0.22 },
        { papel: "livre", peso: 0, preferir: ["cafe_sem_acucar", "cha_sem_acucar"], opcional: true }
      ]
    },
    {
      tipo: "lanche_manha", rotulo: "Lanche da manhã", horario: "10:00", fatia: comCeia ? 0.09 : 0.10,
      vagas: [
        { papel: "fruta", peso: 0.62 },
        { papel: "gordura", peso: 0.38, preferir: ["castanha_do_para", "amendoim_torrado", "linhaca", "abacate"], opcional: true }
      ]
    },
    {
      tipo: "almoco", rotulo: "Almoço", horario: "12:30", fatia: comCeia ? 0.30 : 0.31,
      vagas: [
        { papel: "proteina", peso: 0.34, preferir: PROTEINAS_PRINCIPAIS },
        { papel: "carboidrato", peso: 0.30, preferir: CARBOS_PRINCIPAIS },
        { papel: "carboidrato", peso: 0.16, preferir: LEGUMINOSAS },
        { papel: "vegetal", peso: 0.08 },
        { papel: "vegetal", peso: 0.04, opcional: true },
        { papel: "gordura", peso: 0.08, preferir: GORDURAS_BOAS }
      ]
    },
    {
      tipo: "lanche_tarde", rotulo: "Lanche da tarde", horario: "16:00", fatia: comCeia ? 0.10 : 0.11,
      vagas: [
        { papel: "proteina", peso: 0.52, preferir: PROTEINAS_LEVES },
        { papel: "fruta", peso: 0.48 }
      ]
    },
    {
      tipo: "jantar", rotulo: "Jantar", horario: "19:30", fatia: comCeia ? 0.25 : 0.27,
      vagas: [
        { papel: "proteina", peso: 0.40, preferir: PROTEINAS_PRINCIPAIS },
        { papel: "carboidrato", peso: 0.32, preferir: CARBOS_PRINCIPAIS },
        { papel: "vegetal", peso: 0.14 },
        { papel: "gordura", peso: 0.14, preferir: GORDURAS_BOAS }
      ]
    }
  ];
  if (comCeia) {
    base.push({
      tipo: "ceia", rotulo: "Ceia", horario: "21:30", fatia: 0.07,
      vagas: [
        { papel: "proteina", peso: 0.60, preferir: PROTEINAS_LEVES },
        { papel: "fruta", peso: 0.40, opcional: true }
      ]
    });
  }

  if (reforcado) {
    const extras: Partial<Record<TipoRefeicao, Vaga[]>> = {
      cafe: [
        { papel: "gordura", peso: 0.20, preferir: ["abacate", "castanha_do_para", "amendoim_torrado", "linhaca"], opcional: true },
        { papel: "carboidrato", peso: 0.25, preferir: ["aveia_flocos", "tapioca_goma", "banana_prata"], opcional: true }
      ],
      lanche_manha: [
        { papel: "carboidrato", peso: 0.45, preferir: CARBOS_MATINAIS, opcional: true }
      ],
      almoco: [
        { papel: "fruta", peso: 0.10, opcional: true },
        { papel: "carboidrato", peso: 0.18, preferir: CARBOS_PRINCIPAIS, opcional: true }
      ],
      lanche_tarde: [
        { papel: "carboidrato", peso: 0.45, preferir: CARBOS_MATINAIS, opcional: true },
        { papel: "gordura", peso: 0.18, preferir: GORDURAS_BOAS, opcional: true }
      ],
      jantar: [
        { papel: "carboidrato", peso: 0.20, preferir: LEGUMINOSAS, opcional: true },
        { papel: "fruta", peso: 0.10, opcional: true }
      ],
      ceia: [
        { papel: "carboidrato", peso: 0.40, preferir: ["aveia_flocos", "pao_integral", "tapioca_goma"], opcional: true }
      ]
    };
    for (const modelo of base) {
      const extra = extras[modelo.tipo];
      if (extra) modelo.vagas = [...modelo.vagas, ...extra];
    }
  }

  /* Normaliza os pesos de cada refeição para somarem 1: as vagas extras
     entram com peso solto e é aqui que a conta volta a fechar. */
  for (const modelo of base) {
    const total = modelo.vagas.reduce((x, v) => x + v.peso, 0);
    if (total > 0) modelo.vagas = modelo.vagas.map((v) => ({ ...v, peso: v.peso / total }));
  }
  return base;
}

/* ======================================================================== */
/*  Porções, macros e energia — tudo inteiro e consistente                   */
/* ======================================================================== */

interface Escolha {
  a: Alimento;
  gramas: number;
}

/** Gramas válidas: dentro de [min, max] e em múltiplo do passo do alimento. */
const encaixar = (a: Alimento, gramas: number): number => {
  const passos = Math.round((gramas - a.min) / a.passo);
  return Math.min(a.max, Math.max(a.min, a.min + passos * a.passo));
};

/** Macros inteiros da porção. É daqui que sai TODA a energia da saída. */
const macrosDa = (a: Alimento, gramas: number): Macros => ({
  protein: Math.round((a.proteina * gramas) / 100),
  carb: Math.round((a.carbo * gramas) / 100),
  fat: Math.round((a.gordura * gramas) / 100)
});

const energia = (m: Macros): number => kcalDe(m.protein, m.carb, m.fat);
const somarMacros = (ms: Macros[]): Macros => ({
  protein: ms.reduce((s, m) => s + m.protein, 0),
  carb: ms.reduce((s, m) => s + m.carb, 0),
  fat: ms.reduce((s, m) => s + m.fat, 0)
});

/** Porção inicial que entrega aproximadamente `alvoKcal` deste alimento. */
const porcaoPara = (a: Alimento, alvoKcal: number): number => {
  const por100 = kcal100(a);
  if (por100 <= 1) return a.medida.gramas;                 /* café, chá: energia ~0 */
  return encaixar(a, (alvoKcal * 100) / por100);
};

/* ======================================================================== */
/*  Escolha dos alimentos                                                   */
/* ======================================================================== */

interface Seletor {
  base: Alimento[];
  bloq: Bloqueio;
  rnd: () => number;
  usados: Set<string>;
}

/**
 * Escolhe um alimento para a vaga. Preferência, nesta ordem:
 * 1. ids preferidos que estão na base e que a pessoa não disse que não gosta;
 * 2. qualquer alimento do papel que ela não disse que não gosta;
 * 3. (último recurso) o que sobrou do papel — desgosto não invalida plano.
 * Dentro de cada lista o índice inicial vem do sorteador semeado, e itens já
 * usados no dia são pulados para a refeição não repetir alimento.
 */
function escolher(s: Seletor, vaga: Vaga): Alimento | null {
  const doPapel = porPapel(s.base, vaga.papel);
  const preferidos = (vaga.preferir ?? [])
    .map((id) => doPapel.find((a) => a.id === id))
    .filter((a): a is Alimento => !!a);

  const listas: Alimento[][] = [
    preferidos.filter((a) => !alimentoEvitado(a, s.bloq)),
    doPapel.filter((a) => !alimentoEvitado(a, s.bloq)),
    preferidos,
    doPapel
  ];

  for (const lista of listas) {
    if (lista.length === 0) continue;
    const inicio = Math.floor(s.rnd() * lista.length) % lista.length;
    for (let k = 0; k < lista.length; k++) {
      const a = lista[(inicio + k) % lista.length]!;
      if (!s.usados.has(a.id)) { s.usados.add(a.id); return a; }
    }
    /* Toda a lista já foi usada hoje: repetir é melhor que deixar a vaga vazia. */
    const a = lista[inicio]!;
    return a;
  }
  return null;
}

/* ======================================================================== */
/*  Ajuste fino: fechar na meta                                             */
/* ======================================================================== */

interface Totais { protein: number; carb: number; fat: number; kcal: number }

const totaisDe = (es: Escolha[]): Totais => {
  const m = somarMacros(es.map((e) => macrosDa(e.a, e.gramas)));
  return { ...m, kcal: energia(m) };
};

/** Descida gulosa de um passo por volta, mexendo só nos índices liberados. */
function descer(
  es: Escolha[], moveis: number[], custo: (t: Totais) => number, voltas: number
): void {
  let t = totaisDe(es);
  let atual = custo(t);

  for (let volta = 0; volta < voltas; volta++) {
    let melhorIdx = -1;
    let melhorGramas = 0;
    let melhorCusto = atual;

    for (const i of moveis) {
      const e = es[i]!;
      const antes = macrosDa(e.a, e.gramas);
      for (const direcao of [1, -1]) {
        const gramas = e.gramas + direcao * e.a.passo;
        if (gramas < e.a.min || gramas > e.a.max) continue;
        const depois = macrosDa(e.a, gramas);
        const novo: Totais = {
          protein: t.protein - antes.protein + depois.protein,
          carb: t.carb - antes.carb + depois.carb,
          fat: t.fat - antes.fat + depois.fat,
          kcal: 0
        };
        novo.kcal = energia(novo);
        const c = custo(novo);
        if (c < melhorCusto - 1e-9) { melhorCusto = c; melhorIdx = i; melhorGramas = gramas; }
      }
    }

    if (melhorIdx < 0) break;                      /* nenhum passo melhora */
    es[melhorIdx]!.gramas = melhorGramas;
    t = totaisDe(es);
    atual = custo(t);
  }
}

/** A proteína é o macro dominante deste alimento? */
const ehProteico = (a: Alimento): boolean => {
  const total = kcal100(a);
  return a.papel === "proteina" || (total > 0 && (a.proteina * 4) / total >= 0.35);
};

/**
 * Empurra as porções, um passo por vez, até a energia do dia encostar na meta
 * sem estragar a proteína.
 *
 * Em TRÊS passadas, e a razão de não ser uma só é um poço que custou um teste
 * vermelho: com um único custo somando caloria e proteína, a descida gulosa
 * empaca. Para baixar a proteína sem perder caloria é preciso mexer em DOIS
 * itens ao mesmo tempo (menos frango, mais arroz), e uma descida que anda um
 * passo por vez nunca enxerga esse par — cada metade do movimento, isolada,
 * piora o custo. O plano ficava com 3,2 g de proteína por quilo e a guarda
 * clínica, com razão, recusava.
 *
 * Então separamos os papéis:
 *   1ª passada: só os alimentos proteicos, olhando só a proteína;
 *   2ª passada: só os demais (carboidrato, gordura, fruta, vegetal), olhando
 *               só a energia — a proteína já está no lugar e fica parada;
 *   3ª passada: todos, com o custo combinado, para limpar o resto. Como as
 *               duas primeiras já deixaram os dois alvos perto, aqui ela só
 *               tem movimentos pequenos para fazer.
 *
 * Determinística (não sorteia nada) e limitada por `voltas` para nunca travar.
 */
export interface OpcoesAjuste {
  /** Faixa em que a proteína do dia PODE andar, em gramas. Limite rígido. */
  faixaProteina?: { min: number; max: number };
  voltas?: number;
}

function ajustarPorcoes(
  es: Escolha[], alvoKcal: number, alvoProteina: number, opcoes: OpcoesAjuste = {}
): void {
  const voltas = opcoes.voltas ?? 400;
  const faixa = opcoes.faixaProteina
    ?? { min: Math.round(alvoProteina * 0.6), max: Math.round(alvoProteina * 1.6) };
  const todos = es.map((_, i) => i);
  const proteicos = todos.filter((i) => ehProteico(es[i]!.a));
  const demais = todos.filter((i) => !ehProteico(es[i]!.a));

  if (proteicos.length > 0) {
    descer(es, proteicos, (t) => Math.abs(t.protein - alvoProteina), voltas);
  }
  if (demais.length > 0) {
    descer(es, demais, (t) => Math.abs(t.kcal - alvoKcal), voltas);
  }
  /* Barreira na proteína. Sem ela, a terceira passada troca proteína por
     caloria de graça: cada grama de proteína vale 4 kcal, então subir 1 g
     custa 4 na penalidade de proteína e GANHA 12 na de caloria. O plano
     fechava na meta energética com 3,3 g de proteína por quilo, e a guarda
     clínica recusava. Passando de 20 % de desvio, cada grama custa 500. */
  const folga = Math.max(8, alvoProteina * 0.20);
  const custoProteina = (p: number): number => {
    const desvio = Math.abs(p - alvoProteina);
    return 4 * desvio + (desvio > folga ? 500 * (desvio - folga) : 0);
  };
  descer(es, todos, (t) => 3 * Math.abs(t.kcal - alvoKcal) + custoProteina(t.protein), voltas);

  /* 4ª passada, só quando a energia ainda não fechou. Dependendo de quais
     alimentos foram sorteados, as três primeiras passadas podem empacar num
     poço (alimento no limite da porção, passo grosso). Aqui a caloria passa a
     mandar — ela é o que tem tolerância apertada na validação — e a proteína
     vira restrição RÍGIDA: pode andar dentro da faixa segura e nem um grama
     fora dela. */
  const parcial = totaisDe(es);
  if (Math.abs(parcial.kcal - alvoKcal) > alvoKcal * 0.02) {
    const foraDaFaixa = (p: number): number =>
      p < faixa.min ? (faixa.min - p) : p > faixa.max ? (p - faixa.max) : 0;
    descer(
      es, todos,
      (t) => Math.abs(t.kcal - alvoKcal) + 1000 * foraDaFaixa(t.protein),
      voltas
    );
  }
}

/* ======================================================================== */
/*  Texto seguro                                                            */
/* ======================================================================== */

/**
 * Nenhum texto gerado sai daqui sem passar pelo dicionário clínico. Se uma
 * frase montada por nós casar com um termo bloqueado, ela é substituída pela
 * alternativa neutra — assim o plano não é derrubado por uma palavra de
 * enfeite.
 */
function seguro(texto: string, bloq: Bloqueio, alternativa: string): string {
  if (!textoViola(texto, bloq)) return texto;
  if (!textoViola(alternativa, bloq)) return alternativa;
  /* Nem a alternativa passou: devolve o texto mais neutro que existe. */
  return "Monte a refeição com as medidas indicadas em cada item.";
}

/**
 * Medida caseira do item, conferida contra o dicionário clínico.
 *
 * Isso parece paranoia e não é: o casamento de plural de `seguranca.ts` aceita
 * sufixo "es", então a palavra "porcoes" (de "porções") casa com o termo
 * "porco" da restrição a carne suína. Quem come vegano tem "carne_suina"
 * bloqueada, e a palavra "porções" no texto derrubaria o plano inteiro. Por
 * isso nenhum texto gerado aqui usa "porção"/"porções", e o que vem de
 * `descreverPorcao` cai para gramas puras quando esbarra no dicionário.
 */
const porcaoSegura = (a: Alimento, gramas: number, bloq: Bloqueio): string => {
  const descricao = descreverPorcao(a, gramas);
  return textoViola(descricao, bloq) ? `${gramas} g` : descricao;
};

const minuscula = (nome: string): string => nome.charAt(0).toLowerCase() + nome.slice(1);

/* ======================================================================== */
/*  Montagem de uma refeição                                                */
/* ======================================================================== */

const TITULO_PADRAO: Record<TipoRefeicao, string> = {
  cafe: "Café da manhã equilibrado",
  lanche_manha: "Lanche leve da manhã",
  almoco: "Almoço completo",
  lanche_tarde: "Lanche da tarde",
  jantar: "Jantar do dia",
  ceia: "Ceia leve"
};

function tituloDa(modelo: Modelo, es: Escolha[], bloq: Bloqueio): string {
  const padrao = TITULO_PADRAO[modelo.tipo];
  const principais = es
    .filter((e) => e.a.papel !== "livre")
    .slice(0, 2)
    .map((e) => minuscula(e.a.nome));
  if (principais.length === 0) return padrao;
  const corpo = principais.length === 2
    ? `${principais[0]} com ${principais[1]}`
    : principais[0]!;
  return seguro(`${modelo.rotulo}: ${corpo}`, bloq, padrao);
}

function preparoDe(es: Escolha[], bloq: Bloqueio): string[] {
  const nomes = es.map((e) => minuscula(e.a.nome));
  const passos: string[] = [];
  passos.push(seguro(
    `Separe as medidas: ${nomes.join(", ")}.`,
    bloq, "Separe as medidas indicadas em cada item."
  ));

  const proteina = es.find((e) => e.a.papel === "proteina");
  if (proteina) {
    passos.push(seguro(
      `Prepare ${minuscula(proteina.a.nome)} sem gordura extra, temperando com alho, cebola, sal e ervas a gosto.`,
      bloq, "Prepare a proteína da refeição sem gordura extra, temperando com alho, cebola, sal e ervas a gosto."
    ));
  }
  const vegetal = es.find((e) => e.a.papel === "vegetal");
  if (vegetal) {
    passos.push(seguro(
      `Sirva ${minuscula(vegetal.a.nome)} no vapor ou cru, sem temperos industrializados.`,
      bloq, "Sirva os vegetais no vapor ou crus, sem temperos industrializados."
    ));
  }
  const gordura = es.find((e) => e.a.papel === "gordura");
  if (gordura) {
    passos.push(seguro(
      `Acrescente ${minuscula(gordura.a.nome)} só na hora de servir — a medida é pequena de propósito.`,
      bloq, "Acrescente a gordura boa só na hora de servir — a medida é pequena de propósito."
    ));
  }
  passos.push("Beba água durante a refeição e coma sem pressa, mastigando bem.");
  return passos;
}

function refeicaoDe(modelo: Modelo, es: Escolha[], bloq: Bloqueio): Refeicao {
  const itens: ItemRefeicao[] = es.map((e) => {
    const macros = macrosDa(e.a, e.gramas);
    return {
      alimentoId: e.a.id,
      nome: e.a.nome,
      gramas: e.gramas,
      porcao: porcaoSegura(e.a, e.gramas, bloq),
      kcal: energia(macros),
      macros
    };
  });
  const macros = somarMacros(itens.map((i) => i.macros));
  return {
    tipo: modelo.tipo,
    rotulo: modelo.rotulo,
    horario: modelo.horario,
    titulo: tituloDa(modelo, es, bloq),
    kcal: energia(macros),
    macros,
    itens,
    preparo: preparoDe(es, bloq)
  };
}

/* ======================================================================== */
/*  Montagem de um dia                                                      */
/* ======================================================================== */

interface DiaMontado {
  dia: DiaDoPlano;
  escolhas: Escolha[];
}

function montarDia(
  numero: number, dataIso: string, base: Alimento[], bloq: Bloqueio,
  metas: MetasCalculadas, rnd: () => number, perfilPesoKg = 0
): DiaMontado {
  const modelos = modelosDoDia(metas.kcal);
  const seletor: Seletor = { base, bloq, rnd, usados: new Set() };

  /* 1. escolher os alimentos e dar a cada um a porção que cobre a fatia dele */
  const porRefeicao: { modelo: Modelo; es: Escolha[] }[] = [];
  for (const modelo of modelos) {
    const alvoRefeicao = metas.kcal * modelo.fatia;
    const es: Escolha[] = [];
    for (const vaga of modelo.vagas) {
      const a = escolher(seletor, vaga);
      if (!a) {
        if (vaga.opcional) continue;
        throw new ViolacaoClinica(
          "sem_alimento_disponivel",
          "Com as restrições do seu perfil não sobrou alimento suficiente na nossa base para montar um plano completo. " +
          "Revise as restrições ou peça o plano para a sua nutricionista.",
          [`faltou candidato para o papel "${vaga.papel}" em ${modelo.rotulo}`, `base segura: ${base.length} alimentos`]
        );
      }
      es.push({ a, gramas: porcaoPara(a, alvoRefeicao * vaga.peso) });
    }
    porRefeicao.push({ modelo, es });
  }

  /* 2. ajuste fino sobre o dia inteiro: é o dia que tem que fechar na meta */
  const todas = porRefeicao.flatMap((r) => r.es);
  /* A guarda clínica recusa plano fora de 0,5 a 3,0 g de proteína por quilo.
     A faixa que entregamos ao ajuste é mais estreita, para o plano nunca
     encostar na borda da regra. */
  const kg = metas.proteinaG > 0 && perfilPesoKg > 0 ? perfilPesoKg : 0;
  const faixaProteina = kg > 0
    ? { min: Math.max(Math.round(kg * 0.9), Math.round(metas.proteinaG * 0.55)), max: Math.round(kg * 2.6) }
    : { min: Math.round(metas.proteinaG * 0.6), max: Math.round(metas.proteinaG * 1.6) };
  ajustarPorcoes(todas, metas.kcal, metas.proteinaG, { faixaProteina });

  /* 3. materializar refeições e dia — energia sempre derivada dos macros */
  const refeicoes = porRefeicao.map((r) => refeicaoDe(r.modelo, r.es, bloq));
  const macros = somarMacros(refeicoes.map((r) => r.macros));
  return {
    dia: { dia: numero, data: dataIso, kcal: energia(macros), macros, refeicoes },
    escolhas: todas
  };
}

/* ======================================================================== */
/*  Lista de compras                                                        */
/* ======================================================================== */

const quantidade = (gramas: number): string =>
  gramas >= 1000
    ? `${(Math.round(gramas / 100) / 10).toFixed(1).replace(".", ",")} kg`
    : `${Math.round(gramas / 10) * 10} g`;

export function listaDeCompras(dias: DiaDoPlano[], dataBase: string, bloq: Bloqueio): ListaDeCompras {
  const soma = new Map<string, { a: Alimento; gramas: number }>();
  for (const d of dias) {
    for (const r of d.refeicoes) {
      for (const i of r.itens) {
        const a = ALIMENTOS.find((x) => x.id === i.alimentoId);
        if (!a) continue;
        const atual = soma.get(a.id);
        if (atual) atual.gramas += i.gramas;
        else soma.set(a.id, { a, gramas: i.gramas });
      }
    }
  }

  const items: ItemCompra[] = [...soma.values()]
    .map(({ a, gramas }) => {
      /* 10 % de folga: ninguém compra exatamente o que vai comer. */
      const comprar = Math.ceil((gramas * 1.1) / 10) * 10;
      return {
        group: a.setor,
        name: a.compra ?? a.nome,
        qty: quantidade(comprar),
        cents: Math.round((comprar / 1000) * a.centavosPorKg),
        done: false
      };
    })
    .filter((i) => !textoViola(i.name, bloq))
    .sort((x, y) => x.group.localeCompare(y.group, "pt-BR") || x.name.localeCompare(y.name, "pt-BR"));

  const inicio = inicioDaSemana(new Date(`${dataBase}T12:00:00.000Z`));
  return {
    weekStart: chaveDoDia(inicio),
    estimatedCents: items.reduce((s, i) => s + i.cents, 0),
    items
  };
}

/* ======================================================================== */
/*  Receitas                                                                */
/* ======================================================================== */

interface ModeloReceita {
  nome: string;
  timeMin: number;
  /** Papéis na ordem em que entram, com a fatia de energia de cada um. */
  vagas: Vaga[];
}

const MODELOS_RECEITA: ModeloReceita[] = [
  {
    nome: "Panela única", timeMin: 30,
    vagas: [
      { papel: "proteina", peso: 0.38, preferir: PROTEINAS_PRINCIPAIS },
      { papel: "carboidrato", peso: 0.34, preferir: CARBOS_PRINCIPAIS },
      { papel: "vegetal", peso: 0.14 },
      { papel: "gordura", peso: 0.14, preferir: GORDURAS_BOAS }
    ]
  },
  {
    nome: "Refogado rápido", timeMin: 20,
    vagas: [
      { papel: "proteina", peso: 0.44, preferir: PROTEINAS_PRINCIPAIS },
      { papel: "vegetal", peso: 0.24 },
      { papel: "carboidrato", peso: 0.20, preferir: CARBOS_PRINCIPAIS },
      { papel: "gordura", peso: 0.12, preferir: GORDURAS_BOAS }
    ]
  },
  {
    nome: "Assado de forno", timeMin: 45,
    vagas: [
      { papel: "proteina", peso: 0.40, preferir: PROTEINAS_PRINCIPAIS },
      { papel: "carboidrato", peso: 0.30, preferir: CARBOS_PRINCIPAIS },
      { papel: "vegetal", peso: 0.18 },
      { papel: "gordura", peso: 0.12, preferir: GORDURAS_BOAS }
    ]
  },
  {
    nome: "Bowl frio", timeMin: 15,
    vagas: [
      { papel: "proteina", peso: 0.36, preferir: ["grao_de_bico_cozido", "atum_conserva", "ovo_cozido", "tofu", "lentilha_cozida"] },
      { papel: "carboidrato", peso: 0.28, preferir: ["quinoa_cozida", "arroz_integral_cozido", "batata_doce_cozida"] },
      { papel: "vegetal", peso: 0.22 },
      { papel: "gordura", peso: 0.14, preferir: GORDURAS_BOAS }
    ]
  },
  {
    nome: "Sopa de legumes", timeMin: 35,
    vagas: [
      { papel: "vegetal", peso: 0.30 },
      { papel: "proteina", peso: 0.36, preferir: ["lentilha_cozida", "frango_peito_grelhado", "grao_de_bico_cozido", "tofu"] },
      { papel: "carboidrato", peso: 0.24, preferir: ["batata_cozida", "mandioca_cozida", "abobora_cozida", "arroz_branco_cozido"] },
      { papel: "gordura", peso: 0.10, preferir: GORDURAS_BOAS }
    ]
  },
  {
    nome: "Vitamina reforçada", timeMin: 10,
    vagas: [
      { papel: "fruta", peso: 0.40 },
      { papel: "proteina", peso: 0.36, preferir: PROTEINAS_LEVES },
      { papel: "carboidrato", peso: 0.14, preferir: ["aveia_flocos", "tapioca_goma"] },
      { papel: "gordura", peso: 0.10, preferir: ["linhaca", "castanha_do_para", "amendoim_torrado", "abacate"] }
    ]
  }
];

function passosReceita(nome: string, es: Escolha[], bloq: Bloqueio): string[] {
  const nomes = es.map((e) => minuscula(e.a.nome));
  const proteina = es.find((e) => e.a.papel === "proteina");
  const vegetal = es.find((e) => e.a.papel === "vegetal");
  const passos = [
    seguro(`Reúna e meça tudo antes de começar: ${nomes.join(", ")}.`, bloq, "Reúna e meça todos os itens antes de começar."),
    proteina
      ? seguro(`Cozinhe ${minuscula(proteina.a.nome)} em fogo médio até ficar no ponto, temperando com alho, cebola e ervas.`, bloq,
          "Cozinhe a proteína em fogo médio até o ponto, temperando com alho, cebola e ervas.")
      : "Aqueça a panela e comece pelos temperos: alho, cebola e ervas.",
    vegetal
      ? seguro(`Junte ${minuscula(vegetal.a.nome)} e deixe no fogo só o tempo de ficar al dente.`, bloq,
          "Junte os vegetais e deixe no fogo só o tempo de ficarem al dente.")
      : "Junte os demais itens e misture bem.",
    `Finalize, prove o sal e sirva. Rende uma refeição de ${nome.toLowerCase()}.`
  ];
  return passos;
}

function receitaDe(
  modelo: ModeloReceita, es: Escolha[], bloq: Bloqueio, alvoKcal: number, matchPct: number
): Receita | null {
  if (es.length === 0) return null;
  ajustarPorcoes(es, alvoKcal, Math.max(10, Math.round((alvoKcal * 0.30) / 4)), { voltas: 300 });
  const macros = somarMacros(es.map((e) => macrosDa(e.a, e.gramas)));
  const titulo = seguro(
    `${modelo.nome} de ${minuscula(es[0]!.a.nome)}`, bloq, modelo.nome
  );
  const receita: Receita = {
    title: titulo,
    timeMin: modelo.timeMin,
    kcal: energia(macros),
    macros,
    ingredients: es.map((e) => `${e.a.nome} — ${porcaoSegura(e.a, e.gramas, bloq)}`),
    steps: passosReceita(modelo.nome, es, bloq),
    matchPct
  };
  /* Última conferência da receita inteira antes de devolver. */
  for (const t of [receita.title, ...receita.ingredients, ...receita.steps]) {
    if (textoViola(t, bloq)) return null;
  }
  return receita;
}

/** Receitas que acompanham o plano: usam a base segura e a meta por refeição. */
function receitasDoPlano(
  base: Alimento[], bloq: Bloqueio, metas: MetasCalculadas, rnd: () => number, quantas = 3
): Receita[] {
  const saida: Receita[] = [];
  const alvo = Math.round(metas.kcal * 0.30);
  const inicio = Math.floor(rnd() * MODELOS_RECEITA.length);
  /* Um só conjunto de "já usados" para as três receitas: assim elas não saem
     todas com o mesmo alimento principal. */
  const seletor: Seletor = { base, bloq, rnd, usados: new Set() };
  for (let k = 0; k < MODELOS_RECEITA.length && saida.length < quantas; k++) {
    const modelo = MODELOS_RECEITA[(inicio + k) % MODELOS_RECEITA.length]!;
    const es: Escolha[] = [];
    for (const vaga of modelo.vagas) {
      const a = escolher(seletor, vaga);
      if (a) es.push({ a, gramas: porcaoPara(a, alvo * vaga.peso) });
    }
    const r = receitaDe(modelo, es, bloq, alvo, 100);
    if (r) saida.push(r);
  }
  return saida;
}

/* ======================================================================== */
/*  Plano alimentar                                                         */
/* ======================================================================== */

/**
 * Gera o plano alimentar completo. Devolve `OrientacaoProfissional` quando o
 * perfil tem sinal de cautela: nesse caso o sistema não monta plano, encaminha.
 */
export function gerarPlano(ctx: ContextoGeracao, pedido: PedidoPlano): PlanoAlimentar {
  const perfil = ctx.perfil;
  const bloq = montarBloqueio(perfil);
  const metas = metasDoPerfil(perfil);
  const base = baseSegura(bloq);

  if (base.length < 8) {
    throw new ViolacaoClinica(
      "sem_alimento_disponivel",
      "Suas restrições deixaram pouquíssimos alimentos disponíveis na nossa base, e um plano montado com isso não seria equilibrado. " +
      "Nesse cenário o caminho certo é um plano feito por nutricionista.",
      [`restrições: ${bloq.declaradas.join(", ") || "(estilo alimentar)"}`, `sobraram ${base.length} alimentos`]
    );
  }

  const rnd = sorteador(`${ctx.semente}|plano|${pedido.days}`);
  const dataInicial = new Date(`${ctx.dataBase}T12:00:00.000Z`);

  const dias: DiaDoPlano[] = [];
  for (let n = 1; n <= pedido.days; n++) {
    const data = chaveDoDia(somarDias(dataInicial, n - 1));
    dias.push(montarDia(n, data, base, bloq, metas, rnd, perfil.weightKg ?? 0).dia);
  }

  const kcalMedia = Math.round(dias.reduce((s, d) => s + d.kcal, 0) / dias.length);
  const macrosMedia: Macros = {
    protein: Math.round(dias.reduce((s, d) => s + d.macros.protein, 0) / dias.length),
    carb: Math.round(dias.reduce((s, d) => s + d.macros.carb, 0) / dias.length),
    fat: Math.round(dias.reduce((s, d) => s + d.macros.fat, 0) / dias.length)
  };

  const inicial = statusInicialDoPlano(ctx.temNutricionistaVinculada);
  const avisos = [...inicial.avisos, ...metas.avisos];
  if (bloq.rotulos.length > 0) {
    avisos.push(`Restrições aplicadas em todos os itens: ${bloq.rotulos.join(", ")}.`);
  }
  if (bloq.evitar.length > 0 || bloq.evitarEtiquetas.size > 0) {
    avisos.push("O que você disse que não gosta foi evitado sempre que havia alternativa equivalente.");
  }
  if (pedido.notes) {
    avisos.push("Suas observações ficaram registradas no pedido para a nutricionista ler na revisão. O cálculo não muda por texto livre.");
  }

  const metasDiarias: MetasDiarias = {
    kcal: metas.kcal,
    macros: macrosMeta(metas.kcal, metas.proteinaG),
    aguaMl: metas.aguaMl,
    metodo: metas.metodo,
    tmb: metas.tmb,
    fatorAtividade: metas.fatorAtividade
  };

  const plano: PlanoAlimentar = {
    tipo: "plano_alimentar",
    versao: 1,
    titulo: `Plano de ${pedido.days} ${pedido.days === 1 ? "dia" : "dias"} · ${metas.kcal} kcal por dia`,
    dias,
    metas: metasDiarias,
    resumo: {
      kcalMeta: metas.kcal,
      kcalMedia,
      macrosMeta: metasDiarias.macros,
      macrosMedia,
      desvioKcalPct: Math.round((Math.abs(kcalMedia - metas.kcal) / metas.kcal) * 1000) / 10
    },
    contexto: {
      objetivo: metas.objetivo,
      estiloAlimentar: perfil.dietStyle ?? "tradicional",
      restricoesAplicadas: bloq.declaradas,
      etiquetasBloqueadas: [...bloq.etiquetas],
      evitados: bloq.evitar
    },
    listaDeCompras: listaDeCompras(dias, ctx.dataBase, bloq),
    receitas: receitasDoPlano(base, bloq, metas, rnd),
    avisos,
    status: inicial.status,
    materialEducativo: inicial.materialEducativo,
    gerado: { driver: DRIVER, em: `${ctx.dataBase}T00:00:00.000Z`, semente: ctx.semente }
  };

  /* Cinto e suspensório: o gerador local passa pela MESMA validação que a
     saída do n8n. Se o nosso próprio cálculo furar, ninguém vê o plano. */
  return validarPlano(plano, contextoDeValidacao(perfil, metas, bloq));
}

/* ======================================================================== */
/*  Receitas a partir do que a pessoa tem em casa                           */
/* ======================================================================== */

const PARTICULAS = new Set([
  "de", "da", "do", "das", "dos", "e", "com", "sem", "ao", "a", "o", "em", "um", "uma", "no", "na"
]);

/** Quebra o texto livre em termos pesquisáveis. */
const termosDe = (texto: string): string[] => {
  const bruto = texto.split(/[,;\n/+]|\be\b/g).map((t) => normalizar(t)).filter(Boolean);
  return [...new Set(bruto)];
};

const casaAlimento = (a: Alimento, termo: string): boolean => {
  const alvo = normalizar(`${a.nome} ${a.compra ?? ""} ${a.id.replace(/_/g, " ")}`);
  const palavras = termo.split(" ").filter((p) => p.length >= 3 && !PARTICULAS.has(p));
  if (palavras.length === 0) return false;
  return palavras.some((p) => alvo.includes(p));
};

export function gerarReceitas(ctx: ContextoGeracao, pedido: PedidoReceitas): SaidaReceitas {
  const perfil = ctx.perfil;
  const bloq = montarBloqueio(perfil);
  const metas = metasDoPerfil(perfil);
  const permitida = baseSegura(bloq);
  const rnd = sorteador(`${ctx.semente}|receitas|${normalizar(pedido.ingredients)}`);

  const termos = termosDe(pedido.ingredients);
  const usados: string[] = [];
  const ignorados: { termo: string; motivo: string }[] = [];
  const casados: Alimento[] = [];

  for (const termo of termos) {
    const naPermitida = permitida.filter((a) => casaAlimento(a, termo));
    if (naPermitida.length > 0) {
      usados.push(termo);
      for (const a of naPermitida) if (!casados.includes(a)) casados.push(a);
      continue;
    }
    const naBaseInteira = ALIMENTOS.some((a) => casaAlimento(a, termo));
    ignorados.push({
      termo,
      motivo: naBaseInteira
        ? "está nas suas restrições, então não entrou em nenhuma receita"
        : "não encontramos esse item na nossa base de alimentos"
    });
  }

  /* As receitas priorizam o que a pessoa tem em casa: os alimentos casados
     entram na frente da base na hora de escolher cada vaga. */
  const ordenada = [...casados, ...permitida.filter((a) => !casados.includes(a))];
  const alvo = Math.round(Math.max(320, metas.kcal * 0.30));
  const limiteMinutos = pedido.maxMinutes && pedido.maxMinutes > 0 ? pedido.maxMinutes : null;

  const candidatos = MODELOS_RECEITA.filter((m) => !limiteMinutos || m.timeMin <= limiteMinutos);
  const modelos = candidatos.length > 0
    ? candidatos
    : [...MODELOS_RECEITA].sort((a, b) => a.timeMin - b.timeMin).slice(0, 2);

  const receitas: Receita[] = [];
  const inicio = Math.floor(rnd() * modelos.length);
  for (let k = 0; k < modelos.length && receitas.length < 4; k++) {
    const modelo = modelos[(inicio + k) % modelos.length]!;
    const seletor: Seletor = { base: ordenada, bloq, rnd, usados: new Set() };
    const es: Escolha[] = [];
    for (const vaga of modelo.vagas) {
      const preferir = [
        ...casados.filter((a) => a.papel === vaga.papel).map((a) => a.id),
        ...(vaga.preferir ?? [])
      ];
      const a = escolher(seletor, { ...vaga, preferir });
      if (a) es.push({ a, gramas: porcaoPara(a, alvo * vaga.peso) });
    }
    const emCasa = es.filter((e) => casados.includes(e.a)).length;
    const matchPct = es.length === 0 ? 0 : Math.round((emCasa / es.length) * 100);
    const r = receitaDe(modelo, es, bloq, alvo, matchPct);
    if (r) receitas.push(r);
  }

  if (receitas.length === 0) {
    throw new ViolacaoClinica(
      "sem_alimento_disponivel",
      "Não conseguimos montar nenhuma receita que respeite as suas restrições com esses ingredientes. Tente acrescentar uma proteína ou um carboidrato.",
      [`termos: ${termos.join(", ")}`, `base segura: ${permitida.length} alimentos`]
    );
  }

  receitas.sort((a, b) => b.matchPct - a.matchPct || a.timeMin - b.timeMin);

  const avisos = [AVISO_EDUCATIVO];
  if (ignorados.length > 0) {
    avisos.push(`Ficaram de fora: ${ignorados.map((i) => i.termo).join(", ")}.`);
  }
  if (limiteMinutos && candidatos.length === 0) {
    avisos.push(`Nenhuma receita nossa fica pronta em ${limiteMinutos} min; mostramos as mais rápidas que temos.`);
  }

  const saida: SaidaReceitas = {
    tipo: "receitas",
    versao: 1,
    receitas,
    usados,
    ignorados,
    avisos,
    gerado: { driver: DRIVER, em: `${ctx.dataBase}T00:00:00.000Z`, semente: ctx.semente }
  };
  return validarReceitas(saida, { bloqueio: bloq });
}

/* ======================================================================== */
/*  Cautela clínica                                                         */
/* ======================================================================== */

/**
 * Atalho usado pela rota antes de acionar qualquer driver: com sinal de
 * cautela o sistema não gera plano, devolve encaminhamento.
 */
export function orientacaoSePreciso(ctx: ContextoGeracao) {
  const sinais = detectarSinaisDeCautela(ctx.perfil);
  if (sinais.length === 0) return null;
  return orientacaoProfissional(sinais, ctx.nomeUsuario);
}
