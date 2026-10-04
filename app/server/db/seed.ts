/* =========================================================================
   Nutri&Live — semente

   Dois trabalhos num arquivo:

     1. CATÁLOGO: os nove planos vendidos na landing. Os preços são os
        mesmos de `src/data/segments.mjs` (fonte da verdade comercial), em
        centavos. Se mudar lá, muda aqui.

     2. DEMONSTRAÇÃO: um admin, uma pessoa física, duas nutricionistas
        (uma com 6 pacientes, outra com 2 — serve para provar que uma não
        vê a carteira da outra) e uma academia com 10 alunos, com 60 dias
        de diário alimentar, água, medidas, planos, prontuário, pagamentos
        e comissões coerentes entre si.

   Os dados são gerados com um gerador pseudoaleatório de semente fixa:
   roda duas vezes, sai igual. Isso é o que permite escrever teste e tirar
   print de tela sem o número dançar.

   No motor de memória esta semente é carregada sozinha na subida do
   processo (veja `db/index.ts`). Com Postgres, roda `npm run db:seed`.
   ========================================================================= */
import { randomUUID } from "node:crypto";
import type { Dados } from "./index.js";
import {
  aiJobs, auditLog, careLinks, clinicalNotes, commissions, foodLogs, invitations,
  mealPlans, measurements, organizations, payments, plans, profiles, recipes,
  shoppingLists, subscriptions, users, waterLogs
} from "./schema.js";
import { gerarHash } from "../auth/senha.js";
import { digerir } from "../auth/sessao.js";
import { calcularMetas, estimarRefeicao } from "../lib/metas.js";
import { chaveDoDia, inicioDaSemana, inicioDoDia, somarDias } from "../lib/datas.js";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";

/** Senha de todas as contas de demonstração. */
export const SENHA_DEMO = "Nutri@2025";
/** Quantos dias de histórico a demonstração carrega. */
const DIAS_DE_HISTORICO = 60;

/* ======================================================================== */
/*  Catálogo de planos — espelho de src/data/segments.mjs                   */
/* ======================================================================== */

export const CATALOGO = [
  /* ---------------------------- pessoa física --------------------------- */
  {
    key: "essencial", segment: "pessoal", name: "Essencial",
    description: "Para organizar a alimentação do dia a dia.",
    priceCents: 1990, seatLimit: 1, sortOrder: 10, featured: false,
    features: [
      "Diário alimentar e de hidratação",
      "Score diário de saúde",
      "3 receitas inteligentes por dia",
      "Metas de peso e medidas",
      "Histórico de 90 dias"
    ]
  },
  {
    key: "plus", segment: "pessoal", name: "Plus",
    description: "O plano completo — e o que quase todo mundo escolhe.",
    priceCents: 3990, seatLimit: 1, sortOrder: 20, featured: true,
    features: [
      "Tudo do Essencial",
      "Plano alimentar ilimitado de 1, 3 ou 7 dias",
      "Receitas inteligentes ilimitadas",
      "Lista de compras com preço estimado",
      "Evolução completa: medidas, fotos e gráficos",
      "Exportação em PDF para o seu nutri",
      "Histórico ilimitado"
    ]
  },
  {
    key: "familia", segment: "pessoal", name: "Família",
    description: "Até 5 perfis, cada um com o seu plano.",
    priceCents: 5990, seatLimit: 5, sortOrder: 30, featured: false,
    features: [
      "Tudo do Plus, para 5 pessoas",
      "Perfis independentes e privados",
      "Lista de compras unificada da casa",
      "Perfil infantil com porções ajustadas",
      "Uma única cobrança no mês"
    ]
  },
  /* --------------------------- nutricionista ---------------------------- */
  {
    key: "inicio", segment: "nutricionista", name: "Início",
    description: "Para quem está montando o consultório.",
    priceCents: 7990, seatLimit: 15, sortOrder: 10, featured: false,
    features: [
      "Até 15 pacientes ativos",
      "Planos alimentares ilimitados",
      "Prontuário e antropometria",
      "App do paciente incluso",
      "Suporte por e-mail"
    ]
  },
  {
    key: "profissional", segment: "nutricionista", name: "Profissional",
    description: "Para o consultório que já lotou a agenda.",
    priceCents: 14990, seatLimit: 60, sortOrder: 20, featured: true,
    features: [
      "Até 60 pacientes ativos",
      "Tudo do Início",
      "Relatórios de adesão e de risco de abandono",
      "Agenda com lembrete de retorno",
      "Mensagens dentro do app",
      "Suporte por WhatsApp em até 4 h"
    ]
  },
  {
    key: "clinica", segment: "nutricionista", name: "Clínica",
    description: "Para times com mais de um profissional.",
    priceCents: 29990, seatLimit: 9999, sortOrder: 30, featured: false,
    features: [
      "Pacientes ilimitados",
      "Até 5 nutricionistas na mesma conta",
      "Tudo do Profissional",
      "Permissões por papel e trilha de auditoria",
      "Relatórios consolidados da clínica",
      "API e integração com o seu sistema",
      "Gerente de conta dedicado"
    ]
  },
  /* ------------------------------ academia ------------------------------ */
  {
    key: "studio", segment: "academia", name: "Studio",
    description: "Estúdios e boxes até 150 alunos.",
    priceCents: 24900, seatLimit: 150, sortOrder: 10, featured: false,
    features: [
      "Até 150 alunos ativos",
      "1 unidade",
      "Painel de engajamento",
      "Convite em massa por link e QR",
      "Suporte por e-mail e WhatsApp"
    ]
  },
  {
    key: "academia", segment: "academia", name: "Academia",
    description: "A operação completa de uma academia de bairro ou de rua.",
    priceCents: 54900, seatLimit: 600, sortOrder: 20, featured: true,
    features: [
      "Até 600 alunos ativos",
      "Até 3 unidades na mesma conta",
      "Tudo do Studio",
      "Marca própria no app, e-mail e PDF",
      "Integração com o sistema de gestão",
      "Alerta de risco de cancelamento",
      "Implantação assistida no primeiro mês"
    ]
  },
  {
    key: "rede", segment: "academia", name: "Rede",
    description: "Redes e franquias a partir de 4 unidades.",
    priceCents: 119000, seatLimit: 99999, sortOrder: 30, featured: false,
    features: [
      "Alunos e unidades ilimitados",
      "Tudo do Academia",
      "API, webhooks e exportação para BI",
      "SSO e gestão centralizada de acessos",
      "SLA contratual e ambiente de homologação",
      "Gerente de conta e revisão trimestral",
      "Faturamento consolidado com rateio"
    ]
  }
] as const;

