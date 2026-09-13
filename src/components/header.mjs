import { brand } from "./brand.mjs";
import { icon } from "./icons.mjs";
import { nav } from "../data/site.mjs";

export const header = ({ current = "", cta = { label: "Assinar", href: "#planos" }, home = "index.html" } = {}) => {
  // Âncoras só funcionam na própria landing; nas demais páginas apontam para a home.
  const isLanding = ["voce", "nutri", "academia"].indexOf(current) > -1;
  const resolve = (href) => (href.charAt(0) === "#" && !isLanding ? home + href : href);
  const links = nav
    .map((n) => {
      const isCurrent = n.key === current;
      return `<a class="nav-link" href="${resolve(n.href)}"${isCurrent ? ' aria-current="page"' : ""}>${n.label}</a>`;
    })
    .join("");

  const drawerLinks = nav
    .map((n) => {
      const isCurrent = n.key === current;
      return `<a class="nav-drawer-link" href="${resolve(n.href)}"${isCurrent ? ' aria-current="page"' : ""}>
        <span>${n.label}<span class="nav-drawer-sub">${n.sub}</span></span>
        <span class="chev" aria-hidden="true">${icon.chevronRight()}</span>
      </a>`;
    })
    .join("");

  return `
<header class="site-header" id="site-header" data-stuck="false">
  <div class="container header-inner">
    ${brand({})}
    <nav class="header-nav" aria-label="Navegação principal">${links}</nav>
    <div class="header-actions">
      <a class="btn btn-ghost btn-sm hide-md" href="#" data-noop>Entrar</a>
      <a class="btn btn-primary btn-sm" href="${cta.href}">${cta.label}</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav-drawer" aria-label="Abrir menu" data-nav-toggle>
        <span class="nav-toggle-bars" aria-hidden="true"><span></span><span></span><span></span></span>
      </button>
    </div>
  </div>
</header>
<div class="nav-drawer" id="nav-drawer" data-open="false" hidden>
  <div class="container">
    <nav aria-label="Navegação mobile">${drawerLinks}</nav>
    <div class="nav-drawer-cta">
      <a class="btn btn-primary btn-block" href="${cta.href}">${cta.label}</a>
      <a class="btn btn-secondary btn-block" href="#" data-noop>Entrar na minha conta</a>
    </div>
  </div>
</div>`;
};
