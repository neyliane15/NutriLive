/* =========================================================================
   Admin — IA.
   Execuções, tempo médio, erros com a mensagem e consumo de tokens.

   O formato `IaDados` espelha `GET /api/admin/ai?page=`, que existe no
   contrato. Sem ele respondido, a tela degrada para os dois números do
   resumo (`admin.overview.aiJobs`) e explica o que falta.
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { panel, table, esc, vazio, dataHoraBR, pill } from "../components/index.js";
import {
  estilosFE2, estadoPill, minutos, milhar, aviso, paginacao, colunas
} from "./org-ui.js";

/** Resumo que já existe no contrato (admin.overview.out.aiJobs). */
export type IaResumo = { last24h: number; errorRate: number };

/** Formato que a rota de execuções da IA devolve. */
export type IaDados = {
  total: number;
  page: number;
  /** Médias e somas do período que o servidor escolher (24h por padrão). */
  summary: {
    runs: number; errors: number; avgMs: number;
    tokensIn: number; tokensOut: number;
  };
  byKind: { kind: string; runs: number; errors: number; avgMs: number }[];
  jobs: {
    id: string; kind: string; userName: string | null;
    status: "fila" | "processando" | "concluido" | "erro";
    createdAt: string; finishedAt: string | null; durationMs: number | null;
    tokensIn: number | null; tokensOut: number | null; error: string | null;
  }[];
};

export const POR_PAGINA = 25;

const KIND: Record<string, string> = {
  meal_plan: "Plano alimentar", mealPlan: "Plano alimentar",
  recipes: "Receitas", shopping_list: "Lista de compras", shopping: "Lista de compras"
};

const curto = (id: string) => id.slice(0, 8);

