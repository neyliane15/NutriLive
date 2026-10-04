import { brand } from "./brand.mjs";
import { icon } from "./icons.mjs";
import { site, footer as footerData } from "../data/site.mjs";

export const footer = () => `
<footer class="site-footer">
  <div class="container">
    <div class="footer-grid">
      <div>
        ${brand({})}
        <p style="margin-top:1rem;max-width:32ch;line-height:1.6">${site.tagline}<br>Cuidar da alimentação, sem complicar a vida.</p>
      </div>
      ${footerData.columns
        .map(
          (c) => `<div>
        <h2 class="footer-title">${c.title}</h2>
        <ul class="footer-list">
          ${c.links.map((l) => `<li><a href="${l.href}"${l.href === "#" ? " data-noop" : ""}>${l.label}</a></li>`).join("")}
        </ul>
      </div>`
        )
        .join("")}
    </div>

    <div style="margin-top:3.5rem;display:flex;flex-wrap:wrap;gap:1.5rem;align-items:center;justify-content:space-between">
      <div class="social-row">
        <a class="social-btn" href="#" data-noop aria-label="Instagram do Nutri&amp;Live">${icon.instagram()}</a>
        <a class="social-btn" href="#" data-noop aria-label="LinkedIn do Nutri&amp;Live">${icon.linkedin()}</a>
        <a class="social-btn" href="#" data-noop aria-label="YouTube do Nutri&amp;Live">${icon.youtube()}</a>
        <a class="social-btn" href="${site.whatsappHref}" aria-label="WhatsApp do Nutri&amp;Live">${icon.whatsapp()}</a>
      </div>
      <div class="seal-row">
        <span class="seal">${icon.lock()} Site com TLS 1.3</span>
        <span class="seal">${icon.shield()} PCI-DSS nível 1</span>
        <span class="seal">${icon.globe()} Dados no Brasil</span>
      </div>
    </div>

    <div class="footer-bottom">
      <div class="footer-legal">
        ${footerData.legal.map((l) => `<p style="margin-bottom:.5rem">${l}</p>`).join("")}
        <p>© ${new Date().getFullYear()} ${site.name}. Todos os direitos reservados.</p>
      </div>
    </div>
  </div>
</footer>`;
