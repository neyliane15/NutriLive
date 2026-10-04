/* =========================================================================
   Admin — usuários.
   Busca, filtro por papel e estado, plano e estado da assinatura de cada um,
   suspender/reativar e entrar como usuário (com aviso de auditoria).
   Dados: GET /api/admin/users            (contract.admin.listUsers)
   Ações: PATCH /api/admin/users/:id      (status)
          POST /api/admin/users/:id/impersonate
   ========================================================================= */
import type { z } from "zod";
import { shell, type ShellUser } from "../layout.js";
import { panel, table, pessoa, campo, esc, vazio, dataBR, dataHoraBR } from "../components/index.js";
import { admin } from "../../shared/contract.js";
import { estilosFE2, indisponivel, estadoPill, dialogo, paginacao } from "./org-ui.js";

export type UsuariosDados = z.infer<typeof admin.listUsers.out>;
type Usuario = UsuariosDados["users"][number];

export const POR_PAGINA = 25;

const PAPEIS = [
  { value: "", label: "Todos os papéis" },
  { value: "pessoal", label: "Pessoa física" },
  { value: "nutricionista", label: "Nutricionista" },
  { value: "academia", label: "Academia" },
  { value: "paciente", label: "Paciente" },
  { value: "aluno", label: "Aluno" },
  { value: "admin", label: "Administração" }
];

const ESTADOS = [
  { value: "", label: "Todos os estados" },
  { value: "ativo", label: "Ativos" },
  { value: "convidado", label: "Convidados" },
  { value: "suspenso", label: "Suspensos" }
];

const PAPEL: Record<string, string> = {
  pessoal: "Pessoa física", nutricionista: "Nutricionista", academia: "Academia",
  paciente: "Paciente", aluno: "Aluno", admin: "Administração"
};

export function linhaUsuario(u: Usuario): string {
  const suspenso = u.status === "suspenso";
  return `
<tr data-fe2-user="${esc(u.id)}" data-fe2-nome="${esc(u.name)}" data-fe2-estado="${esc(u.status)}">
  <td>${pessoa(u.name, u.email)}</td>
  <td><span class="fe2-reason">${esc(PAPEL[u.role] ?? u.role)}<small>${esc(u.orgName ?? "sem organização")}</small></span></td>
  <td>${estadoPill(u.status)}</td>
  <td><span class="fe2-reason">${u.planKey ? esc(u.planKey) : "—"}<small>${u.subStatus ? "" : "sem assinatura"}</small></span></td>
  <td>${estadoPill(u.subStatus)}</td>
  <td><span class="fe2-reason">${dataBR(u.createdAt)}<small>${u.lastLoginAt ? `acesso ${dataHoraBR(u.lastLoginAt)}` : "nunca acessou"}</small></span></td>
  <td class="num">
    <span class="fe2-acts">
      <button class="btn btn-ghost btn-sm fe2-tap" type="button"
        data-fe2-suspender="${esc(u.id)}" data-fe2-para="${suspenso ? "ativo" : "suspenso"}"
        aria-label="${suspenso ? "Reativar" : "Suspender"} ${esc(u.name)}">${suspenso ? "Reativar" : "Suspender"}</button>
      <button class="btn btn-secondary btn-sm fe2-tap" type="button"
        data-fe2-impersonar="${esc(u.id)}"
        aria-label="Entrar como ${esc(u.name)}">Entrar como</button>
    </span>
  </td>
</tr>`;
}

