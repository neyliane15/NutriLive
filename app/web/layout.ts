/* =========================================================================
   Nutri&Live — casca da aplicação
   Mesmo sistema de design da landing: carrega nutrielive.css e acrescenta
   app.css. Navegação lateral no desktop, barra inferior no celular — o mesmo
   desenho dos mockups que a landing mostra.
   ========================================================================= */
import type { Role } from "../shared/contract.js";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

/* Ícones monolineares, mesmo traço do conjunto da landing. */
const I: Record<string, string> = {
  hoje: `<path d="M4 20c0-9 6-15 16-15 0 10-6 15-16 15Z"/><path d="M4 20c3.5-6.5 7.3-9.6 12-11.5"/>`,
  plano: `<rect x="5" y="4.5" width="14" height="16" rx="2.4"/><path d="M9 4.5V3.8A1.8 1.8 0 0 1 10.8 2h2.4A1.8 1.8 0 0 1 15 3.8v.7"/><path d="M9 11h6M9 15h4"/>`,
  receitas: `<path d="M4 4.8A2 2 0 0 1 6 2.8h13v14.4H6a2 2 0 0 0-2 2z"/><path d="M4 19.2a2 2 0 0 1 2-2h13v4H6a2 2 0 0 1-2-2Z"/>`,
  compras: `<circle cx="9.5" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3.5h2.6l2.5 12.1h11.1l1.8-8.6H6.1"/>`,
  evolucao: `<path d="M3.5 15.5 9 10l3.5 3.5L20.5 5.5"/><path d="M15.5 5.5h5v5"/>`,
  pacientes: `<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20.2c0-3.2 2.8-5.4 6.2-5.4s6.2 2.2 6.2 5.4"/><path d="M16.2 5.1a3.4 3.4 0 0 1 0 6.4M18 14.9c2 .6 3.4 2.2 3.4 4.3"/>`,
  painel: `<path d="M3.5 20.5h17"/><path d="M6.5 16.5v-4M11 16.5V7.5M15.5 16.5v-6M20 16.5V4.5"/>`,
  comissoes: `<path d="M20.5 8.5V7a2 2 0 0 0-2-2H5.5A2.5 2.5 0 0 0 3 7.5v9A2.5 2.5 0 0 0 5.5 19h13a2 2 0 0 0 2-2v-1.5"/><path d="M21.5 8.5h-4.2a3.5 3.5 0 0 0 0 7h4.2z"/>`,
  conta: `<circle cx="12" cy="8" r="3.8"/><path d="M4.8 20.4c0-3.6 3.2-6.1 7.2-6.1s7.2 2.5 7.2 6.1"/>`,
  usuarios: `<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20.2c0-3.2 2.8-5.4 6.2-5.4s6.2 2.2 6.2 5.4"/><path d="M16.2 5.1a3.4 3.4 0 0 1 0 6.4"/>`,
  pagamentos: `<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M2.5 9.6h19M6 15h3.5"/>`,
  ia: `<path d="M12 3.2 13.6 8l4.8 1.6-4.8 1.6L12 16l-1.6-4.8L5.6 9.6 10.4 8z"/><path d="M18.6 15.4l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7z"/>`,
  auditoria: `<path d="M13.6 2.8H7a2 2 0 0 0-2 2v14.4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.2z"/><path d="M13.4 2.9v5.4H19"/><path d="M8.6 13h6.8M8.6 16.4h4.4"/>`,
  sair: `<path d="M9 21H5.5A1.5 1.5 0 0 1 4 19.5v-15A1.5 1.5 0 0 1 5.5 3H9"/><path d="M16 16.5 20.5 12 16 7.5M20 12H9"/>`
};

