/* =========================================================================
   FE-2 — peças comuns das telas de organização e de administração.
   Arquivo do agente FE-2 (casa no padrão `web/pages/org-*.ts`).
   Só usa o que vem de web/components e de web/layout; não edita nenhum deles.
   ========================================================================= */
import type { Role } from "../../shared/contract.js";
import { esc, pill } from "../components/index.js";

/* ------------------------------- rótulos -------------------------------- */
export type Termos = {
  /** "paciente" / "aluno" */
  pessoa: string;
  /** "pacientes" / "alunos" */
  pessoas: string;
  /** "Pacientes" / "Alunos" */
  Pessoas: string;
  /** "o paciente" / "o aluno" — concordância dos dois é masculina */
  oPessoa: string;
  carteira: string;
};

export const termos = (papel: Role): Termos =>
  papel === "academia"
    ? { pessoa: "aluno", pessoas: "alunos", Pessoas: "Alunos", oPessoa: "o aluno", carteira: "turma" }
    : { pessoa: "paciente", pessoas: "pacientes", Pessoas: "Pacientes", oPessoa: "o paciente", carteira: "carteira" };

/* ------------------------------ formatação ------------------------------ */
/** Rota da listagem, que muda de nome conforme o papel. */
export const rotaPessoas = (papel: Role): string => (papel === "academia" ? "/alunos" : "/pacientes");

export const pct = (n: number | null | undefined): string =>
  n === null || n === undefined ? "—" : `${Math.round(n)}%`;

/** Dias inteiros entre a data e agora. Devolve null se não houver data. */
export function diasDesde(iso: string | null | undefined, agora = Date.now()): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.floor((agora - t) / 86_400_000);
}

/** "hoje", "ontem", "há 6 dias", "nunca". */
export function desdeBR(iso: string | null | undefined, agora = Date.now()): string {
  const d = diasDesde(iso, agora);
  if (d === null) return "nunca";
  if (d <= 0) return "hoje";
  if (d === 1) return "ontem";
  if (d < 30) return `há ${d} dias`;
  const m = Math.floor(d / 30);
  return m === 1 ? "há 1 mês" : `há ${m} meses`;
}

/** "em 2 dias", "amanhã", "atrasado há 3 dias", "sem retorno marcado". */
export function ateBR(iso: string | null | undefined, agora = Date.now()): string {
  const d = diasDesde(iso, agora);
  if (d === null) return "sem retorno marcado";
  if (d > 0) return d === 1 ? "atrasado desde ontem" : `atrasado há ${d} dias`;
  if (d === 0) return "hoje";
  const f = -d;
  return f === 1 ? "amanhã" : `em ${f} dias`;
}

/** "2026-03" -> "mar/26"; "2026-03-09" -> "09/03". */
export function periodoCurto(p: string): string {
  const meses = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(p);
  if (!m) return p;
  if (m[3]) return `${m[3]}/${m[2]}`;
  const mes = meses[Number(m[2]) - 1] ?? m[2];
  return `${mes}/${m[1]!.slice(2)}`;
}

/** "2026-03" -> "Março de 2026". */
export function periodoLongo(p: string): string {
  const meses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  const m = /^(\d{4})-(\d{2})$/.exec(p);
  if (!m) return p;
  return `${meses[Number(m[2]) - 1] ?? m[2]} de ${m[1]}`;
}

export const minutos = (ms: number): string =>
  ms >= 60_000 ? `${(ms / 60_000).toFixed(1).replace(".", ",")} min` : `${(ms / 1000).toFixed(1).replace(".", ",")} s`;

export const milhar = (n: number): string => n.toLocaleString("pt-BR");

/* --------------------------------- estado ------------------------------- */
export type Nivel = "ok" | "atencao" | "risco";

