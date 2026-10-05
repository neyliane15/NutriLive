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
  /* As chaves são os nomes que o servidor realmente grava. Elas estiveram
     erradas (inglês pontuado: "user.impersonated", "payment.refunded") e
     nenhuma das treze casava com nada: toda linha da auditoria mostrava o
     código cru em vez da frase, e o contador de "sensíveis" ficava em zero
     para sempre — justo o número por que esta tela existe. Mexer aqui pede
     conferir `grep -rhoE 'registrarAuditoria\([^,]+, *[^,]+, *"[a-z_.]+"' server/`. */

  /* nosso time passando por cima da fronteira do cliente */
  "admin.impersonate": { texto: "entrou como outro usuário", tom: "risco" },
  "admin.estorno": { texto: "estornou um pagamento", tom: "risco" },
  "admin.usuario_alterado": { texto: "mudou papel ou estado de um usuário", tom: "atencao" },
  "admin.le_membro": { texto: "abriu a ficha de um membro", tom: "atencao" },

  /* organização sobre as pessoas dela */
  "org.convidou": { texto: "cadastrou uma pessoa", tom: "neutro" },
  "org.encerrou_vinculo": { texto: "encerrou um vínculo", tom: "atencao" },
  "org.anotou": { texto: "registrou uma anotação clínica", tom: "neutro" },
  "org.enviou_plano": { texto: "enviou um plano", tom: "neutro" },

  /* autenticação */
  "auth.login": { texto: "entrou na conta", tom: "neutro" },
  "auth.primeiro_acesso": { texto: "definiu a primeira senha", tom: "neutro" },
  "auth.trocou_senha": { texto: "trocou a senha", tom: "neutro" },
  "auth.esqueci_senha": { texto: "pediu link de redefinição", tom: "neutro" },
  "auth.redefiniu_senha": { texto: "redefiniu a senha pelo link", tom: "atencao" },

  /* dinheiro e assinatura, gravados pelo próprio fluxo de cobrança */
  "checkout_criado": { texto: "assinou um plano", tom: "neutro" },
  "pagamento_estornado": { texto: "pagamento estornado", tom: "risco" },
  "pagamento_recusado": { texto: "pagamento recusado", tom: "atencao" },
  "assinatura_cancelada": { texto: "cancelou a assinatura", tom: "atencao" },
  "assinatura_cancelada_provedor": { texto: "assinatura cancelada no provedor", tom: "atencao" },
  "comissao_gerada": { texto: "comissão gerada", tom: "neutro" },
  "comissao_cancelada": { texto: "comissão cancelada por estorno", tom: "atencao" },

  /* IA */
  "ia.plano_pedido": { texto: "pediu um plano à IA", tom: "neutro" },
  "ia.plano_bloqueado": { texto: "IA recusou um plano fora de faixa segura", tom: "atencao" },

  "seed.carregado": { texto: "carregou os dados de demonstração", tom: "neutro" }
};


/* Mesma regra das ações: as chaves são o que o servidor grava, e aqui ele
   grava o nome da TABELA ("users", "ai_jobs"), não o singular. Os singulares
   ficam porque três inserts diretos usam essa forma. */
const ENTIDADE: Record<string, string> = {
  users: "Usuário", user: "Usuário",
  payment: "Pagamento", payments: "Pagamento",
  subscription: "Assinatura", subscriptions: "Assinatura",
  commission: "Comissão", commissions: "Comissão",
  meal_plans: "Plano alimentar", meal_plan: "Plano alimentar",
  clinical_notes: "Anotação", clinical_note: "Anotação",
  ai_jobs: "Execução de IA", ai_job: "Execução de IA",
  care_links: "Vínculo", care_link: "Vínculo",
  organizations: "Organização", organization: "Organização",
  invitations: "Convite", invitation: "Convite",
  webhook_events: "Evento de webhook", sessions: "Sessão",
  sistema: "Sistema"
};

const FILTROS = [
  { value: "", label: "Todas as ações" },
  { value: "admin.impersonate", label: "Entrar como usuário" },
  { value: "admin.estorno", label: "Estorno de pagamento" },
  { value: "admin.usuario_alterado", label: "Papel ou estado alterado" },
  { value: "org.encerrou_vinculo", label: "Encerramento de vínculo" },
  { value: "auth.redefiniu_senha", label: "Senha redefinida por link" },
  { value: "ia.plano_bloqueado", label: "Plano bloqueado pela IA" }
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
