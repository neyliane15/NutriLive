import { shell } from "./shell.mjs";
import { brand } from "../components/brand.mjs";
import { icon } from "../components/icons.mjs";
import { site, trustFacts } from "../data/site.mjs";
import { content, order } from "../data/segments.mjs";

/* Plan catalogue exposed to the client so the summary can react to ?plan= */
const catalogue = () => {
  const out = {};
  for (const k of order) {
    out[k] = {
      label: content[k].navLabel,
      plans: content[k].plans.map((p) => ({
        key: p.planKey,
        name: p.name,
        desc: p.desc,
        monthly: p.monthly,
        yearly: p.yearly,
        featured: !!p.featured,
        top: p.features.slice(0, 4)
      }))
    };
  }
  return out;
};

const stepper = () => `
<div class="co-steps" role="group" aria-label="Etapas da assinatura">
  <div class="co-step" data-step-ind="1" data-state="current">
    <span class="co-step-dot" aria-hidden="true">1</span><span class="co-step-label">Seus dados</span>
  </div>
  <span class="co-step-line" aria-hidden="true"></span>
  <div class="co-step" data-step-ind="2" data-state="todo">
    <span class="co-step-dot" aria-hidden="true">2</span><span class="co-step-label">Pagamento</span>
  </div>
  <span class="co-step-line" aria-hidden="true"></span>
  <div class="co-step" data-step-ind="3" data-state="todo">
    <span class="co-step-dot" aria-hidden="true">3</span><span class="co-step-label">Pronto</span>
  </div>
  <p class="co-steps-now sr-only" data-step-now>Etapa 1 de 3: seus dados.</p>
</div>`;

const cardBrandSvg = `
<svg class="cc-brandmark" viewBox="0 0 48 16" aria-hidden="true" data-brand-mark>
  <text x="48" y="12.5" text-anchor="end" font-family="Inter, sans-serif" font-size="11" font-weight="800" letter-spacing="-0.02em" fill="currentColor" data-brand-text></text>
</svg>`;

/* A dismissible, instructive alert used for declined payments. */
const payAlert = () => `
<div class="pay-alert" data-pay-alert hidden>
  <div class="pay-alert-icon" aria-hidden="true">${icon.alert()}</div>
  <div class="pay-alert-body">
    <p class="pay-alert-title" data-pay-alert-title></p>
    <p class="pay-alert-text" data-pay-alert-text></p>
    <ul class="pay-alert-list" data-pay-alert-list></ul>
    <div class="pay-alert-actions">
      <button class="btn btn-secondary btn-sm" type="button" data-pay-retry>Tentar de novo</button>
      <button class="btn btn-ghost btn-sm" type="button" data-pay-switch-pix>${icon.pix()} Pagar com Pix</button>
    </div>
    <p class="pay-alert-code text-2xs" data-pay-alert-code></p>
  </div>
</div>`;

