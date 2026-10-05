/* =========================================================================
   Comissões — só academia.
   Comissão por período: quanto está previsto, quanto foi apurado, quanto foi
   pago, e o detalhamento por aluno.

   `ComissoesDados` espelha a tabela `commissions` e é o que
   `GET /api/org/commissions?period=AAAA-MM` devolve. Sem resposta, a tela
   degrada: aviso, seletor de período (que navega por querystring) e totais
   zerados, nunca um número inventado.
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { panel, table, pessoa, esc, vazio, brl, dataBR } from "../components/index.js";
import {
  termos, estilosFE2, estadoPill, periodoLongo, periodoCurto, aviso
} from "./org-ui.js";

/** Formato que esta tela consome, igual ao da rota de comissões. */
export type ComissoesDados = {
  /** Períodos com movimento, mais recente primeiro: "2026-03". */
  periods: string[];
  /** Período exibido. */
  period: string;
  totals: { baseCents: number; previstaCents: number; apuradaCents: number; pagaCents: number };
  items: {
    userId: string; userName: string; planName: string;
    baseCents: number; rateBp: number; amountCents: number;
    status: "prevista" | "apurada" | "paga"; paidAt: string | null;
  }[];
};

const taxa = (bp: number) => `${(bp / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

export function orgComissoes(o: { user: ShellUser; dados: ComissoesDados | null; periodo?: string }): string {
  const t = termos(o.user.role);
  const d = o.dados;
  const periodo = d?.period ?? o.periodo ?? "";
  const itens = d?.items ?? [];
  const tot = d?.totals ?? { baseCents: 0, previstaCents: 0, apuradaCents: 0, pagaCents: 0 };
  const total = tot.previstaCents + tot.apuradaCents + tot.pagaCents;

  const seletor = (d?.periods ?? (periodo ? [periodo] : [])).length
    ? `
<form class="fe2-bar" method="get" action="/comissoes">
  <div class="field fe2-grow" data-field="periodo" style="max-width:16rem">
    <label class="field-label" for="periodo">Período</label>
    <select class="input" id="periodo" name="periodo" aria-describedby="err-periodo">
      ${(d?.periods ?? [periodo]).map((p) => `<option value="${esc(p)}"${p === periodo ? " selected" : ""}>${esc(periodoLongo(p))}</option>`).join("")}
    </select>
    <span class="field-error" id="err-periodo" role="alert"></span>
  </div>
  <div class="fe2-bar-end">
    <button class="btn btn-secondary fe2-tap" type="submit">Ver período</button>
  </div>
</form>`
    : "";

  const resumo = `
<dl class="fe2-strip">
  <div>
    <dt>Total do período</dt>
    <dd>${brl(total)}<small>${periodo ? esc(periodoLongo(periodo)) : "sem período"}</small></dd>
  </div>
  <div>
    <dt>Prevista</dt>
    <dd>${brl(tot.previstaCents)}<small>pagamento do aluno ainda não fechou</small></dd>
  </div>
  <div>
    <dt>Apurada</dt>
    <dd>${brl(tot.apuradaCents)}<small>conferida, a receber</small></dd>
  </div>
  <div>
    <dt>Paga</dt>
    <dd>${brl(tot.pagaCents)}<small>já caiu na sua conta</small></dd>
  </div>
  <div>
    <dt>Base de cálculo</dt>
    <dd>${brl(tot.baseCents)}<small>mensalidades dos ${esc(t.pessoas)}</small></dd>
  </div>
</dl>`;

  const detalhe = itens.length
    ? table({
      cols: [
        { label: t.pessoa }, { label: "Plano" }, { label: "Base", align: "right" },
        { label: "Taxa", align: "right" }, { label: "Comissão", align: "right" },
        { label: "Estado" }, { label: "Pago em" }
      ],
      rows: itens.map((i) => `
      <tr data-fe2-user="${esc(i.userId)}">
        <td>${pessoa(i.userName)}</td>
        <td>${esc(i.planName)}</td>
        <td class="num">${brl(i.baseCents)}</td>
        <td class="num">${taxa(i.rateBp)}</td>
        <td class="num"><b>${brl(i.amountCents)}</b></td>
        <td>${estadoPill(i.status)}</td>
        <td>${i.paidAt ? dataBR(i.paidAt) : "—"}</td>
      </tr>`),
      minWidth: 820
    })
    : vazio({
      titulo: d ? "Nenhuma comissão neste período" : "Detalhamento indisponível",
      texto: d
        ? `Comissão aparece aqui quando a mensalidade de um ${t.pessoa} vinculado à sua academia é cobrada.`
        : "Assim que o serviço de comissão responder, o detalhamento por aluno aparece aqui."
    });

  const body = `
${estilosFE2}
${d ? "" : aviso(
    `<b>Comissões indisponíveis agora.</b> <code class="fe2-code">GET /api/org/commissions</code> não
     respondeu nesta carga. Nada do seu repasse foi perdido — é só a leitura desta tela, e ela
     tenta de novo sozinha.`,
    "amber", "alert")}
${panel({ body: `${seletor}${seletor ? `<div class="sep"></div>` : ""}${resumo}` })}
${panel({
    title: "Detalhamento por " + t.pessoa,
    sub: itens.length ? `${itens.length} ${itens.length === 1 ? "linha" : "linhas"} em ${esc(periodoCurto(periodo))}` : undefined,
    body: detalhe
  })}
${panel({
    title: "Como a comissão funciona",
    body: `<ol style="display:grid;gap:.5rem;font-size:var(--fs-sm);color:var(--text-muted);padding-left:1.25rem;list-style:decimal">
      <li><b>Prevista</b> — o aluno assinou, a cobrança do mês ainda não foi confirmada.</li>
      <li><b>Apurada</b> — o pagamento do aluno foi aprovado e a comissão entrou no fechamento do mês.</li>
      <li><b>Paga</b> — o repasse saiu; a data do repasse aparece na coluna "Pago em".</li>
    </ol>`
  })}`;

  return shell({
    title: "Comissões",
    user: o.user,
    active: "/comissoes",
    islands: ["org"],
    bootstrap: { tela: "comissoes", papel: o.user.role, dados: d, periodo },
    body
  });
}

export default orgComissoes;
