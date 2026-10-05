/* =========================================================================
   Tela: Conta.
   Dados pessoais, perfil de saúde (o que alimenta o cálculo das metas e a
   geração dos planos), assinatura com plano e próxima cobrança, troca de
   senha com medidor de força e cancelamento com confirmação honesta.
   Dados: GET /api/auth/me, GET /api/me/profile, GET /api/subscription/invoices
   Ações: PUT /api/me/profile            (contract.me.saveProfile)
          POST /api/auth/change-password (contract.auth.changePassword)
          POST /api/subscription/cancel  (contract.billing.cancel)
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { brl, campo, dataBR, esc, panel, pill, vazio } from "../components/index.js";
import { estilos, ic, indisponivel, num, opcoes } from "./_comuns.js";

export type PerfilConta = {
  birthDate?: string | null;
  sex?: string | null;
  heightCm?: number | null;
  goal?: string | null;
  activityLevel?: string | null;
  dietStyle?: string | null;
  restrictions?: string[] | null;
  dislikes?: string[] | null;
};

export type Assinatura = {
  planKey: string; planName: string; status: string;
  priceCents: number; method: string; currentPeriodEnd: string | null;
  /** false quando o acesso vem da assinatura da organização. */
  ownedByMe?: boolean;
  /** Nome de quem paga, quando não é a própria pessoa. */
  paidByName?: string | null;
};

export type Fatura = {
  id: string; amountCents: number; method: string;
  status: string; paidAt: string | null; createdAt: string;
};

export type DadosConta = {
  usuario: ShellUser;
  user: { id: string; name: string; email: string; role: string; status: string; orgId?: string | null };
  profile: PerfilConta | null;
  subscription: Assinatura | null;
  /** null quando GET /api/subscription/invoices não respondeu. */
  invoices: Fatura[] | null;
  metas?: { kcalTarget: number; proteinTargetG: number; waterTargetMl: number } | null;
  semServidor?: boolean;
};

/* ------------------------------- catálogos ------------------------------ */
export const SEXOS = [
  { value: "feminino", label: "Feminino" },
  { value: "masculino", label: "Masculino" },
  { value: "outro", label: "Prefiro não dizer" }
];

export const OBJETIVOS = [
  { valor: "emagrecer", rotulo: "Emagrecer" },
  { valor: "manter", rotulo: "Manter o peso" },
  { valor: "ganhar_massa", rotulo: "Ganhar massa" }
];

export const ATIVIDADES = [
  { value: "sedentario", label: "Sedentário — pouco ou nenhum exercício" },
  { value: "leve", label: "Leve — 1 a 3 dias por semana" },
  { value: "moderado", label: "Moderado — 3 a 5 dias por semana" },
  { value: "intenso", label: "Intenso — 6 a 7 dias por semana" },
  { value: "atleta", label: "Atleta — treino pesado todo dia" }
];

export const ESTILOS = [
  { value: "tudo", label: "Como de tudo" },
  { value: "vegetariana", label: "Vegetariana" },
  { value: "vegana", label: "Vegana" },
  { value: "pescetariana", label: "Pescetariana" },
  { value: "low_carb", label: "Low carb" },
  { value: "mediterranea", label: "Mediterrânea" }
];

export const RESTRICOES = [
  { valor: "lactose", rotulo: "Lactose" },
  { valor: "glúten", rotulo: "Glúten" },
  { valor: "ovo", rotulo: "Ovo" },
  { valor: "amendoim", rotulo: "Amendoim" },
  { valor: "oleaginosas", rotulo: "Castanhas e nozes" },
  { valor: "peixe", rotulo: "Peixe" },
  { valor: "frutos do mar", rotulo: "Frutos do mar" },
  { valor: "soja", rotulo: "Soja" }
];

const ROTULO_METODO: Record<string, string> = { credito: "Cartão de crédito", debito: "Cartão de débito", pix: "Pix" };
const ROTULO_ESTADO: Record<string, string> = {
  ativa: "Ativa", pendente: "Pagamento pendente", atrasada: "Pagamento atrasado",
  cancelada: "Cancelada", expirada: "Expirada"
};
const TOM_ESTADO: Record<string, "ok" | "atencao" | "risco" | "neutro"> = {
  ativa: "ok", pendente: "atencao", atrasada: "risco", cancelada: "neutro", expirada: "neutro"
};