const creditPanel = () => `
<div class="pm-panel" id="pm-credito" role="tabpanel" aria-labelledby="tab-credito">
  <div class="cc-preview" data-cc-preview data-face="front" aria-hidden="true">
    <div class="cc-card">
      <div class="cc-face cc-front">
        <div class="cc-top">
          <span class="cc-chip"></span>
          <span class="cc-brand" data-cc-brand>${cardBrandSvg}</span>
        </div>
        <div class="cc-number" data-cc-number>
          <span class="ph">••••</span><span class="ph">••••</span><span class="ph">••••</span><span class="ph">••••</span>
        </div>
        <div class="cc-bottom">
          <span class="cc-name">
            <span class="cc-fieldlabel">Nome no cartão</span>
            <span class="cc-fieldvalue" data-cc-name>Seu nome aqui</span>
          </span>
          <span class="cc-exp">
            <span class="cc-fieldlabel">Validade</span>
            <span class="cc-fieldvalue" data-cc-exp>MM/AA</span>
          </span>
        </div>
      </div>
      <div class="cc-face cc-back">
        <div class="cc-magstripe"></div>
        <div class="cc-cvvrow">
          <span class="cc-fieldlabel">CVV</span>
          <span class="cc-cvvbox" data-cc-cvv>•••</span>
        </div>
        <p class="cc-backnote">Os 3 dígitos ficam no verso do cartão, ao lado da assinatura. Na Amex são 4 dígitos na frente.</p>
      </div>
    </div>
  </div>

  <div class="field" data-field="numero">
    <label class="field-label" for="cc-numero">Número do cartão</label>
    <div class="input-wrap">
      <input class="input" id="cc-numero" name="cc-numero" type="text" inputmode="numeric" pattern="[0-9 ]*"
             enterkeyhint="next" autocomplete="section-credito cc-number"
             placeholder="0000 0000 0000 0000" maxlength="23" aria-describedby="err-numero" spellcheck="false">
      <span class="input-affix" data-brand-affix></span>
    </div>
    <span class="field-error" id="err-numero" role="alert"></span>
  </div>

  <div class="field" data-field="nome">
    <label class="field-label" for="cc-nome">Nome impresso no cartão</label>
    <input class="input" id="cc-nome" name="cc-nome" type="text" enterkeyhint="next"
           autocomplete="section-credito cc-name" placeholder="Como está no cartão"
           aria-describedby="err-nome" spellcheck="false" autocapitalize="characters">
    <span class="field-error" id="err-nome" role="alert"></span>
  </div>

  <div class="field-row field-row-2">
    <div class="field" data-field="validade">
      <label class="field-label" for="cc-validade">Validade</label>
      <input class="input" id="cc-validade" name="cc-validade" type="text" inputmode="numeric" pattern="[0-9/]*"
             enterkeyhint="next" autocomplete="section-credito cc-exp"
             placeholder="MM/AA" maxlength="5" aria-describedby="err-validade">
      <span class="field-error" id="err-validade" role="alert"></span>
    </div>
    <div class="field" data-field="cvv">
      <label class="field-label" for="cc-cvv">Código de segurança
        <button class="info-dot" type="button" data-cvv-help aria-expanded="false" aria-controls="cvv-help">
          <span aria-hidden="true">?</span><span class="sr-only">Onde fica o código de segurança</span>
        </button>
      </label>
      <input class="input" id="cc-cvv" name="cc-cvv" type="text" inputmode="numeric" pattern="[0-9]*"
             enterkeyhint="done" autocomplete="section-credito cc-csc"
             placeholder="CVV" maxlength="4" aria-describedby="err-cvv cvv-help">
      <span class="field-hint" id="cvv-help" hidden>São os 3 dígitos do verso do cartão. Na Amex, são 4 na frente.</span>
      <span class="field-error" id="err-cvv" role="alert"></span>
    </div>
  </div>

  <div class="notice" style="margin-top:1.5rem">
    ${icon.refresh()}
    <span><b>Cobrança automática todo mês.</b> Avisamos por e-mail 3 dias antes de cada renovação, e você cancela em 2 toques no app — sem multa.</span>
  </div>
</div>`;

