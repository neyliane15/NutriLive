/* =========================================================================
   Nutri&Live — as rotas de tela e o vercel.json não podem divergir

   Na Vercel, caminho que não está em `rewrites` não chega à função: a
   plataforma procura um arquivo com aquele nome, não acha, e responde 404.
   Então uma tela nova sem rota nova ali fica no ar inteira no servidor local
   e some em produção — e o jeito natural de descobrir é um usuário clicando.

   Este teste compara os dois lados e falha antes do deploy.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("toda rota de tela está coberta por um rewrite do vercel.json", () => {
  const paginas = readFileSync(join(RAIZ, "app/server/routes/pages.ts"), "utf8");
  const vercel = JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8")) as {
    rewrites: { source: string; destination: string }[];
  };

  const rotas = [...paginas.matchAll(/r\.(?:get|post)\("(\/[^"]*)"/g)]
    .map((m) => m[1]!)
    .filter((p) => p !== "/" && p !== "*");
  assert.ok(rotas.length > 15, `só ${rotas.length} rotas encontradas — o regex deixou de casar?`);

  /* O padrão da Vercel aceita `(.*)` e grupos `(a|b)`; os dois viram regex
     direto, e `(.*)` vira `.*`. */
  const padroes = vercel.rewrites.map(
    (r) => new RegExp("^" + r.source.replace(/\(\.\*\)/g, ".*") + "$")
  );

  const descobertas = [...new Set(rotas)]
    .map((p) => p.replace(/:[a-zA-Z]+/g, "exemplo"))
    .filter((p) => !padroes.some((rx) => rx.test(p)));

  assert.deepEqual(
    descobertas, [],
    `estas rotas dariam 404 na Vercel: ${descobertas.join(", ")} — acrescente em vercel.json`
  );
});

test("o cron da renovação está agendado e aponta para a rota certa", () => {
  const vercel = JSON.parse(readFileSync(join(RAIZ, "vercel.json"), "utf8")) as {
    crons?: { path: string; schedule: string }[];
  };
  const cron = vercel.crons?.find((c) => c.path === "/api/cron/renovacoes");
  assert.ok(cron, "sem o cron, quem assina por Pix nunca é cobrado de novo");
  assert.match(cron.schedule, /^\S+ \S+ \S+ \S+ \S+$/, "schedule não parece um cron de 5 campos");
});

test("a função declara o runtime Node, não Edge", () => {
  const entrada = readFileSync(join(RAIZ, "api/index.ts"), "utf8");
  /* Argon2 é binário nativo e o driver `postgres` usa sockets: nenhum dos
     dois roda no Edge. Trocar isso derruba login e banco de uma vez. */
  assert.match(entrada, /runtime:\s*"nodejs"/);
});
