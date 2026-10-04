/* =========================================================================
   Nutri&Live — metas nutricionais

   ------------------------------------------------------------------------
   FÓRMULA (documentada por exigência de contrato — não mude sem avisar)
   ------------------------------------------------------------------------
   1) Taxa metabólica basal — Mifflin-St Jeor (1990), a mais usada na
      prática clínica brasileira:

        homem:    TMB = 10·peso(kg) + 6,25·altura(cm) − 5·idade(anos) + 5
        mulher:   TMB = 10·peso(kg) + 6,25·altura(cm) − 5·idade(anos) − 161
        não dito: usa a média das duas constantes (−78), porque o resto da
                  equação é igual e assim ninguém fica sem meta.

   2) Gasto energético total = TMB × fator de atividade:

        sedentario  1,200   nenhum exercício, trabalho sentado
        leve        1,375   1 a 3 treinos por semana
        moderado    1,550   3 a 5 treinos por semana
        intenso     1,725   6 a 7 treinos por semana
        atleta      1,900   treino duplo ou trabalho físico pesado

   3) Meta calórica = gasto total ajustado pelo objetivo, com arredondamento
      para a dezena mais próxima (número redondo é mais fácil de seguir):

        emagrecer     −20 %  (déficit seguro, ~0,5 kg/semana)
        manter          0 %
        ganhar_massa  +12 %  (superávit enxuto, para ganhar com menos gordura)

      Piso de segurança: nunca abaixo de 1.200 kcal para mulheres e 1.500
      kcal para homens — abaixo disso a dieta deixa de ser orientável por
      aplicativo e vira caso de consultório.

   4) Proteína (g/kg de peso corporal por dia), consenso de sociedades de
      nutrição esportiva e clínica:

        emagrecer     2,0 g/kg  (preserva massa magra no déficit)
        manter        1,6 g/kg
        ganhar_massa  1,8 g/kg

      Quem está sedentário ganha 0,2 g/kg a menos; atleta, 0,2 a mais.

   5) Água = 35 ml/kg/dia, com piso de 1.800 ml e teto de 4.500 ml, mais
      250 ml por nível de atividade acima de "leve". Arredonda para 100 ml.
   ========================================================================= */

export type Sexo = "feminino" | "masculino" | "outro" | null | undefined;
export type Objetivo = "emagrecer" | "manter" | "ganhar_massa";
export type Atividade = "sedentario" | "leve" | "moderado" | "intenso" | "atleta";

export const FATOR_ATIVIDADE: Record<Atividade, number> = {
  sedentario: 1.2,
  leve: 1.375,
  moderado: 1.55,
  intenso: 1.725,
  atleta: 1.9
};

const AJUSTE_OBJETIVO: Record<Objetivo, number> = {
  emagrecer: -0.20,
  manter: 0,
  ganhar_massa: 0.12
};

const PROTEINA_POR_KG: Record<Objetivo, number> = {
  emagrecer: 2.0,
  manter: 1.6,
  ganhar_massa: 1.8
};

/** Aceita o que o front manda hoje e os apelidos mais prováveis. */
export function normalizarObjetivo(v: unknown): Objetivo {
  const t = String(v ?? "").toLowerCase().replace(/\s+/g, "_");
  if (["emagrecer", "perder_peso", "perder", "secar", "deficit"].includes(t)) return "emagrecer";
  if (["ganhar_massa", "ganhar", "hipertrofia", "massa", "ganho_de_massa"].includes(t)) return "ganhar_massa";
  return "manter";
}

export function normalizarAtividade(v: unknown): Atividade {
  const t = String(v ?? "").toLowerCase().replace(/\s+/g, "_");
  if (["sedentario", "sedentária", "sedentaria", "nenhum", "parado"].includes(t)) return "sedentario";
  if (["leve", "levemente_ativo", "1a3"].includes(t)) return "leve";
  if (["intenso", "muito_ativo", "6a7"].includes(t)) return "intenso";
  if (["atleta", "extremo", "atleta_profissional"].includes(t)) return "atleta";
  return "moderado";
}

