import { shell } from "./shell.mjs";
import { header } from "../components/header.mjs";
import { footer } from "../components/footer.mjs";
import { icon } from "../components/icons.mjs";
import { illu } from "../components/illustrations.mjs";
import { trust } from "../components/sections.mjs";
import { site } from "../data/site.mjs";

const EMAIL = "contatonelsystems@gmail.com";

const PASSOS = [
  {
    illu: "consulta",
    title: "Você se cadastra",
    text: "Preenche o formulário abaixo com os dados da academia. A proposta vai direto para o nosso time comercial."
  },
  {
    illu: "academia",
    title: "A gente combina a comissão",
    text: "Em uma conversa curta definimos o percentual, o material de divulgação e o link exclusivo da sua unidade."
  },
  {
    illu: "evolucao",
    title: "Você recebe todo mês",
    text: "Cada aluno que assinar pelo seu link gera comissão recorrente enquanto a assinatura estiver ativa."
  }
];

const CAMPOS = [
  { id: "p-academia", label: "Nome da academia", auto: "organization", ph: "Como aparece na fachada", req: true },
  { id: "p-responsavel", label: "Nome do responsável", auto: "name", ph: "Quem vai falar com a gente", req: true },
  { id: "p-email", label: "E-mail", type: "email", auto: "email", ph: "voce@academia.com.br", req: true },
  { id: "p-whats", label: "WhatsApp", type: "tel", auto: "tel-national", ph: "(11) 90000-0000", req: true },
  { id: "p-cidade", label: "Cidade e estado", auto: "address-level2", ph: "São Paulo/SP", req: true }
];

const campo = (c) => `
<div class="field" data-field="${c.id}">
  <label class="field-label" for="${c.id}">${c.label}${c.req ? "" : ' <span class="soft">(opcional)</span>'}</label>
  <input class="input" id="${c.id}" name="${c.id}" type="${c.type || "text"}"
         autocomplete="${c.auto}" placeholder="${c.ph}" aria-describedby="err-${c.id}">
  <span class="field-error" id="err-${c.id}" role="alert"></span>
</div>`;