/* ======================================================================== */
/*  Gerador pseudoaleatório determinístico (mulberry32)                     */
/* ======================================================================== */

function gerador(semente: number) {
  let a = semente >>> 0;
  const proximo = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    real: (min: number, max: number) => min + proximo() * (max - min),
    inteiro: (min: number, max: number) => Math.floor(min + proximo() * (max - min + 1)),
    chance: (p: number) => proximo() < p,
    de: <T>(lista: readonly T[]): T => lista[Math.floor(proximo() * lista.length)] as T
  };
}

/* ======================================================================== */
/*  Cardápio brasileiro de verdade, para o diário não parecer gerado        */
/* ======================================================================== */

const CARDAPIO = {
  cafe: [
    "Café com leite, pão francês com requeijão e mamão",
    "Tapioca com queijo coalho e café preto",
    "Ovos mexidos, pão integral e suco de laranja",
    "Iogurte natural com aveia, banana e mel",
    "Cuscuz nordestino com ovo e café",
    "Vitamina de abacate com aveia",
    "Pão na chapa com manteiga e pingado"
  ],
  lanche_manha: [
    "Banana com pasta de amendoim",
    "Castanha-de-caju e uma maçã",
    "Iogurte desnatado",
    "Mamão com granola",
    "Água de coco e duas tâmaras"
  ],
  almoco: [
    "Arroz, feijão, bife grelhado e salada de alface com tomate",
    "Arroz integral, lentilha, frango grelhado e brócolis no vapor",
    "Macarrão ao sugo com frango desfiado e salada",
    "Feijoada leve com couve e laranja",
    "Escondidinho de carne moída com purê de abóbora",
    "Peixe assado com arroz de brócolis e salada de grão-de-bico",
    "Strogonoff de frango com arroz e batata palha",
    "Baião de dois com salada de rúcula",
    "Omelete de três ovos com salada e arroz integral"
  ],
  lanche_tarde: [
    "Café com pão de queijo",
    "Iogurte com granola",
    "Sanduíche de atum no pão integral",
    "Shake de whey com banana",
    "Pipoca sem manteiga e chá mate",
    "Fruta picada com chia"
  ],
  jantar: [
    "Sopa de legumes com frango desfiado",
    "Omelete com salada verde",
    "Wrap integral de frango com cenoura",
    "Sanduíche natural e suco de uva integral",
    "Arroz, feijão e ovo frito com couve",
    "Salmão na frigideira com legumes assados",
    "Crepioca com queijo e tomate",
    "Pizza de dois pedaços e refrigerante"
  ],
  ceia: [
    "Chá de camomila",
    "Iogurte natural",
    "Leite morno com canela",
    "Castanhas e chá de erva-doce"
  ]
} as const;

const ITENS_COMPRA = [
  { group: "Hortifrúti", name: "Banana prata", qty: "1 dúzia", cents: 890 },
  { group: "Hortifrúti", name: "Mamão formosa", qty: "1 un", cents: 1190 },
  { group: "Hortifrúti", name: "Alface crespa", qty: "2 pés", cents: 760 },
  { group: "Hortifrúti", name: "Tomate", qty: "1 kg", cents: 1290 },
  { group: "Hortifrúti", name: "Brócolis", qty: "1 maço", cents: 980 },
  { group: "Hortifrúti", name: "Cenoura", qty: "500 g", cents: 480 },
  { group: "Proteínas", name: "Filé de frango", qty: "1 kg", cents: 2290 },
  { group: "Proteínas", name: "Patinho moído", qty: "500 g", cents: 2690 },
  { group: "Proteínas", name: "Ovos caipira", qty: "20 un", cents: 1890 },
  { group: "Proteínas", name: "Filé de tilápia", qty: "600 g", cents: 3290 },
  { group: "Mercearia", name: "Arroz integral", qty: "1 kg", cents: 890 },
  { group: "Mercearia", name: "Feijão carioca", qty: "1 kg", cents: 790 },
  { group: "Mercearia", name: "Aveia em flocos", qty: "500 g", cents: 1090 },
  { group: "Mercearia", name: "Azeite extravirgem", qty: "500 ml", cents: 3490 },
  { group: "Mercearia", name: "Tapioca granulada", qty: "500 g", cents: 850 },
  { group: "Frios e laticínios", name: "Iogurte natural", qty: "6 un", cents: 1740 },
  { group: "Frios e laticínios", name: "Queijo minas frescal", qty: "400 g", cents: 2190 },
  { group: "Frios e laticínios", name: "Requeijão light", qty: "200 g", cents: 1290 }
] as const;

