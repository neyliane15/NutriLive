#!/usr/bin/env node
/* Nutri&Live static site build — assembles pages from src/ into the repo root. */
import { writeFileSync, mkdirSync } from "node:fs";
import { content, order } from "./src/data/segments.mjs";
import { landing } from "./src/pages/landing.mjs";

const out = [];
const emit = (file, html) => {
  writeFileSync(file, html);
  out.push([file, html.length]);
};

for (const key of order) emit(content[key].slug, landing(content[key]));

/* Optional pages are registered here as they land. */
const extra = await Promise.all([
  import("./src/pages/checkout.mjs").catch(() => null),
  import("./src/pages/obrigado.mjs").catch(() => null),
  import("./src/pages/legal.mjs").catch(() => null)
]);
for (const mod of extra) {
  if (mod && typeof mod.pages === "function") {
    for (const [file, html] of Object.entries(mod.pages())) emit(file, html);
  }
}

const total = out.reduce((a, b) => a + b[1], 0);
console.log(out.map(([f, n]) => `  ${f.padEnd(24)} ${(n / 1024).toFixed(1)} KB`).join("\n"));
console.log(`  ${"TOTAL".padEnd(24)} ${(total / 1024).toFixed(1)} KB · ${out.length} pages`);