/* ------------------------------ auxiliares ------------------------------ */
/* O perfil pode ter sido gravado com outros rótulos (um import, a ficha da
   nutricionista). Normaliza para o que os campos desta tela conhecem.      */
export const normalizarSexo = (v: unknown): string => {
  const t = String(v ?? "").trim().toLowerCase();
  if (!t) return "";
  if (t.startsWith("f")) return "feminino";
  if (t.startsWith("m") && t !== "mulher") return "masculino";
  return "outro";
};

export const normalizarObjetivo = (v: unknown): string => {
  const t = String(v ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (["emagrecer", "perder", "perder_peso", "secar", "deficit"].includes(t)) return "emagrecer";
  if (["ganhar_massa", "ganhar", "massa", "hipertrofia", "ganho_de_massa"].includes(t)) return "ganhar_massa";
  return "manter";
};

export const normalizarAtividade = (v: unknown): string => {
  const t = String(v ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  return ATIVIDADES.some((a) => a.value === t) ? t : "moderado";
};

export const normalizarEstilo = (v: unknown): string => {
  const t = String(v ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (!t || t === "tradicional" || t === "sem_restricao") return "tudo";
  if (t === "vegetariano") return "vegetariana";
  if (t === "vegano") return "vegana";
  if (t === "pescetariano") return "pescetariana";
  return ESTILOS.some((e) => e.value === t) ? t : "tudo";
};

/** As restrições que não estão na lista de caixas viram texto livre. */
export function separarRestricoes(todas: string[] | null | undefined): { marcadas: string[]; outras: string } {
  const conhecidas = new Set(RESTRICOES.map((r) => r.valor));
  const marcadas: string[] = [];
  const outras: string[] = [];
  for (const r of todas ?? []) {
    const t = String(r).trim();
    if (!t) continue;
    if (conhecidas.has(t.toLowerCase())) marcadas.push(t.toLowerCase());
    else outras.push(t);
  }
  return { marcadas, outras: outras.join(", ") };
}

/* -------------------------------- blocos -------------------------------- */
const formularioPerfil = (d: DadosConta): string => {
  const p = d.profile ?? {};
  const { marcadas, outras } = separarRestricoes(p.restrictions);

  const pessoais = panel({
    title: "Dados pessoais",
    body: `
<div class="nl-campos-2">
  <div class="field">
    <label class="field-label" for="nome-fixo">Nome</label>
    <input class="input nl-ro" id="nome-fixo" type="text" value="${esc(d.user.name)}" readonly
           autocomplete="name" aria-describedby="dica-identidade">
  </div>
  <div class="field">
    <label class="field-label" for="email-fixo">E-mail</label>
    <input class="input nl-ro" id="email-fixo" type="email" value="${esc(d.user.email)}" readonly
           autocomplete="email" aria-describedby="dica-identidade">
  </div>
</div>
<p class="field-hint" id="dica-identidade">
  Nome e e-mail são a sua identidade na conta e no recibo. Para mudar, fale com o suporte:
  <a class="link" href="mailto:ajuda@nutrielive.com.br">ajuda@nutrielive.com.br</a>.
</p>
<div class="nl-campos-2" style="margin-top:var(--sp-5)">
  ${campo({ id: "birthDate", label: "Nascimento", type: "date",
            value: String(p.birthDate ?? "").slice(0, 10), hint: "Entra no cálculo das suas metas." })}
  ${campo({ id: "sex", label: "Sexo", options: [{ value: "", label: "Selecione" }, ...SEXOS],
            value: normalizarSexo(p.sex) })}
  ${campo({ id: "heightCm", label: "Altura", required: false, inputmode: "numeric",
            value: p.heightCm ? String(p.heightCm) : "", placeholder: "167", hint: "em centímetros" })}
</div>`
  });

  const saude = panel({
    title: "Perfil de saúde",
    sub: "é daqui que saem as suas metas e os seus planos",
    body: `
${opcoes({ nome: "goal", legenda: "Objetivo", valor: normalizarObjetivo(p.goal), itens: OBJETIVOS })}
<div style="margin-top:var(--sp-5)">
  ${campo({ id: "activityLevel", label: "Nível de atividade", options: ATIVIDADES,
            value: normalizarAtividade(p.activityLevel) })}
</div>
${campo({ id: "dietStyle", label: "Estilo alimentar", options: ESTILOS, value: normalizarEstilo(p.dietStyle) })}

<fieldset class="nl-opcoes" style="margin-top:var(--sp-5)">
  <legend class="field-label">Restrições</legend>
  <p class="field-hint" style="margin-top:0">Nada que você marcar aqui entra nos seus planos nem nas receitas.</p>
  <div class="nl-caixas">
    ${RESTRICOES.map((r) => `<label class="nl-caixa">
      <input type="checkbox" name="restriction" value="${esc(r.valor)}"${marcadas.includes(r.valor) ? " checked" : ""}>
      <span>${esc(r.rotulo)}</span>
    </label>`).join("")}
  </div>
</fieldset>
<div style="margin-top:var(--sp-4)">
  ${campo({ id: "restrictionsOutras", label: "Outras restrições", required: false, value: outras,
            placeholder: "camarão, pimenta", hint: "Separe por vírgula." })}
  ${campo({ id: "dislikes", label: "O que você não gosta", required: false,
            value: (p.dislikes ?? []).join(", "), placeholder: "jiló, fígado, beterraba",
            hint: "Separe por vírgula. A gente evita, mas não trata como alergia." })}
</div>
<div class="nl-alerta" role="alert" data-nl="erro-perfil">${ic("alerta", 18)}<span data-nl="erro-perfil-texto"></span></div>
<button class="btn btn-primary btn-lg btn-block nl-cta" type="submit">Salvar perfil</button>`
  });

  return `<form id="form-perfil" novalidate>${pessoais}${saude}</form>`;
};

const blocoMetas = (d: DadosConta): string => {
  const m = d.metas;
  return panel({
    title: "Suas metas de hoje",
    sub: "recalculadas a cada mudança no perfil",
    id: "painel-metas",
    body: m
      ? `<div class="nl-pares" data-nl="metas">
  <div><p class="nl-rotulo">Calorias</p><p class="nl-forte" data-nl="meta-kcal">${esc(num(m.kcalTarget))}</p><p class="nl-legenda">kcal por dia</p></div>
  <div><p class="nl-rotulo">Proteína</p><p class="nl-forte" data-nl="meta-prot">${esc(num(m.proteinTargetG))}</p><p class="nl-legenda">gramas por dia</p></div>
  <div><p class="nl-rotulo">Água</p><p class="nl-forte" data-nl="meta-agua">${esc(num(m.waterTargetMl))}</p><p class="nl-legenda">ml por dia</p></div>
</div>
<p class="nl-legenda" style="margin-top:var(--sp-4)">Valor de referência, não prescrição. Quem acompanha você pode ajustar.</p>`
      : `<div class="nl-pares" data-nl="metas">
  <div><p class="nl-rotulo">Calorias</p><p class="nl-forte" data-nl="meta-kcal">—</p><p class="nl-legenda">kcal por dia</p></div>
  <div><p class="nl-rotulo">Proteína</p><p class="nl-forte" data-nl="meta-prot">—</p><p class="nl-legenda">gramas por dia</p></div>
  <div><p class="nl-rotulo">Água</p><p class="nl-forte" data-nl="meta-agua">—</p><p class="nl-legenda">ml por dia</p></div>
</div>
<p class="nl-legenda" style="margin-top:var(--sp-4)">Preencha altura, nascimento e objetivo e as metas aparecem aqui.</p>`
  });
};

const blocoAssinatura = (d: DadosConta): string => {
  const s = d.subscription;
  if (!s) {
    return panel({
      title: "Assinatura",
      id: "painel-assinatura",
      body: d.user.orgId
        ? `<p class="nl-legenda" style="font-size:var(--fs-sm)">
             O seu acesso vem da organização que acompanha você. Não há cobrança nem assinatura no seu nome.
           </p>`
        : vazio({
            titulo: "Sem assinatura ativa",
            texto: "Você está sem um plano pago no momento. Escolha um plano para liberar o app completo.",
            acao: `<a class="btn btn-primary" href="/checkout.html">Ver planos</a>`,
            icone: ic("cadeado", 24)
          })
    });
  }
  const estado = String(s.status).toLowerCase();
  const cancelada = estado === "cancelada" || estado === "expirada";

  /* Duas situações em que este painel NÃO deve mostrar um preço:

     1. Academia parceira: não paga mensalidade. A coluna `method` do banco
        guarda um valor qualquer do enum, e exibir "Pix" para quem não é
        cobrado é mentira. Preço zero é o sinal.
     2. Paciente, aluno e nutricionista funcionária: o acesso vem da
        assinatura da organização. Mostrar "R$ 149,90 no cartão de crédito"
        para o paciente é dizer que ele paga aquilo — ele não paga nada, e
        não há botão de cancelar que faça sentido na mão dele. */
  const semCobranca = s.priceCents === 0;
  const viaOrganizacao = s.ownedByMe === false;
  const minha = !semCobranca && !viaOrganizacao;
  const quemPaga = s.paidByName ?? "a organização que cadastrou você";

  const linhas = viaOrganizacao
    ? `
  <div><dt>Plano</dt><dd>${esc(s.planName || s.planKey)}</dd></div>
  <div><dt>Quem mantém</dt><dd>${esc(quemPaga)}</dd></div>
  <div><dt>Você paga</dt><dd>Nada — o acesso é pela organização</dd></div>
  <div><dt>Acesso</dt><dd data-nl="proxima-cobranca">${cancelada
      ? `até ${esc(dataBR(s.currentPeriodEnd))}`
      : "liberado enquanto o vínculo estiver ativo"}</dd></div>`
    : `
  <div><dt>Plano</dt><dd>${esc(s.planName || s.planKey)}</dd></div>
  <div><dt>Valor</dt><dd>${semCobranca ? "Sem mensalidade" : esc(brl(s.priceCents))}</dd></div>
  <div><dt>Forma de pagamento</dt>
       <dd>${semCobranca ? "Não há cobrança" : esc(ROTULO_METODO[s.method] ?? s.method)}</dd></div>
  <div><dt>${semCobranca ? "Modelo" : cancelada ? "Acesso até" : "Próxima cobrança"}</dt>
       <dd data-nl="proxima-cobranca">${semCobranca ? "Comissão por aluno assinante" : esc(dataBR(s.currentPeriodEnd))}</dd></div>`;

  const rodape = viaOrganizacao
    ? `<p class="notice" style="margin-top:var(--sp-5)" role="status">${ic("info", 18)}
       <span>Quem cuida desta assinatura é <b>${esc(quemPaga)}</b>. Para sair, fale com
       ${esc(quemPaga)} — aqui você só gerencia os seus dados e a sua senha.</span></p>`
    : cancelada
      ? `<p class="notice" style="margin-top:var(--sp-5)" role="status">${ic("alerta", 18)}
         <span>Assinatura cancelada. O acesso continua até <b>${esc(dataBR(s.currentPeriodEnd))}</b>.</span></p>`
      : minha
        ? `<div class="nl-acoes">
           <button class="btn btn-ghost" type="button" data-nl="abrir-cancelar">Cancelar assinatura</button>
         </div>`
        : "";

  return panel({
    title: viaOrganizacao ? "Seu acesso" : "Assinatura",
    id: "painel-assinatura",
    action: pill(ROTULO_ESTADO[estado] ?? s.status, TOM_ESTADO[estado] ?? "neutro"),
    body: `<dl class="nl-kv">${linhas}
</dl>
${rodape}`
  });
};

const blocoFaturas = (d: DadosConta): string => {
  const f = d.invoices;
  if (f === null) {
    return panel({
      title: "Faturas",
      body: indisponivel({
        titulo: "As faturas não carregaram",
        texto: "O histórico de cobranças ficou indisponível por um instante.",
        recarrega: false
      })
    });
  }
  if (!f.length) {
    return panel({
      title: "Faturas",
      body: `<p class="nl-legenda" style="font-size:var(--fs-sm)">Nenhuma cobrança registrada ainda.</p>`
    });
  }
  return panel({
    title: "Faturas",
    sub: `${f.length} ${f.length === 1 ? "cobrança" : "cobranças"}`,
    body: `<ul class="nl-lista">${f.map((i) => `
  <li class="nl-linha">
    <span class="nl-linha-corpo">
      <b>${esc(brl(i.amountCents))}</b>
      <small>${esc(ROTULO_METODO[i.method] ?? i.method)} · ${esc(dataBR(i.paidAt ?? i.createdAt))}</small>
    </span>
    <span class="nl-linha-meta">${pill(
      i.status === "aprovado" ? "Paga" : i.status === "pendente" ? "Pendente" : i.status === "estornado" ? "Estornada" : i.status,
      i.status === "aprovado" ? "ok" : i.status === "pendente" ? "atencao" : "neutro"
    )}</span>
  </li>`).join("")}</ul>`
  });
};

const blocoSenha = panel({
  title: "Trocar senha",
  id: "painel-senha",
  body: `
<form id="form-senha" novalidate>
  ${campo({ id: "current", label: "Senha atual", type: "password", autocomplete: "current-password" })}
  <div class="field" data-field="next">
    <label class="field-label" for="next">Nova senha</label>
    <input class="input" id="next" name="next" type="password" autocomplete="new-password"
           aria-describedby="err-next forca-senha regras-senha">
    <div class="pw-meter" data-nl="forca" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <p class="nl-barra-senha-nota" id="forca-senha" role="status" data-nl="forca-texto">Use oito caracteres ou mais.</p>
    <ul class="nl-regras" id="regras-senha" data-nl="regras">
      <li data-regra="tamanho">Pelo menos 8 caracteres</li>
      <li data-regra="letra">Uma letra</li>
      <li data-regra="numero">Um número</li>
      <li data-regra="variado">Maiúscula ou símbolo</li>
    </ul>
    <span class="field-error" id="err-next" role="alert"></span>
  </div>
  ${campo({ id: "confirm", label: "Repita a nova senha", type: "password", autocomplete: "new-password" })}
  <div class="nl-alerta" role="alert" data-nl="erro-senha">${ic("alerta", 18)}<span data-nl="erro-senha-texto"></span></div>
  <button class="btn btn-secondary btn-block nl-cta" type="submit">Trocar senha</button>
</form>`
});

const dialogoCancelar = (d: DadosConta): string => {
  const ate = d.subscription?.currentPeriodEnd ?? null;
  return `
<dialog class="nl-modal" id="dlg-cancelar" aria-labelledby="dlg-cancelar-t">
  <form class="nl-modal-in" id="form-cancelar" novalidate>
    <h2 id="dlg-cancelar-t">Cancelar a assinatura</h2>
    <p class="nl-modal-texto">
      Você não será mais cobrado. <b>O acesso continua até ${esc(dataBR(ate))}</b>, o fim do período
      que você já pagou — nada é cortado hoje e nada é devolvido proporcionalmente.
      Seus registros, planos e receitas continuam salvos se você voltar.
    </p>
    ${campo({ id: "motivo", label: "Por que está saindo?", required: false, options: [
      { value: "", label: "Prefiro não dizer" },
      { value: "preco", label: "Está caro para mim" },
      { value: "pouco_uso", label: "Não usei o quanto imaginei" },
      { value: "resultado", label: "Não vi o resultado que esperava" },
      { value: "outro_app", label: "Vou usar outro aplicativo" },
      { value: "objetivo_atingido", label: "Já atingi o meu objetivo" },
      { value: "outro", label: "Outro motivo" }
    ] })}
    ${campo({ id: "reason", label: "Quer contar mais?", required: false, rows: 3, maxlength: 400,
              placeholder: "O que faltou para a Nutri&Live valer a pena para você?" })}
    <div class="field" data-field="ciente" style="margin-top:var(--sp-4)">
      <label class="nl-ciente" for="ciente">
        <input type="checkbox" id="ciente" name="ciente">
        <span class="nl-tick" aria-hidden="true">${ic("certo", 14)}</span>
        <span>Entendi que o acesso termina em <b>${esc(dataBR(ate))}</b></span>
      </label>
      <span class="field-error" id="err-ciente" role="alert"></span>
    </div>
    <p class="nl-modal-erro" role="alert" data-nl="erro-cancelar"></p>
    <div class="nl-modal-acoes">
      <button class="btn btn-secondary" type="button" data-nl="fechar-cancelar">Continuar assinante</button>
      <button class="btn nl-btn-perigo" type="submit">Cancelar assinatura</button>
    </div>
  </form>
</dialog>`;
};

/* -------------------------------- tela ---------------------------------- */
export function paginaConta(d: DadosConta): string {
  const corpo = `
${d.semServidor ? indisponivel({
    titulo: "Parte da sua conta não carregou",
    texto: "Perfil ou assinatura ficaram indisponíveis por um instante. O que aparecer em branco volta ao recarregar."
  }) + `<div style="height:var(--sp-5)"></div>` : ""}
<div class="nl-grade-2">
  <div>
    ${formularioPerfil(d)}
    ${blocoSenha}
  </div>
  <div>
    ${blocoMetas(d)}
    ${blocoAssinatura(d)}
    ${blocoFaturas(d)}
  </div>
</div>
${d.subscription ? dialogoCancelar(d) : ""}`;

  return shell({
    title: "Conta",
    user: d.usuario,
    active: "/conta",
    islands: ["conta"],
    bootstrap: {
      perfil: d.profile,
      assinatura: d.subscription,
      acessoAte: d.subscription?.currentPeriodEnd ?? null
    },
    body: estilos() + `<style>
.nl-campos-2{display:grid;gap:var(--sp-4);grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr));
  align-items:start}
.nl-campos-2 .field + .field{margin-top:0}
.nl-ro{background:var(--ink-50);color:var(--text-muted);cursor:default}
.nl-ciente{display:flex;align-items:center;gap:.75rem;min-height:52px;padding:.625rem .875rem;cursor:pointer;
  border:1.5px solid var(--border-control);border-radius:var(--r-md);background:var(--white);
  font-size:var(--fs-sm);line-height:1.4}
.nl-ciente input{position:absolute;opacity:0;width:0;height:0}
.nl-ciente:has(input:checked){border-color:var(--leaf-600);background:var(--leaf-50)}
.nl-ciente:has(input:focus-visible){box-shadow:var(--sh-focus)}
.nl-ciente input:checked + .nl-tick{background:var(--leaf-600);border-color:var(--leaf-600);color:#fff}
.nl-kv{display:grid;gap:.75rem 1.25rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))}
.nl-kv dt{font-size:var(--fs-xs);font-weight:var(--fw-semi);letter-spacing:var(--ls-wide);
  text-transform:uppercase;color:var(--ink-500)}
.nl-kv dd{font-size:var(--fs-sm);font-weight:var(--fw-semi);margin-top:2px}
#painel-metas .nl-pares{grid-template-columns:repeat(auto-fit,minmax(min(100%,7rem),1fr));gap:var(--sp-4)}
.nl-btn-perigo{--btn-bg:var(--danger-600);--btn-fg:var(--white);background:var(--danger-600);color:var(--white)}
.nl-btn-perigo:hover{background:#B93A33}
.nl-modal{border:0;padding:0;background:transparent;max-width:none;max-height:none;width:100%;height:100%}
.nl-modal::backdrop{background:rgba(7,31,21,.5)}
.nl-modal-in{background:var(--white);border-radius:var(--r-xl);box-shadow:var(--sh-xl);
  width:min(32rem,calc(100vw - 1.5rem));margin:auto;padding:var(--sp-6);position:absolute;inset:0;
  height:max-content;max-height:calc(100vh - 2rem);overflow:auto}
.nl-modal-in h2{font-size:var(--fs-h4);font-weight:var(--fw-black);letter-spacing:-0.02em}
.nl-modal-texto{margin-top:.625rem;font-size:var(--fs-sm);color:var(--text-muted);line-height:var(--lh-body)}
.nl-modal-in .field{margin-top:var(--sp-4)}
.nl-modal-erro{display:none;margin-top:var(--sp-4);font-size:var(--fs-sm);color:var(--danger-600);
  font-weight:var(--fw-semi)}
.nl-modal-erro[data-cheio="1"]{display:block}
.nl-modal-acoes{display:flex;gap:.5rem;justify-content:flex-end;margin-top:var(--sp-6);flex-wrap:wrap}
.nl-modal-acoes .btn{flex:1 1 auto;min-height:44px}
@media(min-width:480px){.nl-modal-acoes .btn{flex:0 0 auto}}
#form-perfil .panel + .panel{margin-top:var(--sp-5)}
</style>` + corpo
  });
}

export default paginaConta;
