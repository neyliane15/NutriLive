/* =========================================================================
   Lista de pessoas da organização — "Pacientes" ou "Alunos".
   Busca, filtro por estado, assentos do plano, cadastro de uma pessoa ou
   em massa (com prévia e erro por linha) e encerramento de vínculo.
   Dados: GET /api/org/members   (contract.org.listMembers)
   Ações: POST /api/org/members | POST /api/org/members/bulk
          DELETE /api/org/members/:userId
   ========================================================================= */
import type { z } from "zod";
import { shell, type ShellUser } from "../layout.js";
import { panel, table, pessoa, campo, esc, vazio, dataBR } from "../components/index.js";
import { org } from "../../shared/contract.js";
import {
  termos, rotaPessoas, estilosFE2, indisponivel, nivelPill, estadoPill,
  assentos, desdeBR, ateBR, dialogo
} from "./org-ui.js";

export type PessoasDados = z.infer<typeof org.listMembers.out>;
type Membro = PessoasDados["members"][number];

const FILTROS = [
  { value: "todos", label: "Todos os estados" },
  { value: "ativo", label: "Ativos" },
  { value: "convidado", label: "Convidados (ainda não entraram)" },
  { value: "risco", label: "Em risco" }
];

/** Uma linha da tabela. Exportada porque a ilha redesenha a tabela sozinha. */
export function linhaMembro(m: Membro, rota: string, rotuloPessoa: string): string {
  const adesao = m.adherencePct;
  return `
<tr data-fe2-user="${esc(m.userId)}" data-fe2-nome="${esc(m.name)}" data-fe2-email="${esc(m.email.toLowerCase())}">
  <td>${pessoa(m.name, m.email)}</td>
  <td>${estadoPill(m.status)}</td>
  <td>
    ${adesao === null
      ? `<span class="fe2-reason"><small>sem registro</small></span>`
      : `<span class="fe2-mini"><b>${adesao}%</b><span class="bar"><i style="width:${Math.min(100, adesao)}%${adesao < 55 ? ";background:var(--danger-500)" : adesao < 75 ? ";background:var(--amber-500)" : ""}"></i></span></span>`}
  </td>
  <td><span class="fe2-reason">${esc(desdeBR(m.lastLogAt))}<small>${m.lastLogAt ? dataBR(m.lastLogAt) : "nunca registrou"}</small></span></td>
  <td><span class="fe2-reason">${esc(ateBR(m.nextReturnAt))}<small>${m.nextReturnAt ? dataBR(m.nextReturnAt) : "—"}</small></span></td>
  <td>${nivelPill(m.riskLevel)}</td>
  <td class="num">
    <span class="fe2-acts">
      <a class="btn btn-secondary btn-sm fe2-tap" href="${rota}/${esc(m.userId)}">Ficha</a>
      <button class="btn btn-ghost btn-sm fe2-tap" type="button"
        data-fe2-encerrar="${esc(m.userId)}"
        aria-label="Encerrar vínculo de ${esc(m.name)}">Encerrar</button>
    </span>
  </td>
</tr>`;
}