const page = () =>
  shell({
    title: "Seja parceiro Nutri&Live — comissão recorrente para academias",
    desc:
      "Indique o Nutri&Live para os seus alunos e receba comissão recorrente por cada assinatura ativa. Cadastre a sua academia pelo formulário.",
    canonical: "academias.html",
    bodyClass: "seg-academia",
    scripts: ["main", "parceiro"],
    ogImage: "assets/img/og-academia.jpg",
    body: `
${header({ current: "academia", cta: { label: "Quero ser parceiro", short: "Parceiro", href: "#cadastro" } })}
<main id="conteudo">

  <section class="hero hero-nu hero-academia" id="topo">
    <div class="container">
      <div class="hero-grid">
        <div class="hero-copy">
          <p class="eyebrow hero-eyebrow">Programa de parceria</p>
          <h1 class="display-1">Indique o Nutri&amp;Live e <span class="hl">ganhe todo mês</span>.</h1>
          <p class="lead">
            A sua academia não paga nada e não assina nada. Você indica, o aluno assina,
            e você recebe comissão recorrente enquanto a assinatura estiver ativa.
          </p>
          <div class="hero-cta">
            <a class="btn btn-light btn-lg" href="#cadastro">Cadastrar minha academia</a>
            <a class="link-arrow" href="#como-funciona">Como funciona</a>
          </div>
          <div class="hero-proof">
            <span class="icon-tile" style="width:34px;height:34px;border-radius:10px" aria-hidden="true">${icon.building()}</span>
            <p class="hero-proof-text">Sem mensalidade, sem meta e <strong>sem exclusividade</strong></p>
          </div>
        </div>
        <div class="hero-stage">
          <span class="hero-stage-glow" aria-hidden="true"></span>
          <div class="partner-art">${illu.academia()}</div>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="como-funciona">
    <div class="container">
      <div class="section-head" data-reveal>
        <h2>Três passos, e nenhum custo para você.</h2>
        <p class="lead measure">
          O programa é de indicação: quem assina é o aluno, direto com a gente.
          A academia não intermedeia pagamento nem assume obrigação com o assinante.
        </p>
      </div>
      <div class="steps mt-12" data-reveal-group>
        ${PASSOS.map(
          (s, i) => `<div class="step" data-reveal>
          <div class="step-art">${illu[s.illu]()}</div>
          <div class="step-num" aria-hidden="true">${i + 1}</div>
          <h3>${s.title}</h3>
          <p>${s.text}</p>
        </div>`
        ).join("")}
      </div>
    </div>
  </section>

  <section class="band section-deep">
    <div class="container">
      <div class="band-grid">
        <div data-reveal>
          <h2 class="display-2">Comissão recorrente, não pagamento único.</h2>
          <p class="lead" style="margin-top:1.25rem">
            Você recebe enquanto o aluno continuar assinando — não só no primeiro mês.
            O percentual e a forma de repasse são definidos na conversa inicial, por escrito.
          </p>
          <div class="cluster" style="margin-top:2rem">
            <a class="btn btn-light btn-lg" href="#cadastro">Quero receber a proposta</a>
          </div>
        </div>
        <div>
          <ul class="partner-facts" data-reveal="right">
            ${[
              ["wallet", "Sem investimento", "A academia não paga nada para entrar no programa."],
              ["link", "Link exclusivo", "Cada unidade recebe o seu, para a comissão ser rastreada."],
              ["users", "Sem exclusividade", "Você segue livre para trabalhar com quem quiser."],
              ["headset", "Material pronto", "Arte para recepção, story e grupo de alunos."]
            ]
              .map(
                (f) => `<li><span class="icon-tile icon-tile-deep" aria-hidden="true">${icon[f[0]]()}</span>
              <span><b>${f[1]}</b><span>${f[2]}</span></span></li>`
              )
              .join("")}
          </ul>
        </div>
      </div>
    </div>
  </section>

  <section class="section" id="cadastro">
    <div class="container">
      <div class="partner-layout">
        <div data-reveal="left">
          <p class="eyebrow">Cadastro</p>
          <h2 style="margin-top:.75rem">Conte da sua academia.</h2>
          <p class="lead" style="margin-top:1rem">
            São cinco campos. A gente responde em até um dia útil com a proposta de comissão.
          </p>
          <ul class="partner-notes">
            <li>${icon.mail()}<span>A proposta chega em <b>${EMAIL}</b> e a resposta vai para o e-mail que você informar.</span></li>
            <li>${icon.lock()}<span>Usamos os dados só para falar com você sobre a parceria.</span></li>
          </ul>
        </div>

        <form class="co-panel partner-form" id="form-parceiro" novalidate data-partner-form>
          <h3 class="co-panel-title" style="font-size:var(--fs-h4)">Dados da academia</h3>
          <div class="co-panel-body" style="margin-top:var(--sp-5)">
            ${CAMPOS.map(campo).join("")}

            <div class="field" data-field="p-alunos">
              <label class="field-label" for="p-alunos">Alunos ativos hoje</label>
              <select class="input" id="p-alunos" name="p-alunos" aria-describedby="err-p-alunos">
                <option value="">Selecione</option>
                <option>Até 150</option>
                <option>De 151 a 400</option>
                <option>De 401 a 800</option>
                <option>Mais de 800</option>
                <option>Rede com mais de uma unidade</option>
              </select>
              <span class="field-error" id="err-p-alunos" role="alert"></span>
            </div>

            <div class="field" data-field="p-msg">
              <label class="field-label" for="p-msg">Quer contar mais alguma coisa? <span class="soft">(opcional)</span></label>
              <textarea class="input" id="p-msg" name="p-msg" rows="3"
                placeholder="Número de unidades, sistema de gestão que usa, o que quiser"></textarea>
            </div>

            <button class="btn btn-primary btn-lg btn-block" type="submit" data-partner-submit style="margin-top:var(--sp-6)">
              ${icon.mail()}<span>Enviar cadastro</span>
            </button>
            <p class="field-error" id="err-partner" role="alert" style="justify-content:center;margin-top:1rem"></p>

            <div class="partner-sent" data-partner-sent hidden>
              <p><b>Pronto — abrimos o seu e-mail com a mensagem preenchida.</b></p>
              <p class="text-sm muted" style="margin-top:.5rem">
                Se nada abriu, o seu navegador pode não ter um e-mail configurado.
                Copie os dados e envie para <b>${EMAIL}</b>.
              </p>
              <div class="cluster" style="margin-top:1rem">
                <button class="btn btn-secondary btn-sm" type="button" data-partner-copy>${icon.copy()}<span>Copiar os dados</span></button>
                <a class="btn btn-secondary btn-sm" href="mailto:${EMAIL}">${icon.mail()}<span>${EMAIL}</span></a>
              </div>
            </div>

            <p class="text-xs soft" style="margin-top:1.25rem;text-align:center">
              Ao enviar, você concorda que a gente entre em contato sobre o programa de parceria.
              Nada é cobrado e nenhum contrato é assinado nesta etapa.
            </p>
          </div>
        </form>
      </div>
    </div>
  </section>

  ${trust()}

  <section class="section cta-final section-deep">
    <div class="container">
      <div style="max-width:44rem" data-reveal>
        <h2 class="display-2">Prefere conversar antes?</h2>
        <p class="lead" style="margin-top:1.25rem">
          Escreve para a gente e a proposta sai na mesma conversa, sem formulário.
        </p>
        <div class="cluster" style="margin-top:2rem">
          <a class="btn btn-light btn-lg" href="mailto:${EMAIL}?subject=${encodeURIComponent("Parceria Nutri&Live — academia")}">${icon.mail()}<span>${EMAIL}</span></a>
          <a class="btn btn-outline-light btn-lg" href="${site.whatsappHref}">${icon.whatsapp()}<span>WhatsApp</span></a>
        </div>
      </div>
    </div>
  </section>
</main>
${footer()}`
  });

export const pages = () => ({ "academias.html": page() });
