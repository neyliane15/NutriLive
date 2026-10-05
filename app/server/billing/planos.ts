/* =========================================================================
   Nutri&Live — catálogo de planos e cupons

   Os preços são os mesmos da landing (`#nl-catalogue` em checkout.html).
   Em produção a tabela `plans` é a fonte; este arquivo é o que alimenta o
   seed e o modo memória, para o sistema rodar inteiro sem Postgres.
   Dinheiro sempre em centavos, inteiro.
   ========================================================================= */
import type { Segment } from "../../shared/contract.js";

/** Mesma forma da tabela `plans`, para dar para inserir direto. */
export interface PlanoCatalogo {
  key: string;
  segment: Segment;
  name: string;
  description: string;
  priceCents: number;
  seatLimit: number;
  features: string[];
  featured: boolean;
  active: boolean;
  sortOrder: number;
}

export const PLANOS: PlanoCatalogo[] = [
  /* ------------------------------- pessoal ------------------------------- */
  {
    key: "essencial", segment: "pessoal", name: "Essencial",
    description: "Para organizar a alimentação do dia a dia.",
    priceCents: 1990, seatLimit: 1, featured: false, active: true, sortOrder: 1,
    features: [
      "Diário alimentar e de hidratação",
      "Score diário de saúde",
      "3 receitas inteligentes por dia",
      "Metas de peso e medidas"
    ]
  },
  {
    key: "plus", segment: "pessoal", name: "Plus",
    description: "O plano completo — e o que quase todo mundo escolhe.",
    priceCents: 3990, seatLimit: 1, featured: true, active: true, sortOrder: 2,
    features: [
      "Tudo do Essencial",
      "Plano alimentar ilimitado de 1, 3 ou 7 dias",
      "Receitas inteligentes ilimitadas",
      "Lista de compras com preço estimado"
    ]
  },
  {
    key: "familia", segment: "pessoal", name: "Família",
    description: "Até 5 perfis, cada um com o seu plano.",
    priceCents: 5990, seatLimit: 5, featured: false, active: true, sortOrder: 3,
    features: [
      "Tudo do Plus, para 5 pessoas",
      "Perfis independentes e privados",
      "Lista de compras unificada da casa",
      "Perfil infantil com porções ajustadas"
    ]
  },

  /* ---------------------------- nutricionista ---------------------------- */
  {
    key: "inicio", segment: "nutricionista", name: "Início",
    description: "Para quem está montando o consultório.",
    priceCents: 7990, seatLimit: 15, featured: false, active: true, sortOrder: 1,
    features: [
      "Até 15 pacientes ativos",
      "Planos alimentares ilimitados",
      "Prontuário e antropometria",
      "App do paciente incluso"
    ]
  },
  {
    key: "profissional", segment: "nutricionista", name: "Profissional",
    description: "Para o consultório que já lotou a agenda.",
    priceCents: 14990, seatLimit: 60, featured: true, active: true, sortOrder: 2,
    features: [
      "Até 60 pacientes ativos",
      "Tudo do Início",
      "Relatórios de adesão e de risco de abandono",
      "Agenda com lembrete de retorno"
    ]
  },
  {
    key: "clinica", segment: "nutricionista", name: "Clínica",
    description: "Para times com mais de um profissional.",
    priceCents: 29990, seatLimit: 100000, featured: false, active: true, sortOrder: 3,
    features: [
      "Pacientes ilimitados",
      "Até 5 nutricionistas na mesma conta",
      "Tudo do Profissional",
      "Permissões por papel e trilha de auditoria"
    ]
  },

  /* -------------------------------- academia -----------------------------
     A academia NÃO compra plano. O programa de parceria (academias.html) é
     de indicação: ela se cadastra por formulário, nós aprovamos, e ela
     recebe comissão por cada aluno que assina pelo link dela.

     Então existe um registro só, e ele é `active: false` DE PROPÓSITO:
     `exigirPlano` recusa plano inativo, e é isso que fecha o checkout
     público para o segmento academia. A assinatura de parceria é criada por
     nós ao aprovar o parceiro, nunca por quem chega pela URL. Preço zero
     porque é exatamente isso que a academia paga. O `seatLimit` alto é o
     teto operacional do vínculo, não uma faixa de preço — quem paga é o
     aluno, cada um pelo plano pessoal dele. */
  {
    key: "parceria", segment: "academia", name: "Parceria",
    description: "Programa de indicação: a academia não paga e recebe comissão por aluno assinante.",
    priceCents: 0, seatLimit: 2000, featured: false, active: false, sortOrder: 1,
    features: [
      "Sem mensalidade para a academia",
      "Comissão recorrente por aluno que assina pelo link da unidade",
      "Painel de engajamento dos alunos vinculados",
      "Convite em massa por link e QR"
    ]
  }
];

/* ---------------------------------- cupons -------------------------------- */
/** `once` = vale só na primeira cobrança; a renovação volta ao preço cheio. */
export interface Cupom { codigo: string; desconto: number; rotulo: string; once: boolean }

export const CUPONS: Record<string, Cupom> = {
  BEMVINDO20: { codigo: "BEMVINDO20", desconto: 0.2, rotulo: "20% no primeiro mês", once: true },
  NUTRI10: { codigo: "NUTRI10", desconto: 0.1, rotulo: "10% de desconto", once: false },
  PRIMEIROMES: { codigo: "PRIMEIROMES", desconto: 0.5, rotulo: "50% no primeiro mês", once: true }
};

export const acharCupom = (codigo?: string): Cupom | null => {
  if (!codigo) return null;
  return CUPONS[codigo.trim().toUpperCase()] ?? null;
};

/**
 * Preço da primeira cobrança e da renovação.
 * Arredonda o desconto para centavo inteiro — nunca sobra fração.
 */
export function precificar(precoCents: number, cupom: Cupom | null): { primeiraCents: number; recorrenteCents: number } {
  if (!cupom) return { primeiraCents: precoCents, recorrenteCents: precoCents };
  const desconto = Math.round(precoCents * cupom.desconto);
  const comDesconto = Math.max(0, precoCents - desconto);
  return {
    primeiraCents: comDesconto,
    recorrenteCents: cupom.once ? precoCents : comDesconto
  };
}
