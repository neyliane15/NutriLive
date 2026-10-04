/* =========================================================================
   Tela: Lista de compras da semana.
   A lista vem do plano ativo, agrupada por seção de mercado — na ordem em
   que a pessoa anda no supermercado. Marcar e desmarcar é otimista: o item
   risca na hora e, se a API recusar, volta como estava.
   Dados: GET /api/me/shopping-list        (contract.me.shoppingList)
   Ação:  PATCH /api/me/shopping-list      (contract.me.toggleShoppingItem)
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { brl, esc, panel, vazio } from "../components/index.js";
import { esqueleto, estilos, ic, indisponivel, linha, num } from "./_comuns.js";

export type ItemCompra = { group: string; name: string; qty: string; cents: number; done: boolean };

export type ListaDeCompras = {
  id: string | null;
  /** "aaaa-mm-dd" da segunda-feira da semana. */
  weekStart: string;
  estimatedCents: number;
  items: ItemCompra[];
};

export type DadosCompras = {
  usuario: ShellUser;
  /** null quando GET /api/me/shopping-list não respondeu. */
  lista: ListaDeCompras | null;
  /** Se existe plano ativo — define o que o estado vazio oferece. */
  temPlano?: boolean;
  semServidor?: boolean;
};

/* ------------------------- seções de mercado ---------------------------- */
/** A ordem é a do corredor, não a alfabética: é assim que se faz a feira. */
export const ORDEM_SECOES = [
  "Hortifrúti", "Açougue e ovos", "Peixaria", "Laticínios",
  "Padaria", "Mercearia", "Bebidas", "Outros"
] as const;

const ICONE_SECAO: Record<string, string> = {
  "Hortifrúti": "folha",
  "Açougue e ovos": "carne",
  "Peixaria": "peixe",
  "Laticínios": "leite",
  "Padaria": "pao",
  "Mercearia": "lata",
  "Bebidas": "copo",
  "Outros": "sacola"
};

const TRACO_SECAO: Record<string, string> = {
  folha: `<path d="M20.4 3.6c.6 6.6-.6 11.4-3.8 14.4-3 2.9-7 3.6-11.8 2.5"/><path d="M4.8 20.5c1.6-6.8 5.6-11.2 11.8-13.3"/>`,
  carne: `<path d="M13.6 3.8a5.4 5.4 0 0 1 5.6 8.9c-1.6 1.6-3.6 2.1-5.2 2.3-1 .2-1.8 1-2 2a3.2 3.2 0 1 1-3.9-3.9c1-.2 1.8-1 2-2 .2-1.6.7-3.6 2.3-5.2a5.4 5.4 0 0 1 1.2-.9Z"/><path d="M9.3 14.7 4.6 19.4"/>`,
  peixe: `<path d="M3.2 12c2.8-3.4 6-5.1 9.4-5.1 3.2 0 6 1.7 7.6 5.1-1.6 3.4-4.4 5.1-7.6 5.1-3.4 0-6.6-1.7-9.4-5.1Z"/><path d="m20.2 12 1-3.2M20.2 12l1 3.2"/><circle cx="8.2" cy="11" r=".9"/>`,
  leite: `<path d="M8.6 2.8h6.8v3.1l2.3 3.6v11H6.3v-11l2.3-3.6z"/><path d="M6.3 12.9h11.4"/>`,
  pao: `<path d="M3.4 10.6c0-3.1 3.8-5.2 8.6-5.2s8.6 2.1 8.6 5.2c0 1.3-1 2-2.3 2.2v5.6a1.6 1.6 0 0 1-1.6 1.6H7.3a1.6 1.6 0 0 1-1.6-1.6v-5.6c-1.3-.2-2.3-.9-2.3-2.2Z"/><path d="M8.6 6v7M15.4 6v7"/>`,
  lata: `<rect x="6.2" y="3.4" width="11.6" height="17.2" rx="2.2"/><path d="M6.2 8.2h11.6M6.2 15.8h11.6"/>`,
  copo: `<path d="M6.4 4.4h11.2l-1.3 14.1a2 2 0 0 1-2 1.9H9.7a2 2 0 0 1-2-1.9z"/><path d="M6.9 10.3h10.2"/>`,
  sacola: `<path d="M5.4 7.6h13.2l1 12.6H4.4z"/><path d="M8.8 7.6V5.9a3.2 3.2 0 0 1 6.4 0v1.7"/>`
};

