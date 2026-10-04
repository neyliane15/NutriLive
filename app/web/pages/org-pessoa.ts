/* =========================================================================
   Ficha de uma pessoa da organização — a pessoa por dentro.
   Perfil, evolução de peso, adesão por semana, planos enviados e as
   anotações clínicas (privadas da profissional). Gera plano com IA.
   Dados: GET /api/org/members/:userId   (contract.org.member)
   Ações: POST /api/org/members/:userId/notes
          POST /api/ai/meal-plan  (forUserId)
          POST /api/org/members/:userId/plan
   ========================================================================= */
import type { z } from "zod";
import { shell, type ShellUser } from "../layout.js";
import { panel, table, campo, esc, vazio, sparkline, iniciais, dataBR, dataHoraBR } from "../components/index.js";
import { org } from "../../shared/contract.js";
import {
  termos, rotaPessoas, estilosFE2, indisponivel, estadoPill, colunas,
  periodoCurto, chaveValor, aviso
} from "./org-ui.js";

export type FichaDados = z.infer<typeof org.member.out>;

const SEXO: Record<string, string> = { f: "Feminino", m: "Masculino", feminino: "Feminino", masculino: "Masculino" };
const OBJETIVO: Record<string, string> = {
  perder: "Perder peso", manter: "Manter o peso", ganhar: "Ganhar massa",
  saude: "Saúde geral", performance: "Performance"
};

const kg = (n: number) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;

const nivelAdesao = (p: number): "ok" | "atencao" | "risco" =>
  p >= 75 ? "ok" : p >= 55 ? "atencao" : "risco";