/** Forma além da cor: cada nível ganha um texto próprio e um prefixo. */
export const nivelPill = (nivel: Nivel): string =>
  nivel === "risco" ? pill("Risco", "risco")
    : nivel === "atencao" ? pill("Atenção", "atencao")
      : pill("Em dia", "ok");

const TOM_ESTADO: Record<string, "ok" | "atencao" | "risco" | "neutro"> = {
  ativo: "ok", ativa: "ok", aprovado: "ok", paga: "ok", apurada: "ok", concluido: "ok",
  convidado: "atencao", pendente: "atencao", prevista: "atencao", fila: "atencao",
  processando: "atencao", atrasada: "risco", suspenso: "risco", recusado: "risco",
  cancelada: "risco", cancelado: "risco", expirada: "risco", erro: "risco",
  estornado: "neutro", encerrado: "neutro"
};

const NOME_ESTADO: Record<string, string> = {
  ativo: "Ativo", ativa: "Ativa", convidado: "Convidado", suspenso: "Suspenso",
  pendente: "Pendente", atrasada: "Atrasada", cancelada: "Cancelada", expirada: "Expirada",
  aprovado: "Aprovado", recusado: "Recusado", estornado: "Estornado", cancelado: "Cancelado",
  prevista: "Prevista", apurada: "Apurada", paga: "Paga",
  fila: "Na fila", processando: "Processando", concluido: "Concluída", erro: "Erro",
  encerrado: "Encerrado", enviado: "Enviado", rascunho: "Rascunho"
};

export const estadoPill = (estado: string | null | undefined): string => {
  if (!estado) return pill("Sem assinatura", "neutro");
  const k = String(estado).toLowerCase();
  return pill(NOME_ESTADO[k] ?? estado, TOM_ESTADO[k] ?? "neutro");
};

/* ------------------------------- avisos --------------------------------- */
const svgInfo = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.6v.1"/></svg>`;

export const aviso = (texto: string, tom: "info" | "amber" | "danger" = "info", papel?: "alert"): string => `
<p class="notice${tom === "amber" ? " notice-amber" : tom === "danger" ? " notice-danger" : ""}"${papel ? ` role="${papel}"` : ""}>
  ${svgInfo}<span>${texto}</span>
</p>`;

/** Degradação elegante: o endpoint respondeu 503 (ou nem existe ainda). */
export const indisponivel = (o: { oque: string; rota: string }): string => `
<p class="notice notice-amber" role="status" data-fe2-indisponivel>
  ${svgInfo}
  <span><b>${esc(o.oque)} indisponível agora.</b> O serviço respondeu que está fora do ar
  (<code class="fe2-code">${esc(o.rota)}</code>). A tela segue utilizável e recarrega sozinha
  quando o serviço voltar.</span>
</p>`;

/* ------------------------------ barra de filtro -------------------------- */
export const barraFiltro = (o: { campos: string; acao?: string; id?: string }): string => `
<form class="fe2-bar"${o.id ? ` id="${o.id}"` : ""} role="search">
  ${o.campos}
  ${o.acao ? `<div class="fe2-bar-end">${o.acao}</div>` : ""}
</form>`;

/* ------------------------------- assentos -------------------------------- */
export const assentos = (o: { usados: number; limite: number; rotulo: string }): string => {
  const livres = Math.max(0, o.limite - o.usados);
  const fill = o.limite ? Math.min(100, (o.usados / o.limite) * 100) : 0;
  const tom: Nivel = livres === 0 ? "risco" : livres <= 2 ? "atencao" : "ok";
  return `
<div class="fe2-seats" data-fe2-seats>
  <div class="fe2-seats-top">
    <span class="fe2-seats-label">Assentos do plano</span>
    ${livres === 0 ? pill("Plano cheio", "risco") : livres <= 2 ? pill(`${livres} livre${livres === 1 ? "" : "s"}`, "atencao") : pill(`${livres} livres`, "ok")}
  </div>
  <p class="fe2-seats-num"><b data-fe2-usados>${o.usados}</b> de ${o.limite} ${esc(o.rotulo)}</p>
  <div class="bar"><i style="width:${fill.toFixed(1)}%;${tom === "risco" ? "background:var(--danger-500)" : tom === "atencao" ? "background:var(--amber-500)" : ""}"></i></div>
</div>`;
};