const icSecao = (secao: string, t = 18): string =>
  `<svg viewBox="0 0 24 24" width="${t}" height="${t}" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${TRACO_SECAO[ICONE_SECAO[secao] ?? "sacola"] ?? TRACO_SECAO["sacola"]}</svg>`;

/* ------------------------------ formatação ------------------------------ */
/** "2026-09-28" -> "28/09". Aceita ISO completo. */
export const diaCurto = (iso: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  return m ? `${m[3]}/${m[2]}` : "—";
};

export const semanaBR = (weekStart: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(weekStart ?? "");
  if (!m) return "Semana atual";
  const ini = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const fim = new Date(ini.getTime() + 6 * 86_400_000);
  const d = (x: Date) => String(x.getUTCDate()).padStart(2, "0") + "/" + String(x.getUTCMonth() + 1).padStart(2, "0");
  return `Semana de ${d(ini)} a ${d(fim)}`;
};

/* ------------------------- agrupar por seção ---------------------------- */
export type Grupo = { secao: string; itens: { item: ItemCompra; indice: number }[] };

/** Mantém o índice original de cada item: é ele que a API espera no PATCH. */
export function agrupar(itens: ItemCompra[]): Grupo[] {
  const mapa = new Map<string, { item: ItemCompra; indice: number }[]>();
  itens.forEach((item, indice) => {
    const secao = (item.group || "Outros").trim() || "Outros";
    const atual = mapa.get(secao);
    if (atual) atual.push({ item, indice });
    else mapa.set(secao, [{ item, indice }]);
  });
  const pos = (s: string) => {
    const i = (ORDEM_SECOES as readonly string[]).indexOf(s);
    return i === -1 ? ORDEM_SECOES.length : i;
  };
  return [...mapa.entries()]
    .map(([secao, itens]) => ({ secao, itens }))
    .sort((a, b) => pos(a.secao) - pos(b.secao) || a.secao.localeCompare(b.secao, "pt-BR"));
}

export const somaCentavos = (itens: ItemCompra[], soPendentes = false): number =>
  itens.reduce((s, i) => (soPendentes && i.done ? s : s + (i.cents || 0)), 0);

/* ------------------------------- pedaços -------------------------------- */
const grupoHTML = (g: Grupo): string => {
  const marcados = g.itens.filter((x) => x.item.done).length;
  return panel({
    body: `<div class="nl-secao-cab">
  <span class="nl-secao-icone" aria-hidden="true">${icSecao(g.secao, 20)}</span>
  <h2>${esc(g.secao)}</h2>
  <span class="panel-sub">${marcados} de ${g.itens.length} ${g.itens.length === 1 ? "item" : "itens"}</span>
</div>
<ul class="nl-lista">${g.itens
      .map((x) => linha({
        titulo: x.item.name,
        sub: x.item.qty,
        meta: brl(x.item.cents),
        marcada: x.item.done,
        caixa: { nome: "item", valor: String(x.indice) }
      }))
      .join("")}</ul>`
  });
};

const resumo = (l: ListaDeCompras): string => {
  const total = l.estimatedCents || somaCentavos(l.items);
  const falta = somaCentavos(l.items, true);
  const marcados = l.items.filter((i) => i.done).length;
  const cheio = l.items.length ? Math.round((marcados / l.items.length) * 100) : 0;
  return panel({
    id: "resumo-compras",
    title: semanaBR(l.weekStart),
    sub: `${l.items.length} ${l.items.length === 1 ? "item" : "itens"} na lista`,
    body: `
<div class="nl-pares" data-nl="numeros">
  <div>
    <p class="nl-rotulo">Total estimado</p>
    <p class="nl-forte" data-nl="total">${esc(brl(total))}</p>
  </div>
  <div>
    <p class="nl-rotulo">Falta comprar</p>
    <p class="nl-forte" data-nl="falta">${esc(brl(falta))}</p>
  </div>
  <div>
    <p class="nl-rotulo">No carrinho</p>
    <p class="nl-forte"><span data-nl="marcados">${marcados}</span> de ${l.items.length}</p>
  </div>
</div>
<div class="bar"><i data-nl="barra" style="width:${cheio}%"></i></div>
<p class="nl-legenda" data-nl="recado" role="status">${esc(recadoCompras(marcados, l.items.length))}</p>
<p class="nl-legenda">Preço estimado por média de mercado. O seu pode variar.</p>`
  });
};

