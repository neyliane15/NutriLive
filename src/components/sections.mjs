/* =========================================================================
   Page sections shared by the three landing pages.
   ========================================================================= */
import { icon } from "./icons.mjs";
import { device } from "./devices.mjs";
import { payMark } from "./paymarks.mjs";
import { segments, trustFacts, securityPillars, site } from "../data/site.mjs";
import { brlParts, pct } from "../lib/format.mjs";

/* ---------- Audience switcher ---------- */
export const audienceSwitch = (current, deep = false) => `
<div class="segmented${deep ? " segmented-deep" : ""}" data-segmented role="group" aria-label="Escolha o seu perfil">
  <span class="seg-thumb" aria-hidden="true"></span>
  ${Object.values(segments)
    .map(
      (s) =>
        `<a class="seg" href="${s.slug}"${s.key === current ? ' aria-current="true"' : ""}>${s.shortLabel}</a>`
    )
    .join("")}
</div>`;

/* ---------- Hero ---------- */
const renderTitle = (parts) =>
  parts.map((p) => (typeof p === "string" ? p : `<span class="hl">${p.hl}</span>`)).join(" ");

export const hero = (c) => {
  const h = c.hero;
  const proof = h.proof.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return `
<section class="hero hero-nu" id="topo">
  <div class="container">
    <div style="margin-bottom:clamp(1.75rem,1rem+2vw,2.75rem)">${audienceSwitch(c.key)}</div>
    <div class="hero-grid">
      <div class="hero-copy">
        <h1 class="display-1">${renderTitle(h.title)}</h1>
        <p class="lead">${h.lead}</p>
        <div class="hero-cta">
          <a class="btn btn-primary btn-lg" href="${h.primary.href}">${h.primary.label}</a>
          <a class="link-arrow" href="${h.secondary.href}">${h.secondary.label}</a>
        </div>
        <div class="hero-proof">
          ${
            c.key === "voce"
              ? `<span class="quote-stars" style="margin:0" aria-label="4,9 de 5 estrelas">${icon.star().repeat(5)}</span>`
              : `<span class="icon-tile" style="width:34px;height:34px;border-radius:10px" aria-hidden="true">${
                  c.key === "nutri" ? icon.clipboard() : icon.building()
                }</span>`
          }
          <p class="hero-proof-text">${proof}</p>
        </div>
      </div>
      <div class="hero-stage">
        <span class="hero-stage-glow" aria-hidden="true"></span>
        <div class="device-duo">
          ${device(c.screen)}
          ${device(c.heroScreen2 || "compras", { size: "device-sm" })}
        </div>
      </div>
    </div>
  </div>
</section>`;
};

/* ---------- Faixa de produtos (padrão Nubank) ---------- */
export const tiles = (c) => `
<section class="tiles-band">
  <div class="container">
    <div class="tiles-head">
      <h2 style="font-size:var(--fs-h3)">${
        c.key === "voce" ? "Tudo em um app só" : c.key === "nutri" ? "Tudo em um painel só" : "Tudo em uma conta só"
      }</h2>
      <a class="link-arrow" href="#recursos">Ver por dentro</a>
    </div>
    <div class="tiles-scroll">
      ${c.tiles
        .map(
          (t) => `<a class="tile" href="${t.href}">
        <span class="icon-tile" aria-hidden="true">${icon[t.icon] ? icon[t.icon]() : icon.check()}</span>
        <h3>${t.title}</h3>
        <p>${t.text}</p>
        <span class="tile-go">Saiba mais ${icon.arrowRight()}</span>
      </a>`
        )
        .join("")}
    </div>
  </div>
</section>`;

/* ---------- Faixa cheia na cor da marca (padrão Nubank) ---------- */
export const band = (c) => `
<section class="band section-deep">
  <div class="container">
    <div class="band-grid">
      <div>
        <h2 class="display-2">${c.band.title}</h2>
        <p class="lead" style="margin-top:1.25rem">${c.band.text}</p>
        <div class="cluster" style="margin-top:2rem">
          <a class="btn btn-light btn-lg" href="${c.band.cta.href}">${c.band.cta.label}</a>
        </div>
      </div>
      <div style="display:grid;place-items:center">
        ${device(c.band.screen)}
      </div>
    </div>
  </div>
</section>`;