const NOTAS_CLINICAS = [
  "Primeira consulta. Relata compulsão no fim da tarde e pouca ingestão de água. Combinamos lanche proteico às 16h.",
  "Retorno de 30 dias. Perdeu 1,8 kg, cintura −3 cm. Adesão boa durante a semana, cai no fim de semana.",
  "Ajustei o café da manhã para incluir proteína. Queixa de fome às 10h deve melhorar.",
  "Exames trazidos: ferritina baixa. Orientei fontes de ferro com vitamina C e encaminhei para avaliação médica.",
  "Relata treino novo 5x/semana. Aumentei carboidrato no pré-treino e proteína total para 1,8 g/kg.",
  "Semana de viagem de trabalho. Orientei escolhas em restaurante por quilo e hidratação.",
  "Paciente sumiu do app por 12 dias. Mandei mensagem; relata semana difícil no trabalho. Replanejamos metas menores."
];

/* ======================================================================== */
/*  Perfis de demonstração                                                  */
/* ======================================================================== */

type Pessoa = {
  nome: string;
  email: string;
  sexo: "feminino" | "masculino";
  nascimento: string;
  alturaCm: number;
  pesoKg: number;
  /** kg por semana: negativo emagrece. */
  tendencia: number;
  objetivo: "emagrecer" | "manter" | "ganhar_massa";
  atividade: "sedentario" | "leve" | "moderado" | "intenso" | "atleta";
  /** Probabilidade de registrar o dia: é o que produz a adesão. */
  disciplina: number;
  restricoes?: string[];
  naoGosta?: string[];
  /** Fica como "convidado": recebeu convite e ainda não entrou. */
  pendente?: boolean;
  /** Dias desde o último registro, para forçar risco de abandono. */
  silencio?: number;
};

const PACIENTES_JULIANA: Pessoa[] = [
  { nome: "Mariana Alves Ribeiro", email: "mariana.ribeiro@exemplo.com.br", sexo: "feminino", nascimento: "1991-04-18", alturaCm: 164, pesoKg: 78.4, tendencia: -0.35, objetivo: "emagrecer", atividade: "leve", disciplina: 0.92, restricoes: ["lactose"] },
  { nome: "Thiago Nogueira Lima", email: "thiago.lima@exemplo.com.br", sexo: "masculino", nascimento: "1987-11-02", alturaCm: 178, pesoKg: 92.1, tendencia: -0.45, objetivo: "emagrecer", atividade: "moderado", disciplina: 0.78, naoGosta: ["jiló", "fígado"] },
  { nome: "Patrícia Souza Barreto", email: "patricia.barreto@exemplo.com.br", sexo: "feminino", nascimento: "1979-06-27", alturaCm: 158, pesoKg: 69.0, tendencia: -0.15, objetivo: "emagrecer", atividade: "sedentario", disciplina: 0.52 },
  { nome: "Rafael Costa Pimentel", email: "rafael.pimentel@exemplo.com.br", sexo: "masculino", nascimento: "1996-02-09", alturaCm: 183, pesoKg: 71.5, tendencia: 0.22, objetivo: "ganhar_massa", atividade: "intenso", disciplina: 0.88 },
  { nome: "Luciana Ferraz de Melo", email: "luciana.melo@exemplo.com.br", sexo: "feminino", nascimento: "1984-09-14", alturaCm: 170, pesoKg: 64.3, tendencia: -0.05, objetivo: "manter", atividade: "moderado", disciplina: 0.33, silencio: 11, restricoes: ["glúten"] },
  { nome: "Daniel Moreira Pinto", email: "daniel.pinto@exemplo.com.br", sexo: "masculino", nascimento: "2000-01-23", alturaCm: 175, pesoKg: 83.7, tendencia: -0.30, objetivo: "emagrecer", atividade: "leve", disciplina: 0.0, pendente: true }
];

const PACIENTES_BIA: Pessoa[] = [
  { nome: "Fernanda Quirino Sales", email: "fernanda.sales@exemplo.com.br", sexo: "feminino", nascimento: "1993-07-30", alturaCm: 161, pesoKg: 59.8, tendencia: 0.08, objetivo: "ganhar_massa", atividade: "moderado", disciplina: 0.84 },
  { nome: "Marcos Vinícius Teles", email: "marcos.teles@exemplo.com.br", sexo: "masculino", nascimento: "1982-03-05", alturaCm: 172, pesoKg: 88.9, tendencia: -0.25, objetivo: "emagrecer", atividade: "leve", disciplina: 0.61 }
];

