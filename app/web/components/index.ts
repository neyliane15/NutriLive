/* =========================================================================
   Peças compartilhadas das telas. Devolvem string de HTML.
   Dono: executor. Agentes de front usam, não editam.
   ========================================================================= */

export const esc = (s: unknown): string =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const brl = (cents: number): string =>
  "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dataBR = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export const dataHoraBR = (iso: string | null | undefined): string =>
  iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

export const iniciais = (nome: string): string =>
  nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0] ?? "").join("").toUpperCase();

/* ------------------------------- métrica -------------------------------- */
export const metric = (o: {
  label: string; value: string; unit?: string; foot?: string;
  trend?: { dir: "up" | "down"; text: string }; fill?: number; deep?: boolean;
}) => `
<div class="metric${o.deep ? " is-deep" : ""}">
  <div class="metric-label">${esc(o.label)}</div>
  <div class="metric-value">${esc(o.value)}${o.unit ? `<small> ${esc(o.unit)}</small>` : ""}</div>
  ${o.fill !== undefined ? `<div class="bar${o.deep ? " on-deep" : ""}"><i style="width:${Math.max(0, Math.min(100, o.fill))}%"></i></div>` : ""}
  ${o.foot || o.trend ? `<div class="metric-foot">${o.trend ? `<span class="metric-trend ${o.trend.dir}">${esc(o.trend.text)}</span> ` : ""}${esc(o.foot ?? "")}</div>` : ""}
</div>`;

/* -------------------------------- painel -------------------------------- */
export const panel = (o: { title?: string; sub?: string; action?: string; body: string; id?: string }) => `
<section class="panel"${o.id ? ` id="${o.id}"` : ""}>
  ${o.title ? `<div class="panel-head">
    <h2>${esc(o.title)}</h2>
    ${o.sub ? `<span class="panel-sub">${esc(o.sub)}</span>` : ""}
    ${o.action ? `<span class="panel-action">${o.action}</span>` : ""}
  </div>` : ""}
  ${o.body}
</section>`;

/* -------------------------------- tabela -------------------------------- */
export const table = (o: { cols: { label: string; align?: "right" }[]; rows: string[]; minWidth?: number }) => `
<div class="table-wrap">
  <table class="data"${o.minWidth ? ` style="min-width:${o.minWidth}px"` : ""}>
    <thead><tr>${o.cols.map((c) => `<th${c.align === "right" ? ' class="num"' : ""}>${esc(c.label)}</th>`).join("")}</tr></thead>
    <tbody>${o.rows.join("")}</tbody>
  </table>
</div>`;

export const pessoa = (nome: string, sub?: string) => `
<span class="cell-person">
  <span class="avatar avatar-sm" aria-hidden="true">${esc(iniciais(nome))}</span>
  <span><b>${esc(nome)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span>
</span>`;

/* --------------------------------- pill --------------------------------- */
export const pill = (texto: string, tom: "ok" | "atencao" | "risco" | "neutro" = "neutro") =>
  `<span class="pill ${tom}">${esc(texto)}</span>`;

/* --------------------------------- vazio -------------------------------- */
export const vazio = (o: { titulo: string; texto: string; acao?: string; icone?: string }) => `
<div class="empty">
  <span class="icon-tile" aria-hidden="true">${o.icone ?? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M4 20c0-9 6-15 16-15 0 10-6 15-16 15Z"/></svg>`}</span>
  <h3>${esc(o.titulo)}</h3>
  <p>${esc(o.texto)}</p>
  ${o.acao ?? ""}
</div>`;

/* --------------------------------- campo -------------------------------- */
export const campo = (o: {
  id: string; label: string; type?: string; placeholder?: string;
  value?: string; hint?: string; autocomplete?: string; inputmode?: string;
  maxlength?: number; required?: boolean; options?: { value: string; label: string }[];
  rows?: number;
}) => {
  const comum = `id="${o.id}" name="${o.id}" class="input"` +
    (o.placeholder ? ` placeholder="${esc(o.placeholder)}"` : "") +
    (o.autocomplete ? ` autocomplete="${o.autocomplete}"` : "") +
    (o.inputmode ? ` inputmode="${o.inputmode}"` : "") +
    (o.maxlength ? ` maxlength="${o.maxlength}"` : "") +
    ` aria-describedby="err-${o.id}"`;
  const controle = o.options
    ? `<select ${comum}>${o.options.map((op) => `<option value="${esc(op.value)}"${op.value === o.value ? " selected" : ""}>${esc(op.label)}</option>`).join("")}</select>`
    : o.rows
    ? `<textarea ${comum} rows="${o.rows}">${esc(o.value ?? "")}</textarea>`
    : `<input ${comum} type="${o.type ?? "text"}" value="${esc(o.value ?? "")}">`;
  return `
<div class="field" data-field="${o.id}">
  <label class="field-label" for="${o.id}">${esc(o.label)}${o.required === false ? ' <span class="soft">(opcional)</span>' : ""}</label>
  ${controle}
  ${o.hint ? `<span class="field-hint">${esc(o.hint)}</span>` : ""}
  <span class="field-error" id="err-${o.id}" role="alert"></span>
</div>`;
};

/* ------------------------------ mini gráfico ---------------------------- */
export const sparkline = (pontos: number[], o?: { cor?: string; altura?: number }) => {
  if (pontos.length < 2) return "";
  const w = 240, h = o?.altura ?? 56, cor = o?.cor ?? "var(--leaf-500)";
  const max = Math.max(...pontos), min = Math.min(...pontos), span = max - min || 1;
  const pts = pontos.map((p, i) => [(i / (pontos.length - 1)) * w, h - 6 - ((p - min) / span) * (h - 14)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0]!.toFixed(1)},${p[1]!.toFixed(1)}`).join("");
  const last = pts[pts.length - 1]!;
  return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" style="width:100%;height:${h}px;display:block" aria-hidden="true">
    <path d="${d}L${w},${h}L0,${h}Z" fill="${cor}" opacity=".12"/>
    <path d="${d}" fill="none" stroke="${cor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${last[0]!.toFixed(1)}" cy="${last[1]!.toFixed(1)}" r="3.2" fill="${cor}"/>
  </svg>`;
};

export const barras = (valores: number[], rotulos?: string[], cor = "var(--leaf-500)") => {
  const max = Math.max(...valores, 1);
  return `<div style="display:flex;align-items:flex-end;gap:5px;height:84px;margin-top:.75rem" aria-hidden="true">
    ${valores.map((v, i) => `<span style="flex:1;display:grid;gap:4px;align-content:end">
      <i style="display:block;height:${Math.max(6, (v / max) * 72)}px;background:${cor};opacity:${(0.45 + 0.55 * (v / max)).toFixed(2)};border-radius:4px 4px 2px 2px"></i>
      ${rotulos?.[i] ? `<small style="font-size:10px;color:var(--ink-500);text-align:center">${esc(rotulos[i])}</small>` : ""}
    </span>`).join("")}
  </div>`;
};