/* ---------- Baixe o app, com QR (padrão Nubank) ---------- */
export const appBand = () => `
<section class="section app-band">
  <div class="container">
    <div class="app-grid">
      <div>
        <p class="eyebrow">Baixe o app</p>
        <h2 style="margin-top:.75rem;max-width:16ch">Aponte a câmera e comece agora.</h2>
        <p class="lead measure-sm" style="margin-top:1rem">Funciona em iPhone e Android, sincroniza sozinho e continua funcionando quando a internet cai.</p>
        <div class="app-stores">
          <a class="store-badge" href="#" data-noop aria-label="Baixar na App Store">
            ${icon.apple_store()}<span><span class="sb-top">Baixe na</span><span class="sb-main">App Store</span></span>
          </a>
          <a class="store-badge" href="#" data-noop aria-label="Baixar no Google Play">
            ${icon.play_store()}<span><span class="sb-top">Disponível no</span><span class="sb-main">Google Play</span></span>
          </a>
        </div>
      </div>
      <div class="qr-card">
        <div class="qr-box" data-app-qr aria-label="QR Code para baixar o aplicativo Nutri&amp;Live"></div>
        <p class="qr-note">Aponte a câmera do celular para abrir a loja</p>
      </div>
    </div>
  </div>
</section>`;

/* ---------- Reconhecimento ---------- */
export const awards = () => `
<section class="section section-sm">
  <div class="container">
    <div class="awards">
      ${[
        ["refresh", "30 dias", "Garantia total", "Não gostou, devolvemos 100% do valor — sem perguntar o motivo."],
        ["x", "2 toques", "Cancelamento", "Direto no app. Sem multa, sem ligação, sem retenção."],
        ["lock", "PCI-DSS", "Pagamento seguro", "Seu cartão vai direto ao processador. A gente nunca vê o número."],
        ["receipt", "Todo mês", "Nota fiscal", "Emitida automaticamente e enviada para o seu e-mail."]
      ]
        .map(
          (a) => `<div class="award">
        <span class="icon-tile" aria-hidden="true">${icon[a[0]]()}</span>
        <span><span class="yr">${a[1]}</span><b>${a[2]}</b><span class="src">${a[3]}</span></span>
      </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;

/* ---------- Faixa de meios de pagamento ---------- */
export const paystrip = () => `
<section class="logostrip">
  <div class="container">
    <p class="logostrip-label">Pague como preferir — e mude quando quiser</p>
    <div class="logostrip-row">
      <span class="lg" title="Pix">${payMark.pix()}</span>
      <span class="lg" title="Visa">${payMark.visa()}</span>
      <span class="lg" title="Mastercard">${payMark.master()}</span>
      <span class="lg" title="Elo">${payMark.elo()}</span>
      <span class="lg" title="American Express">${payMark.amex()}</span>
      <span class="lg" title="Hipercard">${payMark.hiper()}</span>
      <span class="lg" title="Boleto bancário">${payMark.boleto()}</span>
    </div>
  </div>
</section>`;

/* ---------- Stats ---------- */
export const stats = (list, deep = false) => `
<section class="section section-sm${deep ? " section-deep" : " section-soft"}">
  <div class="container">
    <div class="statband" data-reveal-group>
      ${list
        .map(
          (s) => `<div class="stat" data-reveal>
        <div class="stat-num" data-count="${s.num}">${s.num}</div>
        <p class="stat-label">${s.label}</p>
      </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;

/* ---------- Steps ---------- */
export const steps = (list, head) => `
<section class="section" id="como-funciona">
  <div class="container">
    <div class="section-head" data-reveal>
      <p class="eyebrow">${head.eyebrow}</p>
      <h2>${head.title}</h2>
      ${head.text ? `<p class="lead measure">${head.text}</p>` : ""}
    </div>
    <div class="steps mt-16" data-reveal-group>
      ${list
        .map(
          (s, i) => `<div class="step" data-reveal>
        <div class="step-num" aria-hidden="true">${i + 1}</div>
        <h3>${s.title}</h3>
        <p>${s.text}</p>
      </div>`
        )
        .join("")}
    </div>
  </div>
</section>`;

/* ---------- Showcases ----------
   Cada linha ganha o seu próprio fundo: claro, cor da marca, menta.
   É assim que o Nubank mantém a cor presente ao longo da página. */