const ALUNOS: Pessoa[] = [
  { nome: "Bruno Sales Carvalho", email: "bruno.carvalho@exemplo.com.br", sexo: "masculino", nascimento: "1995-05-12", alturaCm: 180, pesoKg: 86.2, tendencia: -0.25, objetivo: "emagrecer", atividade: "intenso", disciplina: 0.86 },
  { nome: "Juliana Matos Freire", email: "juliana.freire@exemplo.com.br", sexo: "feminino", nascimento: "1998-08-21", alturaCm: 167, pesoKg: 62.4, tendencia: 0.10, objetivo: "ganhar_massa", atividade: "intenso", disciplina: 0.80 },
  { nome: "Carlos Eduardo Brandão", email: "carlos.brandao@exemplo.com.br", sexo: "masculino", nascimento: "1976-12-03", alturaCm: 174, pesoKg: 95.5, tendencia: -0.40, objetivo: "emagrecer", atividade: "moderado", disciplina: 0.57 },
  { nome: "Aline Ribeiro Tavares", email: "aline.tavares@exemplo.com.br", sexo: "feminino", nascimento: "1990-10-17", alturaCm: 159, pesoKg: 71.8, tendencia: -0.20, objetivo: "emagrecer", atividade: "leve", disciplina: 0.44 },
  { nome: "Pedro Henrique Góes", email: "pedro.goes@exemplo.com.br", sexo: "masculino", nascimento: "2002-06-08", alturaCm: 177, pesoKg: 68.3, tendencia: 0.28, objetivo: "ganhar_massa", atividade: "atleta", disciplina: 0.91 },
  { nome: "Simone Araújo Vilela", email: "simone.vilela@exemplo.com.br", sexo: "feminino", nascimento: "1971-02-26", alturaCm: 162, pesoKg: 74.6, tendencia: -0.12, objetivo: "emagrecer", atividade: "moderado", disciplina: 0.66 },
  { nome: "Wesley Damião Pontes", email: "wesley.pontes@exemplo.com.br", sexo: "masculino", nascimento: "1999-09-19", alturaCm: 181, pesoKg: 79.0, tendencia: 0.05, objetivo: "manter", atividade: "intenso", disciplina: 0.21, silencio: 14 },
  { nome: "Camila Prado Dutra", email: "camila.dutra@exemplo.com.br", sexo: "feminino", nascimento: "1994-11-11", alturaCm: 165, pesoKg: 66.1, tendencia: -0.10, objetivo: "manter", atividade: "moderado", disciplina: 0.73 },
  { nome: "Otávio Lins Fontes", email: "otavio.fontes@exemplo.com.br", sexo: "masculino", nascimento: "1988-04-04", alturaCm: 170, pesoKg: 101.3, tendencia: -0.50, objetivo: "emagrecer", atividade: "leve", disciplina: 0.49 },
  { nome: "Rebeca Nunes Siqueira", email: "rebeca.siqueira@exemplo.com.br", sexo: "feminino", nascimento: "2001-01-07", alturaCm: 156, pesoKg: 54.2, tendencia: 0.12, objetivo: "ganhar_massa", atividade: "moderado", disciplina: 0.0, pendente: true }
];

/* ======================================================================== */
/*  A semente                                                              */
/* ======================================================================== */

export type OpcoesSemente = { silencioso?: boolean; forcar?: boolean };

