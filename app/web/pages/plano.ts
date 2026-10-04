/* =========================================================================
   Tela: Plano alimentar.
   Duas partes: o plano ativo (por dia e refeição) e o gerador (1, 3 ou 7
   dias) que enfileira um job de IA e acompanha a espera.
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { campo, esc, panel, pill, vazio } from "../components/index.js";
import { estilos, ic, indisponivel, num, opcoes } from "./_comuns.js";
import { NOME_REFEICAO } from "./hoje.js";

export type RefeicaoPlano = {
  meal: string; titulo: string; kcal: number;
  macros?: { protein?: number; carb?: number; fat?: number } | null;
  feito?: boolean;
};
export type DiaPlano = { dia: string; kcal?: number; refeicoes: RefeicaoPlano[] };
export type PlanoAtivo = {
  id: string; titulo: string; dias: DiaPlano[];
  kcalTarget?: number | null; proteinTargetG?: number | null;
  criadoEm?: string | null; fonte?: string | null;
};

export type DadosPlano = {
  usuario: ShellUser;
  /** Plano ativo, ou null quando ainda não existe nenhum. */
  plano: PlanoAtivo | null;
  /** Resumo do perfil, para a pessoa saber com que regras o plano é gerado. */
  perfil?: { dietStyle?: string | null; kcalTarget?: number | null; proteinTargetG?: number | null; restrictions?: string[] } | null;
  /** true quando /api/me/profile ou o plano não puderam ser lidos. */
  semServidor?: boolean;
};

const DIETA: Record<string, string> = {
  tudo: "Sem restrição", vegetariana: "Vegetariana", vegana: "Vegana",
  pescetariana: "Pescetariana", low_carb: "Low carb", mediterranea: "Mediterrânea"
};

function resumoPerfil(p: DadosPlano["perfil"]): string {
  if (!p) return "Ajuste altura, objetivo e restrições na sua conta para o plano ficar com a sua cara.";
  const partes: string[] = [];
  if (p.dietStyle) partes.push(DIETA[p.dietStyle] ?? p.dietStyle);
  if (p.kcalTarget) partes.push(`${num(p.kcalTarget)} kcal`);
  if (p.proteinTargetG) partes.push(`${num(p.proteinTargetG)} g de proteína`);
  if (p.restrictions && p.restrictions.length) partes.push(`sem ${p.restrictions.join(", ")}`);
  return partes.length ? partes.join(" · ") : "Perfil ainda sem dados. Preencha na sua conta.";
}

const macrosTexto = (m: RefeicaoPlano["macros"]): string => {
  if (!m) return "";
  const t: string[] = [];
  if (m.protein != null) t.push(`${num(m.protein)} g de proteína`);
  if (m.carb != null) t.push(`${num(m.carb)} g de carbo`);
  if (m.fat != null) t.push(`${num(m.fat)} g de gordura`);
  return t.join(" · ");
};

export const diaHTML = (dia: DiaPlano, indice: number, ativo: boolean): string => `
<div class="nl-painel-dia" id="dia-${indice}" role="tabpanel" aria-labelledby="aba-${indice}"${ativo ? "" : " hidden"} tabindex="0">
  <ul class="nl-lista">
    ${dia.refeicoes.map((r) => `<li class="nl-linha">
      <span class="nl-linha-icone" aria-hidden="true">${ic("prato", 18)}</span>
      <span class="nl-linha-corpo">
        <b>${esc(NOME_REFEICAO[r.meal] ?? r.meal)} · ${esc(r.titulo)}</b>
        <small>${num(r.kcal)} kcal${macrosTexto(r.macros) ? ` · ${esc(macrosTexto(r.macros))}` : ""}</small>
      </span>
    </li>`).join("")}
  </ul>
  ${dia.kcal ? `<p class="nl-legenda">Total do dia: ${num(dia.kcal)} kcal</p>` : ""}
</div>`;