export function orgPessoa(o: { user: ShellUser; userId: string; dados: FichaDados | null }): string {
  const t = termos(o.user.role);
  const rota = rotaPessoas(o.user.role);
  const d = o.dados;
  const nome = d?.user.name ?? "Carregando…";

  const perfil = (d?.profile ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : esc(String(v)));

  /* --------------------------- evolução de peso -------------------------- */
  const pesos = d?.weight ?? [];
  const pKg = pesos.map((p) => p.kg);
  const primeiro = pKg.length ? pKg[0]! : null;
  const atual = pKg.length ? pKg[pKg.length - 1]! : null;
  const delta = primeiro !== null && atual !== null ? atual - primeiro : null;

  const blocoPeso = pesos.length >= 2
    ? `${chaveValor([
      { k: "Peso atual", v: `<b>${kg(atual!)}</b>` },
      { k: "No começo", v: kg(primeiro!) },
      {
        k: "Variação",
        v: `<span style="color:${delta! <= 0 ? "var(--leaf-700)" : "var(--danger-600)"}">${delta! > 0 ? "+" : "−"}${kg(Math.abs(delta!))}</span>`
      },
      { k: "Última pesagem", v: dataBR(pesos[pesos.length - 1]!.at) }
    ])}
    <div style="margin-top:var(--sp-4)">${sparkline(pKg, { altura: 72 })}</div>
    <p class="fe2-seats-num">${pesos.length} pesagens, de ${dataBR(pesos[0]!.at)} a ${dataBR(pesos[pesos.length - 1]!.at)}.</p>
    <table class="fe2-sr"><caption>Evolução de peso</caption><tbody>
      ${pesos.map((p) => `<tr><th scope="row">${dataBR(p.at)}</th><td>${kg(p.kg)}</td></tr>`).join("")}
    </tbody></table>`
    : pesos.length === 1
      ? chaveValor([{ k: "Peso atual", v: `<b>${kg(pKg[0]!)}</b>` }, { k: "Pesagens", v: "só uma até agora" }])
      : `<p class="fe2-seats-num">Sem pesagem registrada.</p>`;

  /* ---------------------------- adesão por semana ------------------------ */
  const semanas = d?.adherence ?? [];
  const mediaAdesao = semanas.length
    ? Math.round(semanas.reduce((s, x) => s + x.pct, 0) / semanas.length)
    : null;
  const blocoAdesao = semanas.length
    ? colunas({
      titulo: "Adesão por semana",
      altura: 96,
      itens: semanas.map((s) => ({
        rotulo: periodoCurto(s.weekStart), valor: s.pct, texto: `${s.pct}%`, tom: nivelAdesao(s.pct)
      }))
    })
    : `<p class="fe2-seats-num">Sem semana fechada ainda.</p>`;

  /* ------------------------------- planos -------------------------------- */
  const planos = d?.plans ?? [];
  const blocoPlanos = planos.length
    ? table({
      cols: [{ label: "Plano" }, { label: "Estado" }, { label: "Enviado em" }, { label: "", align: "right" }],
      rows: planos.map((p) => `
      <tr data-fe2-plano="${esc(p.id)}">
        <td><b>${esc(p.title)}</b></td>
        <td>${estadoPill(p.status)}</td>
        <td>${dataBR(p.createdAt)}</td>
        <td class="num"><span class="fe2-acts">
          <button class="btn btn-ghost btn-sm fe2-tap" type="button" data-fe2-enviar-plano="${esc(p.id)}">Enviar</button>
        </span></td>
      </tr>`),
      minWidth: 520
    })
    : vazio({
      titulo: "Nenhum plano enviado",
      texto: `Gere um plano com a IA e envie para ${t.oPessoa}. Ele aparece no app dela na mesma hora.`
    });

  /* ---------------------------- anotações -------------------------------- */
  const notas = d?.notes ?? [];
  const blocoNotas = `
<form data-fe2-form="nota" novalidate>
  <div class="field" data-field="body">
    <label class="field-label" for="body">Nova anotação</label>
    <textarea class="input" id="body" name="body" rows="3" maxlength="4000"
      placeholder="Conduta, queixa, ajuste combinado…" aria-describedby="err-body"></textarea>
    <span class="field-error" id="err-body" role="alert"></span>
  </div>
  <div class="fe2-modal-acts" style="justify-content:flex-start;margin-top:var(--sp-3)">
    <button class="btn btn-secondary btn-sm fe2-tap" type="submit">Salvar anotação</button>
  </div>
</form>
<div class="fe2-notes" data-fe2-notas>
  ${notas.length
      ? notas.map((n) => `
  <article class="fe2-note">
    <p>${esc(n.body)}</p>
    <p class="fe2-note-foot">${esc(n.authorName)} · ${dataHoraBR(n.createdAt)}</p>
  </article>`).join("")
      : `<p class="fe2-seats-num" data-fe2-notas-vazio>Nenhuma anotação ainda.</p>`}
</div>`;

  /* ------------------------------ cabeçalho ------------------------------ */
  const cabecalho = panel({
    body: `
<div class="fe2-head">
  <span class="avatar" aria-hidden="true">${esc(iniciais(nome))}</span>
  <div class="fe2-head-id">
    <h2>${esc(nome)}</h2>
    <p>${esc(d?.user.email ?? "—")}</p>
    <div class="row" style="margin-top:.5rem;gap:.375rem">
      ${estadoPill(d?.user.status)}
      ${mediaAdesao !== null ? `<span class="badge badge-outline">Adesão média ${mediaAdesao}%</span>` : ""}
      ${planos.length ? `<span class="badge badge-outline">${planos.length} plano${planos.length === 1 ? "" : "s"}</span>` : ""}
      ${notas.length ? `<span class="badge badge-outline">${notas.length} anotação${notas.length === 1 ? "" : "ões"}</span>` : ""}
    </div>
  </div>
  <div class="fe2-head-acts">
    <a class="btn btn-secondary btn-sm fe2-tap" href="${rota}">Voltar para ${esc(t.pessoas)}</a>
    <button class="btn btn-primary btn-sm fe2-tap" type="button" data-fe2-abrir="dlg-ia">Gerar plano com IA</button>
  </div>
</div>
<div class="sep"></div>
${chaveValor([
      { k: "Nascimento", v: texto(perfil["birthDate"] ? dataBR(String(perfil["birthDate"])) : null) },
      { k: "Sexo", v: texto(SEXO[String(perfil["sex"] ?? "").toLowerCase()] ?? perfil["sex"]) },
      { k: "Altura", v: perfil["heightCm"] ? `${esc(String(perfil["heightCm"]))} cm` : "—" },
      { k: "Objetivo", v: texto(OBJETIVO[String(perfil["goal"] ?? "").toLowerCase()] ?? perfil["goal"]) },
      { k: "Atividade", v: texto(perfil["activityLevel"]) },
      { k: "Estilo alimentar", v: texto(perfil["dietStyle"]) },
      {
        k: "Restrições",
        v: Array.isArray(perfil["restrictions"]) && perfil["restrictions"].length
          ? (perfil["restrictions"] as unknown[]).map((r) => `<span class="badge badge-amber">${esc(String(r))}</span>`).join(" ")
          : "nenhuma"
      },
      {
        k: "Não gosta de",
        v: Array.isArray(perfil["dislikes"]) && perfil["dislikes"].length
          ? (perfil["dislikes"] as unknown[]).map((r) => `<span class="badge badge-outline">${esc(String(r))}</span>`).join(" ")
          : "—"
      }
    ])}`
  });

  /* ------------------------------ diálogo IA ----------------------------- */
  const dialogoIa = `
<dialog class="fe2-modal" id="dlg-ia" aria-labelledby="dlg-ia-t">
  <form class="fe2-modal-in" data-fe2-form="ia" novalidate>
    <h2 id="dlg-ia-t">Gerar plano com IA</h2>
    <p class="fe2-modal-text">A IA usa o perfil, as restrições e a evolução de ${esc(nome)}. Você revisa antes de enviar.</p>
    ${campo({
      id: "days", label: "Tamanho do plano", value: "7",
      options: [
        { value: "1", label: "1 dia — testar uma ideia" },
        { value: "3", label: "3 dias — ajuste rápido" },
        { value: "7", label: "7 dias — semana completa" }
      ]
    })}
    ${campo({
      id: "notes", label: "Orientação para a IA", required: false, rows: 3, maxlength: 600,
      placeholder: "Ex.: reduzir lactose, incluir jantar leve, treino 19h."
    })}
    <p class="fe2-modal-err" role="alert" data-fe2-erro></p>
    <div data-fe2-ia-status aria-live="polite"></div>
    <div class="fe2-modal-acts">
      <button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-fechar>Cancelar</button>
      <button class="btn btn-primary btn-sm fe2-tap" type="submit">Gerar plano</button>
    </div>
  </form>
</dialog>`;

  const body = `
${estilosFE2}
${d ? "" : indisponivel({ oque: "Ficha", rota: `GET /api/org/members/${esc(o.userId)}` })}
${cabecalho}
<div class="grid-2col" style="margin-top:var(--sp-5)">
  <div>
    ${panel({ title: "Evolução de peso", body: blocoPeso })}
    ${panel({
      title: "Adesão por semana",
      sub: mediaAdesao !== null ? `média de ${mediaAdesao}%` : undefined,
      body: blocoAdesao
    })}
    ${panel({
      title: "Planos enviados",
      action: `<button class="btn btn-secondary btn-sm fe2-tap" type="button" data-fe2-abrir="dlg-ia">Gerar com IA</button>`,
      body: `<div data-fe2-planos>${blocoPlanos}</div>`
    })}
  </div>
  <div>
    ${panel({
      title: "Anotações clínicas",
      sub: "privadas",
      body: `${aviso(`Só você vê estas anotações. ${esc(nome)} não tem acesso a elas.`)}${blocoNotas}`
    })}
  </div>
</div>
${dialogoIa}`;

  return shell({
    title: nome,
    user: o.user,
    active: rota,
    islands: ["org"],
    bootstrap: {
      tela: "pessoa", papel: o.user.role, userId: o.userId, dados: d, rotaPessoas: rota,
      termos: { pessoa: t.pessoa, pessoas: t.pessoas }
    },
    body
  });
}

export default orgPessoa;
