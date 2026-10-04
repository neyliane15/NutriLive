/* =========================================================================
   Tela: Evolução — peso, medidas e constância.
   Período escolhido em chips (7 dias a 1 ano), curva de peso em sparkline,
   constância das últimas semanas em barras e o formulário de registrar as
   medidas de hoje.
   Dados: GET /api/me/progress?range=     (contract.me.progress)
   Ação:  POST /api/me/measurements       (contract.me.addMeasurement)
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { barras, campo, esc, panel, sparkline, vazio } from "../components/index.js";
import { esqueleto, estilos, ic, indisponivel, num, opcoes, pct } from "./_comuns.js";

export type Faixa = "7d" | "30d" | "3m" | "6m" | "1y";

export type Progresso = {
  weight: { at: string; kg: number }[];
  measurements: { at: string; waist: number | null; hip: number | null; arm: number | null }[];
  streakDays: number;
  loggedDays: number;
  totalDays: number;
};

export type DadosEvolucao = {
  usuario: ShellUser;
  /** null quando GET /api/me/progress não respondeu. */
  progresso: Progresso | null;
  faixa?: string;
  /** Do perfil, só para calcular o IMC. */
  alturaCm?: number | null;
};

export const FAIXAS: { valor: Faixa; rotulo: string; dias: number }[] = [
  { valor: "7d", rotulo: "7 dias", dias: 7 },
  { valor: "30d", rotulo: "30 dias", dias: 30 },
  { valor: "3m", rotulo: "3 meses", dias: 90 },
  { valor: "6m", rotulo: "6 meses", dias: 180 },
  { valor: "1y", rotulo: "1 ano", dias: 365 }
];

export const faixaValida = (v: string | undefined): Faixa =>
  (FAIXAS.find((f) => f.valor === v)?.valor ?? "30d") as Faixa;

/* ------------------------------ formatação ------------------------------ */
export const kg = (v: number): string => `${num(v, 1)} kg`;
export const cm = (v: number): string => `${num(v, 1)} cm`;

const diaBR = (iso: string): string => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
};

/** Diferença entre o primeiro e o último ponto, com o sinal certo. */
export function variacao(valores: number[]): { delta: number; classe: "sobe" | "desce" | "igual"; texto: string } | null {
  if (valores.length < 2) return null;
  const delta = valores[valores.length - 1]! - valores[0]!;
  const classe = Math.abs(delta) < 0.05 ? "igual" : delta < 0 ? "desce" : "sobe";
  const sinal = delta > 0 ? "+" : delta < 0 ? "−" : "";
  return { delta, classe, texto: `${sinal}${num(Math.abs(delta), 1)}` };
}

/** IMC com a leitura em palavras — informativo, nunca diagnóstico. */
export function imc(pesoKg: number, alturaCm: number): { valor: number; leitura: string } {
  const m = alturaCm / 100;
  const v = pesoKg / (m * m);
  const leitura = v < 18.5 ? "abaixo do peso"
    : v < 25 ? "faixa de peso adequada"
      : v < 30 ? "sobrepeso"
        : "obesidade";
  return { valor: Math.round(v * 10) / 10, leitura };
}

/* ---------------------- constância em barras ---------------------------- */
export type Semana = { rotulo: string; dias: number };

/**
 * Agrupa as datas com registro em semanas, de trás para a frente, cobrindo
 * os últimos `dias` dias. O contrato não publica a série dia a dia, então o
 * que entra aqui são as datas de pesagem e de medida.
 */
export function semanasDeConstancia(datas: string[], dias = 30, agora = Date.now()): Semana[] {
  const semanas = Math.max(1, Math.ceil(dias / 7));
  const baldes: Semana[] = [];
  for (let i = semanas - 1; i >= 0; i--) {
    const fim = agora - i * 7 * 86_400_000;
    const ini = fim - 7 * 86_400_000;
    const diasVistos = new Set<string>();
    for (const d of datas) {
      const t = Date.parse(d);
      if (!Number.isNaN(t) && t > ini && t <= fim) diasVistos.add(new Date(t).toISOString().slice(0, 10));
    }
    baldes.push({ rotulo: diaBR(new Date(ini + 86_400_000).toISOString()), dias: diasVistos.size });
  }
  return baldes;
}

