/* =========================================================================
   Nutri&Live — datas no fuso do usuário

   O produto é brasileiro e o Brasil não tem horário de verão desde 2019,
   então o dia do usuário é calculado com deslocamento fixo de −03:00
   (America/Sao_Paulo). Tudo é guardado em UTC no banco; a conversão só
   acontece aqui, na hora de decidir "que dia é hoje" e de agrupar.
   ========================================================================= */

export const FUSO_BR_MINUTOS = -180;
const MS_DIA = 86_400_000;

const comFuso = (d: Date): Date => new Date(d.getTime() + FUSO_BR_MINUTOS * 60_000);
const semFuso = (d: Date): Date => new Date(d.getTime() - FUSO_BR_MINUTOS * 60_000);

/** "AAAA-MM-DD" do dia em que esse instante caiu no Brasil. */
export const chaveDoDia = (d: Date = new Date()): string => comFuso(d).toISOString().slice(0, 10);

/** Instante (UTC) da meia-noite brasileira do dia desse instante. */
export function inicioDoDia(d: Date = new Date()): Date {
  const local = comFuso(d);
  local.setUTCHours(0, 0, 0, 0);
  return semFuso(local);
}

export const fimDoDia = (d: Date = new Date()): Date => new Date(inicioDoDia(d).getTime() + MS_DIA);

/** Meia-noite brasileira de segunda-feira da semana desse instante. */
export function inicioDaSemana(d: Date = new Date()): Date {
  const inicio = inicioDoDia(d);
  const diaSemana = comFuso(inicio).getUTCDay();          /* 0 = domingo */
  const recuo = (diaSemana + 6) % 7;                      /* segunda = 0 */
  return new Date(inicio.getTime() - recuo * MS_DIA);
}

export const somarDias = (d: Date, dias: number): Date => new Date(d.getTime() + dias * MS_DIA);

/** Dias inteiros entre dois instantes, pelo calendário brasileiro. */
export const diasEntre = (a: Date, b: Date): number =>
  Math.round((inicioDoDia(b).getTime() - inicioDoDia(a).getTime()) / MS_DIA);

/** Quantos dias cada faixa do contrato cobre. */
export const DIAS_DA_FAIXA: Record<string, number> = {
  "7d": 7, "30d": 30, "3m": 90, "6m": 180, "1y": 365
};

export function faixa(range: string): { inicio: Date; fim: Date; dias: number } {
  const dias = DIAS_DA_FAIXA[range] ?? 30;
  const fim = fimDoDia();
  return { inicio: somarDias(inicioDoDia(), -(dias - 1)), fim, dias };
}

/** Lista de chaves de dia, da mais antiga para a mais nova. */
export function diasDaFaixa(dias: number, fim: Date = new Date()): string[] {
  const base = inicioDoDia(fim);
  return Array.from({ length: dias }, (_, i) => chaveDoDia(somarDias(base, -(dias - 1 - i))));
}

/** Semanas (segunda a domingo) que cobrem os últimos N dias. */
export function semanasDaFaixa(dias: number, fim: Date = new Date()): { inicio: Date; chave: string }[] {
  const primeira = inicioDaSemana(somarDias(inicioDoDia(fim), -(dias - 1)));
  const ultima = inicioDaSemana(fim);
  const saida: { inicio: Date; chave: string }[] = [];
  for (let d = primeira; d.getTime() <= ultima.getTime(); d = somarDias(d, 7)) {
    saida.push({ inicio: d, chave: chaveDoDia(d) });
  }
  return saida;
}