export function orgPessoas(o: { user: ShellUser; dados: PessoasDados | null; q?: string; status?: string }): string {
  const t = termos(o.user.role);
  const rota = rotaPessoas(o.user.role);
  const d = o.dados;
  const membros = d?.members ?? [];

  const corpoTabela = !d
    ? `<div class="loading" data-fe2-recarregando>Tentando buscar de novo…</div>`
    : membros.length
      ? table({
        cols: [
          { label: t.pessoa }, { label: "Estado" }, { label: "Adesão" },
          { label: "Último registro" }, { label: "Retorno" }, { label: "Nível" },
          { label: "", align: "right" }
        ],
        rows: membros.map((m) => linhaMembro(m, rota, t.pessoa)),
        minWidth: 900
      })
      : vazio({
        titulo: o.q || (o.status && o.status !== "todos") ? "Nada com esse filtro" : `Nenhum ${t.pessoa} ainda`,
        texto: o.q || (o.status && o.status !== "todos")
          ? "Mude a busca ou o estado para ver outras pessoas."
          : `Cadastre a primeira pessoa e ela recebe por e-mail o link de primeiro acesso.`,
        acao: `<button class="btn btn-primary fe2-tap" type="button" data-fe2-abrir="dlg-novo">Cadastrar ${t.pessoa}</button>`
      });

  /* ------------------------ cadastro: uma pessoa ------------------------- */
  const abaUma = `
<div class="fe2-panel" id="pnl-uma" role="tabpanel" aria-labelledby="tab-uma">
  <form data-fe2-form="uma" novalidate>
    ${campo({ id: "nome", label: "Nome completo", autocomplete: "off", maxlength: 160, placeholder: "Maria Souza Lima" })}
    ${campo({ id: "email", label: "E-mail", type: "email", autocomplete: "off", maxlength: 320, placeholder: "maria@email.com", hint: "É para lá que vai o link de primeiro acesso." })}
    ${campo({ id: "note", label: "Observação interna", required: false, rows: 2, placeholder: "Ex.: encaminhada pela Dra. Ana, foco em perda de peso." })}
    <p class="fe2-modal-err" role="alert" data-fe2-erro></p>
    <div class="fe2-modal-acts">
      <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-fechar>Cancelar</button>
      <button class="btn btn-primary btn-sm fe2-tap" type="submit">Cadastrar e convidar</button>
    </div>
  </form>
</div>`;

  /* ------------------------- cadastro: em massa -------------------------- */
  const abaMassa = `
<div class="fe2-panel" id="pnl-massa" role="tabpanel" aria-labelledby="tab-massa" hidden>
  <form data-fe2-form="massa" novalidate>
    <div class="field" data-field="lista">
      <label class="field-label" for="lista">Cole a lista: um por linha, nome e e-mail</label>
      <textarea class="input" id="lista" name="lista" rows="7" aria-describedby="err-lista dica-lista"
        placeholder="Maria Souza Lima, maria@email.com&#10;João Pedro Alves; joao@email.com&#10;Ana Paula Dias	ana@email.com"></textarea>
      <span class="field-hint" id="dica-lista">Separe nome e e-mail por vírgula, ponto e vírgula ou tabulação. Até 500 linhas — dá para colar direto da planilha.</span>
      <span class="field-error" id="err-lista" role="alert"></span>
    </div>
    <div class="fe2-modal-acts" style="justify-content:flex-start;margin-top:var(--sp-4)">
      <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-previa>Ver prévia</button>
    </div>
    <div data-fe2-previa-area aria-live="polite"></div>
    <p class="fe2-modal-err" role="alert" data-fe2-erro></p>
    <div class="fe2-modal-acts">
      <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-fechar>Cancelar</button>
      <button class="btn btn-primary btn-sm fe2-tap" type="submit" data-fe2-confirmar-massa disabled>
        Confirmar importação
      </button>
    </div>
  </form>
</div>`;

  const dialogoNovo = `
<dialog class="fe2-modal" id="dlg-novo" aria-labelledby="dlg-novo-t">
  <div class="fe2-modal-in">
    <h2 id="dlg-novo-t">Cadastrar ${esc(t.pessoa)}</h2>
    <p class="fe2-modal-text">Quem você cadastrar recebe um e-mail para definir a senha e já entra com o app completo, sem pagar nada.</p>
    <div class="fe2-tabs" role="tablist" aria-label="Forma de cadastro">
      <button type="button" role="tab" id="tab-uma" aria-selected="true" aria-controls="pnl-uma" data-fe2-aba="uma">Uma pessoa</button>
      <button type="button" role="tab" id="tab-massa" aria-selected="false" aria-controls="pnl-massa" data-fe2-aba="massa" tabindex="-1">Em massa</button>
    </div>
    ${abaUma}
    ${abaMassa}
  </div>
</dialog>`;

  const dialogoEncerrar = dialogo({
    id: "dlg-encerrar",
    titulo: "Encerrar vínculo",
    texto: `A pessoa deixa de aparecer na sua ${t.carteira} e o assento volta para o plano. O histórico dela continua salvo e o acesso ao app dela não é apagado — só o vínculo com você termina.`,
    corpo: `<p class="notice notice-amber" style="margin-top:var(--sp-5)"><span data-fe2-encerrar-nome>—</span></p>`,
    confirmar: "Encerrar vínculo",
    perigo: true
  });

  const body = `
${estilosFE2}
${d ? "" : indisponivel({ oque: `Lista de ${t.pessoas}`, rota: "GET /api/org/members" })}
${panel({
    body: `
<div class="fe2-bar" style="align-items:flex-end">
  <div class="fe2-grow field" data-field="q">
    <label class="field-label" for="q">Buscar ${esc(t.pessoa)}</label>
    <input class="input" id="q" name="q" type="search" value="${esc(o.q ?? "")}"
      placeholder="Nome ou e-mail" autocomplete="off" aria-describedby="err-q">
    <span class="field-error" id="err-q" role="alert"></span>
  </div>
  ${campo({ id: "status", label: "Estado", options: FILTROS, value: o.status ?? "todos" })}
  <div class="fe2-bar-end">
    ${assentos({ usados: d?.seatsUsed ?? 0, limite: d?.seatLimit ?? 0, rotulo: t.pessoas })}
    <button class="btn btn-primary fe2-tap" type="button" data-fe2-abrir="dlg-novo">
      Cadastrar ${esc(t.pessoa)}
    </button>
  </div>
</div>`
  })}
${panel({
    title: t.Pessoas,
    sub: d ? `${membros.length} ${membros.length === 1 ? "pessoa" : "pessoas"} na visão atual` : "carregando",
    body: `<div data-fe2-tabela>${corpoTabela}</div>`
  })}
${dialogoNovo}
${dialogoEncerrar}`;

  return shell({
    title: t.Pessoas,
    user: o.user,
    active: rota,
    islands: ["org"],
    bootstrap: {
      tela: "pessoas", papel: o.user.role, dados: d, rotaPessoas: rota,
      termos: { pessoa: t.pessoa, pessoas: t.pessoas }
    },
    body
  });
}

export default orgPessoas;
