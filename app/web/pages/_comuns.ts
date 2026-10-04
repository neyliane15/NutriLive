/* =========================================================================
   Peças comuns das telas do app pessoal (dono: FE-1).
   Só o que as minhas telas usam e não existe em web/components.
   Nada aqui conhece o servidor: tudo é string de HTML.
   ========================================================================= */
import { esc } from "../components/index.js";

/* ------------------------------- ícones --------------------------------- */
const TRACOS: Record<string, string> = {
  chama: `<path d="M12 2.9c4 4 6 6.7 6 10a6 6 0 0 1-12 0c0-2.2 1-4.1 2.6-5.7.2 1.7.9 2.7 2 3.1.9-1.8.6-4.5 1.4-7.4Z"/>`,
  gota: `<path d="M12 3.1c3.6 4 5.6 6.9 5.6 9.7a5.6 5.6 0 0 1-11.2 0c0-2.8 2-5.7 5.6-9.7Z"/>`,
  prato: `<circle cx="12" cy="12" r="8.4"/><circle cx="12" cy="12" r="3.4"/>`,
  relogio: `<circle cx="12" cy="12" r="8.6"/><path d="M12 7.3V12l3.2 2"/>`,
  balanca: `<path d="M6.4 20.6h11.2a1.6 1.6 0 0 0 1.6-1.8l-1-9.4H5.8l-1 9.4a1.6 1.6 0 0 0 1.6 1.8Z"/><path d="M9.2 6.3a2.9 2.9 0 0 1 5.6 0"/><path d="M12 9.4v3.2"/>`,
  fita: `<rect x="2.8" y="8.6" width="18.4" height="6.8" rx="2.2"/><path d="M7 8.6v2.4M10.5 8.6v3.4M14 8.6v2.4M17.5 8.6v3.4"/>`,
  mais: `<path d="M12 5.2v13.6M5.2 12h13.6"/>`,
  certo: `<path d="M4.8 12.6 9.3 17l9.9-10"/>`,
  faisca: `<path d="M12 3.2 13.6 8l4.8 1.6-4.8 1.6L12 16l-1.6-4.8L5.6 9.6 10.4 8z"/><path d="M18.6 15.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>`,
  seta: `<path d="M5 12h14M13 6l6 6-6 6"/>`,
  alerta: `<circle cx="12" cy="12" r="9"/><path d="M12 7.6v5M12 15.9v.6"/>`,
  cadeado: `<rect x="4.6" y="10.4" width="14.8" height="10" rx="2.4"/><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6"/>`
};

export const ic = (nome: string, t = 20): string =>
  `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRACOS[nome] ?? ""}</svg>`;

/* ------------------------- número em português -------------------------- */
export const num = (v: number, casas = 0): string =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

export const pct = (parte: number, total: number): number =>
  total > 0 ? Math.max(0, Math.min(100, Math.round((parte / total) * 100))) : 0;

/* ------------------------------ anel do dia ------------------------------ */
/** Mesmo desenho do mockup da landing: anel com o número dentro. */
export const anel = (score: number, tamanho = 108): string => {
  const r = 15.5;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, score));
  return `<svg class="nl-anel" viewBox="0 0 40 40" width="${tamanho}" height="${tamanho}" role="img"
    aria-label="Score do dia: ${p} de 100">
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="3.6"/>
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="var(--lime-300)" stroke-width="3.6" stroke-linecap="round"
      stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${(c * (1 - p / 100)).toFixed(2)}" transform="rotate(-90 20 20)"/>
    <text x="20" y="21.6" text-anchor="middle" font-size="12.6" font-weight="800" letter-spacing="-0.04em" fill="#fff">${p}</text>
    <text x="20" y="27.4" text-anchor="middle" font-size="5.2" font-weight="700" letter-spacing="0.05em" fill="rgba(255,255,255,.66)">/100</text>
  </svg>`;
};

/* ------------------------------- carregando ------------------------------ */
export const carregando = (texto = "Carregando…"): string =>
  `<p class="loading" role="status">${esc(texto)}</p>`;

/** Esqueleto de cartão, para o primeiro desenho da tela sem dados. */
export const esqueleto = (linhas = 3): string =>
  `<div class="nl-esqueleto" aria-hidden="true">${Array.from({ length: linhas })
    .map((_, i) => `<span class="skeleton" style="width:${[92, 68, 80, 56][i % 4]}%"></span>`)
    .join("")}</div>`;

