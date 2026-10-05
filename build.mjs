#!/usr/bin/env node
/* Nutri&Live static site build — assembles pages from src/ into the repo root. */
import { writeFileSync, readFileSync, mkdirSync, readdirSync } from "node:fs";
import { content, order } from "./src/data/segments.mjs";
import { landing } from "./src/pages/landing.mjs";

/* ---- CSS: uma única requisição em produção, arquivos separados na fonte ---- */
const CSS_ORDER = ["tokens", "base", "components", "layout", "sections", "checkout", "motion"];
const bundle = CSS_ORDER.map((n) => {
  const src = readFileSync(`assets/css/${n}.css`, "utf8");
  return `/* ===== ${n}.css ===== */\n${src.replace(/@charset[^;]+;\n?/g, "")}`;
}).join("\n");
const minified = bundle
  .replace(/\/\*(?!!)[\s\S]*?\*\//g, "")   // comentários
  .replace(/\n\s*\n+/g, "\n")               // linhas em branco
  .replace(/[ \t]+/g, " ")                   // espaços repetidos
  .replace(/\s*([{}:;,>])\s*/g, "$1")        // espaço em volta de pontuação
  .replace(/;}/g, "}")
  .trim();
writeFileSync("assets/css/nutrielive.css", minified);

const out = [];
const emit = (file, html) => {
  writeFileSync(file, html);
  out.push([file, html.length]);
};

// A página de academias deixou de ser uma landing de produto: virou o
// cadastro do programa de parceria, com template próprio.
for (const key of order) {
  if (key === "academia") continue;
  emit(content[key].slug, landing(content[key]));
}

/* Optional pages are registered here as they land. */
const extra = await Promise.all([
  import("./src/pages/checkout.mjs").catch(() => null),
  import("./src/pages/obrigado.mjs").catch(() => null),
  import("./src/pages/legal.mjs").catch(() => null),
  import("./src/pages/academias.mjs").catch(() => null)
]);
for (const mod of extra) {
  if (mod && typeof mod.pages === "function") {
    for (const [file, html] of Object.entries(mod.pages())) emit(file, html);
  }
}

/* ------------------------------------------------------------------------
   Os arquivos do app viram estáticos na raiz.

   O app pede `/app-assets/app.css` e `/app-assets/islands/*.js`. Num
   servidor comum o próprio Hono os serve de `app/web/`; na Vercel não existe
   disco servido por função — e, mesmo existindo, mandar CSS por execução de
   função é pagar para fazer pior. Copiados para cá, a plataforma os entrega
   direto do disco, com cache.
   ------------------------------------------------------------------------ */
{
  const de = "app/web";
  const para = "app-assets";
  mkdirSync(`${para}/islands`, { recursive: true });
  const copiar = (origem, destino) => {
    const conteudo = readFileSync(origem);
    writeFileSync(destino, conteudo);
    out.push([destino, conteudo.length]);
  };
  copiar(`${de}/app.css`, `${para}/app.css`);
  for (const f of readdirSync(`${de}/islands`).filter((f) => f.endsWith(".js"))) {
    copiar(`${de}/islands/${f}`, `${para}/islands/${f}`);
  }
}

out.push(["assets/css/nutrielive.css", minified.length]);
const total = out.reduce((a, b) => a + b[1], 0);
console.log(out.map(([f, n]) => `  ${f.padEnd(24)} ${(n / 1024).toFixed(1)} KB`).join("\n"));
console.log(`  ${"TOTAL".padEnd(24)} ${(total / 1024).toFixed(1)} KB · ${out.length} pages`);