const debitPanel = () => `
<div class="pm-panel" id="pm-debito" role="tabpanel" aria-labelledby="tab-debito" hidden>
  <div class="notice" style="margin-bottom:1.5rem">
    ${icon.info()}
    <span><b>Como funciona o débito recorrente.</b> Você autoriza uma vez e, todo mês, o valor sai direto da sua conta. Na primeira cobrança o seu banco pode pedir uma confirmação no app dele.</span>
  </div>

  <div class="field" data-field="dnumero">
    <label class="field-label" for="db-numero">Número do cartão de débito</label>
    <div class="input-wrap">
      <input class="input" id="db-numero" name="db-numero" type="text" inputmode="numeric" pattern="[0-9 ]*"
             enterkeyhint="next" autocomplete="section-debito cc-number"
             placeholder="0000 0000 0000 0000" maxlength="23" aria-describedby="err-dnumero" spellcheck="false">
      <span class="input-affix" data-brand-affix></span>
    </div>
    <span class="field-error" id="err-dnumero" role="alert"></span>
  </div>

  <div class="field" data-field="dnome">
    <label class="field-label" for="db-nome">Nome impresso no cartão</label>
    <input class="input" id="db-nome" name="db-nome" type="text" enterkeyhint="next"
           autocomplete="section-debito cc-name" placeholder="Como está no cartão"
           aria-describedby="err-dnome" spellcheck="false" autocapitalize="characters">
    <span class="field-error" id="err-dnome" role="alert"></span>
  </div>

  <div class="field-row field-row-2">
    <div class="field" data-field="dvalidade">
      <label class="field-label" for="db-validade">Validade</label>
      <input class="input" id="db-validade" name="db-validade" type="text" inputmode="numeric" pattern="[0-9/]*"
             enterkeyhint="next" autocomplete="section-debito cc-exp"
             placeholder="MM/AA" maxlength="5" aria-describedby="err-dvalidade">
      <span class="field-error" id="err-dvalidade" role="alert"></span>
    </div>
    <div class="field" data-field="dcvv">
      <label class="field-label" for="db-cvv">Código de segurança</label>
      <input class="input" id="db-cvv" name="db-cvv" type="text" inputmode="numeric" pattern="[0-9]*"
             enterkeyhint="done" autocomplete="section-debito cc-csc"
             placeholder="CVV" maxlength="4" aria-describedby="err-dcvv">
      <span class="field-error" id="err-dcvv" role="alert"></span>
    </div>
  </div>

  <fieldset class="bank-fieldset" data-field="banco">
    <legend class="field-label">Seu banco</legend>
    <div class="bank-grid" role="group" aria-describedby="err-banco" data-banks>
      ${[
        ["Nubank", "#820AD1", "N"],
        ["Itaú", "#EC7000", "I"],
        ["Bradesco", "#CC092F", "B"],
        ["Banco do Brasil", "#F8D117", "BB"],
        ["Santander", "#EC0000", "S"],
        ["Caixa", "#0070AF", "C"],
        ["Inter", "#FF7A00", "In"],
        ["Outro", "#637F72", "•••"]
      ]
        .map(
          ([n, c, m]) =>
            `<button class="bank-opt" type="button" aria-pressed="false" data-bank="${n}">
              <span class="bank-mark" style="background:${c}${c === "#F8D117" ? ";color:#124B31" : ""}" aria-hidden="true">${m}</span>
              <span class="bank-name">${n}</span>
            </button>`
        )
        .join("")}
    </div>
    <span class="field-error" id="err-banco" role="alert"></span>
  </fieldset>

  <label class="choice choice-stack" data-field="autorizacao">
    <input type="checkbox" id="db-auth" data-auth-check aria-describedby="err-autorizacao">
    <span class="choice-radio" style="border-radius:6px" aria-hidden="true"></span>
    <span class="choice-body">
      <span class="choice-title">Autorizo o débito automático mensal</span>
      <span class="choice-sub">Autorizo o Nutri&amp;Live a debitar o valor da assinatura na conta vinculada a este cartão, todo mês, até que eu cancele.</span>
    </span>
  </label>
  <span class="field-error" id="err-autorizacao" role="alert"></span>
</div>`;