export const icon = (name: string, size = 20) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name] ?? ""}</svg>`;

export const NAV: Record<Role, NavItem[]> = {
  pessoal: [
    { href: "/hoje", label: "Hoje", icon: "hoje" },
    { href: "/plano", label: "Plano", icon: "plano" },
    { href: "/receitas", label: "Receitas", icon: "receitas" },
    { href: "/compras", label: "Compras", icon: "compras" },
    { href: "/evolucao", label: "Evolução", icon: "evolucao" }
  ],
  paciente: [
    { href: "/hoje", label: "Hoje", icon: "hoje" },
    { href: "/plano", label: "Plano", icon: "plano" },
    { href: "/receitas", label: "Receitas", icon: "receitas" },
    { href: "/compras", label: "Compras", icon: "compras" },
    { href: "/evolucao", label: "Evolução", icon: "evolucao" }
  ],
  aluno: [
    { href: "/hoje", label: "Hoje", icon: "hoje" },
    { href: "/plano", label: "Plano", icon: "plano" },
    { href: "/receitas", label: "Receitas", icon: "receitas" },
    { href: "/evolucao", label: "Evolução", icon: "evolucao" }
  ],
  nutricionista: [
    { href: "/painel", label: "Painel", icon: "painel" },
    { href: "/pacientes", label: "Pacientes", icon: "pacientes" },
    { href: "/receitas", label: "Receitas", icon: "receitas" },
    { href: "/hoje", label: "Meu dia", icon: "hoje" }
  ],
  academia: [
    { href: "/painel", label: "Painel", icon: "painel" },
    { href: "/alunos", label: "Alunos", icon: "pacientes" },
    { href: "/comissoes", label: "Comissões", icon: "comissoes" }
  ],
  admin: [
    { href: "/admin", label: "Visão geral", icon: "painel" },
    { href: "/admin/usuarios", label: "Usuários", icon: "usuarios" },
    { href: "/admin/pagamentos", label: "Pagamentos", icon: "pagamentos" },
    { href: "/admin/ia", label: "IA", icon: "ia" },
    { href: "/admin/auditoria", label: "Auditoria", icon: "auditoria" }
  ]
};

const brandMark = `<svg viewBox="0 0 40 40" width="26" height="26" fill="none" aria-hidden="true"><path d="M34.2 5.6c.6 0 1.1.4 1.2 1 .9 6.9-.5 12.9-4.2 17.4-3.8 4.5-9 6.6-15 6.2-.3 1.6-.4 3.3-.4 5.1a1.3 1.3 0 1 1-2.6 0c0-2.1.2-4.1.6-6a24 24 0 0 1 4.6-9.7 1.3 1.3 0 0 1 2 1.6 21.4 21.4 0 0 0-3.8 7.5c4.9.3 9-1.5 12-5.1 2.9-3.5 4.2-8.2 3.8-13.7-6.6.2-11.7 1.6-15.3 4-3.8 2.6-5.7 6-5.7 10.3 0 1.7.4 3.2 1.1 4.5a1.3 1.3 0 0 1-2.2 1.3 12 12 0 0 1-1.5-5.8c0-5.2 2.4-9.5 7-12.5C19.7 8.4 26 6.9 33.6 6.7l.6-1.1Z" fill="currentColor"/></svg>`;

/** Escape de HTML. Igual ao `esc` de components/, repetido aqui porque a
    casca não importa componentes (seria ciclo): componentes usam a casca. */
const escapar = (v: unknown): string =>
  String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * JSON para dentro de `<script type="application/json">`.
 *
 * `JSON.stringify` não escapa `<`, então uma string com `</script>` FECHA o
 * bloco e o resto do valor é interpretado como HTML. Era um XSS armazenado
 * de verdade: `name` do checkout não restringe caractere e o usuário é
 * gravado antes de a cobrança sair, então um visitante anônimo plantava
 * `</script><img src=x onerror=...>` num Pix pendente, e o código rodava na
 * sessão do admin ao abrir /admin/usuarios — com impersonate e estorno à
 * mão. A tabela sempre esteve escapada; o vazamento era só por aqui.
 *
 * `\u003c` e companhia são JSON válido e idênticos ao original depois do
 * `JSON.parse`, então nada do lado do cliente muda.
 */
export const jsonSeguro = (valor: unknown): string =>
  JSON.stringify(valor ?? {})
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

export type ShellUser = { id: string; name: string; email: string; role: Role; orgName?: string | null };

export type ShellOpts = {
  /** Vai escapado nos três lugares onde aparece (os dois <title> e o <h1>).

      NÃO é sempre texto nosso: `org-pessoa` passa o nome da pessoa
      atendida, que QUEM É ATENDIDO digita. Sem escape, bastava se
      cadastrar com `</h1><img src=x onerror=...>` para rodar script na
      sessão de quem abre a ficha — a profissional, com acesso à carteira
      inteira e às anotações clínicas. Escapar aqui, e não no chamador, é
      o que faz a próxima tela com título dinâmico nascer segura.
      Coberto por test/xss.test.ts. */
  title: string;
  user: ShellUser;
  active: string;
  /** Ilhas de JS desta tela, por nome de arquivo em web/islands/. */
  islands?: string[];
  /** Conteúdo injetado antes de </body>, para dados iniciais. */
  bootstrap?: unknown;
  body: string;
  /** Ação à direita do título. */
  action?: string;
};

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase();

export function shell(o: ShellOpts): string {
  const items = NAV[o.user.role] ?? [];
  const nav = (cls: string) =>
    items.map((i) => {
      const on = o.active === i.href;
      return `<a class="${cls}${on ? " is-on" : ""}" href="${i.href}"${on ? ' aria-current="page"' : ""}>
        ${icon(i.icon)}<span>${i.label}</span>${i.badge ? `<em class="nav-badge">${i.badge}</em>` : ""}
      </a>`;
    }).join("");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapar(o.title)} · Nutri&amp;Live</title>
<meta name="theme-color" content="#17603D">
<meta name="robots" content="noindex">
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter-latin.woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/nutrielive.css">
<link rel="stylesheet" href="/app-assets/app.css">
</head>
<body class="app-body">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>

<aside class="app-side">
  <a class="app-brand" href="/">${brandMark}<span>Nutri<i>&amp;</i>Live</span></a>
  <nav class="app-nav" aria-label="Navegação principal">${nav("app-nav-link")}</nav>
  <div class="app-side-foot">
    <a class="app-nav-link" href="/conta">${icon("conta")}<span>Conta</span></a>
    <form method="post" action="/sair"><button class="app-nav-link" type="submit">${icon("sair")}<span>Sair</span></button></form>
  </div>
</aside>

<div class="app-main">
  <header class="app-top">
    <div class="app-top-inner">
      <h1 class="app-title">${escapar(o.title)}</h1>
      ${o.action ?? ""}
      <div class="app-who">
        <span class="app-who-text">
          <b>${escapar(o.user.name.split(" ")[0] ?? "")}</b>
          <small>${escapar(o.user.orgName ?? roleLabel(o.user.role))}</small>
        </span>
        <span class="avatar avatar-sm" aria-hidden="true">${escapar(initials(o.user.name))}</span>
      </div>
    </div>
  </header>

  <main class="app-content" id="conteudo">${o.body}</main>
</div>

<nav class="app-tabs" aria-label="Navegação">${nav("app-tab")}</nav>

<script id="nl-boot" type="application/json">${jsonSeguro(o.bootstrap)}</script>
<script src="/app-assets/islands/base.js" defer></script>
${(o.islands ?? []).map((i) => `<script src="/app-assets/islands/${i}.js" defer></script>`).join("\n")}
</body>
</html>`;
}