const SHOWCASE_SKIN = ["is-light", "is-deep", "is-mint"];

export const showcases = (list) =>
  list
    .map((s, i) => {
      const skin = SHOWCASE_SKIN[i % SHOWCASE_SKIN.length];
      const deep = skin === "is-deep";
      return `
<section class="section showcase-section ${skin}"${i === 0 ? ' id="recursos"' : ""}>
  <div class="container">
    <div class="showcase${s.flip ? " is-flip" : ""}">
      <div class="showcase-copy" data-reveal="${s.flip ? "right" : "left"}">
        <p class="eyebrow">${s.eyebrow}</p>
        <h2 style="margin-top:.75rem">${s.title}</h2>
        <p class="lead measure-sm">${s.text}</p>
        <ul class="showcase-list">
          ${s.list
            .map(
              (l) =>
                `<li><span class="tick" aria-hidden="true">${icon.check()}</span><span><b>${l[0]}</b> ${l[1]}</span></li>`
            )
            .join("")}
        </ul>
      </div>
      <div class="showcase-media" data-reveal="${s.flip ? "left" : "right"}">
        <div class="media-panel${deep ? " media-panel-deep" : ""}">${device(s.screen)}</div>
      </div>
    </div>
  </div>
</section>`;
    })
    .join("");

/* ---------- Feature grid ---------- */
export const features = (list, head) => `
<section class="section">
  <div class="container">
    <div class="section-head" data-reveal>
      <p class="eyebrow">${head.eyebrow}</p>
      <h2>${head.title}</h2>
      ${head.text ? `<p class="lead measure">${head.text}</p>` : ""}
    </div>
    <div class="grid-3 mt-16" data-reveal-group>
      ${list
        .map(
          (f) => `<article class="card card-interactive feature-card" data-reveal>
        <span class="icon-tile" aria-hidden="true">${icon[f.icon] ? icon[f.icon]() : icon.check()}</span>
        <h3>${f.title}</h3>
        <p>${f.text}</p>
      </article>`
        )
        .join("")}
    </div>
  </div>
</section>`;

/* ---------- Pricing ---------- */
export const pricing = (c) => {
  const cards = c.plans
    .map((p) => {
      const m = brlParts(p.monthly);
      const y = brlParts(p.yearly);
      const save = pct(p.monthly, p.yearly);
      const feats = p.features
        .map(
          (f) =>
            `<li><span class="tick" aria-hidden="true">${icon.checkSolid()}</span><span>${f}</span></li>`
        )
        .join("");
      const offs = (p.off || [])
        .map(
          (f) =>
            `<li><span class="tick off" aria-hidden="true">${icon.xCircle()}</span><span class="off-text">${f}</span></li>`
        )
        .join("");
      return `<article class="plan${p.featured ? " is-featured" : ""}" data-reveal>
      ${p.flag ? `<span class="plan-flag">${p.flag}</span>` : ""}
      <h3 class="plan-name">${p.name}</h3>
      <p class="plan-desc">${p.desc}</p>
      <p class="plan-price">
        <span class="cur">R$</span>
        <span class="amt" data-price-int data-m="${m.int}" data-y="${y.int}">${m.int}</span>
        <span class="cents" data-price-dec data-m="${m.dec}" data-y="${y.dec}">,${m.dec}</span>
        <span class="per">/mês</span>
      </p>
      <p class="plan-price-note" data-price-note
         data-m="Cobrado mensalmente. Cancele quando quiser."
         data-y="Cobrado 12× no anual. <b>Economize ${save}%</b>">Cobrado mensalmente. Cancele quando quiser.</p>
      <a class="btn ${p.featured ? "btn-primary" : "btn-secondary"} btn-block" href="checkout.html?seg=${c.key}&amp;plan=${p.planKey}" data-plan-cta="${p.planKey}">${p.cta}</a>
      <ul class="plan-features">${feats}${offs}</ul>
      <p class="plan-foot">${p.foot || "Pix, cartão de crédito ou débito. Sem taxa de adesão."}</p>
    </article>`;
    })
    .join("");

  return `
<section class="section" id="planos">
  <div class="container">
    <div class="pricing-head" data-reveal>
      <p class="eyebrow">Planos e preços</p>
      <h2>Preço claro. Sem letra miúda.</h2>
      <p class="lead">${c.plansNote}</p>
      <div class="pricing-toggle">
        <span class="pricing-toggle-label is-on" data-bill-label="m">Mensal</span>
        <label class="switch">
          <input type="checkbox" data-bill-toggle aria-label="Cobrar anualmente e economizar">
          <span class="switch-track" aria-hidden="true"></span>
        </label>
        <span class="pricing-toggle-label" data-bill-label="y">Anual <span class="badge badge-lime" style="margin-left:.25rem">−20%</span></span>
      </div>
    </div>

    <div class="plans" data-reveal-group>${cards}</div>

    <ul class="pricing-reassure" data-reveal="fade">
      ${trustFacts.guarantees
        .map((g) => `<li>${icon[g.icon] ? icon[g.icon]() : icon.check()}<span>${g.text}</span></li>`)
        .join("")}
    </ul>

    <div class="card card-flat mt-10" data-reveal="fade" style="text-align:center">
      <p class="text-sm muted" style="margin-bottom:.875rem">Formas de pagamento aceitas</p>
      <div class="cluster" style="justify-content:center">
        ${trustFacts.methods
          .map(
            (m) =>
              `<span class="badge badge-outline" style="padding:.5rem .875rem;font-size:.8125rem">${m.label}</span>`
          )
          .join("")}
        <span class="badge badge-outline" style="padding:.5rem .875rem;font-size:.8125rem">Boleto (anual)</span>
      </div>
    </div>
  </div>
</section>`;
};