export function normalizarSexo(v: unknown): Sexo {
  const t = String(v ?? "").toLowerCase();
  if (t.startsWith("f") || t === "mulher") return "feminino";
  if (t.startsWith("m") && t !== "mulher") return "masculino";
  return "outro";
}

/** Idade em anos completos. Aceita "AAAA-MM-DD" ou Date. */
export function idadeEm(nascimento: string | Date | null | undefined, referencia = new Date()): number | null {
  if (!nascimento) return null;
  const d = nascimento instanceof Date ? nascimento : new Date(`${nascimento}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  let anos = referencia.getUTCFullYear() - d.getUTCFullYear();
  const mes = referencia.getUTCMonth() - d.getUTCMonth();
  if (mes < 0 || (mes === 0 && referencia.getUTCDate() < d.getUTCDate())) anos--;
  return anos >= 0 && anos < 130 ? anos : null;
}

export type EntradaMetas = {
  sexo?: unknown;
  nascimento?: string | Date | null;
  idade?: number | null;
  alturaCm?: number | null;
  pesoKg?: number | null;
  objetivo?: unknown;
  atividade?: unknown;
};

export type Metas = {
  kcal: number;
  proteinaG: number;
  aguaMl: number;
  /** Intermediários, úteis para explicar a conta na tela e nos testes. */
  tmb: number;
  gastoTotal: number;
  pesoUsadoKg: number;
  alturaUsadaCm: number;
  idadeUsada: number;
  sexo: Sexo;
  objetivo: Objetivo;
  atividade: Atividade;
};

const arredondar = (v: number, passo: number) => Math.round(v / passo) * passo;

/**
 * Calcula as três metas do dia. Quando falta dado do perfil usa valores
 * medianos da população adulta brasileira (altura 168 cm, 30 anos) e peso
 * estimado por IMC 23, para a tela nunca aparecer vazia.
 */
export function calcularMetas(e: EntradaMetas): Metas {
  const sexo = normalizarSexo(e.sexo);
  const objetivo = normalizarObjetivo(e.objetivo);
  const atividade = normalizarAtividade(e.atividade);

  const alturaCm = e.alturaCm && e.alturaCm >= 120 && e.alturaCm <= 230 ? e.alturaCm : 168;
  const idade = e.idade ?? idadeEm(e.nascimento) ?? 30;
  const alturaM = alturaCm / 100;
  const pesoKg = e.pesoKg && e.pesoKg >= 25 && e.pesoKg <= 400
    ? e.pesoKg
    : Math.round(23 * alturaM * alturaM * 10) / 10;       /* IMC 23 como estimativa */

  const constante = sexo === "masculino" ? 5 : sexo === "feminino" ? -161 : -78;
  const tmb = 10 * pesoKg + 6.25 * alturaCm - 5 * idade + constante;
  const gastoTotal = tmb * FATOR_ATIVIDADE[atividade];

  const piso = sexo === "masculino" ? 1500 : 1200;
  const kcal = Math.max(piso, arredondar(gastoTotal * (1 + AJUSTE_OBJETIVO[objetivo]), 10));

  let gkg = PROTEINA_POR_KG[objetivo];
  if (atividade === "sedentario") gkg -= 0.2;
  if (atividade === "atleta") gkg += 0.2;
  const proteinaG = Math.round(pesoKg * gkg);

  const extraAtividade = atividade === "moderado" ? 250 : atividade === "intenso" ? 500 : atividade === "atleta" ? 750 : 0;
  const aguaMl = Math.min(4500, Math.max(1800, arredondar(pesoKg * 35 + extraAtividade, 100)));

  return {
    kcal, proteinaG, aguaMl,
    tmb: Math.round(tmb), gastoTotal: Math.round(gastoTotal),
    pesoUsadoKg: pesoKg, alturaUsadaCm: alturaCm, idadeUsada: idade,
    sexo, objetivo, atividade
  };
}

/* ------------------------------------------------------------------------
   Score do dia (0 a 100) — o número grande da tela "Hoje".

     50 % energia:    quanto a ingestão se aproxima da meta, penalizando
                      tanto a falta quanto o excesso (|desvio| sobre a meta)
     25 % proteína:   proporção da meta batida, com teto em 100 %
     15 % água:       proporção da meta batida, com teto em 100 %
     10 % constância: 1 ponto por refeição registrada, até 4 refeições

   Sem nenhum registro o score é 0 — a tela não deve premiar quem não usou.
   ------------------------------------------------------------------------ */
export function scoreDoDia(a: {
  kcal: number; kcalMeta: number;
  proteinaG: number; proteinaMetaG: number;
  aguaMl: number; aguaMetaMl: number;
  refeicoes: number;
}): number {
  if (a.refeicoes === 0 && a.aguaMl === 0) return 0;
  const alvoKcal = Math.max(1, a.kcalMeta);
  const desvio = Math.abs(a.kcal - alvoKcal) / alvoKcal;
  const energia = Math.max(0, 1 - desvio);                                 /* 1 quando cravou a meta */
  const proteina = Math.min(1, a.proteinaG / Math.max(1, a.proteinaMetaG));
  const agua = Math.min(1, a.aguaMl / Math.max(1, a.aguaMetaMl));
  const constancia = Math.min(1, a.refeicoes / 4);
  return Math.max(0, Math.min(100, Math.round(100 * (0.50 * energia + 0.25 * proteina + 0.15 * agua + 0.10 * constancia))));
}

/* Estimativa de calorias e macros para texto livre, usada quando o usuário
   registra uma refeição sem informar kcal e a IA não está no caminho.
   Base: tabela TACO resumida por tipo de prato — grosseira de propósito,
   serve para a tela não ficar com zero até a IA responder. */
const PESOS_POR_REFEICAO: Record<string, number> = {
  cafe: 380, lanche_manha: 180, almoco: 650, lanche_tarde: 220, jantar: 550, ceia: 160
};

export function estimarRefeicao(meal: string, descricao: string): { kcal: number; protein: number; carb: number; fat: number } {
  const base = PESOS_POR_REFEICAO[meal] ?? 400;
  const texto = descricao.toLowerCase();
  let fator = 1;
  if (/(frito|fritura|hamb[úu]rguer|pizza|batata frita|refrigerante|sorvete|chocolate|doce)/.test(texto)) fator += 0.45;
  if (/(salada|folhas|legume|verdura|sopa|ch[áa]|caldo)/.test(texto)) fator -= 0.30;
  if (/(integral|aveia|fruta|iogurte|grelhad[oa]|cozid[oa]|assad[oa])/.test(texto)) fator -= 0.10;
  const kcal = Math.max(40, Math.round((base * Math.max(0.35, fator)) / 10) * 10);

  /* Distribuição de macros: mais proteína quando há carne/ovo/whey,
     mais gordura quando há fritura, resto em carboidrato. */
  const temProteina = /(carne|frango|peixe|ovo|atum|whey|queijo|iogurte|feij[ãa]o|lentilha|gr[ãa]o-de-bico|tofu|carne moída)/.test(texto);
  const temGordura = /(frito|fritura|azeite|manteiga|bacon|queijo|castanha|am[êe]ndoa|abacate)/.test(texto);
  const pctProteina = temProteina ? 0.30 : 0.15;
  const pctGordura = temGordura ? 0.35 : 0.25;
  const pctCarbo = Math.max(0.15, 1 - pctProteina - pctGordura);

  return {
    kcal,
    protein: Math.round((kcal * pctProteina) / 4),
    carb: Math.round((kcal * pctCarbo) / 4),
    fat: Math.round((kcal * pctGordura) / 9)
  };
}
