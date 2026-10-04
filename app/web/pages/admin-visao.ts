/* =========================================================================
   Admin — visão geral do negócio.
   MRR, assinaturas, receita por mês, cadastros por dia, usuários por tipo
   e saúde da IA.
   Dados: GET /api/admin/overview   (contract.admin.overview)
   ========================================================================= */
import type { z } from "zod";
import { shell, type ShellUser } from "../layout.js";
import { metric, panel, brl, esc } from "../components/index.js";
import { admin } from "../../shared/contract.js";
import {
  estilosFE2, indisponivel, colunas, periodoCurto, milhar, pct
} from "./org-ui.js";

export type VisaoDados = z.infer<typeof admin.overview.out>;

const TIPOS: { k: keyof VisaoDados["users"]; label: string }[] = [
  { k: "pessoal", label: "Pessoa física" },
  { k: "nutricionista", label: "Nutricionista" },
  { k: "academia", label: "Academia" },
  { k: "vinculados", label: "Pacientes e alunos" }
];

export function adminVisao(o: { user: ShellUser; dados: VisaoDados | null }): string {
  const d = o.dados;
  const receita = d?.revenueByMonth ?? [];
  const cadastros = d?.signupsByDay ?? [];
  const ultimoMes = receita.length ? receita[receita.length - 1]! : null;
  const mesAnterior = receita.length > 1 ? receita[receita.length - 2]! : null;
  const varReceita = ultimoMes && mesAnterior && mesAnterior.cents
    ? Math.round(((ultimoMes.cents - mesAnterior.cents) / mesAnterior.cents) * 100)
    : null;

  const totalCadastros = cadastros.reduce((s, c) => s + c.count, 0);
  const erroIa = d ? d.aiJobs.errorRate : null;
  const tomIa = erroIa === null ? "neutro" : erroIa >= 0.1 ? "risco" : erroIa >= 0.03 ? "atencao" : "ok";

  /* ------------------------------- resumo -------------------------------- */
  const cartoes = `
<div class="grid-cards">
  ${metric({
    label: "MRR",
    value: d ? brl(d.mrrCents) : "—",
    foot: d ? `${milhar(d.activeSubs)} assinaturas ativas` : "aguardando dados",
    deep: true,
    ...(varReceita !== null
      ? { trend: { dir: varReceita >= 0 ? "up" as const : "down" as const, text: `${varReceita >= 0 ? "+" : "−"}${Math.abs(varReceita)}%` } }
      : {})
  })}
  ${metric({
    label: "Em atraso",
    value: d ? milhar(d.pastDue) : "—",
    foot: d && d.activeSubs ? `${pct((d.pastDue / Math.max(1, d.activeSubs + d.pastDue)) * 100)} da base` : "aguardando dados"
  })}
  ${metric({
    label: "Canceladas no mês",
    value: d ? milhar(d.canceledThisMonth) : "—",
    foot: d ? `${milhar(d.trialing)} em teste` : "aguardando dados"
  })}
  ${metric({
    label: "Usuários",
    value: d ? milhar(d.users.total) : "—",
    foot: d ? `${milhar(totalCadastros)} cadastros no período` : "aguardando dados"
  })}
</div>`;

  /* ------------------------------ receita -------------------------------- */
  const blocoReceita = receita.length
    ? colunas({
      titulo: "Receita por mês",
      itens: receita.map((r) => ({
        rotulo: periodoCurto(r.period),
        valor: r.cents,
        texto: r.cents >= 100_000 ? `${Math.round(r.cents / 100_000)}k` : brl(r.cents).replace("R$ ", "")
      }))
    })
    : `<p class="fe2-seats-num">Sem receita registrada.</p>`;

  /* ----------------------------- cadastros ------------------------------- */
  const blocoCadastros = cadastros.length
    ? colunas({
      titulo: "Cadastros por dia",
      altura: 96,
      itens: cadastros.slice(-14).map((c) => ({
        rotulo: periodoCurto(c.day), valor: c.count, texto: String(c.count)
      }))
    })
    : `<p class="fe2-seats-num">Sem cadastro no período.</p>`;

  /* --------------------------- usuários por tipo ------------------------- */
  const maxTipo = d ? Math.max(1, ...TIPOS.map((t) => d.users[t.k])) : 1;
  const blocoTipos = d
    ? `<div class="fe2-split">
      ${TIPOS.map((t) => `
      <div class="fe2-split-row">
        <span>${esc(t.label)}</span>
        <span class="bar"><i style="width:${((d.users[t.k] / maxTipo) * 100).toFixed(1)}%"></i></span>
        <b>${milhar(d.users[t.k])}</b>
      </div>`).join("")}
    </div>
    <table class="fe2-sr"><caption>Usuários por tipo</caption><tbody>
      ${TIPOS.map((t) => `<tr><th scope="row">${esc(t.label)}</th><td>${d.users[t.k]}</td></tr>`).join("")}
    </tbody></table>`
    : `<p class="fe2-seats-num">Aguardando dados.</p>`;

  /* ------------------------------ saúde da IA ---------------------------- */
  const blocoIa = `
<dl class="fe2-strip">
  <div>
    <dt>Execuções em 24h</dt>
    <dd>${d ? milhar(d.aiJobs.last24h) : "—"}<small>planos e receitas gerados</small></dd>
  </div>
  <div>
    <dt>Taxa de erro</dt>
    <dd style="${tomIa === "risco" ? "color:var(--danger-600)" : tomIa === "atencao" ? "color:#7A4A00" : ""}">
      ${erroIa === null ? "—" : `${(erroIa * 100).toFixed(1).replace(".", ",")}%`}
      <small>${tomIa === "risco" ? "acima do limite de 10%" : tomIa === "atencao" ? "atenção: acima de 3%" : "dentro do esperado"}</small>
    </dd>
  </div>
</dl>
<div class="fe2-modal-acts" style="justify-content:flex-start">
  <a class="btn btn-secondary btn-sm fe2-tap" href="/admin/ia">Abrir painel da IA</a>
</div>`;

  const body = `
${estilosFE2}
${d ? "" : indisponivel({ oque: "Visão geral", rota: "GET /api/admin/overview" })}
${cartoes}
<div class="grid-2col" style="margin-top:var(--sp-5)">
  ${panel({
    title: "Receita por mês",
    sub: ultimoMes ? `${periodoCurto(ultimoMes.period)}: ${brl(ultimoMes.cents)}` : undefined,
    body: `<div data-fe2-receita>${blocoReceita}</div>`
  })}
  ${panel({
    title: "Cadastros por dia",
    sub: cadastros.length ? `últimos ${Math.min(14, cadastros.length)} dias` : undefined,
    body: `<div data-fe2-cadastros>${blocoCadastros}</div>`
  })}
</div>
<div class="grid-2col" style="margin-top:var(--sp-5)">
  ${panel({ title: "Usuários por tipo", body: blocoTipos })}
  ${panel({ title: "Saúde da IA", sub: "últimas 24 horas", body: blocoIa })}
</div>`;

  return shell({
    title: "Visão geral",
    user: o.user,
    active: "/admin",
    islands: ["admin"],
    bootstrap: { tela: "visao", dados: d },
    body
  });
}

export default adminVisao;