/* -------------------------------- diálogo -------------------------------- */
/**
 * Confirmação em <dialog> nativo. O JS da ilha só chama showModal/close.
 * `perigo` deixa o botão de confirmar vermelho.
 */
export const dialogo = (o: {
  id: string; titulo: string; texto?: string; corpo?: string;
  confirmar: string; perigo?: boolean; form?: { api: string; method?: string };
}): string => `
<dialog class="fe2-modal" id="${o.id}" aria-labelledby="${o.id}-t">
  <form class="fe2-modal-in"${o.form ? ` data-fe2-api="${o.form.api}" data-fe2-method="${o.form.method ?? "POST"}"` : " method=\"dialog\""}>
    <h2 id="${o.id}-t">${esc(o.titulo)}</h2>
    ${o.texto ? `<p class="fe2-modal-text">${esc(o.texto)}</p>` : ""}
    ${o.corpo ?? ""}
    <p class="fe2-modal-err" role="alert" data-fe2-erro></p>
    <div class="fe2-modal-acts">
      <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-fechar>Cancelar</button>
      <button class="btn ${o.perigo ? "fe2-btn-danger" : "btn-primary"} btn-sm fe2-tap" type="submit" data-fe2-confirmar>${esc(o.confirmar)}</button>
    </div>
  </form>
</dialog>`;

/* ------------------------------- paginação ------------------------------- */
export const paginacao = (o: { pagina: number; total: number; porPagina: number; rotulo: string }): string => {
  const paginas = Math.max(1, Math.ceil(o.total / o.porPagina));
  const de = o.total === 0 ? 0 : (o.pagina - 1) * o.porPagina + 1;
  const ate = Math.min(o.total, o.pagina * o.porPagina);
  return `
<nav class="fe2-page" aria-label="Paginação">
  <p class="fe2-page-info" aria-live="polite">${de}–${ate} de ${milhar(o.total)} ${esc(o.rotulo)}</p>
  <div class="fe2-page-acts">
    <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-pagina="${o.pagina - 1}"${o.pagina <= 1 ? " disabled" : ""}>Anterior</button>
    <span class="fe2-page-num">Página ${o.pagina} de ${paginas}</span>
    <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-pagina="${o.pagina + 1}"${o.pagina >= paginas ? " disabled" : ""}>Próxima</button>
  </div>
</nav>`;
};

/* --------------------------- gráfico de colunas -------------------------- */
/**
 * Colunas com rótulo, valor acessível e eixo. Mais legível que `barras`
 * quando o valor importa (adesão, receita) — e devolve uma tabela escondida
 * para leitor de tela.
 */
export const colunas = (o: {
  itens: { rotulo: string; valor: number; texto: string; tom?: Nivel }[];
  titulo: string; max?: number; altura?: number;
}): string => {
  const max = o.max ?? Math.max(1, ...o.itens.map((i) => i.valor));
  const h = o.altura ?? 128;
  const cor = (t?: Nivel) =>
    t === "risco" ? "var(--danger-500)" : t === "atencao" ? "var(--amber-500)" : "var(--leaf-500)";
  return `
<div class="fe2-cols" style="--fe2-col-h:${h}px">
  ${o.itens.map((i) => `
  <div class="fe2-col">
    <span class="fe2-col-v">${esc(i.texto)}</span>
    <span class="fe2-col-track"><i style="height:${Math.max(3, (i.valor / max) * 100).toFixed(1)}%;background:${cor(i.tom)}"></i></span>
    <span class="fe2-col-l">${esc(i.rotulo)}</span>
  </div>`).join("")}
</div>
<table class="fe2-sr">
  <caption>${esc(o.titulo)}</caption>
  <tbody>${o.itens.map((i) => `<tr><th scope="row">${esc(i.rotulo)}</th><td>${esc(i.texto)}</td></tr>`).join("")}</tbody>
</table>`;
};

