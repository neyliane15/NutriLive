/* =========================================================================
   Nutri&Live — tipos da ponte de IA

   Formato de saída da IA. Vale tanto para o driver local quanto para o n8n:
   o que o n8n devolve em `POST /api/ai/callback` é validado contra estes
   tipos e contra as guardas clínicas antes de ser gravado.

   Convenção de nomes: a estrutura do plano está em português, porque é jsonb
   livre em `meal_plans.content`. Os objetos que caem direto numa coluna ou
   numa rota do contrato usam os nomes do contrato (`macros` como
   `{ protein, carb, fat }`, item de lista de compras como
   `{ group, name, qty, cents, done }`, receita como a tabela `recipes`),
   para o front e o banco consumirem sem tradução.
   ========================================================================= */
import type { TipoRefeicao } from "./alimentos.js";

export type { TipoRefeicao } from "./alimentos.js";

/** Macros em gramas, com os nomes do contrato. */
export interface Macros {
  protein: number;
  carb: number;
  fat: number;
}

export type ObjetivoNutricional = "emagrecer" | "manter" | "ganhar_massa" | "saude";

export interface PerfilNutricional {
  /** ISO "aaaa-mm-dd". */
  birthDate?: string | null;
  sex?: string | null;
  heightCm?: number | null;
  /** Último peso conhecido, em quilos. Vem de `measurements`. */
  weightKg?: number | null;
  goal?: string | null;
  activityLevel?: string | null;
  dietStyle?: string | null;
  /** Restrições e alergias declaradas. Filtro RÍGIDO. */
  restrictions: string[];
  /** Não gosta. Filtro brando: evitamos, mas não invalida o plano. */
  dislikes: string[];
  kcalTarget?: number | null;
  proteinTargetG?: number | null;
  waterTargetMl?: number | null;
  /** Condições de saúde declaradas (texto livre). Veja `detectarSinaisDeCautela`. */
  conditions?: string[] | null;
  pregnant?: boolean | null;
  breastfeeding?: boolean | null;
}

export const perfilVazio = (): PerfilNutricional => ({
  restrictions: [], dislikes: []
});

/* ------------------------------ saída da IA ----------------------------- */

export interface ItemRefeicao {
  alimentoId: string;
  nome: string;
  gramas: number;
  /** Medida caseira legível: "2 fatias (50 g)". */
  porcao: string;
  kcal: number;
  macros: Macros;
}

export interface Refeicao {
  tipo: TipoRefeicao;
  rotulo: string;
  horario: string;
  titulo: string;
  kcal: number;
  macros: Macros;
  itens: ItemRefeicao[];
  preparo: string[];
}

export interface DiaDoPlano {
  dia: number;
  /** ISO "aaaa-mm-dd". */
  data: string;
  kcal: number;
  macros: Macros;
  refeicoes: Refeicao[];
}

/** Item de lista de compras — mesmos campos de `shopping_lists.items`. */
export interface ItemCompra {
  group: string;
  name: string;
  qty: string;
  cents: number;
  done: boolean;
}

export interface ListaDeCompras {
  /** ISO "aaaa-mm-dd" da segunda-feira da semana. */
  weekStart: string;
  estimatedCents: number;
  items: ItemCompra[];
}

/** Receita — mesmos campos da tabela `recipes`. */
export interface Receita {
  title: string;
  timeMin: number;
  kcal: number;
  macros: Macros;
  ingredients: string[];
  steps: string[];
  matchPct: number;
}

export interface MetasDiarias {
  kcal: number;
  macros: Macros;
  aguaMl: number;
  /** Como a meta foi obtida, para a nutricionista auditar. */
  metodo: string;
  tmb: number | null;
  fatorAtividade: number;
}

export interface PlanoAlimentar {
  tipo: "plano_alimentar";
  versao: 1;
  titulo: string;
  dias: DiaDoPlano[];
  metas: MetasDiarias;
  resumo: {
    kcalMeta: number;
    kcalMedia: number;
    macrosMeta: Macros;
    macrosMedia: Macros;
    desvioKcalPct: number;
  };
  contexto: {
    objetivo: ObjetivoNutricional;
    estiloAlimentar: string;
    restricoesAplicadas: string[];
    etiquetasBloqueadas: string[];
    evitados: string[];
  };
  listaDeCompras: ListaDeCompras;
  receitas: Receita[];
  avisos: string[];
  /** `rascunho` quando há nutricionista vinculada; `ativo` quando não há. */
  status: "rascunho" | "ativo";
  /** Sem nutricionista, o plano é material educativo, nunca prescrição. */
  materialEducativo: boolean;
  gerado: { driver: string; em: string; semente: string };
}

export interface SaidaReceitas {
  tipo: "receitas";
  versao: 1;
  receitas: Receita[];
  /** Ingredientes do usuário que a base reconheceu. */
  usados: string[];
  /** Ingredientes que a base não reconheceu ou que a restrição bloqueou. */
  ignorados: { termo: string; motivo: string }[];
  avisos: string[];
  gerado: { driver: string; em: string; semente: string };
}

/** Quando há sinal de cautela, não geramos plano: orientamos. */
export interface OrientacaoProfissional {
  tipo: "orientacao_profissional";
  versao: 1;
  titulo: string;
  mensagem: string;
  sinais: { id: string; rotulo: string; orientacao: string }[];
  comoProsseguir: string[];
}

export type SaidaIA = PlanoAlimentar | SaidaReceitas | OrientacaoProfissional;

/* ------------------------------- o pedido ------------------------------- */

export type TipoJob = "plano" | "receita" | "lista_compras" | "analise";

export interface PedidoPlano {
  kind: "plano";
  days: 1 | 3 | 7;
  notes?: string;
}

export interface PedidoReceitas {
  kind: "receita";
  ingredients: string;
  maxMinutes?: number;
}

export type Pedido = PedidoPlano | PedidoReceitas;

/** Tudo o que o gerador precisa saber sobre a pessoa e o momento. */
export interface ContextoGeracao {
  /** Dono do plano. */
  userId: string;
  nomeUsuario: string;
  perfil: PerfilNutricional;
  /** Quem pediu: a própria pessoa, ou a nutricionista dela. */
  solicitanteUserId: string;
  /** Vínculo ativo com nutricionista: muda o status inicial do plano. */
  temNutricionistaVinculada: boolean;
  /** Semente para o gerador determinístico. */
  semente: string;
  /** Data base do plano, ISO "aaaa-mm-dd". */
  dataBase: string;
}