/* ------------------------- aviso de indisponível ------------------------ */
/** Degradação elegante: o endpoint respondeu 503 e a tela continua de pé. */
export const indisponivel = (o: { titulo: string; texto: string; recarrega?: boolean }): string => `
<div class="notice notice-amber" role="status">
  ${ic("alerta")}
  <span>
    <b>${esc(o.titulo)}</b><br>${esc(o.texto)}
    ${o.recarrega === false ? "" : `<br><button class="link" type="button" data-nl="recarregar">Tentar de novo</button>`}
  </span>
</div>`;

/* ----------------------------- grupo de opções -------------------------- */
/** Rádios de verdade com cara de chip. Alvo de toque de 44px. */
export const opcoes = (o: {
  nome: string; legenda: string; itens: { valor: string; rotulo: string }[];
  valor?: string; escondeLegenda?: boolean;
}): string => `
<fieldset class="nl-opcoes" data-opcoes="${esc(o.nome)}">
  <legend class="${o.escondeLegenda ? "sr-only" : "field-label"}">${esc(o.legenda)}</legend>
  <div class="nl-opcoes-lista">
    ${o.itens.map((i) => `<label class="nl-opcao">
      <input type="radio" name="${esc(o.nome)}" value="${esc(i.valor)}"${i.valor === o.valor ? " checked" : ""}>
      <span>${esc(i.rotulo)}</span>
    </label>`).join("")}
  </div>
</fieldset>`;

/* ------------------------------ linha de item --------------------------- */
export const linha = (o: {
  titulo: string; sub?: string; meta?: string; marcada?: boolean;
  caixa?: { nome: string; valor: string }; icone?: string;
}): string => {
  const corpo = `<span class="nl-linha-corpo"><b>${esc(o.titulo)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ""}</span>
    ${o.meta ? `<span class="nl-linha-meta">${esc(o.meta)}</span>` : ""}`;
  if (o.caixa) {
    return `<li class="nl-linha"><label class="nl-marcar">
      <input type="checkbox" name="${esc(o.caixa.nome)}" value="${esc(o.caixa.valor)}"${o.marcada ? " checked" : ""}>
      <span class="nl-tick" aria-hidden="true">${ic("certo", 14)}</span>
      ${corpo}
    </label></li>`;
  }
  return `<li class="nl-linha">${o.icone ? `<span class="nl-linha-icone" aria-hidden="true">${o.icone}</span>` : ""}${corpo}</li>`;
};

/* ============================== estilos ================================= */
/* As telas do app pessoal trazem o próprio CSS porque app.css é do executor.
   Tudo com prefixo nl- para não colidir com nada da landing.               */
