/* =========================================================================
   Page sections shared by the three landing pages.
   ========================================================================= */
import { icon } from "./icons.mjs";
import { device } from "./devices.mjs";
import { wordmark } from "./brand.mjs";
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
<section class="hero" id="topo">
  <div class="bg-art" aria-hidden="true">
    <span class="bg-blob float-slow" style="width:340px;height:340px;background:#B7E3C7;right:-90px;top:-70px"></span>
    <span class="bg-blob float-slower" style="width:260px;height:260px;background:#DFF5B8;left:-110px;bottom:-40px;opacity:.5"></span>
  </div>
  <div class="container">
    <div class="hero-grid">
      <div class="hero-copy">
        <div data-reveal="fade">${audienceSwitch(c.key)}</div>
        ${h.badge ? `<p class="pill-note" data-reveal="fade" style="--reveal-delay:60ms">${icon.sparkles()}<span>${h.badge}</span></p>` : ""}
        <h1 class="display-1" data-reveal style="--reveal-delay:100ms">${renderTitle(h.title)}</h1>
        <p class="lead measure-sm" data-reveal style="--reveal-delay:160ms">${h.lead}</p>
        <ul class="hero-bullets" data-reveal style="--reveal-delay:220ms">
          ${h.bullets.map((b) => `<li><span class="tick" aria-hidden="true">${icon.check()}</span><span>${b}</span></li>`).join("")}
        </ul>
        <div class="hero-cta" data-reveal style="--reveal-delay:280ms">
          <a class="btn btn-primary btn-lg" href="${h.primary.href}">${h.primary.label}<span class="btn-arrow" aria-hidden="true">${icon.arrowRight()}</span></a>
          <a class="btn btn-secondary btn-lg" href="${h.secondary.href}">${h.secondary.label}</a>
        </div>
        <div class="hero-proof" data-reveal="fade" style="--reveal-delay:340ms">
          <div class="avatar-stack" aria-hidden="true">
            <span class="avatar avatar-sm" style="background:#B7E3C7">AP</span>
            <span class="avatar avatar-sm" style="background:#DFF5B8;color:#124B31">CR</span>
            <span class="avatar avatar-sm" style="background:#89CFA5;color:#0D3524">RS</span>
            <span class="avatar avatar-sm" style="background:#17603D;color:#fff">+</span>
          </div>
          <p class="hero-proof-text">${proof}</p>
        </div>
      </div>
      <div class="hero-stage" data-reveal="scale" style="--reveal-delay:180ms">
        <span class="hero-stage-glow" aria-hidden="true"></span>
        <div class="device-duo">
          ${device(c.screen, { cls: "float-slow" })}
          ${device(c.heroScreen2 || "compras", { size: "device-sm", cls: "float-slower" })}
        </div>
      </div>
    </div>
  </div>
</section>`;
};

/* ---------- Logo strip ---------- */
export const logostrip = (labels) => `
<section class="logostrip">
  <div class="container">
    <p class="logostrip-label">${labels.title}</p>
    <div class="logostrip-row">
      ${labels.items.map((t) => `<span class="lg">${wordmark(t)}</span>`).join("")}
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
    <div class="section-head is-center" data-reveal>
      <p class="eyebrow">${head.eyebrow}</p>
      <h2>${head.title}</h2>
      ${head.text ? `<p class="lead measure" style="margin-inline:auto">${head.text}</p>` : ""}
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

/* ---------- Showcases ---------- */
export const showcases = (list) => `
<section class="section section-soft" id="recursos">
  <div class="container">
    ${list
      .map(
        (s) => `<div class="showcase${s.flip ? " is-flip" : ""}">
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
        <div class="media-panel">${device(s.screen)}</div>
      </div>
    </div>`
      )
      .join("")}
  </div>
</section>`;

/* ---------- Feature grid ---------- */
export const features = (list, head) => `
<section class="section">
  <div class="container">
    <div class="section-head is-center" data-reveal>
      <p class="eyebrow">${head.eyebrow}</p>
      <h2>${head.title}</h2>
      ${head.text ? `<p class="lead measure" style="margin-inline:auto">${head.text}</p>` : ""}
    </div>
    <div class="grid-4 mt-16" data-reveal-group>
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
    <div class="section-head is-center" data-reveal>
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
    <div class="section-head is-center" data-reveal>
      <h2 style="font-size:var(--fs-h2)">O Nutri&amp;Live também atende</h2>
    </div>
    <div class="grid-2 mt-10" data-reveal-group style="max-width:56rem;margin-inline:auto">
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
