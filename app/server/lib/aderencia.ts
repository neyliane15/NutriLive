/* =========================================================================
   Nutri&Live — adesão e risco de abandono

   ADESÃO: percentual de dias, na janela observada, em que a pessoa
   registrou alguma coisa (refeição ou água). É a métrica honesta do que o
   sistema sabe: ele não vê o prato, vê o registro.

        adesão = dias com registro ÷ dias da janela × 100

   RISCO DE ABANDONO: combina três sinais que, na prática de consultório,
   antecedem o abandono:

     1. silêncio      dias desde o último registro
     2. adesão        percentual na janela de 28 dias
     3. retorno       consulta de retorno marcada e já vencida

        risco    silêncio ≥ 10 dias, ou adesão < 35 %, ou retorno vencido
                 há mais de 7 dias
        atencao  silêncio ≥ 4 dias, ou adesão < 60 %, ou retorno vencido
        ok       o resto

   O motivo volta em texto para a tela mostrar "por que" — nutricionista
   não confia em semáforo sem explicação.
   ========================================================================= */
import { chaveDoDia, diasDaFaixa, diasEntre, semanasDaFaixa } from "./datas.js";

export type Nivel = "ok" | "atencao" | "risco";

/** Percentual de dias com registro na janela de N dias. */
export function aderenciaPct(registros: Date[], dias: number, fim: Date = new Date()): number {
  if (dias <= 0) return 0;
  const janela = new Set(diasDaFaixa(dias, fim));
  const vistos = new Set<string>();
  for (const d of registros) {
    const k = chaveDoDia(d);
    if (janela.has(k)) vistos.add(k);
  }
  return Math.round((vistos.size / dias) * 100);
}

/** Série semanal de adesão, pronta para o gráfico do contrato. */
export function aderenciaPorSemana(registros: Date[], dias: number, fim: Date = new Date()): { weekStart: string; pct: number }[] {
  const porDia = new Set(registros.map((d) => chaveDoDia(d)));
  const hoje = chaveDoDia(fim);
  return semanasDaFaixa(dias, fim).map(({ inicio, chave }) => {
    const diasDaSemana = diasDaFaixa(7, new Date(inicio.getTime() + 6 * 86_400_000))
      .filter((k) => k <= hoje);
    const validos = diasDaSemana.length || 1;
    const batidos = diasDaSemana.filter((k) => porDia.has(k)).length;
    return { weekStart: chave, pct: Math.round((batidos / validos) * 100) };
  });
}

/** Maior sequência de dias consecutivos com registro, terminando hoje ou ontem. */
export function sequenciaAtual(registros: Date[], fim: Date = new Date()): number {
  const porDia = new Set(registros.map((d) => chaveDoDia(d)));
  const chaves = diasDaFaixa(400, fim);
  let seq = 0;
  for (let i = chaves.length - 1; i >= 0; i--) {
    const k = chaves[i];
    if (k && porDia.has(k)) seq++;
    else if (i === chaves.length - 1) continue;            /* hoje ainda pode estar em branco */
    else break;
  }
  return seq;
}

export function avaliarRisco(a: {
  ultimoRegistro: Date | null;
  aderencia28d: number;
  proximoRetorno: Date | null;
  agora?: Date;
}): { nivel: Nivel; motivo: string } {
  const agora = a.agora ?? new Date();
  const silencio = a.ultimoRegistro ? diasEntre(a.ultimoRegistro, agora) : Number.POSITIVE_INFINITY;
  const atrasoRetorno = a.proximoRetorno ? diasEntre(a.proximoRetorno, agora) : Number.NEGATIVE_INFINITY;

  if (silencio === Number.POSITIVE_INFINITY) return { nivel: "risco", motivo: "Nunca registrou nada no app." };
  if (silencio >= 10) return { nivel: "risco", motivo: `Sem registro há ${silencio} dias.` };
  if (a.aderencia28d < 35) return { nivel: "risco", motivo: `Adesão de ${a.aderencia28d}% nos últimos 28 dias.` };
  if (atrasoRetorno > 7) return { nivel: "risco", motivo: `Retorno vencido há ${atrasoRetorno} dias.` };
  if (silencio >= 4) return { nivel: "atencao", motivo: `Sem registro há ${silencio} dias.` };
  if (a.aderencia28d < 60) return { nivel: "atencao", motivo: `Adesão de ${a.aderencia28d}% nos últimos 28 dias.` };
  if (atrasoRetorno >= 0) return { nivel: "atencao", motivo: "Retorno vencido." };
  return { nivel: "ok", motivo: `Adesão de ${a.aderencia28d}% e registro em dia.` };
}
