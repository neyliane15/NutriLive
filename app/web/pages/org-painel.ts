/* =========================================================================
   Painel da profissional — nutricionista e academia.
   O que ela vê ao abrir: tamanho e saúde da carteira, e quem precisa dela.
   Dados: GET /api/org/dashboard  (contract.org.dashboard)
   ========================================================================= */
import type { z } from "zod";
import { shell, type ShellUser } from "../layout.js";
import { metric, panel, table, pessoa, esc, vazio } from "../components/index.js";
import { org } from "../../shared/contract.js";
import {
  termos, rotaPessoas, pct, estilosFE2, indisponivel, nivelPill, colunas, periodoCurto
} from "./org-ui.js";

export type PainelDados = z.infer<typeof org.dashboard.out>;

const ORDEM = { risco: 0, atencao: 1 } as const;

/** Nível da adesão média, para codificar em forma além de cor. */
const nivelAdesao = (p: number): "ok" | "atencao" | "risco" =>
  p >= 75 ? "ok" : p >= 55 ? "atencao" : "risco";

export function orgPainel(o: { user: ShellUser; dados: PainelDados | null }): string {
  const t = termos(o.user.role);
  const d = o.dados;
  const semanas = d?.adherenceByWeek ?? [];
  const ultima = semanas.length ? semanas[semanas.length - 1]! : null;
  const penultima = semanas.length > 1 ? semanas[semanas.length - 2]! : null;
  const variacao = ultima && penultima ? ultima.pct - penultima.pct : null;

  const fila = [...(d?.needsAttention ?? [])].sort(
    (a, b) => (ORDEM[a.level] ?? 2) - (ORDEM[b.level] ?? 2)
  );
  const emRisco = fila.filter((f) => f.level === "risco").length;
  const emAtencao = fila.length - emRisco;

  /* ----------------------------- resumo ---------------------------------- */
  const cartoes = `
<div class="grid-cards">
  ${metric({
    label: `${t.Pessoas} ativos`,
    value: d ? String(d.seatsUsed) : "—",
    foot: d ? `de ${d.seatLimit} assentos do plano` : "aguardando dados",
    fill: d && d.seatLimit ? (d.seatsUsed / d.seatLimit) * 100 : undefined,
    deep: true
  })}
  ${metric({
    label: "Adesão média",
    value: d ? pct(d.avgAdherencePct) : "—",
    /* O número é de 28 DIAS (`m.aderencia28d` no servidor); o rodapé dizia
       "nas últimas 13 semanas", que é o tamanho da SÉRIE do gráfico ao
       lado, não da média. */
    foot: d ? `${t.carteira === "turma" ? "da turma" : "da carteira"} nos últimos 28 dias` : "aguardando dados",
    fill: d ? d.avgAdherencePct : undefined,
    ...(variacao !== null
      ? { trend: { dir: variacao >= 0 ? "up" as const : "down" as const, text: `${variacao >= 0 ? "+" : "−"}${Math.abs(variacao)} p.p.` } }
      : {})
  })}
  ${metric({
    label: "Precisam de você",
    value: d ? String(fila.length) : "—",
    foot: d ? `${emRisco} em risco · ${emAtencao} em atenção` : "aguardando dados"
  })}
  ${metric({
    label: "Adesão desta semana",
    value: ultima ? pct(ultima.pct) : "—",
    foot: ultima ? `semana de ${periodoCurto(ultima.weekStart)}` : "sem registro na semana",
    fill: ultima?.pct
  })}
</div>`;

  /* -------------------------- precisam de você --------------------------- */
  const linhas = fila.map((f) => `
<tr data-fe2-user="${esc(f.userId)}">
  <td>${pessoa(f.name)}</td>
  <td><span class="fe2-reason">${esc(f.reason)}</span></td>
  <td>${nivelPill(f.level)}</td>
  <td class="num">
    <span class="fe2-acts">
      <a class="btn btn-secondary btn-sm fe2-tap" href="${rotaPessoas(o.user.role)}/${esc(f.userId)}">Abrir ficha</a>
    </span>
  </td>
</tr>`);

  const filaCorpo = !d
    ? `<div class="loading" data-fe2-recarregando>Tentando buscar de novo…</div>`
    : fila.length
      ? table({
        cols: [{ label: t.pessoa }, { label: "Motivo" }, { label: "Nível" }, { label: "", align: "right" }],
        rows: linhas,
        minWidth: 620
      })
      : vazio({
        titulo: "Ninguém pendurado hoje",
        texto: `Todos os seus ${t.pessoas} estão registrando e com adesão dentro do esperado. Bom trabalho.`
      });

  /* --------------------------- adesão por semana ------------------------- */
  const grafico = semanas.length
    ? colunas({
      titulo: `Adesão da ${t.carteira} por semana`,
      itens: semanas.map((s) => ({
        rotulo: periodoCurto(s.weekStart),
        valor: s.pct,
        texto: `${s.pct}%`,
        tom: nivelAdesao(s.pct)
      }))
    })
    : `<p class="fe2-seats-num" style="padding:var(--sp-4) 0">Sem semanas fechadas ainda.</p>`;

  const body = `
${estilosFE2}
${d ? "" : indisponivel({ oque: "Painel", rota: "GET /api/org/dashboard" })}
${cartoes}
<div class="grid-2col" style="margin-top:var(--sp-5)">
  ${panel({
    title: "Precisam de você",
    sub: fila.length ? `${fila.length} ${fila.length === 1 ? "pessoa" : "pessoas"}, em ordem de risco` : "em ordem de risco",
    action: `<a class="link-arrow" href="${rotaPessoas(o.user.role)}">Ver todos os ${t.pessoas}</a>`,
    body: `<div data-fe2-fila>${filaCorpo}</div>`,
    id: "precisam"
  })}
  ${panel({
    title: "Adesão por semana",
    sub: variacao === null ? undefined : variacao >= 0 ? `subiu ${variacao} p.p. na última` : `caiu ${Math.abs(variacao)} p.p. na última`,
    body: `<div data-fe2-grafico>${grafico}</div>
    <p class="fe2-seats-num" style="margin-top:var(--sp-4);border-top:1px solid var(--border-subtle);padding-top:var(--sp-3)">
      Verde a partir de 75%, âmbar de 55% a 74%, vermelho abaixo de 55%.
    </p>`
  })}
</div>`;

  return shell({
    title: "Painel",
    user: o.user,
    active: "/painel",
    islands: ["org"],
    bootstrap: { tela: "painel", papel: o.user.role, dados: d, rotaPessoas: rotaPessoas(o.user.role) },
    action: `<a class="btn btn-primary btn-sm fe2-tap" href="${rotaPessoas(o.user.role)}#novo">Cadastrar ${t.pessoa}</a>`,
    body
  });
}

export default orgPainel;