/* ---------- Trust / security ---------- */
export const trust = () => `
<section class="section section-deep" id="seguranca">
  <div class="container">
    <div class="section-head" data-reveal>
      <p class="eyebrow">Segurança</p>
      <h2>Dado de saúde é dado sensível. A gente trata assim.</h2>
      <p class="lead measure">Você confia informações íntimas ao Nutri&amp;Live. Estas são as regras que não negociamos.</p>
    </div>
    <div class="trust-grid mt-16" data-reveal-group>
      ${securityPillars
        .map(
          (p) => `<article class="trust-card" data-reveal>
        <span class="icon-tile icon-tile-deep" aria-hidden="true">${icon[p.icon]()}</span>
        <h3>${p.title}</h3>
        <p>${p.text}</p>
      </article>`
        )
        .join("")}
    </div>
    <div class="mt-16" data-reveal="fade">
      <div class="seal-row">
        <span class="seal">${icon.lock()} TLS 1.3 · AES-256</span>
        <span class="seal">${icon.card()} PCI-DSS nível 1</span>
        <span class="seal">${icon.shield()} LGPD · DPO nomeado</span>
        <span class="seal">${icon.globe()} Servidores no Brasil</span>
        <span class="seal">${icon.refresh()} Backup diário com retenção de 35 dias</span>
      </div>
      <p class="text-sm" style="margin-top:1.5rem"><a class="link" href="seguranca.html">Ver a página completa de segurança</a></p>
    </div>
  </div>
</section>`;

/* ---------- Testimonials ---------- */
export const testimonials = (list, head) => `
<section class="section section-soft" id="depoimentos">
  <div class="container">
    <div class="section-head" data-reveal>
      <p class="eyebrow">${head.eyebrow}</p>
      <h2>${head.title}</h2>
    </div>
    <div class="quotes mt-16" data-reveal-group>
      ${list
        .map(
          (t) => `<figure class="card card-lg quote" data-reveal>
        <div class="quote-stars" aria-label="5 de 5 estrelas">${icon.star().repeat(5)}</div>
        <blockquote class="quote-text">“${t.text}”</blockquote>
        <figcaption class="quote-foot">
          <span class="avatar" aria-hidden="true">${t.initials}</span>
          <span><span class="quote-name">${t.name}</span><br><span class="quote-role">${t.role}</span></span>
        </figcaption>
      </figure>`
        )
        .join("")}
    </div>
  </div>
</section>`;