export const estilos = (): string => `<style>
.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}

/* ---- herói do dia ---- */
.nl-heroi{background:linear-gradient(148deg,var(--leaf-600),var(--leaf-800));color:var(--text-on-deep);
  border-radius:var(--r-xl);padding:var(--sp-5);display:grid;gap:var(--sp-5)}
@media(min-width:560px){.nl-heroi{padding:var(--sp-6)}}
.nl-heroi-topo{display:flex;align-items:center;gap:var(--sp-4);justify-content:space-between}
.nl-heroi-ola{font-size:var(--fs-xs);font-weight:var(--fw-bold);letter-spacing:var(--ls-wide);
  text-transform:uppercase;color:rgba(234,246,238,.74)}
.nl-heroi-titulo{font-size:var(--fs-h3);font-weight:var(--fw-black);letter-spacing:-0.028em;margin-top:.25rem;color:#fff}
.nl-heroi-nota{margin-top:.5rem;font-size:var(--fs-sm);color:var(--text-on-deep-muted);max-width:30ch}
.nl-anel{flex:none}

.nl-chips{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}
@media(min-width:720px){.nl-chips{grid-template-columns:repeat(4,minmax(0,1fr))}}
.nl-chip{display:flex;align-items:center;gap:.5rem;background:rgba(255,255,255,.12);
  border:1px solid rgba(255,255,255,.14);border-radius:var(--r-md);padding:.625rem .75rem;min-height:56px}
.nl-chip > span:first-child{flex:none;width:30px;height:30px;border-radius:9px;display:grid;place-items:center;
  background:rgba(169,221,92,.2);color:var(--lime-300)}
.nl-chip b{display:block;font-size:var(--fs-sm);font-weight:var(--fw-bold);color:#fff;font-variant-numeric:tabular-nums}
.nl-chip small{display:block;font-size:11px;color:rgba(234,246,238,.72)}

/* ---- listas ---- */
.nl-lista{list-style:none;display:grid;gap:2px;margin:0;padding:0}
.nl-linha{display:flex;align-items:center;gap:.75rem;padding:.75rem .25rem;border-top:1px solid var(--border-subtle);
  min-height:56px}
.nl-lista > .nl-linha:first-child{border-top:0}
.nl-linha-corpo{flex:1;min-width:0}
.nl-linha-corpo b{display:block;font-size:var(--fs-sm);font-weight:var(--fw-semi);letter-spacing:-0.008em}
.nl-linha-corpo small{display:block;font-size:var(--fs-xs);color:var(--text-soft);margin-top:2px;line-height:1.45}
.nl-linha-meta{flex:none;font-size:var(--fs-sm);color:var(--text-muted);font-variant-numeric:tabular-nums}
.nl-linha-icone{flex:none;width:36px;height:36px;border-radius:11px;background:var(--leaf-100);color:var(--leaf-700);
  display:grid;place-items:center}

/* marcar/desmarcar item */
.nl-marcar{display:flex;align-items:center;gap:.75rem;flex:1;min-height:44px;cursor:pointer;padding:.125rem 0}
.nl-marcar input{position:absolute;opacity:0;width:0;height:0}
.nl-tick{flex:none;width:24px;height:24px;border-radius:7px;border:1.5px solid var(--border-control);
  display:grid;place-items:center;color:transparent;background:var(--white);
  transition:background-color var(--dur-2) var(--ease-out),border-color var(--dur-2) var(--ease-out)}
.nl-marcar input:checked + .nl-tick{background:var(--leaf-600);border-color:var(--leaf-600);color:#fff}
.nl-marcar input:focus-visible + .nl-tick{box-shadow:var(--sh-focus)}
.nl-marcar input:checked ~ .nl-linha-corpo b{text-decoration:line-through;color:var(--text-soft);font-weight:var(--fw-regular)}

/* ---- opções em chip ---- */
.nl-opcoes{border:0;padding:0;margin:0}
.nl-opcoes-lista{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:.4375rem}
.nl-opcao{position:relative;display:inline-flex}
.nl-opcao input{position:absolute;opacity:0;width:0;height:0}
.nl-opcao > span{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 1rem;
  border:1.5px solid var(--border-control);border-radius:var(--r-pill);background:var(--white);
  font-size:var(--fs-sm);font-weight:var(--fw-semi);color:var(--ink-700);cursor:pointer;white-space:nowrap;
  transition:background-color var(--dur-2) var(--ease-out),border-color var(--dur-2) var(--ease-out),color var(--dur-2) var(--ease-out)}
.nl-opcao > span:hover{border-color:var(--leaf-400);background:var(--leaf-50)}
.nl-opcao input:checked + span{background:var(--leaf-600);border-color:var(--leaf-600);color:#fff}
.nl-opcao input:focus-visible + span{box-shadow:var(--sh-focus)}

/* ---- caixas de seleção em grade (restrições) ---- */
.nl-caixas{display:grid;gap:.5rem;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-top:.4375rem}
.nl-caixa{display:flex;align-items:center;gap:.625rem;min-height:48px;padding:.5rem .875rem;cursor:pointer;
  border:1.5px solid var(--border-control);border-radius:var(--r-md);background:var(--white);font-size:var(--fs-sm)}
.nl-caixa input{position:absolute;opacity:0;width:0;height:0}
.nl-caixa:has(input:checked){border-color:var(--leaf-600);background:var(--leaf-50);color:var(--leaf-800);font-weight:var(--fw-semi)}
.nl-caixa:has(input:focus-visible){box-shadow:var(--sh-focus)}

/* ---- abas de dia ---- */
.nl-dias{display:flex;gap:.375rem;overflow-x:auto;padding-bottom:.25rem;margin-bottom:var(--sp-4);
  scrollbar-width:none;-webkit-overflow-scrolling:touch}
.nl-dias::-webkit-scrollbar{display:none}
.nl-dia{flex:none;min-height:44px;padding:0 .9375rem;border-radius:var(--r-pill);border:1.5px solid var(--border-subtle);
  background:var(--white);font-size:var(--fs-sm);font-weight:var(--fw-semi);color:var(--ink-600);
  display:inline-flex;align-items:center;cursor:pointer}
.nl-dia[aria-selected="true"]{background:var(--leaf-700);border-color:var(--leaf-700);color:#fff}
.nl-dia:focus-visible{box-shadow:var(--sh-focus);outline:none}

/* ---- espera de geração ---- */
.nl-espera{display:grid;gap:var(--sp-4);padding:var(--sp-6) var(--sp-2);text-align:center;justify-items:center}
.nl-espera-giro{width:44px;height:44px;border-radius:50%;border:3px solid var(--leaf-100);
  border-top-color:var(--leaf-600);animation:nl-spin .9s linear infinite}
.nl-espera h3{font-size:var(--fs-h4);font-weight:var(--fw-bold)}
.nl-espera p{font-size:var(--fs-sm);color:var(--text-muted);max-width:40ch}
.nl-passos{list-style:none;display:grid;gap:.5rem;text-align:left;font-size:var(--fs-sm);margin:0;padding:0;
  width:min(22rem,100%)}
.nl-passos li{display:flex;align-items:center;gap:.625rem;color:var(--text-soft)}
.nl-passos li::before{content:"";width:18px;height:18px;flex:none;border-radius:50%;border:2px solid var(--ink-200)}
.nl-passos li[data-estado="indo"]{color:var(--text);font-weight:var(--fw-semi)}
.nl-passos li[data-estado="indo"]::before{border-color:var(--leaf-500);border-top-color:transparent;animation:nl-spin .9s linear infinite}
.nl-passos li[data-estado="feito"]{color:var(--leaf-700)}
.nl-passos li[data-estado="feito"]::before{border-color:var(--leaf-600);background:var(--leaf-600)}
@media(prefers-reduced-motion:reduce){
  .nl-espera-giro,.nl-passos li[data-estado="indo"]::before{animation:none}
  .nl-espera-giro{border-top-color:var(--leaf-300)}
}

/* ---- esqueleto ---- */
.nl-esqueleto{display:grid;gap:.625rem;padding:var(--sp-2) 0}
.nl-esqueleto .skeleton{height:14px;display:block}
@media(prefers-reduced-motion:reduce){.skeleton{animation:none}}

/* ---- utilidades das minhas telas ---- */
.nl-grade-2{display:grid;gap:var(--sp-5)}
@media(min-width:900px){.nl-grade-2{grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start}}
.nl-grade-2 > div > .panel:first-child{margin-top:0}
.nl-pares{display:grid;gap:var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr))}
.nl-acoes{display:flex;flex-wrap:wrap;gap:.5rem;margin-top:var(--sp-4)}
.nl-acoes .btn{flex:1 1 auto;min-width:8.5rem}
.nl-cta{margin-top:var(--sp-5)}
.nl-oculto[hidden]{display:none}
.nl-forte{font-size:var(--fs-h3);font-weight:var(--fw-black);letter-spacing:-0.035em;font-variant-numeric:tabular-nums}
.nl-rotulo{font-size:var(--fs-xs);font-weight:var(--fw-semi);letter-spacing:var(--ls-wide);
  text-transform:uppercase;color:var(--ink-500)}
.nl-delta{font-size:var(--fs-sm);font-weight:var(--fw-bold)}
.nl-delta.desce{color:var(--leaf-600)}.nl-delta.sobe{color:var(--danger-600)}.nl-delta.igual{color:var(--text-soft)}
.nl-mapa{display:flex;gap:3px;margin-top:.75rem}
.nl-mapa span{flex:1;height:30px;border-radius:5px;background:var(--ink-100)}
.nl-mapa span[data-on="1"]{background:var(--leaf-500)}
.nl-mapa span[data-on="2"]{background:var(--leaf-200)}
.nl-legenda{margin-top:.5rem;font-size:var(--fs-xs);color:var(--text-soft)}
.nl-total{display:flex;align-items:baseline;justify-content:space-between;gap:var(--sp-3);
  padding-top:var(--sp-4);margin-top:var(--sp-2);border-top:1px solid var(--border-subtle)}
.nl-barra-senha-nota{font-size:var(--fs-xs);color:var(--text-soft);margin-top:.4375rem}
.nl-alerta{display:none;gap:.625rem;align-items:flex-start;margin-top:var(--sp-4);padding:.875rem 1rem;
  border-radius:var(--r-md);background:var(--danger-100);border:1px solid #F6D2D0;color:#8E211C;font-size:var(--fs-sm)}
.nl-alerta[data-cheio="1"]{display:flex}
.nl-alerta svg{flex:none;color:var(--danger-600);margin-top:1px}
.nl-ok-caixa{display:grid;gap:var(--sp-4);justify-items:center;text-align:center}
.nl-ok-caixa .icon-tile{width:52px;height:52px}
.nl-regras{list-style:none;display:grid;gap:.375rem;margin:.75rem 0 0;padding:0;font-size:var(--fs-xs);color:var(--text-soft)}
.nl-regras li{display:flex;align-items:center;gap:.4375rem}
.nl-regras li::before{content:"";width:14px;height:14px;border-radius:50%;border:1.5px solid var(--ink-300);flex:none}
.nl-regras li[data-ok="1"]{color:var(--leaf-700);font-weight:var(--fw-medium)}
.nl-regras li[data-ok="1"]::before{border-color:var(--leaf-600);background:var(--leaf-600)}
</style>`;