/* -------------------------------- blocos -------------------------------- */
const blocoPeso = (p: Progresso, alturaCm?: number | null): string => {
  const pontos = p.weight.map((w) => w.kg);
  if (!pontos.length) {
    return vazio({
      titulo: "Nenhuma pesagem no período",
      texto: "Registre o seu peso de hoje ali ao lado. Com duas pesagens a curva já aparece.",
      icone: ic("balanca", 24)
    });
  }
  const atual = pontos[pontos.length - 1]!;
  const v = variacao(pontos);
  const i = alturaCm ? imc(atual, alturaCm) : null;
  return `
<div class="nl-pares">
  <div>
    <p class="nl-rotulo">Peso atual</p>
    <p class="nl-forte" data-nl="peso-atual">${esc(kg(atual))}</p>
    ${v ? `<p class="nl-delta ${v.classe}" data-nl="peso-delta">${esc(v.texto)} kg no período</p>`
        : `<p class="nl-legenda" data-nl="peso-delta">primeira pesagem do período</p>`}
  </div>
  <div>
    <p class="nl-rotulo">Pesagens</p>
    <p class="nl-forte" data-nl="peso-contagem">${pontos.length}</p>
    <p class="nl-legenda" data-nl="peso-janela">de ${esc(diaBR(p.weight[0]!.at))} a ${esc(diaBR(p.weight[p.weight.length - 1]!.at))}</p>
  </div>
  ${i ? `<div>
    <p class="nl-rotulo">IMC</p>
    <p class="nl-forte" data-nl="peso-imc">${esc(num(i.valor, 1))}</p>
    <p class="nl-legenda">${esc(i.leitura)}</p>
  </div>` : ""}
</div>
<div data-nl="peso-grafico" style="margin-top:var(--sp-5)">${sparkline(pontos, { altura: 96 })}</div>
<p class="nl-faixa-extremos" data-nl="peso-extremos">
  <span>${esc(diaBR(p.weight[0]!.at))} · ${esc(kg(pontos[0]!))}</span>
  <span>mín ${esc(kg(Math.min(...pontos)))} · máx ${esc(kg(Math.max(...pontos)))}</span>
  <span>${esc(diaBR(p.weight[p.weight.length - 1]!.at))} · ${esc(kg(atual))}</span>
</p>
<table class="nl-sr-tabela"><caption>Pesagens do período</caption><tbody data-nl="peso-tabela">
  ${p.weight.map((w) => `<tr><th scope="row">${esc(diaBR(w.at))}</th><td>${esc(kg(w.kg))}</td></tr>`).join("")}
</tbody></table>`;
};

type Medida = { chave: "waist" | "hip" | "arm"; rotulo: string };
const MEDIDAS: Medida[] = [
  { chave: "waist", rotulo: "Cintura" },
  { chave: "hip", rotulo: "Quadril" },
  { chave: "arm", rotulo: "Braço" }
];

const blocoMedidas = (p: Progresso): string => {
  const cartoes = MEDIDAS.map((m) => {
    const serie = p.measurements.map((x) => x[m.chave]).filter((x): x is number => typeof x === "number");
    if (!serie.length) {
      return `<div class="nl-medida" data-nl="medida-${m.chave}">
        <p class="nl-rotulo">${esc(m.rotulo)}</p>
        <p class="nl-forte">—</p>
        <p class="nl-legenda">sem registro</p>
      </div>`;
    }
    const v = variacao(serie);
    /* braço não tem direção "boa": cresce com massa, encolhe com gordura. */
    const classe = v ? (m.chave === "arm" ? "igual" : v.classe) : "";
    return `<div class="nl-medida" data-nl="medida-${m.chave}">
      <p class="nl-rotulo">${esc(m.rotulo)}</p>
      <p class="nl-forte">${esc(cm(serie[serie.length - 1]!))}</p>
      ${v ? `<p class="nl-delta ${classe}">${esc(v.texto)} cm</p>` : `<p class="nl-legenda">primeira medida</p>`}
      ${serie.length > 1 ? sparkline(serie, { altura: 42 }) : ""}
    </div>`;
  }).join("");

  const vazias = p.measurements.length === 0;
  return vazias
    ? vazio({
        titulo: "Nenhuma medida no período",
        texto: "Cintura, quadril e braço contam uma história que a balança sozinha não conta.",
        icone: ic("fita", 24)
      })
    : `<div class="nl-medidas" data-nl="medidas">${cartoes}</div>`;
};