export function adminIa(o: { user: ShellUser; dados: IaDados | null; resumo: IaResumo | null; pagina?: number }): string {
  const d = o.dados;
  const pagina = o.pagina ?? d?.page ?? 1;
  const s = d?.summary ?? null;

  const execucoes = s ? s.runs : o.resumo?.last24h ?? null;
  const taxaErro = s ? (s.runs ? s.errors / s.runs : 0) : o.resumo?.errorRate ?? null;
  const tomErro = taxaErro === null ? "neutro" : taxaErro >= 0.1 ? "risco" : taxaErro >= 0.03 ? "atencao" : "ok";

  const resumo = `
<dl class="fe2-strip">
  <div>
    <dt>Execuções</dt>
    <dd>${execucoes === null ? "—" : milhar(execucoes)}<small>${s ? "no período" : "últimas 24 horas"}</small></dd>
  </div>
  <div>
    <dt>Tempo médio</dt>
    <dd>${s ? minutos(s.avgMs) : "—"}<small>${s ? "da fila até o retorno do n8n" : "precisa de GET /api/admin/ai"}</small></dd>
  </div>
  <div>
    <dt>Taxa de erro</dt>
    <dd style="${tomErro === "risco" ? "color:var(--danger-600)" : tomErro === "atencao" ? "color:#7A4A00" : ""}">
      ${taxaErro === null ? "—" : `${(taxaErro * 100).toFixed(1).replace(".", ",")}%`}
      <small>${s ? `${milhar(s.errors)} de ${milhar(s.runs)} execuções` : tomErro === "ok" ? "dentro do esperado" : "acima do esperado"}</small>
    </dd>
  </div>
  <div>
    <dt>Tokens de entrada</dt>
    <dd>${s ? milhar(s.tokensIn) : "—"}<small>enviados ao modelo</small></dd>
  </div>
  <div>
    <dt>Tokens de saída</dt>
    <dd>${s ? milhar(s.tokensOut) : "—"}<small>gerados pelo modelo</small></dd>
  </div>
</dl>
<div class="row" style="margin-top:var(--sp-4)">
  ${tomErro === "risco" ? pill("IA instável", "risco") : tomErro === "atencao" ? pill("IA em atenção", "atencao") : tomErro === "ok" ? pill("IA saudável", "ok") : pill("Sem leitura", "neutro")}
  <span class="fe2-seats-num">Limite de alerta: 3% de erro em atenção, 10% em risco.</span>
</div>`;

  const porTipo = d && d.byKind.length
    ? colunas({
      titulo: "Execuções por tipo",
      altura: 96,
      itens: d.byKind.map((k) => ({
        rotulo: (KIND[k.kind] ?? k.kind).split(" ")[0]!,
        valor: k.runs,
        texto: String(k.runs),
        tom: k.runs && k.errors / k.runs >= 0.1 ? "risco" : k.runs && k.errors / k.runs >= 0.03 ? "atencao" : "ok"
      }))
    }) + `<table class="data" style="min-width:0;margin-top:var(--sp-4)">
      <thead><tr><th>Tipo</th><th class="num">Execuções</th><th class="num">Erros</th><th class="num">Tempo médio</th></tr></thead>
      <tbody>${d.byKind.map((k) => `<tr>
        <td>${esc(KIND[k.kind] ?? k.kind)}</td>
        <td class="num">${milhar(k.runs)}</td>
        <td class="num">${k.errors ? `<b style="color:var(--danger-600)">${milhar(k.errors)}</b>` : "0"}</td>
        <td class="num">${minutos(k.avgMs)}</td>
      </tr>`).join("")}</tbody></table>`
    : `<p class="fe2-seats-num">Sem quebra por tipo. Depende de <code class="fe2-code">GET /api/admin/ai</code>.</p>`;

  const erros = d ? d.jobs.filter((j) => j.status === "erro") : [];
  const blocoErros = erros.length
    ? table({
      cols: [{ label: "Execução" }, { label: "Tipo" }, { label: "Quando" }, { label: "Mensagem" }],
      rows: erros.map((j) => `
      <tr data-fe2-job="${esc(j.id)}">
        <td><code class="fe2-code">${esc(curto(j.id))}</code></td>
        <td>${esc(KIND[j.kind] ?? j.kind)}</td>
        <td>${dataHoraBR(j.createdAt)}</td>
        <td><span class="fe2-err-msg">${esc(j.error ?? "sem mensagem")}</span></td>
      </tr>`),
      minWidth: 680
    })
    : vazio({
      titulo: d ? "Nenhum erro no período" : "Erros indisponíveis",
      texto: d
        ? "Todas as execuções retornaram do n8n sem falha."
        : "A mensagem de erro de cada execução vem da listagem, que ainda não está no contrato."
    });

  const blocoJobs = d && d.jobs.length
    ? table({
      cols: [
        { label: "Execução" }, { label: "Tipo" }, { label: "Usuário" }, { label: "Estado" },
        { label: "Duração", align: "right" }, { label: "Tokens", align: "right" }, { label: "Quando" }
      ],
      rows: d.jobs.map((j) => `
      <tr data-fe2-job="${esc(j.id)}">
        <td><code class="fe2-code">${esc(curto(j.id))}</code></td>
        <td>${esc(KIND[j.kind] ?? j.kind)}</td>
        <td>${esc(j.userName ?? "—")}</td>
        <td>${estadoPill(j.status)}${j.error ? `<details class="fe2-det"><summary>ver erro</summary><pre>${esc(j.error)}</pre></details>` : ""}</td>
        <td class="num">${j.durationMs === null ? "—" : minutos(j.durationMs)}</td>
        <td class="num">${j.tokensIn === null && j.tokensOut === null ? "—" : `${milhar(j.tokensIn ?? 0)} / ${milhar(j.tokensOut ?? 0)}`}</td>
        <td><span class="fe2-reason">${dataHoraBR(j.createdAt)}<small>${j.finishedAt ? `fim ${dataHoraBR(j.finishedAt)}` : "sem retorno"}</small></span></td>
      </tr>`),
      minWidth: 940
    }) + paginacao({ pagina, total: d.total, porPagina: POR_PAGINA, rotulo: "execuções" })
    : vazio({
      titulo: d ? "Nenhuma execução" : "Listagem indisponível",
      texto: d
        ? "Nada foi enfileirado para a IA no período."
        : "A listagem de execuções precisa de um endpoint que ainda não existe no contrato.",
      acao: `<a class="btn btn-secondary fe2-tap" href="/admin">Ver visão geral</a>`
    });

  const body = `
${estilosFE2}
${d ? "" : aviso(
    `<b>Detalhamento da IA indisponível agora.</b> O resumo abaixo vem de
     <code class="fe2-code">GET /api/admin/overview</code>, que respondeu. As execuções, o tempo médio
     por tipo e os tokens vêm de <code class="fe2-code">GET /api/admin/ai</code>, que não respondeu
     nesta carga — a tela tenta de novo sozinha.`,
    "amber", "alert")}
${panel({ title: "Saúde da IA", sub: s ? "no período" : "resumo do contrato", body: `<div data-fe2-resumo>${resumo}</div>` })}
<div class="grid-2col" style="margin-top:var(--sp-5)">
  ${panel({ title: "Por tipo de execução", body: porTipo })}
  ${panel({ title: "Erros", sub: erros.length ? `${erros.length} no período` : undefined, body: blocoErros })}
</div>
${panel({ title: "Execuções", body: blocoJobs })}`;

  return shell({
    title: "IA",
    user: o.user,
    active: "/admin/ia",
    islands: ["admin"],
    bootstrap: { tela: "ia", dados: d, resumo: o.resumo, porPagina: POR_PAGINA, pagina },
    body
  });
}

export default adminIa;
