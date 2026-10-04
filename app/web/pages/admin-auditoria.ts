/* =========================================================================
   Admin — auditoria.
   Quem fez o quê, quando, em qual entidade. Linha do tempo em tabela, com o
   detalhe técnico (meta) recolhido em cada linha.
   Dados: GET /api/admin/audit?page=   (contract.admin.audit)
   ========================================================================= */
import type { z } from "zod";
import { shell, type ShellUser } from "../layout.js";
import { panel, table, pessoa, campo, esc, vazio, dataHoraBR } from "../components/index.js";
import { admin } from "../../shared/contract.js";
import { estilosFE2, indisponivel } from "./org-ui.js";

export type AuditoriaDados = z.infer<typeof admin.audit.out>;
type Entrada = AuditoriaDados["entries"][number];

/** Ação em português, com o tom de quem lê relatório, não log. */
const ACAO: Record<string, { texto: string; tom: "neutro" | "atencao" | "risco" }> = {
  "user.login": { texto: "entrou na conta", tom: "neutro" },
  "user.logout": { texto: "saiu da conta", tom: "neutro" },
  "user.created": { texto: "criou um usuário", tom: "neutro" },
  "user.suspended": { texto: "suspendeu um usuário", tom: "risco" },
  "user.reactivated": { texto: "reativou um usuário", tom: "atencao" },
  "user.impersonated": { texto: "entrou como outro usuário", tom: "risco" },
  "member.invited": { texto: "convidou uma pessoa", tom: "neutro" },
  "member.removed": { texto: "encerrou um vínculo", tom: "atencao" },
  "member.bulk_invited": { texto: "importou pessoas em massa", tom: "neutro" },
  "payment.refunded": { texto: "estornou um pagamento", tom: "risco" },
  "payment.approved": { texto: "pagamento aprovado", tom: "neutro" },
  "subscription.canceled": { texto: "cancelou uma assinatura", tom: "atencao" },
  "plan.sent": { texto: "enviou um plano", tom: "neutro" },
  "note.added": { texto: "registrou uma anotação", tom: "neutro" },
  "ai.requested": { texto: "pediu geração à IA", tom: "neutro" }
};

const ENTIDADE: Record<string, string> = {
  user: "Usuário", users: "Usuário", payment: "Pagamento", subscription: "Assinatura",
  organization: "Organização", care_link: "Vínculo", meal_plan: "Plano alimentar",
  clinical_note: "Anotação", ai_job: "Execução de IA", invitation: "Convite",
  webhook_event: "Evento de webhook", session: "Sessão"
};

const FILTROS = [
  { value: "", label: "Todas as ações" },
  { value: "user.impersonated", label: "Entrar como usuário" },
  { value: "payment.refunded", label: "Estorno de pagamento" },
  { value: "user.suspended", label: "Suspensão de usuário" },
  { value: "member.removed", label: "Encerramento de vínculo" }
];

export function linhaAuditoria(e: Entrada): string {
  const a = ACAO[e.action];
  const meta = e.meta === null || e.meta === undefined ? null : JSON.stringify(e.meta, null, 2);
  const temMeta = meta !== null && meta !== "{}" && meta !== "null";
  return `
<tr data-fe2-audit="${esc(e.id)}" data-fe2-acao="${esc(e.action)}">
  <td><span class="fe2-reason">${dataHoraBR(e.createdAt)}<small><code class="fe2-code">${esc(e.id.slice(0, 8))}</code></small></span></td>
  <td>${e.actorName ? pessoa(e.actorName) : `<span class="fe2-reason">Sistema<small>sem ator</small></span>`}</td>
  <td>
    <span class="fe2-reason">
      ${esc(a?.texto ?? e.action)}
      <small><code class="fe2-code">${esc(e.action)}</code></small>
    </span>
  </td>
  <td>
    <span class="fe2-reason">
      ${esc(ENTIDADE[e.entity] ?? e.entity)}
      <small>${e.entityId ? `<code class="fe2-code">${esc(String(e.entityId).slice(0, 8))}</code>` : "—"}</small>
    </span>
  </td>
  <td>${temMeta ? `<details class="fe2-det"><summary>ver detalhe</summary><pre>${esc(meta)}</pre></details>` : `<span class="fe2-reason"><small>sem detalhe</small></span>`}</td>
</tr>`;
}

export function adminAuditoria(o: {
  user: ShellUser; dados: AuditoriaDados | null; pagina?: number; acao?: string;
}): string {
  const d = o.dados;
  const pagina = o.pagina ?? 1;
  const entradas = d?.entries ?? [];
  const sensiveis = entradas.filter((e) => ACAO[e.action]?.tom === "risco").length;

  const corpo = !d
    ? `<div class="loading" data-fe2-recarregando>Tentando buscar de novo…</div>`
    : entradas.length
      ? table({
        cols: [
          { label: "Quando" }, { label: "Quem" }, { label: "O quê" },
          { label: "Em qual entidade" }, { label: "Detalhe" }
        ],
        rows: entradas.map(linhaAuditoria),
        minWidth: 900
      }) + `
<nav class="fe2-page" aria-label="Paginação">
  <p class="fe2-page-info" aria-live="polite">${entradas.length} registros nesta página</p>
  <div class="fe2-page-acts">
    <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-pagina="${pagina - 1}"${pagina <= 1 ? " disabled" : ""}>Anterior</button>
    <span class="fe2-page-num">Página ${pagina}</span>
    <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-pagina="${pagina + 1}"${entradas.length === 0 ? " disabled" : ""}>Próxima</button>
  </div>
</nav>`
      : vazio({
        titulo: o.acao ? "Nada com esse filtro" : "Auditoria vazia",
        texto: o.acao
          ? "Nenhum registro dessa ação nesta página."
          : "Nenhuma ação registrada ainda. Toda operação sensível de admin cai aqui automaticamente."
      });

  const body = `
${estilosFE2}
${d ? "" : indisponivel({ oque: "Auditoria", rota: "GET /api/admin/audit" })}
${panel({
    body: `
<div class="fe2-bar">
  ${campo({ id: "acao", label: "Ação", options: FILTROS, value: o.acao ?? "" })}
  <div class="fe2-bar-end">
    <p class="fe2-seats-num" aria-live="polite">
      <b>${entradas.length}</b> registros nesta página${sensiveis ? ` · <b style="color:var(--danger-600)">${sensiveis}</b> sensíveis` : ""}
    </p>
  </div>
</div>
<p class="fe2-seats-num" style="margin-top:var(--sp-3)">
  O registro de auditoria não é editável nem apagável. O filtro de ação é aplicado sobre a página carregada.
</p>`
  })}
${panel({ title: "Registros", body: `<div data-fe2-tabela>${corpo}</div>` })}`;

  return shell({
    title: "Auditoria",
    user: o.user,
    active: "/admin/auditoria",
    islands: ["admin"],
    bootstrap: { tela: "auditoria", dados: d, pagina, filtro: { acao: o.acao ?? "" } },
    body
  });
}

export default adminAuditoria;