export const planoHTML = (p: PlanoAtivo): string => `
<div class="nl-dias" role="tablist" aria-label="Dias do plano">
  ${p.dias.map((d, i) => `<button class="nl-dia" type="button" role="tab" id="aba-${i}"
      aria-controls="dia-${i}" aria-selected="${i === 0 ? "true" : "false"}"
      tabindex="${i === 0 ? "0" : "-1"}">${esc(d.dia)}</button>`).join("")}
</div>
${p.dias.map((d, i) => diaHTML(d, i, i === 0)).join("")}`;

/* -------------------------------- tela ---------------------------------- */
export function paginaPlano(d: DadosPlano): string {
  const p = d.plano;

  const gerador = panel({
    title: "Gerar um plano novo",
    sub: "Leva menos de um minuto",
    body: `
<p style="font-size:var(--fs-sm);color:var(--text-muted);margin-bottom:var(--sp-4)">
  ${esc(resumoPerfil(d.perfil))}
  <a class="link" href="/conta">ajustar</a>
</p>

<form id="form-gerar" novalidate>
  ${opcoes({ nome: "days", legenda: "Quantos dias", valor: "3",
             itens: [{ valor: "1", rotulo: "1 dia" }, { valor: "3", rotulo: "3 dias" }, { valor: "7", rotulo: "7 dias" }] })}
  ${campo({ id: "notes", label: "Algum pedido?", required: false, rows: 2,
            placeholder: "Quero jantar leve e almoço que dê para levar na marmita",
            hint: "Opcional. Escreva como você falaria com uma nutricionista." })}
  <button class="btn btn-primary btn-lg btn-block nl-cta" type="submit" id="botao-gerar">
    ${ic("faisca")} Gerar plano
  </button>
</form>

<div id="espera-plano" class="nl-espera nl-oculto" hidden role="status" aria-live="polite">
  <span class="nl-espera-giro" aria-hidden="true"></span>
  <h3 data-nl="espera-titulo">Montando seu plano</h3>
  <p data-nl="espera-texto">Isso roda do nosso lado. Pode sair desta tela: quando terminar, o plano aparece aqui.</p>
  <ul class="nl-passos" data-nl="passos">
    <li data-passo="fila" data-estado="indo">Entrando na fila</li>
    <li data-passo="processando" data-estado="espera">Calculando calorias e proteínas</li>
    <li data-passo="montando" data-estado="espera">Escolhendo as refeições</li>
  </ul>
  <p class="nl-legenda" data-nl="espera-tempo"></p>
</div>`
  });

  const ativo = p
    ? panel({
        title: p.titulo || "Plano ativo",
        sub: `${p.dias.length} dia${p.dias.length === 1 ? "" : "s"}`,
        action: pill(p.fonte === "nutricionista" ? "da sua nutricionista" : "gerado por IA", "ok"),
        id: "plano-ativo",
        body: `<div data-nl="plano-corpo">${planoHTML(p)}</div>
<div class="nl-acoes">
  <a class="btn btn-secondary" href="/compras">${ic("certo")} Ver lista de compras</a>
  <a class="btn btn-ghost" href="/receitas">Trocar uma refeição</a>
</div>`
      })
    : panel({
        title: "Plano ativo",
        id: "plano-ativo",
        body: `<div data-nl="plano-corpo">${vazio({
          titulo: "Você ainda não tem plano",
          texto: "Escolha 1, 3 ou 7 dias ali em cima e mande gerar. Depois dá para trocar refeição por refeição.",
          icone: ic("prato", 24)
        })}</div>`
      });

  return shell({
    title: "Plano",
    user: d.usuario,
    active: "/plano",
    islands: ["plano"],
    bootstrap: { temPlano: !!p },
    body: estilos() + `<style>
.nl-painel-dia:focus-visible{outline:none;box-shadow:var(--sh-focus-tight);border-radius:var(--r-md)}
</style>` + `
${d.semServidor ? indisponivel({
  titulo: "Algumas informações não carregaram",
  texto: "O plano ou o seu perfil ficaram indisponíveis por um instante. Você ainda pode gerar um plano novo."
}) + "<div style=\"height:var(--sp-5)\"></div>" : ""}
<div class="nl-grade-2">
  <div>${ativo}</div>
  <div>${gerador}</div>
</div>`
  });
}

export default paginaPlano;
