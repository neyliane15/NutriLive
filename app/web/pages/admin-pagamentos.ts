/* =========================================================================
   Admin — pagamentos.
   Lista com filtro por estado, valor, método, e estorno com motivo
   obrigatório.
   Dados: GET /api/admin/payments          (contract.admin.listPayments)
   Ação:  POST /api/admin/payments/:id/refund  (motivo obrigatório)
   ========================================================================= */
import type { z } from "zod";
import { shell, type ShellUser } from "../layout.js";
import { panel, table, pessoa, campo, esc, vazio, brl, dataHoraBR } from "../components/index.js";
import { admin } from "../../shared/contract.js";
import { estilosFE2, indisponivel, estadoPill, paginacao, milhar } from "./org-ui.js";

export type PagamentosDados = z.infer<typeof admin.listPayments.out>;
type Pagamento = PagamentosDados["payments"][number];

export const POR_PAGINA = 25;

const ESTADOS = [
  { value: "", label: "Todos os estados" },
  { value: "aprovado", label: "Aprovados" },
  { value: "pendente", label: "Pendentes" },
  { value: "recusado", label: "Recusados" },
  { value: "estornado", label: "Estornados" },
  { value: "cancelado", label: "Cancelados" }
];

const METODO: Record<string, string> = { credito: "Crédito", debito: "Débito", pix: "Pix" };

const icoMetodo = (m: string) =>
  m === "pix"
    ? `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 2.8 21.2 12 12 21.2 2.8 12z"/></svg>`
    : `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.6"/><path d="M2.5 10h19"/></svg>`;

export function linhaPagamento(p: Pagamento): string {
  const estornavel = p.status === "aprovado";
  return `
<tr data-fe2-pag="${esc(p.id)}" data-fe2-nome="${esc(p.userName)}" data-fe2-valor="${p.amountCents}">
  <td>${pessoa(p.userName, p.userEmail)}</td>
  <td class="num"><b>${brl(p.amountCents)}</b></td>
  <td><span class="fe2-mini">${icoMetodo(p.method)}<span>${esc(METODO[p.method] ?? p.method)}</span></span></td>
  <td>${estadoPill(p.status)}</td>
  <td><span class="fe2-reason">${p.paidAt ? dataHoraBR(p.paidAt) : "não pago"}<small>criado ${dataHoraBR(p.createdAt)}</small></span></td>
  <td class="num">
    <span class="fe2-acts">
      ${estornavel
      ? `<button class="btn btn-ghost btn-sm fe2-tap" type="button" data-fe2-estornar="${esc(p.id)}"
          aria-label="Estornar ${brl(p.amountCents)} de ${esc(p.userName)}">Estornar</button>`
      : `<span class="fe2-reason"><small>sem estorno</small></span>`}
    </span>
  </td>
</tr>`;
}

export function adminPagamentos(o: {
  user: ShellUser; dados: PagamentosDados | null; status?: string; pagina?: number;
}): string {
  const d = o.dados;
  const lista = d?.payments ?? [];
  const pagina = o.pagina ?? 1;

  const somaAprovada = lista.filter((p) => p.status === "aprovado").reduce((s, p) => s + p.amountCents, 0);
  const somaEstornada = lista.filter((p) => p.status === "estornado").reduce((s, p) => s + p.amountCents, 0);

  const corpo = !d
    ? `<div class="loading" data-fe2-recarregando>Tentando buscar de novo…</div>`
    : lista.length
      ? table({
        cols: [
          { label: "Pagador" }, { label: "Valor", align: "right" }, { label: "Método" },
          { label: "Estado" }, { label: "Quando" }, { label: "", align: "right" }
        ],
        rows: lista.map(linhaPagamento),
        minWidth: 860
      }) + paginacao({ pagina, total: d.total, porPagina: POR_PAGINA, rotulo: "pagamentos" })
      : vazio({
        titulo: o.status ? "Nada com esse estado" : "Nenhum pagamento",
        texto: o.status ? "Troque o estado para ver outros pagamentos." : "Nenhuma cobrança foi processada ainda."
      });

  const dlgEstorno = `
<dialog class="fe2-modal" id="dlg-estorno" aria-labelledby="dlg-est-t">
  <form class="fe2-modal-in" data-fe2-form="estorno" novalidate>
    <h2 id="dlg-est-t">Estornar pagamento</h2>
    <p class="fe2-modal-text">
      Devolve <b data-fe2-est-valor>—</b> para <b data-fe2-est-nome>—</b>. O provedor processa o estorno e a
      assinatura pode cair para atrasada. Não dá para desfazer.
    </p>
    ${campo({
      id: "reason", label: "Motivo do estorno", rows: 3, maxlength: 400,
      placeholder: "Ex.: cobrança em duplicidade no dia 12, confirmada pelo cliente.",
      hint: "Obrigatório. Fica gravado em auditoria junto com o seu nome."
    })}
    <p class="fe2-modal-err" role="alert" data-fe2-erro></p>
    <div class="fe2-modal-acts">
      <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-fechar>Cancelar</button>
      <button class="btn fe2-btn-danger btn-sm fe2-tap" type="submit">Estornar</button>
    </div>
  </form>
</dialog>`;

  const body = `
${estilosFE2}
${d ? "" : indisponivel({ oque: "Pagamentos", rota: "GET /api/admin/payments" })}
${panel({
    body: `
<div class="fe2-bar">
  ${campo({ id: "status", label: "Estado do pagamento", options: ESTADOS, value: o.status ?? "" })}
  <div class="fe2-bar-end">
    <dl class="fe2-strip" style="grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));min-width:18rem">
      <div><dt>Nesta página</dt><dd>${brl(somaAprovada)}<small>aprovado</small></dd></div>
      <div><dt>Estornado</dt><dd>${brl(somaEstornada)}<small>nesta página</small></dd></div>
      <div><dt>Total</dt><dd>${d ? milhar(d.total) : "—"}<small>pagamentos</small></dd></div>
    </dl>
  </div>
</div>`
  })}
${panel({ title: "Pagamentos", body: `<div data-fe2-tabela>${corpo}</div>` })}
${dlgEstorno}`;

  return shell({
    title: "Pagamentos",
    user: o.user,
    active: "/admin/pagamentos",
    islands: ["admin"],
    bootstrap: { tela: "pagamentos", dados: d, porPagina: POR_PAGINA, filtro: { status: o.status ?? "" }, pagina },
    body
  });
}

export default adminPagamentos;