/* ---------- FAQ ---------- */
export const faq = (list, key) => `
<section class="section" id="duvidas">
  <div class="container">
    <div class="faq-layout">
      <div data-reveal="left">
        <p class="eyebrow">Perguntas frequentes</p>
        <h2 style="margin-top:.75rem">Tudo que costumam perguntar antes de assinar.</h2>
        <p class="lead" style="margin-top:1rem">Não achou a sua? A gente responde em minutos.</p>
        <div class="cluster" style="margin-top:1.5rem">
          <a class="btn btn-secondary" href="${site.whatsappHref}">${icon.whatsapp()} Falar no WhatsApp</a>
        </div>
      </div>
      <div class="accordion" data-accordion data-reveal="right">
        ${list
          .map(
            (f, i) => `<div class="accordion-item">
          <h3>
            <button class="accordion-trigger" type="button" aria-expanded="false" aria-controls="faq-${key}-${i}" id="faqb-${key}-${i}">
              <span>${f.q}</span><span class="accordion-icon" aria-hidden="true"></span>
            </button>
          </h3>
          <div class="accordion-panel" id="faq-${key}-${i}" role="region" aria-labelledby="faqb-${key}-${i}" data-open="false">
            <div><p>${f.a}</p></div>
          </div>
        </div>`
          )
          .join("")}
      </div>
    </div>
  </div>
</section>`;

/* ---------- Cross-sell ---------- */
export const crossSell = (current) => {
  const others = Object.values(segments).filter((s) => s.key !== current);
  const blurbs = {
    voce: { t: "Para você", d: "Plano alimentar, receitas com o que tem em casa e a sua evolução no bolso.", p: "R$ 19,90", icon: "user" },
    nutri: { t: "Para nutricionistas", d: "Prontuário, prescrição em minutos e adesão do paciente em tempo real.", p: "R$ 79,90", icon: "clipboard" },
    academia: { t: "Para academias", d: "Nutrição para a base inteira, menos cancelamento e receita nova.", p: "R$ 249", icon: "building" }
  };
  return `
<section class="section section-sm">
  <div class="container">
    <div class="section-head" data-reveal>
      <h2 style="font-size:var(--fs-h2)">O Nutri&amp;Live também atende</h2>
    </div>
    <div class="grid-2 mt-10" data-reveal-group>
      ${others
        .map((s) => {
          const b = blurbs[s.key];
          return `<a class="audience-card" href="${s.slug}" data-reveal>
        <span class="ac-head"><span class="icon-tile" aria-hidden="true">${icon[b.icon]()}</span><h3>${b.t}</h3></span>
        <p>${b.d}</p>
        <span class="ac-price">a partir de <b>${b.p}</b>/mês</span>
        <span class="link-arrow">Conhecer</span>
      </a>`;
        })
        .join("")}
    </div>
  </div>
</section>`;
};

/* ---------- Final CTA ---------- */
export const finalCta = (c) => `
<section class="section cta-final">
  <div class="container">
    <div style="max-width:44rem" data-reveal>
      <h2 class="display-2">${c.finalCta.title}</h2>
      <p class="lead" style="margin-top:1.25rem">${c.finalCta.text}</p>
      <div class="cluster" style="margin-top:2rem">
        <a class="btn btn-light btn-lg" href="${c.finalCta.primary.href}">${c.finalCta.primary.label}<span class="btn-arrow" aria-hidden="true">${icon.arrowRight()}</span></a>
        <a class="btn btn-outline-light btn-lg" href="${c.finalCta.secondary.href}">${c.finalCta.secondary.label}</a>
      </div>
      <ul class="cluster" style="margin-top:2rem;gap:1rem 1.75rem;font-size:var(--fs-sm);color:var(--text-on-deep-muted)">
        <li style="display:flex;gap:.4375rem;align-items:center">${icon.check()} 30 dias de garantia</li>
        <li style="display:flex;gap:.4375rem;align-items:center">${icon.check()} Cancele quando quiser</li>
        <li style="display:flex;gap:.4375rem;align-items:center">${icon.check()} Pix, crédito ou débito</li>
      </ul>
    </div>
  </div>
</section>`;

/* ---------- Sticky mobile CTA ---------- */
export const stickyCta = (c) => {
  const featured = c.plans.find((p) => p.featured) || c.plans[0];
  const m = brlParts(featured.monthly);
  return `
<div class="sticky-cta" data-sticky-cta data-show="false">
  <div class="sc-copy">
    <div class="sc-price">${featured.name} · R$ ${m.int},${m.dec}/mês</div>
    <div class="sc-note">Cancele quando quiser</div>
  </div>
  <a class="btn btn-primary btn-sm" href="checkout.html?seg=${c.key}&amp;plan=${featured.planKey}">Assinar</a>
</div>`;
};
