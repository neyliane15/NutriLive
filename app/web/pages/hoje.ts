/* =========================================================================
   Tela: Hoje — a principal do app pessoal.
   Espelha o mockup que a landing mostra (src/components/devices.mjs, "home"):
   anel do score, calorias, proteínas, hidratação, próxima refeição,
   refeições do dia e um botão grande para registrar.
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { campo, esc, metric, panel, vazio } from "../components/index.js";
import { anel, esqueleto, estilos, ic, indisponivel, num, pct } from "./_comuns.js";

export type Refeicao = { id: string; meal: string; description: string; kcal: number; loggedAt: string };
export type Hoje = {
  score: number;
  kcal: { consumed: number; target: number };
  protein: { consumed: number; target: number };
  waterMl: { consumed: number; target: number };
  meals: Refeicao[];
  nextMeal: { at: string; title: string; kcal: number } | null;
};

export type DadosHoje = {
  usuario: ShellUser;
  /** null quando /api/me/today não respondeu: a ilha busca de novo. */
  hoje: Hoje | null;
};

export const NOME_REFEICAO: Record<string, string> = {
  cafe: "Café da manhã",
  lanche_manha: "Lanche da manhã",
  almoco: "Almoço",
  lanche_tarde: "Lanche da tarde",
  jantar: "Jantar",
  ceia: "Ceia"
};

const hora = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
};

const litros = (ml: number): string => num(ml / 1000, 1);

/* ------------------------------ pedaços --------------------------------- */
const chip = (icone: string, rotulo: string, valor: string) => `
<span class="nl-chip"><span>${ic(icone, 17)}</span><span><b>${esc(valor)}</b><small>${esc(rotulo)}</small></span></span>`;

const heroi = (nome: string, h: Hoje) => `
<section class="nl-heroi" data-nl="heroi">
  <div class="nl-heroi-topo">
    <div>
      <p class="nl-heroi-ola">Olá, ${esc(nome)}</p>
      <h2 class="nl-heroi-titulo">Sua saúde hoje</h2>
      <p class="nl-heroi-nota" data-nl="recado">${esc(recadoDoScore(h.score))}</p>
    </div>
    <span data-nl="anel">${anel(h.score, 104)}</span>
  </div>
  <div class="nl-chips" data-nl="chips">
    ${chip("prato", "Refeições", `${h.meals.length} de 5`)}
    ${chip("gota", "Água", `${litros(h.waterMl.consumed)} / ${litros(h.waterMl.target)} L`)}
    ${chip("chama", "Calorias", `${pct(h.kcal.consumed, h.kcal.target)}%`)}
    ${chip("balanca", "Proteína", `${pct(h.protein.consumed, h.protein.target)}%`)}
  </div>
</section>`;

export function recadoDoScore(score: number): string {
  if (score >= 85) return "Dia redondo. Continua assim.";
  if (score >= 60) return "Está indo bem. Falta pouco para fechar o dia.";
  if (score >= 30) return "Dá tempo de virar o dia. Comece pela água.";
  return "Nada registrado ainda. Um registro já muda esse número.";
}

const cartaoAgua = (a: { consumed: number; target: number }) => `
<div class="metric" data-nl="cartao-agua">
  <div class="metric-label">Hidratação</div>
  <div class="metric-value" data-nl="valor">${litros(a.consumed)}<small> de ${litros(a.target)} L</small></div>
  <div class="bar"><i data-nl="barra" style="width:${pct(a.consumed, a.target)}%"></i></div>
  <div class="metric-foot" data-nl="foot">${esc(faltaAgua(a))}</div>
  <div class="nl-acoes" role="group" aria-label="Registrar água">
    <button class="btn btn-secondary btn-sm" type="button" data-agua="200">+ 200 ml</button>
    <button class="btn btn-secondary btn-sm" type="button" data-agua="300">+ 300 ml</button>
    <button class="btn btn-secondary btn-sm" type="button" data-agua="500">+ 500 ml</button>
  </div>
</div>`;

function faltaAgua(a: { consumed: number; target: number }): string {
  const falta = a.target - a.consumed;
  return falta > 0 ? `Faltam ${num(falta)} ml` : "Meta do dia batida";
}

const listaRefeicoes = (ms: Refeicao[]) =>
  ms.length === 0
    ? vazio({
        titulo: "Nada registrado hoje",
        texto: "Anote a primeira refeição e o score do dia já começa a subir.",
        icone: ic("prato", 24)
      })
    : `<ul class="nl-lista">${ms
        .map((m) => `<li class="nl-linha">
      <span class="nl-linha-icone" aria-hidden="true">${ic("prato", 18)}</span>
      <span class="nl-linha-corpo">
        <b>${esc(NOME_REFEICAO[m.meal] ?? m.meal)}</b>
        <small>${esc(m.description)}${hora(m.loggedAt) ? ` · ${hora(m.loggedAt)}` : ""}</small>
      </span>
      <span class="nl-linha-meta">${num(m.kcal)} kcal</span>
    </li>`)
        .join("")}</ul>`;

const proxima = (p: Hoje["nextMeal"]) =>
  p
    ? `<div class="nl-linha" style="border:0;padding:0">
    <span class="nl-linha-icone" aria-hidden="true">${ic("relogio", 18)}</span>
    <span class="nl-linha-corpo"><b>${esc(p.title)}</b><small>${num(p.kcal)} kcal · às ${esc(p.at)}</small></span>
    <a class="btn btn-secondary btn-sm" href="/plano">Ver no plano</a>
  </div>`
    : vazio({
        titulo: "Sem próxima refeição",
        texto: "Gere um plano alimentar e a gente avisa o que vem agora.",
        acao: `<a class="btn btn-primary" href="/plano">Gerar meu plano</a>`,
        icone: ic("relogio", 24)
      });

