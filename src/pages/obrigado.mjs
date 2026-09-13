import { shell } from "./shell.mjs";
import { brand } from "../components/brand.mjs";
import { icon } from "../components/icons.mjs";
import { footer } from "../components/footer.mjs";
import { site } from "../data/site.mjs";

const page = () =>
  shell({
    title: "Assinatura confirmada — Nutri&Live",
    desc: "Sua assinatura do Nutri&Live está ativa. Veja os próximos passos para começar hoje.",
    canonical: "obrigado.html",
    bodyClass: "checkout-page",
    scripts: ["obrigado"],
    body: `
<header class="co-header">
  <div class="container co-header-inner">
    ${brand({})}
    <span class="co-secure" data-head-badge>${icon.shield()} Pagamento confirmado</span>
  </div>
</header>

<main class="co-main" id="conteudo">
  <div class="container">
    <div class="success-hero">
      <div class="success-check" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none"><path d="M20 6.5 9.6 17 4 11.4" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <h1 class="display-2" data-greeting tabindex="-1">Tudo certo!</h1>
      <p class="lead" style="margin-top:1rem" data-success-line>
        Sua assinatura está ativa. Enviamos o acesso para o seu e-mail.
      </p>
      <p class="success-paid" data-paid-line hidden></p>
      <div class="cluster" style="justify-content:center;margin-top:2rem">
        <a class="btn btn-primary btn-lg" href="#" data-noop>${icon.play_store()} Baixar o app</a>
        <a class="btn btn-secondary btn-lg" href="#" data-noop>Abrir no navegador</a>
      </div>
    </div>

    <div class="co-panel receipt">
      <div class="co-panel-head">
        <div>
          <h2 class="co-panel-title" style="font-size:var(--fs-h4)">Resumo da assinatura</h2>
          <p class="co-panel-sub">Pedido <b data-order-id>—</b></p>
        </div>
        <span class="badge badge-lime">Ativa</span>
      </div>
      <div class="co-panel-body" style="margin-top:1.25rem">
        <div class="co-line"><span class="cl-label">Plano</span><span class="cl-value" data-r-plan>—</span></div>
        <div class="co-line"><span class="cl-label">Ciclo</span><span class="cl-value" data-r-cycle>—</span></div>
        <div class="co-line">
          <span class="cl-label">Forma de pagamento</span>
          <span class="cl-value">
            <span data-r-method>—</span>
            <small class="receipt-sub" data-r-method-sub hidden></small>
          </span>
        </div>
        <div class="co-line" data-r-coupon-row hidden>
          <span class="cl-label">Cupom</span><span class="cl-value" data-r-coupon>—</span>
        </div>
        <div class="co-line"><span class="cl-label">Próxima cobrança</span><span class="cl-value" data-r-renew>—</span></div>
        <div class="co-total">
          <span class="ct-label">Pago hoje</span>
          <span class="ct-value tnum" data-r-total>—</span>
          <small class="ct-note" data-r-after hidden></small>
        </div>
        <p class="text-xs soft" style="margin-top:1rem">A nota fiscal chega no seu e-mail em até 24 horas. Você pode ver e baixar todas as faturas no app, em <b>Menu › Assinatura</b>.</p>
      </div>
    </div>

    <div class="next-steps">
      <h2 style="font-size:var(--fs-h3)">Comece por aqui</h2>
      ${[
        ["phone", "Baixe o app e entre com o seu e-mail", "Enviamos um link mágico — sem senha para inventar nem esquecer."],
        ["clipboard", "Responda 2 minutos de perguntas", "Rotina, restrições, objetivo. É o que faz o plano ser seu de verdade."],
        ["sparkles", "Gere o seu primeiro plano", "Em cerca de 40 segundos você tem plano, receitas e lista de compras."]
      ]
        .map(
          (s, i) => `<div class="card" style="display:flex;gap:1rem;align-items:flex-start">
        <span class="step-num" style="margin:0">${i + 1}</span>
        <span>
          <b style="display:block;font-size:var(--fs-h4);letter-spacing:-.015em">${s[1]}</b>
          <span class="text-sm muted" style="display:block;margin-top:.25rem">${s[2]}</span>
        </span>
      </div>`
        )
        .join("")}
    </div>

    <div class="notice" style="max-width:34rem;margin:2rem auto 0">
      ${icon.refresh()}
      <span><b>Mudou de ideia?</b> Você tem 30 dias para pedir o reembolso integral, sem precisar explicar nada. É só falar com a gente pelo app ou no <a class="link" href="${site.whatsappHref}">WhatsApp</a>.</span>
    </div>
  </div>
</main>
${footer()}`
  });

export const pages = () => ({ "obrigado.html": page() });
