/* =========================================================================
   Tela: Receitas. "O que tem na geladeira" → a IA devolve receitas com
   tempo, calorias, macros e quanto combinam com o plano ativo.
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { campo, esc, panel, vazio } from "../components/index.js";
import { estilos, ic, indisponivel, num, opcoes } from "./_comuns.js";

export type Receita = {
  id?: string; title: string; timeMin?: number | null; kcal?: number | null;
  macros?: { protein?: number; carb?: number; fat?: number } | null;
  matchPct?: number | null; ingredients?: string[]; steps?: string[];
};

export type DadosReceitas = {
  usuario: ShellUser;
  /** Receitas já geradas antes, para a tela não nascer vazia. */
  receitas: Receita[];
  /** Última busca, para repetir o contexto. */
  ingredientes?: string;
  semServidor?: boolean;
};

const metaReceita = (r: Receita): string => {
  const p: string[] = [];
  if (r.timeMin) p.push(`${num(r.timeMin)} min`);
  if (r.kcal) p.push(`${num(r.kcal)} kcal`);
  if (r.macros?.protein != null) p.push(`${num(r.macros.protein)} g de proteína`);
  if (r.macros?.carb != null) p.push(`${num(r.macros.carb)} g de carbo`);
  if (r.macros?.fat != null) p.push(`${num(r.macros.fat)} g de gordura`);
  return p.join(" · ");
};

export const receitaHTML = (r: Receita): string => `
<article class="card" style="display:grid;gap:.625rem">
  <h3 style="font-size:var(--fs-h4);font-weight:var(--fw-bold);letter-spacing:-0.016em">${esc(r.title)}</h3>
  <p style="font-size:var(--fs-sm);color:var(--text-muted)">
    <span style="display:inline-flex;align-items:center;gap:.3125rem;vertical-align:-3px">${ic("relogio", 15)}</span>
    ${esc(metaReceita(r))}
  </p>
  ${r.matchPct != null ? `
  <div>
    <div class="bar"><i style="width:${Math.max(0, Math.min(100, r.matchPct))}%"></i></div>
    <p class="nl-legenda" style="color:var(--leaf-700);font-weight:var(--fw-semi)">${num(r.matchPct)}% de combinação com o seu plano</p>
  </div>` : ""}
  ${(r.ingredients && r.ingredients.length) || (r.steps && r.steps.length) ? `
  <details>
    <summary class="link" style="cursor:pointer;min-height:44px;display:flex;align-items:center">Ver o modo de fazer</summary>
    ${r.ingredients && r.ingredients.length ? `<p class="nl-rotulo" style="margin-top:var(--sp-3)">Ingredientes</p>
    <ul style="margin:.375rem 0 0;padding-left:1.125rem;font-size:var(--fs-sm);color:var(--text-muted);display:grid;gap:.25rem">
      ${r.ingredients.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>` : ""}
    ${r.steps && r.steps.length ? `<p class="nl-rotulo" style="margin-top:var(--sp-4)">Passo a passo</p>
    <ol style="margin:.375rem 0 0;padding-left:1.125rem;font-size:var(--fs-sm);color:var(--text-muted);display:grid;gap:.375rem">
      ${r.steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
  </details>` : ""}
</article>`;

export function paginaReceitas(d: DadosReceitas): string {
  const busca = panel({
    title: "O que tem na geladeira?",
    sub: "A gente monta a refeição com isso",
    body: `
<form id="form-receitas" novalidate>
  ${campo({
    id: "ingredients", label: "Ingredientes que você tem", rows: 3,
    value: d.ingredientes,
    placeholder: "peito de frango, batata-doce, cenoura, ovos",
    hint: "Separe por vírgula. Não precisa ser exato."
  })}
  ${opcoes({
    nome: "maxMinutes", legenda: "Tempo de preparo", valor: "30",
    itens: [
      { valor: "15", rotulo: "até 15 min" },
      { valor: "30", rotulo: "até 30 min" },
      { valor: "45", rotulo: "até 45 min" },
      { valor: "0", rotulo: "tanto faz" }
    ]
  })}
  <button class="btn btn-primary btn-lg btn-block nl-cta" type="submit" id="botao-receitas">
    ${ic("faisca")} Buscar receitas
  </button>
</form>

<div id="espera-receitas" class="nl-espera nl-oculto" hidden role="status" aria-live="polite">
  <span class="nl-espera-giro" aria-hidden="true"></span>
  <h3>Procurando o que dá para fazer</h3>
  <p>Estamos cruzando o que você tem com o seu plano e as suas restrições.</p>
  <ul class="nl-passos" data-nl="passos">
    <li data-passo="fila" data-estado="indo">Lendo os ingredientes</li>
    <li data-passo="processando" data-estado="espera">Montando combinações</li>
    <li data-passo="montando" data-estado="espera">Calculando calorias e macros</li>
  </ul>
  <p class="nl-legenda" data-nl="espera-tempo"></p>
</div>`
  });

  const resultados = panel({
    title: "Receitas para você",
    id: "resultados",
    body: `<div data-nl="lista-receitas">${
      d.receitas.length
        ? `<div class="nl-pares">${d.receitas.map(receitaHTML).join("")}</div>`
        : vazio({
            titulo: "Nenhuma receita por aqui ainda",
            texto: "Escreva o que tem em casa ali ao lado. Em alguns segundos aparecem opções com tempo, calorias e macros.",
            icone: ic("prato", 24)
          })
    }</div>`
  });

  return shell({
    title: "Receitas",
    user: d.usuario,
    active: "/receitas",
    islands: ["receitas"],
    body: estilos() + `
${d.semServidor ? indisponivel({
  titulo: "Não carregamos suas receitas salvas",
  texto: "A lista anterior ficou indisponível por um instante. A busca por ingredientes continua funcionando."
}) + "<div style=\"height:var(--sp-5)\"></div>" : ""}
<div class="nl-grade-2">
  <div>${resultados}</div>
  <div>${busca}</div>
</div>`
  });
}

export default paginaReceitas;