/* -------------------------------- tela ---------------------------------- */
export function paginaHoje(d: DadosHoje): string {
  const nome = d.usuario.name.trim().split(/\s+/)[0] ?? "";
  const h = d.hoje;

  const corpo = h
    ? `
${heroi(nome, h)}

<div class="grid-cards" style="margin-top:var(--sp-5)">
  <div data-nl="cartao-kcal">
    ${metric({
      label: "Calorias", value: num(h.kcal.consumed), unit: `de ${num(h.kcal.target)} kcal`,
      fill: pct(h.kcal.consumed, h.kcal.target),
      foot: h.kcal.consumed <= h.kcal.target
        ? `Ainda cabem ${num(Math.max(0, h.kcal.target - h.kcal.consumed))} kcal`
        : `${num(h.kcal.consumed - h.kcal.target)} kcal acima da meta`
    })}
  </div>
  <div data-nl="cartao-prot">
    ${metric({
      label: "Proteínas", value: num(h.protein.consumed), unit: `de ${num(h.protein.target)} g`,
      fill: pct(h.protein.consumed, h.protein.target),
      foot: `${pct(h.protein.consumed, h.protein.target)}% da meta do dia`
    })}
  </div>
  ${cartaoAgua(h.waterMl)}
</div>

<section class="panel" id="registrar" style="margin-top:var(--sp-5)">
  <button class="btn btn-primary btn-lg btn-block" type="button"
          data-nl="abrir-registro" aria-expanded="false" aria-controls="form-refeicao">
    ${ic("mais")} Registrar refeição
  </button>

  <form id="form-refeicao" class="nl-oculto" hidden novalidate style="margin-top:var(--sp-5)">
    <h2 class="nl-rotulo">O que você comeu</h2>
    ${campo({
      id: "meal", label: "Refeição", value: "almoco",
      options: Object.keys(NOME_REFEICAO).map((k) => ({ value: k, label: NOME_REFEICAO[k]! }))
    })}
    ${campo({
      id: "description", label: "Descrição", rows: 2,
      placeholder: "Arroz integral, filé de tilápia e brócolis",
      hint: "Escreva do seu jeito. A gente calcula as calorias."
    })}
    ${campo({
      id: "kcal", label: "Calorias", required: false, inputmode: "numeric",
      placeholder: "deixe em branco se não souber", hint: "Em kcal. Só se você já souber o valor."
    })}
    <div class="nl-acoes">
      <button class="btn btn-primary" type="submit">Salvar refeição</button>
      <button class="btn btn-ghost" type="button" data-nl="fechar-registro">Cancelar</button>
    </div>
  </form>
</section>

<div class="nl-grade-2" style="margin-top:var(--sp-5)">
  <div>
    ${panel({ title: "Refeições de hoje", sub: `${h.meals.length} registro${h.meals.length === 1 ? "" : "s"}`,
              body: `<div data-nl="lista-refeicoes">${listaRefeicoes(h.meals)}</div>` })}
  </div>
  <div>
    ${panel({ title: "Próxima refeição", body: `<div data-nl="proxima">${proxima(h.nextMeal)}</div>` })}
    ${panel({
      title: "Como fechar o dia",
      body: `<ul class="nl-lista">
        <li class="nl-linha"><span class="nl-linha-icone" aria-hidden="true">${ic("gota", 18)}</span>
          <span class="nl-linha-corpo"><b>Beba ${num(Math.max(0, h.waterMl.target - h.waterMl.consumed))} ml</b>
          <small>para fechar a meta de água</small></span></li>
        <li class="nl-linha"><span class="nl-linha-icone" aria-hidden="true">${ic("balanca", 18)}</span>
          <span class="nl-linha-corpo"><b>Faltam ${num(Math.max(0, h.protein.target - h.protein.consumed))} g de proteína</b>
          <small>ovo, iogurte ou atum resolvem</small></span></li>
        <li class="nl-linha"><span class="nl-linha-icone" aria-hidden="true">${ic("fita", 18)}</span>
          <span class="nl-linha-corpo"><b>Registre seu peso</b>
          <small><a class="link" href="/evolucao">ir para evolução</a></small></span></li>
      </ul>`
    })}
  </div>
</div>`
    : `
<section class="nl-heroi" data-nl="heroi">
  <div class="nl-heroi-topo">
    <div>
      <p class="nl-heroi-ola">Olá, ${esc(nome)}</p>
      <h2 class="nl-heroi-titulo">Sua saúde hoje</h2>
      <p class="nl-heroi-nota">Carregando os números do dia…</p>
    </div>
    <span data-nl="anel">${anel(0, 104)}</span>
  </div>
</section>
<div style="margin-top:var(--sp-5)">
  ${indisponivel({
    titulo: "Não conseguimos carregar o seu dia agora",
    texto: "O resumo de hoje ficou indisponível por um instante. Seus registros estão salvos."
  })}
</div>
${panel({ title: "Resumo do dia", body: esqueleto(4) })}`;

  return shell({
    title: "Hoje",
    user: d.usuario,
    active: "/hoje",
    islands: ["hoje"],
    bootstrap: { hoje: d.hoje, nome },
    body: estilos() + corpo
  });
}

export default paginaHoje;