/* ------------------------------ lista chave/valor ------------------------ */
export const chaveValor = (itens: { k: string; v: string }[]): string => `
<dl class="fe2-kv">
  ${itens.map((i) => `<div><dt>${esc(i.k)}</dt><dd>${i.v}</dd></div>`).join("")}
</dl>`;

/* ----------------------------- estilos da área --------------------------- */
/**
 * CSS exclusivo das telas de FE-2. Fica aqui porque `web/app.css` é do
 * executor; usa só os tokens que a landing já define.
 */
export const estilosFE2 = `<style>
.fe2-bar { display:flex; flex-wrap:wrap; gap:var(--sp-3); align-items:flex-end; }
.fe2-bar .field { margin:0 !important; flex:0 1 13rem; min-width:0; }
.fe2-bar .field.fe2-grow { flex:1 1 18rem; }
.fe2-bar .field .input { height:46px; }
.fe2-bar .field-error:empty { display:none; }
.fe2-bar-end { margin-left:auto; display:flex; gap:var(--sp-2); align-items:center; flex-wrap:wrap; }
.fe2-tap { min-height:44px; }
.fe2-acts { display:flex; gap:.25rem; justify-content:flex-end; flex-wrap:nowrap; }
.fe2-acts .btn { padding-inline:.75rem; }
.fe2-btn-danger { --btn-bg:var(--danger-600); --btn-fg:var(--white); }
.fe2-btn-danger:hover { background:#B93A33; }
.fe2-code { font-family:var(--font-mono); font-size:var(--fs-xs); background:var(--ink-100); border-radius:var(--r-xs); padding:1px 5px; }
.fe2-sr { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }

/* assentos */
.fe2-seats { background:var(--bg-soft); border:1px solid var(--border-subtle); border-radius:var(--r-md); padding:.75rem .875rem; min-width:14rem; }
.fe2-seats-top { display:flex; align-items:center; gap:.5rem; justify-content:space-between; }
.fe2-seats-label { font-size:var(--fs-2xs); font-weight:var(--fw-bold); letter-spacing:var(--ls-wide); text-transform:uppercase; color:var(--ink-500); }
.fe2-seats-num { font-size:var(--fs-sm); color:var(--text-muted); margin-top:.25rem; }
.fe2-seats-num b { font-size:1.125rem; font-weight:var(--fw-black); color:var(--text); font-variant-numeric:tabular-nums; }
.fe2-seats .bar { margin-top:.5rem; height:6px; }

/* colunas */
.fe2-cols { display:flex; align-items:flex-end; gap:.375rem; margin-top:var(--sp-4); }
.fe2-col { flex:1 1 0; min-width:0; display:grid; gap:.25rem; justify-items:center; }
.fe2-col-v { font-size:10px; font-weight:var(--fw-bold); color:var(--ink-600); font-variant-numeric:tabular-nums; white-space:nowrap; }
.fe2-col-track { width:100%; height:var(--fe2-col-h); background:var(--ink-100); border-radius:var(--r-xs); display:flex; align-items:flex-end; overflow:hidden; }
.fe2-col-track > i { display:block; width:100%; border-radius:var(--r-xs); }
.fe2-col-l { font-size:10px; color:var(--ink-500); white-space:nowrap; }

/* chave/valor */
.fe2-kv { display:grid; gap:.625rem 1.25rem; grid-template-columns:repeat(auto-fit,minmax(9rem,1fr)); }
.fe2-kv dt { font-size:var(--fs-2xs); font-weight:var(--fw-bold); letter-spacing:var(--ls-wide); text-transform:uppercase; color:var(--ink-500); }
.fe2-kv dd { font-size:var(--fs-sm); font-weight:var(--fw-semi); margin-top:2px; }

/* motivo em texto, dentro da tabela */
.fe2-reason { display:block; font-size:var(--fs-sm); }
.fe2-reason small { display:block; color:var(--text-soft); font-size:var(--fs-xs); margin-top:1px; }
.fe2-mini { display:flex; align-items:center; gap:.5rem; }
.fe2-mini .bar { margin:0; width:56px; height:6px; flex:none; }
.fe2-mini b { font-variant-numeric:tabular-nums; font-weight:var(--fw-semi); min-width:2.75rem; }

/* diálogo */
.fe2-modal { border:0; padding:0; background:transparent; max-width:none; max-height:none; width:100%; height:100%; }
.fe2-modal::backdrop { background:rgba(7,31,21,.46); backdrop-filter:blur(2px); }
.fe2-modal-in {
  background:var(--white); border-radius:var(--r-xl); box-shadow:var(--sh-xl);
  width:min(34rem, calc(100vw - 1.5rem)); margin:auto; padding:var(--sp-6);
  position:absolute; inset:0; height:max-content; max-height:calc(100vh - 2rem); overflow:auto;
}
.fe2-modal-in h2 { font-size:var(--fs-h4); font-weight:var(--fw-black); letter-spacing:-0.02em; }
.fe2-modal-text { margin-top:.5rem; font-size:var(--fs-sm); color:var(--text-muted); }
.fe2-modal-in .field:first-of-type { margin-top:var(--sp-5); }
.fe2-modal-err { display:none; margin-top:var(--sp-4); font-size:var(--fs-sm); color:var(--danger-600); font-weight:var(--fw-semi); }
.fe2-modal-err.is-on { display:block; }
.fe2-modal-acts { display:flex; gap:.5rem; justify-content:flex-end; margin-top:var(--sp-6); flex-wrap:wrap; }
.fe2-modal-acts .btn { flex:1 1 auto; }
@media (min-width:480px) { .fe2-modal-acts .btn { flex:0 0 auto; } }

/* abas de cadastro */
.fe2-tabs { display:flex; gap:.25rem; background:var(--ink-50); border-radius:var(--r-pill); padding:4px; margin-top:var(--sp-5); }
.fe2-tabs button { flex:1; min-height:40px; border-radius:var(--r-pill); font-size:var(--fs-sm); font-weight:var(--fw-semi); color:var(--ink-600); }
.fe2-tabs button[aria-selected="true"] { background:var(--white); color:var(--leaf-800); box-shadow:var(--sh-xs); }
.fe2-tabs button:focus-visible { outline:none; box-shadow:var(--sh-focus); }
.fe2-panel[hidden] { display:none; }

/* prévia da importação */
.fe2-prev { margin-top:var(--sp-4); border:1px solid var(--border-subtle); border-radius:var(--r-md); overflow:hidden; }
.fe2-prev-head { display:flex; gap:.75rem; flex-wrap:wrap; align-items:center; padding:.625rem .75rem; background:var(--bg-soft); font-size:var(--fs-sm); font-weight:var(--fw-semi); }
.fe2-prev-list { max-height:15rem; overflow:auto; }
.fe2-prev-row { display:flex; gap:.625rem; align-items:baseline; padding:.5rem .75rem; border-top:1px solid var(--border-subtle); font-size:var(--fs-sm); }
.fe2-prev-row .ln { font-variant-numeric:tabular-nums; color:var(--ink-400); font-size:var(--fs-xs); min-width:1.75rem; }
.fe2-prev-row .nm { font-weight:var(--fw-semi); }
.fe2-prev-row .em { color:var(--text-soft); font-size:var(--fs-xs); word-break:break-all; }
.fe2-prev-row .wh { margin-left:auto; flex:none; }
.fe2-prev-row.is-bad { background:#FDF4F3; }

/* anotações clínicas */
.fe2-notes { display:grid; gap:.75rem; margin-top:var(--sp-4); }
.fe2-note { background:var(--bg-soft); border:1px solid var(--border-subtle); border-left:3px solid var(--leaf-400); border-radius:var(--r-sm); padding:.75rem .875rem; }
.fe2-note p { font-size:var(--fs-sm); line-height:var(--lh-body); white-space:pre-wrap; }
.fe2-note-foot { margin-top:.375rem; font-size:var(--fs-xs); color:var(--text-soft); }

/* cabeçalho de ficha */
.fe2-head { display:flex; gap:var(--sp-4); align-items:flex-start; flex-wrap:wrap; }
.fe2-head .avatar { width:52px; height:52px; font-size:var(--fs-sm); flex:none; }
.fe2-head-id { min-width:0; flex:1 1 12rem; }
.fe2-head-id h2 { font-size:var(--fs-h4); font-weight:var(--fw-black); letter-spacing:-0.02em; }
.fe2-head-id p { font-size:var(--fs-sm); color:var(--text-soft); word-break:break-all; }
.fe2-head-acts { display:flex; gap:.5rem; flex-wrap:wrap; margin-left:auto; }

/* detalhe em linha (auditoria, erro de IA) */
.fe2-det summary { cursor:pointer; font-size:var(--fs-xs); font-weight:var(--fw-semi); color:var(--leaf-700); min-height:24px; }
.fe2-det summary:focus-visible { outline:none; box-shadow:var(--sh-focus); border-radius:var(--r-xs); }
.fe2-det pre { margin-top:.375rem; font-family:var(--font-mono); font-size:11px; line-height:1.5; background:var(--ink-50); border-radius:var(--r-xs); padding:.5rem .625rem; max-width:34rem; overflow:auto; white-space:pre-wrap; word-break:break-word; }
.fe2-err-msg { font-family:var(--font-mono); font-size:11px; color:var(--danger-600); word-break:break-word; display:block; max-width:28rem; }

/* paginação */
.fe2-page { display:flex; align-items:center; gap:var(--sp-3); flex-wrap:wrap; margin-top:var(--sp-4); padding-top:var(--sp-4); border-top:1px solid var(--border-subtle); }
.fe2-page-info { font-size:var(--fs-sm); color:var(--text-muted); }
.fe2-page-acts { margin-left:auto; display:flex; align-items:center; gap:.5rem; }
.fe2-page-num { font-size:var(--fs-xs); color:var(--text-soft); font-variant-numeric:tabular-nums; }

/* faixas de resumo */
.fe2-strip { display:grid; gap:var(--sp-3); grid-template-columns:repeat(auto-fit,minmax(10rem,1fr)); }
.fe2-strip > div { background:var(--bg-soft); border-radius:var(--r-md); padding:.75rem .875rem; }
.fe2-strip dt { font-size:var(--fs-2xs); font-weight:var(--fw-bold); letter-spacing:var(--ls-wide); text-transform:uppercase; color:var(--ink-500); }
.fe2-strip dd { font-size:1.25rem; font-weight:var(--fw-black); letter-spacing:-0.03em; margin-top:.125rem; font-variant-numeric:tabular-nums; }
.fe2-strip dd small { font-size:var(--fs-xs); font-weight:var(--fw-regular); color:var(--text-soft); display:block; letter-spacing:0; }

/* repartição por tipo */
.fe2-split { display:grid; gap:.625rem; margin-top:var(--sp-2); }
.fe2-split-row { display:grid; grid-template-columns:minmax(7rem,auto) 1fr auto; gap:.625rem; align-items:center; font-size:var(--fs-sm); }
.fe2-split-row b { font-variant-numeric:tabular-nums; font-weight:var(--fw-semi); }
.fe2-split-row .bar { margin:0; height:8px; }
</style>`;