const pixPanel = () => `
<div class="pm-panel" id="pm-pix" role="tabpanel" aria-labelledby="tab-pix" hidden>
  <div class="pix-wrap">
    <div class="pix-col-qr">
      <div class="pix-qr-card" data-pix-qr-card>
        <div class="pix-qr" data-pix-qr role="img" aria-label="QR Code do Pix para pagamento da assinatura"></div>
        <div class="pix-qr-veil" data-pix-veil hidden aria-hidden="true">
          <span class="pix-qr-veil-mark">${icon.check()}</span>
        </div>
        <span class="pix-qr-brand">${icon.pix()} Pix · pagamento na hora</span>
      </div>
      <p class="pix-timer" data-pix-timer>${icon.clock()}<span>Válido por <b data-pix-clock class="tnum">30:00</b></span></p>
      <button class="btn btn-secondary btn-sm btn-block pix-renew" type="button" data-pix-renew hidden>
        ${icon.refresh()} Gerar um novo código
      </button>
    </div>
    <div class="pix-col-how">
      <ol class="pix-steps">
        <li><span class="n">1</span><span>Abra o app do seu banco e entre em <b>Pix &gt; Pagar com QR Code</b>.</span></li>
        <li><span class="n">2</span><span>Aponte a câmera para o QR Code — ou use o Pix copia e cola.</span></li>
        <li><span class="n">3</span><span>Confirme o valor. A gente reconhece o pagamento aqui na hora.</span></li>
      </ol>

      <div class="pix-code">
        <span class="pix-code-text" data-pix-code>—</span>
        <button class="btn btn-secondary btn-sm pix-copy" type="button" data-pix-copy>${icon.copy()} <span data-pix-copy-label>Copiar</span></button>
      </div>
      <p class="field-hint pix-copied" data-pix-copied hidden>${icon.check()} Código copiado. Cole no app do seu banco.</p>

      <div class="pix-status" data-pix-status data-state="waiting">
        <span class="pix-status-mark" aria-hidden="true"><span class="spin"></span></span>
        <span class="pix-status-body">
          <b data-pix-status-text>Aguardando o seu pagamento…</b>
          <small data-pix-status-sub>Deixe esta página aberta. Assim que o Pix cair, a gente segue sozinho.</small>
        </span>
      </div>

      <div class="notice" style="margin-top:1.25rem">
        ${icon.refresh()}
        <span><b>Assinatura no Pix.</b> A gente envia um novo código por e-mail e no app 3 dias antes de cada vencimento. Nada é debitado sem você autorizar.</span>
      </div>
    </div>
  </div>
</div>`;

const summaryInner = () => `
  <div class="co-summary" data-summary>
    <div class="co-summary-head">
      <div class="co-summary-id">
        <p class="co-summary-title" data-sum-plan>Plano Plus</p>
        <p class="text-xs soft" data-sum-seg>Para você</p>
      </div>
      <a class="co-planswitch" href="index.html#planos" data-sum-switch>Trocar</a>
      <button class="co-summary-toggle" type="button" data-summary-toggle aria-expanded="true" aria-controls="resumo-detalhes">
        <span class="co-summary-toggle-total tnum" data-sum-total-mini>R$ 39,90</span>
        <span class="co-summary-toggle-word">Detalhes</span>
        ${icon.chevronDown()}
      </button>
    </div>
    <div id="resumo-detalhes" class="co-summary-fold">
      <div class="co-summary-body">
        <ul class="plan-features" style="margin-top:0;gap:.5rem" data-sum-feats></ul>
        <hr class="rule rule-soft" style="margin:1.25rem 0">
        <div class="co-line">
          <span class="cl-label" data-sum-cycle-label>Assinatura mensal</span>
          <span class="cl-value tnum" data-sum-base>R$ 39,90</span>
        </div>
        <div class="co-line is-discount" data-sum-discount-row hidden>
          <span class="cl-label" data-sum-discount-label>Desconto anual</span>
          <span class="cl-value tnum" data-sum-discount>− R$ 0,00</span>
        </div>
        <div class="co-line is-discount" data-sum-coupon-row hidden>
          <span class="cl-label">Cupom <b data-sum-coupon-code></b>
            <button class="co-coupon-remove" type="button" data-coupon-remove>remover</button>
          </span>
          <span class="cl-value tnum" data-sum-coupon>− R$ 0,00</span>
        </div>

        <div class="co-coupon">
          <button class="co-coupon-toggle" type="button" data-coupon-toggle aria-expanded="false" aria-controls="coupon-form">Tenho um cupom</button>
          <div id="coupon-form" hidden>
            <div class="co-coupon-form">
              <label class="sr-only" for="cupom">Código do cupom</label>
              <input class="input" id="cupom" placeholder="CUPOM" maxlength="16" autocomplete="off"
                     spellcheck="false" autocapitalize="characters" enterkeyhint="done" aria-describedby="coupon-msg">
              <button class="btn btn-secondary" type="button" data-coupon-apply>Aplicar</button>
            </div>
            <p class="co-coupon-msg" id="coupon-msg" data-coupon-msg role="status" hidden></p>
          </div>
        </div>

        <div class="co-total">
          <span class="ct-label">Total hoje</span>
          <span class="ct-value tnum" data-sum-total>R$ 39,90</span>
          <small class="ct-note" data-sum-renew>Renova em 13/10/2026</small>
        </div>
      </div>
      <div class="co-summary-foot">
        <ul class="co-guarantees">
          ${trustFacts.guarantees.map((g) => `<li>${icon[g.icon] ? icon[g.icon]() : icon.check()}<span>${g.text}</span></li>`).join("")}
        </ul>
      </div>
    </div>
  </div>`;