export function recadoCompras(marcados: number, total: number): string {
  if (total === 0) return "Lista vazia.";
  if (marcados === 0) return "Nada no carrinho ainda. Comece pelo hortifrúti.";
  if (marcados >= total) return "Feira completa. Pode ir para o caixa.";
  return `Faltam ${total - marcados} ${total - marcados === 1 ? "item" : "itens"}.`;
}

const vazioComPlano = `
${vazio({
  titulo: "Sua lista desta semana ainda não foi montada",
  texto: "A gente lê o seu plano ativo e separa tudo por seção de mercado, com a quantidade e o preço estimado de cada item.",
  acao: `<button class="btn btn-primary btn-lg" type="button" data-nl="gerar-lista">${ic("faisca")} Gerar a lista da semana</button>`,
  icone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9.5" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.5 12.1h11.1l1.8-8.6H6.1"/></svg>`
})}`;

const vazioSemPlano = vazio({
  titulo: "Primeiro um plano, depois a lista",
  texto: "A lista de compras nasce do plano alimentar: sem plano ativo, não há o que comprar. Gerar um plano leva menos de um minuto.",
  acao: `<a class="btn btn-primary btn-lg" href="/plano">${ic("faisca")} Gerar meu plano</a>`,
  icone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4.5" width="14" height="16" rx="2.4"/><path d="M9 11h6M9 15h4"/></svg>`
});

/* -------------------------------- tela ---------------------------------- */
export function paginaCompras(d: DadosCompras): string {
  const l = d.lista;
  const temItens = !!l && l.items.length > 0;

  const corpo = !l
    ? `
${indisponivel({
  titulo: "A lista de compras não carregou",
  texto: "O serviço respondeu que está fora do ar. Nada do que você já marcou foi perdido."
})}
<div style="height:var(--sp-5)"></div>
${panel({ title: "Lista da semana", body: esqueleto(5) })}`
    : temItens
      ? `
${resumo(l)}
<div data-nl="grupos">${agrupar(l.items).map(grupoHTML).join("")}</div>
${panel({
  body: `<div class="nl-total">
    <span class="nl-rotulo">Total estimado da semana</span>
    <b class="nl-forte" data-nl="total">${esc(brl(l.estimatedCents || somaCentavos(l.items)))}</b>
  </div>
  <div class="nl-acoes">
    <a class="btn btn-secondary" href="/plano">Ver o plano desta semana</a>
    <button class="btn btn-ghost" type="button" data-nl="atualizar">Atualizar a lista</button>
  </div>`
})}`
      : panel({
          title: "Lista da semana",
          body: `<div data-nl="grupos">${d.temPlano === false ? vazioSemPlano : vazioComPlano}</div>`
        });

  return shell({
    title: "Compras",
    user: d.usuario,
    active: "/compras",
    islands: ["compras"],
    bootstrap: { lista: l, temPlano: d.temPlano !== false },
    body: estilos() + `<style>
.nl-secao-cab{display:flex;align-items:center;gap:.75rem;margin-bottom:var(--sp-3)}
.nl-secao-cab h2{font-size:var(--fs-h4);font-weight:var(--fw-black);letter-spacing:-0.02em}
.nl-secao-cab .panel-sub{margin-left:auto;font-size:var(--fs-sm);color:var(--text-muted);
  font-variant-numeric:tabular-nums;white-space:nowrap}
.nl-secao-icone{flex:none;display:grid;place-items:center;width:36px;height:36px;border-radius:11px;
  background:var(--leaf-100);color:var(--leaf-700)}
.nl-linha[data-salvando="1"]{opacity:.62}
.nl-linha[data-falhou="1"]{background:var(--danger-100);border-radius:var(--r-sm)}
#resumo-compras .nl-pares{grid-template-columns:repeat(auto-fit,minmax(8.5rem,1fr));align-items:end}
#resumo-compras .bar{margin-top:var(--sp-4)}
.nl-total{flex-wrap:wrap}
</style>` + corpo
  });
}

export default paginaCompras;