export async function semear(db: Dados, opcoes: OpcoesSemente = {}): Promise<void> {
  const diga = (m: string) => { if (!opcoes.silencioso) log.info(m); };
  const comecou = Date.now();

  if (opcoes.forcar) await db.limpar();

  /* -------------------------- 1. catálogo ------------------------------- */
  for (const p of CATALOGO) {
    const existe = await db.primeiro(plans, { key: p.key });
    const valores = {
      key: p.key, segment: p.segment, name: p.name, description: p.description,
      priceCents: p.priceCents, seatLimit: p.seatLimit, features: [...p.features],
      featured: p.featured, active: true, sortOrder: p.sortOrder
    };
    if (existe) await db.atualizar(plans, { key: p.key }, valores);
    else await db.inserir(plans, valores);
  }
  diga(`semente: ${CATALOGO.length} planos no catálogo`);

  /* Já tem demonstração? Então só o catálogo era para ser atualizado. */
  const jaTem = await db.primeiro(users, { email: "admin@nutrielive.com.br" });
  if (jaTem && !opcoes.forcar) {
    diga("semente: dados de demonstração já existem, nada a recriar");
    return;
  }

  const r = gerador(20250607);
  const hash = await gerarHash(SENHA_DEMO);        /* um hash só: Argon2 é caro de propósito */
  const hoje = inicioDoDia();
  const emDias = (d: number, hora = 9, minuto = 0) =>
    new Date(somarDias(hoje, d).getTime() + hora * 3_600_000 + minuto * 60_000);

  /* ------------------------- 2. nosso time ----------------------------- */
  const admin = await db.inserir(users, {
    email: "admin@nutrielive.com.br", passwordHash: hash, name: "Equipe Nutri&Live",
    role: "admin", status: "ativo", emailVerifiedAt: emDias(-120), createdAt: emDias(-120),
    mustChangePassword: false, lastLoginAt: emDias(0, 8, 12)
  });

  /* ----------------- 3. funções de apoio ao histórico ------------------- */

  /** Cria usuário + perfil + metas calculadas. */
  async function criarPessoa(p: Pessoa, papel: "pessoal" | "paciente" | "aluno", orgId: string | null, criadoEm: Date) {
    const metas = calcularMetas({
      sexo: p.sexo, nascimento: p.nascimento, alturaCm: p.alturaCm,
      pesoKg: p.pesoKg, objetivo: p.objetivo, atividade: p.atividade
    });
    const u = await db.inserir(users, {
      email: p.email,
      passwordHash: p.pendente ? null : hash,
      name: p.nome,
      role: papel,
      status: p.pendente ? "convidado" : "ativo",
      orgId,
      cpf: String(r.inteiro(10_000_000_000, 99_999_999_998)),
      phone: `119${r.inteiro(10_000_000, 99_999_999)}`,
      mustChangePassword: Boolean(p.pendente),
      emailVerifiedAt: p.pendente ? null : criadoEm,
      lastLoginAt: p.pendente ? null : emDias(-(p.silencio ?? 0), 20, r.inteiro(0, 59)),
      createdAt: criadoEm
    });
    await db.inserir(profiles, {
      userId: u.id,
      birthDate: p.nascimento,
      sex: p.sexo,
      heightCm: p.alturaCm,
      goal: p.objetivo,
      activityLevel: p.atividade,
      dietStyle: r.de(["tradicional", "tradicional", "low_carb", "mediterranea", "vegetariana"]),
      restrictions: p.restricoes ?? [],
      dislikes: p.naoGosta ?? [],
      kcalTarget: metas.kcal,
      proteinTargetG: metas.proteinaG,
      waterTargetMl: metas.aguaMl,
      updatedAt: criadoEm
    });
    return { usuario: u, metas };
  }

  /** 60 dias de diário, água e medidas, com a adesão que o perfil pede. */
  async function criarHistorico(p: Pessoa, usuarioId: string, metas: { kcal: number; proteinaG: number; aguaMl: number }) {
    if (p.pendente) return;

    const refeicoesParaInserir: any[] = [];
    const aguaParaInserir: any[] = [];
    const silencio = p.silencio ?? 0;

    for (let d = -(DIAS_DE_HISTORICO - 1); d <= 0; d++) {
      if (d > -silencio) break;                        /* parou de registrar há `silencio` dias */
      const fimDeSemana = [0, 6].includes(somarDias(hoje, d).getUTCDay());
      const prob = p.disciplina * (fimDeSemana ? 0.72 : 1);
      if (!r.chance(prob)) continue;

      const quantas = r.inteiro(3, 5);
      const ordem = ["cafe", "almoco", "jantar", "lanche_tarde", "lanche_manha", "ceia"] as const;
      const horas: Record<string, number> = { cafe: 7, lanche_manha: 10, almoco: 12, lanche_tarde: 16, jantar: 20, ceia: 22 };

      for (const refeicao of ordem.slice(0, quantas)) {
        const descricao = r.de(CARDAPIO[refeicao]);
        const base = estimarRefeicao(refeicao, descricao);
        /* Variação de ±12 % para o total do dia não ficar sempre igual. */
        const fator = r.real(0.88, 1.12) * (metas.kcal / 2000);
        refeicoesParaInserir.push({
          userId: usuarioId,
          loggedAt: emDias(d, horas[refeicao] ?? 12, r.inteiro(0, 55)),
          meal: refeicao,
          description: descricao,
          kcal: Math.round(base.kcal * fator),
          proteinG: Math.round(base.protein * fator),
          carbG: Math.round(base.carb * fator),
          fatG: Math.round(base.fat * fator)
        });
      }

      const copos = r.inteiro(3, 8);
      for (let i = 0; i < copos; i++) {
        aguaParaInserir.push({
          userId: usuarioId,
          loggedAt: emDias(d, 8 + i * 2, r.inteiro(0, 50)),
          ml: r.de([200, 250, 300, 500])
        });
      }
    }

    await db.inserirVarios(foodLogs, refeicoesParaInserir);
    await db.inserirVarios(waterLogs, aguaParaInserir);

    /* Medidas a cada 7 dias, com a tendência de peso do perfil e um pouco
       de ruído — balança de banheiro não é laboratório. */
    const medidas: any[] = [];
    for (let semana = 8; semana >= 0; semana--) {
      const peso = p.pesoKg + p.tendencia * (8 - semana) + r.real(-0.35, 0.35);
      const cinturaBase = p.sexo === "feminino" ? p.pesoKg * 1.02 : p.pesoKg * 1.05;
      medidas.push({
        userId: usuarioId,
        takenAt: emDias(-semana * 7, 7, 30),
        weightKg: Math.round(peso * 1000),                                  /* coluna weight_g: gramas */
        waistCm: Math.round((cinturaBase + p.tendencia * (8 - semana) * 1.6 + r.real(-0.8, 0.8)) * 10),  /* waist_mm */
        hipCm: Math.round((cinturaBase * 1.12 + p.tendencia * (8 - semana) + r.real(-0.6, 0.6)) * 10),
        armCm: Math.round((p.sexo === "feminino" ? 29 : 33) * 10 + (p.objetivo === "ganhar_massa" ? (8 - semana) * 2 : 0)),
        bodyFatPct: Math.round(r.real(p.sexo === "feminino" ? 26 : 18, p.sexo === "feminino" ? 34 : 27) * 100),
        note: semana === 8 ? "Avaliação inicial" : null
      });
    }
    await db.inserirVarios(measurements, medidas);

    /* Lista de compras da semana corrente, com metade dos itens já comprados. */
    const itens = [...ITENS_COMPRA]
      .slice(0, r.inteiro(10, ITENS_COMPRA.length))
      .map((i, idx) => ({ ...i, done: idx % 3 === 0 }));
    await db.inserir(shoppingLists, {
      userId: usuarioId,
      weekStart: chaveDoDia(inicioDaSemana()),
      items: itens,
      estimatedCents: itens.reduce((t, i) => t + i.cents, 0),
      createdAt: inicioDaSemana()
    });
  }

  /** Plano alimentar com conteúdo de verdade, do jeito que a IA devolve. */
  async function criarPlano(usuarioId: string, criadoPor: string | null, metas: { kcal: number; proteinaG: number },
                            titulo: string, origem: "ia" | "nutricionista", estado: "rascunho" | "enviado" | "ativo", quandoDias: number) {
    const dia = (nome: string) => ({
      dia: nome,
      refeicoes: (["cafe", "lanche_manha", "almoco", "lanche_tarde", "jantar"] as const).map((k) => {
        const descricao = r.de(CARDAPIO[k]);
        const est = estimarRefeicao(k, descricao);
        return { refeicao: k, descricao, kcal: Math.round(est.kcal * (metas.kcal / 2000)), proteinaG: est.protein };
      })
    });
    return db.inserir(mealPlans, {
      userId: usuarioId,
      createdByUserId: criadoPor,
      title: titulo,
      days: 7,
      kcalTarget: metas.kcal,
      macros: { protein: metas.proteinaG, carb: Math.round((metas.kcal * 0.45) / 4), fat: Math.round((metas.kcal * 0.28) / 9) },
      content: { dias: ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"].map(dia) },
      source: origem,
      status: estado,
      createdAt: emDias(quandoDias, 11, 20)
    });
  }

  /** Assinatura + 3 faturas pagas, para o painel do admin ter série temporal. */
  async function assinar(usuarioId: string, orgId: string | null, planKey: string, metodo: "credito" | "debito" | "pix", desdeDias: number) {
    const plano = CATALOGO.find((p) => p.key === planKey)!;
    const assinatura = await db.inserir(subscriptions, {
      userId: usuarioId, orgId, planKey, status: "ativa", method: metodo,
      provider: env.PAY_DRIVER === "simulado" ? "simulado" : "mercadopago",
      providerSubId: `demo-sub-${planKey}-${usuarioId.slice(0, 8)}`,
      priceCents: plano.priceCents,
      /* Próxima renovação: o primeiro ciclo de 30 dias que cai no futuro. */
      currentPeriodEnd: emDias(desdeDias + 30 * Math.ceil((1 - desdeDias) / 30), 12),
      createdAt: emDias(desdeDias, 10, 5)
    });
    for (let i = 0; i < 3; i++) {
      const quando = desdeDias + i * 30;
      if (quando > 0) break;
      await db.inserir(payments, {
        subscriptionId: assinatura.id, userId: usuarioId,
        provider: assinatura.provider,
        providerPaymentId: `demo-pay-${assinatura.id.slice(0, 8)}-${i}`,
        amountCents: plano.priceCents, method: metodo, status: "aprovado",
        brand: metodo === "pix" ? null : r.de(["visa", "master", "elo"]),
        last4: metodo === "pix" ? null : String(r.inteiro(1000, 9999)),
        paidAt: emDias(quando, 10, 7), createdAt: emDias(quando, 10, 5)
      });
    }
    return assinatura;
  }

  /* ---------------------- 4. pessoa física ----------------------------- */
  const pessoaFisica: Pessoa = {
    nome: "Camila Duarte Rocha", email: "camila@exemplo.com.br", sexo: "feminino",
    nascimento: "1992-03-15", alturaCm: 166, pesoKg: 72.5, tendencia: -0.30,
    objetivo: "emagrecer", atividade: "moderado", disciplina: 0.9, restricoes: ["lactose"],
    naoGosta: ["berinjela"]
  };
  const camila = await criarPessoa(pessoaFisica, "pessoal", null, emDias(-72));
  await assinar(camila.usuario.id, null, "plus", "credito", -72);
  await criarHistorico(pessoaFisica, camila.usuario.id, camila.metas);
  await criarPlano(camila.usuario.id, null, camila.metas, "Plano de 7 dias — semana leve", "ia", "ativo", -6);
  await criarPlano(camila.usuario.id, null, camila.metas, "Plano de 7 dias — semana anterior", "ia", "arquivado", -14);
  diga("semente: pessoa física com assinatura Plus e 60 dias de histórico");

  /* --------------------- 5. receitas da vitrine ------------------------ */
  const RECEITAS = [
    { title: "Frango ao curry com abobrinha", timeMin: 25, kcal: 420, ingredientes: ["Filé de frango", "Abobrinha", "Leite de coco", "Curry", "Cebola"], passos: ["Doure a cebola", "Sele o frango em cubos", "Junte a abobrinha e o curry", "Finalize com leite de coco e cozinhe 8 min"] },
    { title: "Omelete de forno com espinafre", timeMin: 20, kcal: 310, ingredientes: ["3 ovos", "Espinafre", "Queijo minas", "Tomate"], passos: ["Bata os ovos", "Misture os recheios", "Asse em forma pequena por 18 min a 200 °C"] },
    { title: "Escondidinho de abóbora com carne moída", timeMin: 40, kcal: 480, ingredientes: ["Abóbora cabotiá", "Patinho moído", "Cebola", "Alho", "Orégano"], passos: ["Cozinhe e amasse a abóbora", "Refogue a carne", "Monte em camadas e gratine 15 min"] },
    { title: "Tapioca de queijo com tomate", timeMin: 8, kcal: 260, ingredientes: ["Goma de tapioca", "Queijo minas", "Tomate", "Orégano"], passos: ["Espalhe a goma na frigideira", "Recheie e dobre", "Sirva na hora"] }
  ];
  for (const rc of RECEITAS) {
    await db.inserir(recipes, {
      userId: camila.usuario.id, title: rc.title, timeMin: rc.timeMin, kcal: rc.kcal,
      macros: { protein: Math.round((rc.kcal * 0.3) / 4), carb: Math.round((rc.kcal * 0.4) / 4), fat: Math.round((rc.kcal * 0.3) / 9) },
      ingredients: rc.ingredientes, steps: rc.passos, matchPct: r.inteiro(72, 98),
      createdAt: emDias(-r.inteiro(1, 20), 19)
    });
  }

  /* -------------- 6. consultório: duas nutricionistas ------------------ */

  async function criarConsultorio(dados: {
    nomeOrg: string; slug: string; cidade: string; planKey: string;
    profissional: { nome: string; email: string; crn: string; nascimento: string; sexo: "feminino" | "masculino"; alturaCm: number; pesoKg: number };
    pacientes: Pessoa[]; desdeDias: number;
  }) {
    const plano = CATALOGO.find((p) => p.key === dados.planKey)!;
    const org = await db.inserir(organizations, {
      type: "nutricionista", name: dados.nomeOrg, slug: dados.slug,
      seatLimit: plano.seatLimit, cityState: dados.cidade, createdAt: emDias(dados.desdeDias)
    });
    const prof = await db.inserir(users, {
      email: dados.profissional.email, passwordHash: hash, name: dados.profissional.nome,
      role: "nutricionista", status: "ativo", orgId: org.id, crn: dados.profissional.crn,
      cpf: String(r.inteiro(10_000_000_000, 99_999_999_998)), phone: `119${r.inteiro(10_000_000, 99_999_999)}`,
      emailVerifiedAt: emDias(dados.desdeDias), createdAt: emDias(dados.desdeDias), lastLoginAt: emDias(0, 7, 40)
    });
    await db.atualizar(organizations, { id: org.id }, { ownerUserId: prof.id });
    await db.inserir(profiles, {
      userId: prof.id, birthDate: dados.profissional.nascimento, sex: dados.profissional.sexo,
      heightCm: dados.profissional.alturaCm, goal: "manter", activityLevel: "moderado",
      dietStyle: "tradicional", restrictions: [], dislikes: [],
      kcalTarget: calcularMetas({ sexo: dados.profissional.sexo, nascimento: dados.profissional.nascimento, alturaCm: dados.profissional.alturaCm, pesoKg: dados.profissional.pesoKg, objetivo: "manter", atividade: "moderado" }).kcal,
      proteinTargetG: calcularMetas({ sexo: dados.profissional.sexo, nascimento: dados.profissional.nascimento, alturaCm: dados.profissional.alturaCm, pesoKg: dados.profissional.pesoKg, objetivo: "manter", atividade: "moderado" }).proteinaG,
      waterTargetMl: 2500, updatedAt: emDias(dados.desdeDias)
    });
    await assinar(prof.id, org.id, dados.planKey, "credito", dados.desdeDias);

    for (const [i, p] of dados.pacientes.entries()) {
      const entrouEm = emDias(dados.desdeDias + 3 + i * 4);
      const pac = await criarPessoa(p, "paciente", org.id, entrouEm);
      const vinculo = await db.inserir(careLinks, {
        orgId: org.id, professionalUserId: prof.id, memberUserId: pac.usuario.id,
        status: p.pendente ? "pendente" : "ativo",
        startedAt: entrouEm,
        nextReturnAt: p.pendente ? null : emDias(p.silencio && p.silencio > 7 ? -4 : r.inteiro(6, 25), 14)
      });
      await criarHistorico(p, pac.usuario.id, pac.metas);
      if (!p.pendente) {
        await criarPlano(pac.usuario.id, prof.id, pac.metas, `Plano de 7 dias — ${p.nome.split(" ")[0]}`, "nutricionista", "enviado", -r.inteiro(3, 20));
        const quantasNotas = r.inteiro(1, 3);
        for (let n = 0; n < quantasNotas; n++) {
          await db.inserir(clinicalNotes, {
            careLinkId: vinculo.id, authorUserId: prof.id,
            body: r.de(NOTAS_CLINICAS), createdAt: emDias(-(n * 14 + r.inteiro(1, 6)), 15, 10)
          });
        }
      } else {
        /* Convite enviado e ainda não aceito: ocupa assento e aparece como convidado. */
        await db.inserir(invitations, {
          orgId: org.id, invitedByUserId: prof.id, email: p.email, name: p.nome,
          role: "paciente", tokenHash: digerir(randomUUID()),
          expiresAt: emDias(12, 12), createdAt: emDias(-2, 9, 30)
        });
      }
    }
    return { org, prof };
  }

  const juliana = await criarConsultorio({
    nomeOrg: "Clínica Prado Nutrição", slug: "clinica-prado", cidade: "São Paulo/SP",
    planKey: "profissional",
    profissional: { nome: "Juliana Prado Avelar", email: "juliana@exemplo.com.br", crn: "CRN-3 12345", nascimento: "1986-05-20", sexo: "feminino", alturaCm: 168, pesoKg: 63 },
    pacientes: PACIENTES_JULIANA, desdeDias: -96
  });
  diga(`semente: ${PACIENTES_JULIANA.length} pacientes na ${juliana.org.name}`);

  const bia = await criarConsultorio({
    nomeOrg: "Bia Camargo Nutrição", slug: "bia-camargo", cidade: "Belo Horizonte/MG",
    planKey: "inicio",
    profissional: { nome: "Beatriz Camargo Dias", email: "bia@exemplo.com.br", crn: "CRN-9 54321", nascimento: "1994-02-02", sexo: "feminino", alturaCm: 162, pesoKg: 58 },
    pacientes: PACIENTES_BIA, desdeDias: -48
  });
  diga(`semente: ${PACIENTES_BIA.length} pacientes na ${bia.org.name} (serve para provar o isolamento entre carteiras)`);

  /* ------------------------- 7. academia ------------------------------- */
  const planoAcademia = CATALOGO.find((p) => p.key === "academia")!;
  const orgAcademia = await db.inserir(organizations, {
    type: "academia", name: "Academia Corpo & Movimento", slug: "corpo-e-movimento",
    seatLimit: planoAcademia.seatLimit, cityState: "Curitiba/PR", createdAt: emDias(-64)
  });
  const gestor = await db.inserir(users, {
    email: "rodrigo@corpoemovimento.com.br", passwordHash: hash, name: "Rodrigo Menezes Alencar",
    role: "academia", status: "ativo", orgId: orgAcademia.id,
    cpf: String(r.inteiro(10_000_000_000, 99_999_999_998)), phone: `419${r.inteiro(10_000_000, 99_999_999)}`,
    emailVerifiedAt: emDias(-64), createdAt: emDias(-64), lastLoginAt: emDias(0, 9, 5)
  });
  await db.atualizar(organizations, { id: orgAcademia.id }, { ownerUserId: gestor.id });
  const assinaturaAcademia = await assinar(gestor.id, orgAcademia.id, "academia", "pix", -64);

  for (const [i, p] of ALUNOS.entries()) {
    const entrouEm = emDias(-60 + i * 5);
    const aluno = await criarPessoa(p, "aluno", orgAcademia.id, entrouEm);
    await db.inserir(careLinks, {
      orgId: orgAcademia.id, professionalUserId: gestor.id, memberUserId: aluno.usuario.id,
      status: p.pendente ? "pendente" : "ativo", startedAt: entrouEm,
      nextReturnAt: p.pendente ? null : emDias(r.inteiro(10, 40), 10)
    });
    await criarHistorico(p, aluno.usuario.id, aluno.metas);
    if (!p.pendente && r.chance(0.6)) {
      await criarPlano(aluno.usuario.id, null, aluno.metas, `Plano de 7 dias — ${p.nome.split(" ")[0]}`, "ia", "ativo", -r.inteiro(2, 18));
    }
    if (p.pendente) {
      await db.inserir(invitations, {
        orgId: orgAcademia.id, invitedByUserId: gestor.id, email: p.email, name: p.nome,
        role: "aluno", tokenHash: digerir(randomUUID()), expiresAt: emDias(12, 12), createdAt: emDias(-3, 11)
      });
    }
  }
  diga(`semente: ${ALUNOS.length} alunos na ${orgAcademia.name}`);

  /* Comissão da academia sobre os três últimos meses. */
  for (let m = 2; m >= 0; m--) {
    const quando = somarDias(hoje, -m * 30);
    const base = planoAcademia.priceCents;
    await db.inserir(commissions, {
      orgId: orgAcademia.id, subscriptionId: assinaturaAcademia.id,
      period: `${quando.getUTCFullYear()}-${String(quando.getUTCMonth() + 1).padStart(2, "0")}`,
      baseCents: base, rateBp: env.COMMISSION_RATE_BP,
      amountCents: Math.round((base * env.COMMISSION_RATE_BP) / 10_000),
      status: m === 0 ? "prevista" : "paga", paidAt: m === 0 ? null : emDias(-m * 30 + 5, 12),
      createdAt: emDias(-m * 30, 1)
    });
  }

  /* ------------------------- 8. IA e auditoria ------------------------- */
  await db.inserir(aiJobs, {
    userId: camila.usuario.id, requestedByUserId: camila.usuario.id, kind: "plano",
    status: "concluido", input: { days: 7, notes: "sem lactose" },
    output: { resumo: "Plano de 7 dias gerado com 1.520 kcal por dia." },
    n8nExecutionId: "demo-exec-1", tokensIn: 1820, tokensOut: 2450,
    createdAt: emDias(-6, 11, 18), finishedAt: emDias(-6, 11, 19)
  });
  await db.inserir(aiJobs, {
    userId: camila.usuario.id, requestedByUserId: camila.usuario.id, kind: "receita",
    status: "concluido", input: { ingredients: "frango, abobrinha, leite de coco" },
    output: { receitas: 3 }, n8nExecutionId: "demo-exec-2", tokensIn: 640, tokensOut: 980,
    createdAt: emDias(-2, 19, 40), finishedAt: emDias(-2, 19, 41)
  });
  await db.inserir(aiJobs, {
    userId: ALUNOS[0] ? (await db.primeiro(users, { email: ALUNOS[0].email }))!.id : camila.usuario.id,
    requestedByUserId: gestor.id, kind: "analise", status: "erro",
    input: { periodo: "30d" }, error: "n8n indisponível (502) — tentativa automática em 10 min",
    createdAt: emDias(-1, 8, 10), finishedAt: emDias(-1, 8, 11)
  });

  await db.inserir(auditLog, {
    actorUserId: admin.id, action: "seed.carregado", entity: "sistema", entityId: null,
    meta: { planos: CATALOGO.length, motor: db.motor } as never, ip: "127.0.0.1", createdAt: new Date()
  });

  const totalUsuarios = await db.contar(users);
  const totalRefeicoes = await db.contar(foodLogs);
  diga(`semente: pronta em ${Date.now() - comecou} ms — ${totalUsuarios} usuários, ${totalRefeicoes} refeições registradas`);
  diga(`semente: entre com qualquer e-mail de demonstração e a senha ${SENHA_DEMO}`);
}

/* ------------------------------ linha de comando ------------------------ */
const executadoDireto = process.argv[1]?.replace(/\\/g, "/").endsWith("db/seed.ts");
if (executadoDireto) {
  const { db } = await import("./index.js");
  await semear(db, { forcar: process.env.SEED_FORCE === "1" });
  await db.encerrar();
}