const summary = () => `
<aside class="co-aside" aria-label="Resumo do pedido">
  ${summaryInner()}
</aside>`;

const trustbar = () => `
<ul class="co-trustbar">
  <li>${icon.lock()} TLS 1.3</li>
  <li>${icon.shield()} PCI-DSS nível 1</li>
  <li>${icon.globe()} Dados no Brasil</li>
</ul>`;

const checkoutPage = () =>
  shell({
    title: "Assinar o Nutri&Live — pagamento seguro",
    desc: "Finalize a sua assinatura do Nutri&Live com Pix, cartão de crédito ou débito. Ambiente criptografado, cobrança mensal e cancelamento em 2 toques.",
    canonical: "checkout.html",
    bodyClass: "checkout-page",
    scripts: ["qr", "checkout"],
    body: `
<header class="co-header">
  <div class="container co-header-inner">
    ${brand({})}
    <span class="co-secure">${icon.lock()} Ambiente seguro</span>
  </div>
</header>

<div class="container co-backbar">
  <a class="co-back" href="index.html#planos" data-back>${icon.arrowLeft()} Voltar para os planos</a>
</div>

<main class="co-main" id="conteudo">
  <div class="container">
    <div class="co-stepbar">${stepper()}</div>

    <form class="co-layout" id="checkout-form" novalidate autocomplete="on">
      <div class="co-col-main">
        <!-- STEP 1 -->
        <section class="co-panel" data-step="1" aria-labelledby="t-dados">
          <div class="co-panel-head">
            <div>
              <h1 class="co-panel-title" id="t-dados">Seus dados</h1>
              <p class="co-panel-sub">Usamos só para criar a sua conta e emitir a nota fiscal.</p>
            </div>
            <span class="co-panel-done" data-panel-done="1" hidden>${icon.check()} Pronto</span>
          </div>
          <div class="co-panel-body">
            <div class="field" data-field="nomeCompleto">
              <label class="field-label" for="nome">Nome completo</label>
              <div class="input-wrap">
                <input class="input" id="nome" name="nome" type="text" autocomplete="name" enterkeyhint="next"
                       placeholder="Como no seu documento" aria-describedby="err-nomeCompleto" autocapitalize="words">
                <span class="input-ok" aria-hidden="true">${icon.check()}</span>
              </div>
              <span class="field-error" id="err-nomeCompleto" role="alert"></span>
            </div>
            <div class="field" data-field="email">
              <label class="field-label" for="email">E-mail</label>
              <div class="input-wrap">
                <input class="input" id="email" name="email" type="email" inputmode="email" autocomplete="email"
                       enterkeyhint="next" placeholder="voce@email.com" aria-describedby="err-email hint-email"
                       spellcheck="false" autocapitalize="none">
                <span class="input-ok" aria-hidden="true">${icon.check()}</span>
              </div>
              <span class="field-hint" id="hint-email">É para lá que vão o acesso, o recibo e a nota fiscal.</span>
              <span class="field-error" id="err-email" role="alert"></span>
            </div>
            <div class="field-row field-row-2">
              <div class="field" data-field="cpf">
                <label class="field-label" for="cpf">CPF</label>
                <div class="input-wrap">
                  <input class="input" id="cpf" name="cpf" type="text" inputmode="numeric" pattern="[0-9.\\-]*"
                         enterkeyhint="next" autocomplete="off" placeholder="000.000.000-00" maxlength="14"
                         aria-describedby="err-cpf">
                  <span class="input-ok" aria-hidden="true">${icon.check()}</span>
                </div>
                <span class="field-error" id="err-cpf" role="alert"></span>
              </div>
              <div class="field" data-field="telefone">
                <label class="field-label" for="telefone">Celular</label>
                <div class="input-wrap">
                  <input class="input" id="telefone" name="telefone" type="tel" inputmode="tel"
                         autocomplete="tel-national" enterkeyhint="next" placeholder="(11) 90000-0000"
                         maxlength="16" aria-describedby="err-telefone">
                  <span class="input-ok" aria-hidden="true">${icon.check()}</span>
                </div>
                <span class="field-error" id="err-telefone" role="alert"></span>
              </div>
            </div>
          </div>
        </section>

        <!-- STEP 2 -->
        <section class="co-panel" data-step="2" aria-labelledby="t-pag">
          <div class="co-panel-head">
            <div>
              <h2 class="co-panel-title" id="t-pag">Como você quer pagar</h2>
              <p class="co-panel-sub">Escolha a forma de pagamento da sua assinatura.</p>
            </div>
            <span class="co-panel-done" data-panel-done="2" hidden>${icon.check()} Pronto</span>
          </div>
          <div class="co-panel-body">
            <div class="pm-tabs" role="tablist" aria-label="Forma de pagamento">
              ${trustFacts.methods
                .map(
                  (m, i) => `<button class="pm-tab" type="button" role="tab" id="tab-${m.key}"
                aria-selected="${i === 0}" aria-controls="pm-${m.key}" data-pm="${m.key}" tabindex="${i === 0 ? 0 : -1}">
                ${icon[m.icon]()}
                <span class="pm-tab-text">
                  <span class="pm-tab-label">${m.label}</span>
                  <span class="pm-tab-sub">${m.sub}</span>
                </span>
                ${m.badge ? `<span class="pm-badge">${m.badge}</span>` : ""}
              </button>`
                )
                .join("")}
            </div>

            ${payAlert()}
            ${creditPanel()}
            ${debitPanel()}
            ${pixPanel()}
          </div>
        </section>

        <div class="co-finish">
          <label class="choice choice-stack" data-field="termos">
            <input type="checkbox" id="aceite" data-terms aria-describedby="err-termos">
            <span class="choice-radio" style="border-radius:6px" aria-hidden="true"></span>
            <span class="choice-body">
              <span class="choice-title">Li e aceito os termos</span>
              <span class="choice-sub">Concordo com os <a class="link" href="termos.html" target="_blank" rel="noopener">Termos de uso</a> e a <a class="link" href="privacidade.html" target="_blank" rel="noopener">Política de privacidade</a>, e entendo que o Nutri&amp;Live não substitui consulta com profissional de saúde.</span>
            </span>
          </label>
          <span class="field-error" id="err-termos" role="alert"></span>

          <div class="co-cta">
            <button class="btn btn-primary btn-lg btn-block" type="submit" data-submit>
              ${icon.lock()}<span data-submit-label>Assinar por R$ 39,90/mês</span>
            </button>
          </div>

          <p class="co-cta-fine text-xs soft text-center" data-cta-fine>
            Ao confirmar, a cobrança recorrente começa hoje. Você pode cancelar quando quiser pelo app, sem multa.
          </p>

          <p class="field-error co-formerror" id="err-form" role="alert"></p>

          ${trustbar()}
        </div>
      </div>

      ${summary()}
    </form>
  </div>
</main>

<p class="sr-only" data-live aria-live="polite" role="status"></p>

<footer class="co-footer">
  <div class="container co-footer-inner">
    <p class="text-xs soft">© ${new Date().getFullYear()} ${site.name} · CNPJ ${site.cnpj}</p>
    <div class="cluster text-xs">
      <a class="link" href="termos.html">Termos</a>
      <a class="link" href="privacidade.html">Privacidade</a>
      <a class="link" href="seguranca.html">Segurança</a>
      <a class="link" href="${site.whatsappHref}">Ajuda</a>
    </div>
  </div>
</footer>

<script id="nl-catalogue" type="application/json">${JSON.stringify(catalogue())}</script>`
  });

export const pages = () => ({ "checkout.html": checkoutPage() });