const blocoConstancia = (p: Progresso, datas: string[]): string => {
  const semanas = semanasDeConstancia(datas, 30);
  const cheio = pct(p.loggedDays, p.totalDays || 30);
  return `
<div class="nl-pares">
  <div>
    <p class="nl-rotulo">Dias com registro</p>
    <p class="nl-forte"><span data-nl="logados">${p.loggedDays}</span> de ${p.totalDays || 30}</p>
    <div class="bar"><i data-nl="const-barra" style="width:${cheio}%"></i></div>
  </div>
  <div>
    <p class="nl-rotulo">Sequência atual</p>
    <p class="nl-forte"><span data-nl="sequencia">${p.streakDays}</span> <small style="font-size:var(--fs-sm);font-weight:var(--fw-regular)">${p.streakDays === 1 ? "dia" : "dias"}</small></p>
    <p class="nl-legenda">${esc(recadoSequencia(p.streakDays))}</p>
  </div>
</div>
<p class="nl-rotulo" style="margin-top:var(--sp-5)">Pesagens e medidas por semana</p>
<div data-nl="const-barras">${barras(semanas.map((s) => s.dias), semanas.map((s) => s.rotulo))}</div>
<p class="nl-legenda">Últimos 30 dias, semana a semana. Cada barra conta os dias em que você anotou peso ou medidas.</p>`;
};

export function recadoSequencia(dias: number): string {
  if (dias >= 21) return "Três semanas seguidas. Isso já é hábito.";
  if (dias >= 7) return "Uma semana inteira sem falhar.";
  if (dias >= 2) return "Está pegando o ritmo.";
  if (dias === 1) return "Primeiro dia da nova sequência.";
  return "Um registro hoje recomeça a contagem.";
}

const formulario = `
<form id="form-medidas" novalidate>
  <p class="nl-legenda" style="margin-bottom:var(--sp-4)">
    Preencha o que você tiver. Nada aqui é obrigatório sozinho — só não dá para salvar tudo em branco.
  </p>
  <div class="nl-campos-2">
    ${campo({ id: "weightKg", label: "Peso", required: false, inputmode: "decimal", placeholder: "72,4", hint: "em kg" })}
    ${campo({ id: "waistCm", label: "Cintura", required: false, inputmode: "decimal", placeholder: "84,0", hint: "em cm" })}
    ${campo({ id: "hipCm", label: "Quadril", required: false, inputmode: "decimal", placeholder: "98,5", hint: "em cm" })}
    ${campo({ id: "armCm", label: "Braço", required: false, inputmode: "decimal", placeholder: "31,0", hint: "em cm" })}
  </div>
  ${campo({ id: "note", label: "Observação", required: false, rows: 2, maxlength: 400,
            placeholder: "Medi em jejum, depois do treino…" })}
  <div class="nl-alerta" role="alert" data-nl="erro-medidas">
    ${ic("alerta", 18)}<span data-nl="erro-texto"></span>
  </div>
  <button class="btn btn-primary btn-lg btn-block nl-cta" type="submit">${ic("mais")} Salvar as medidas de hoje</button>
</form>`;