export const roleLabel = (r: Role) =>
  ({ admin: "Administração", pessoal: "Plano pessoal", nutricionista: "Nutricionista",
     academia: "Academia", paciente: "Paciente", aluno: "Aluno" })[r];

/** Casca enxuta para telas sem sessão: entrar, primeiro acesso, redefinir senha. */
export function publicShell(o: { title: string; body: string; islands?: string[]; bootstrap?: unknown }): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapar(o.title)} · Nutri&amp;Live</title>
<meta name="theme-color" content="#17603D">
<meta name="robots" content="noindex">
<link rel="preload" as="font" type="font/woff2" href="/assets/fonts/inter-latin.woff2" crossorigin>
<link rel="stylesheet" href="/assets/css/nutrielive.css">
<link rel="stylesheet" href="/app-assets/app.css">
</head>
<body class="auth-body">
<main class="auth-wrap" id="conteudo">
  <a class="auth-brand" href="/">${brandMark}<span>Nutri<i>&amp;</i>Live</span></a>
  ${o.body}
</main>
<script id="nl-boot" type="application/json">${jsonSeguro(o.bootstrap)}</script>
<script src="/app-assets/islands/base.js" defer></script>
${(o.islands ?? []).map((i) => `<script src="/app-assets/islands/${i}.js" defer></script>`).join("\n")}
</body>
</html>`;
}