export function adminUsuarios(o: {
  user: ShellUser; dados: UsuariosDados | null;
  q?: string; role?: string; status?: string;
}): string {
  const d = o.dados;
  const lista = d?.users ?? [];
  const temFiltro = Boolean(o.q || o.role || o.status);

  const corpo = !d
    ? `<div class="loading" data-fe2-recarregando>Tentando buscar de novo…</div>`
    : lista.length
      ? table({
        cols: [
          { label: "Usuário" }, { label: "Papel" }, { label: "Estado" },
          { label: "Plano" }, { label: "Assinatura" }, { label: "Cadastro" },
          { label: "", align: "right" }
        ],
        rows: lista.map(linhaUsuario),
        minWidth: 980
      }) + paginacao({ pagina: d.page, total: d.total, porPagina: POR_PAGINA, rotulo: "usuários" })
      : vazio({
        titulo: temFiltro ? "Nada com esses filtros" : "Nenhum usuário",
        texto: temFiltro ? "Afrouxe a busca, o papel ou o estado." : "Ainda não há usuário cadastrado na base."
      });

  const dlgSuspender = dialogo({
    id: "dlg-suspender",
    titulo: "Mudar o acesso",
    texto: "Suspender bloqueia a entrada na hora e encerra as sessões abertas. Reativar devolve o acesso sem mexer na assinatura.",
    corpo: `<p class="notice notice-amber" style="margin-top:var(--sp-5)"><span data-fe2-suspender-texto>—</span></p>`,
    confirmar: "Confirmar",
    perigo: true
  });

  const dlgImpersonar = `
<dialog class="fe2-modal" id="dlg-impersonar" aria-labelledby="dlg-imp-t">
  <form class="fe2-modal-in" data-fe2-form="impersonar" novalidate>
    <h2 id="dlg-imp-t">Entrar como usuário</h2>
    <p class="fe2-modal-text">Você passa a navegar com a sessão de <b data-fe2-imp-nome>—</b>, vendo exatamente o que essa pessoa vê.</p>
    <p class="notice notice-danger" style="margin-top:var(--sp-5)">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M12 3.5 2.8 19.4h18.4z"/><path d="M12 9.6v4.2M12 16.6v.1"/></svg>
      <span><b>Esta ação fica registrada em auditoria.</b> Ficam gravados o seu nome, o nome da pessoa,
      a data e a hora. O registro aparece em <a class="link" href="/admin/auditoria">Auditoria</a> e não pode ser apagado.</span>
    </p>
    <div class="field" data-field="ciente" style="margin-top:var(--sp-5)">
      <label class="choice" for="ciente">
        <input type="checkbox" id="ciente" name="ciente" required>
        <span class="choice-radio" aria-hidden="true" style="border-radius:5px"></span>
        <span class="choice-body"><span class="choice-title">Estou ciente de que este acesso será registrado</span>
        <span class="choice-sub">Marque para liberar o botão.</span></span>
      </label>
      <span class="field-error" id="err-ciente" role="alert"></span>
    </div>
    <p class="fe2-modal-err" role="alert" data-fe2-erro></p>
    <div class="fe2-modal-acts">
      <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-fechar>Cancelar</button>
      <button class="btn fe2-btn-danger btn-sm fe2-tap" type="submit">Entrar como usuário</button>
    </div>
  </form>
</dialog>`;

  const body = `
${estilosFE2}
${d ? "" : indisponivel({ oque: "Lista de usuários", rota: "GET /api/admin/users" })}
${panel({
    body: `
<div class="fe2-bar">
  <div class="fe2-grow field" data-field="q">
    <label class="field-label" for="q">Buscar</label>
    <input class="input" id="q" name="q" type="search" value="${esc(o.q ?? "")}"
      placeholder="Nome, e-mail ou organização" autocomplete="off" aria-describedby="err-q">
    <span class="field-error" id="err-q" role="alert"></span>
  </div>
  ${campo({ id: "role", label: "Papel", options: PAPEIS, value: o.role ?? "" })}
  ${campo({ id: "status", label: "Estado", options: ESTADOS, value: o.status ?? "" })}
  <div class="fe2-bar-end">
    <p class="fe2-seats-num" aria-live="polite" data-fe2-total>
      <b>${d ? d.total.toLocaleString("pt-BR") : "—"}</b> usuários
    </p>
  </div>
</div>`
  })}
${panel({ title: "Usuários", body: `<div data-fe2-tabela>${corpo}</div>` })}
${dlgSuspender}
${dlgImpersonar}`;

  return shell({
    title: "Usuários",
    user: o.user,
    active: "/admin/usuarios",
    islands: ["admin"],
    bootstrap: {
      tela: "usuarios", dados: d, porPagina: POR_PAGINA,
      filtro: { q: o.q ?? "", role: o.role ?? "", status: o.status ?? "" }
    },
    body
  });
}

export default adminUsuarios;