/* -------------------------------- tela ---------------------------------- */
export function paginaEvolucao(d: DadosEvolucao): string {
  const faixa = faixaValida(d.faixa);
  const p = d.progresso;
  const datas = p ? [...p.weight.map((w) => w.at), ...p.measurements.map((m) => m.at)] : [];
  const vazioDeTudo = !!p && p.weight.length === 0 && p.measurements.length === 0;

  const seletor = panel({
    body: `
<form id="form-faixa" data-nl="faixa">
  ${opcoes({
    nome: "range", legenda: "Período", valor: faixa,
    itens: FAIXAS.map((f) => ({ valor: f.valor, rotulo: f.rotulo }))
  })}
  <noscript><button class="btn btn-secondary btn-sm" type="submit" style="margin-top:.75rem">Aplicar período</button></noscript>
</form>
<p class="nl-legenda" role="status" data-nl="faixa-recado">Mostrando os últimos ${esc(FAIXAS.find((f) => f.valor === faixa)!.rotulo)}.</p>`
  });

  const corpo = !p
    ? `
${indisponivel({
  titulo: "A sua evolução não carregou",
  texto: "O histórico de peso e medidas ficou indisponível por um instante. Você ainda pode registrar as medidas de hoje."
})}
<div style="height:var(--sp-5)"></div>
${seletor}
<div class="nl-grade-2" style="margin-top:var(--sp-5)">
  <div>${panel({ title: "Peso", body: esqueleto(4) })}${panel({ title: "Medidas", body: esqueleto(3) })}</div>
  <div>${panel({ title: "Registrar hoje", body: formulario })}</div>
</div>`
    : vazioDeTudo
      ? `
${seletor}
<div class="nl-grade-2" style="margin-top:var(--sp-5)">
  <div>${panel({
    title: "Sua evolução",
    body: vazio({
      titulo: "Nada registrado ainda",
      texto: "A primeira pesagem é o ponto zero. Da segunda em diante você vê a linha — e ela costuma surpreender para melhor.",
      acao: `<button class="btn btn-primary btn-lg" type="button" data-nl="ir-formulario">${ic("mais")} Registrar meu peso</button>`,
      icone: ic("balanca", 24)
    })
  })}</div>
  <div>${panel({ title: "Registrar hoje", id: "registrar-hoje", body: formulario })}</div>
</div>`
      : `
${seletor}
<div class="nl-grade-2" style="margin-top:var(--sp-5)">
  <div>
    ${panel({ title: "Peso", sub: `últimos ${FAIXAS.find((f) => f.valor === faixa)!.rotulo}`,
              id: "painel-peso", body: `<div data-nl="peso">${blocoPeso(p, d.alturaCm)}</div>` })}
    ${panel({ title: "Medidas", id: "painel-medidas", body: `<div data-nl="medidas-corpo">${blocoMedidas(p)}</div>` })}
  </div>
  <div>
    ${panel({ title: "Constância", sub: "últimos 30 dias", id: "painel-constancia",
              body: `<div data-nl="constancia">${blocoConstancia(p, datas)}</div>` })}
    ${panel({ title: "Registrar hoje", id: "registrar-hoje", body: formulario })}
  </div>
</div>`;

  return shell({
    title: "Evolução",
    user: d.usuario,
    active: "/evolucao",
    islands: ["evolucao"],
    bootstrap: { faixa, progresso: p, alturaCm: d.alturaCm ?? null },
    body: estilos() + `<style>
.nl-sr-tabela{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.nl-medidas{display:grid;gap:var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,9.5rem),1fr))}
.nl-medida{background:var(--bg-soft);border:1px solid var(--border-subtle);border-radius:var(--r-md);padding:.875rem}
.nl-medida .nl-forte{font-size:1.375rem}
.nl-campos-2{display:grid;gap:var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr));
  align-items:start;margin-bottom:var(--sp-4)}
.nl-campos-2 .field + .field{margin-top:0}
#painel-peso .nl-pares{grid-template-columns:repeat(auto-fit,minmax(min(100%,8.5rem),1fr));gap:var(--sp-4) var(--sp-5)}
#painel-constancia .nl-pares{gap:var(--sp-4) var(--sp-5)}
.nl-faixa-extremos{display:flex;justify-content:space-between;gap:var(--sp-3);margin-top:.375rem;
  font-size:var(--fs-xs);color:var(--text-soft);font-variant-numeric:tabular-nums}
[data-nl="peso-grafico"] svg{border-radius:var(--r-sm)}
</style>` + corpo
  });
}

export default paginaEvolucao;
