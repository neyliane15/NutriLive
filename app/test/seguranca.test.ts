/* =========================================================================
   Nutri&Live — cabeçalhos de segurança

   Dois riscos cobertos aqui:

   1. divergência. A mesma política sai de dois lugares (a função, por
      server/lib/seguranca.ts, e os arquivos da landing, pelo vercel.json).
      Se divergirem, o navegador aplica a interseção e a tela quebra sem
      erro visível.

   2. afrouxamento silencioso. `'unsafe-inline'` em script-src desfaz a
      proteção inteira, e é exatamente o que alguém adiciona para fazer um
      script inline funcionar. Aqui isso reprova.
   ========================================================================= */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { CSP, CABECALHOS, ehEstatico } from "../server/lib/seguranca.js";

const RAIZ = resolve(import.meta.dirname, "../..");
const vercel = JSON.parse(readFileSync(resolve(RAIZ, "vercel.json"), "utf8")) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const globais = vercel.headers.find((b) => b.source === "/(.*)");

describe("cabeçalhos: função e vercel.json dizem o mesmo", () => {
  it("o vercel.json tem a regra que cobre tudo", () => {
    assert.ok(globais, "sem a regra /(.*) a landing sai sem cabeçalho nenhum");
  });

  for (const [nome, valor] of Object.entries(CABECALHOS)) {
    it(`${nome} idêntico nos dois`, () => {
      const noVercel = globais!.headers.find((h) => h.key === nome);
      assert.ok(noVercel, `${nome} falta no vercel.json — a landing fica sem ele`);
      assert.equal(noVercel.value, valor, `${nome} divergiu entre a função e o vercel.json`);
    });
  }

  it("HSTS só no vercel.json, nunca na função", () => {
    /* Em http ele não faz nada, e emitido com domínio errado trava o
       navegador naquele domínio por dois anos. */
    assert.ok(globais!.headers.some((h) => h.key === "Strict-Transport-Security"));
    assert.ok(!("Strict-Transport-Security" in CABECALHOS));
  });

  it("não marca a landing como noindex", () => {
    /* A landing é o site de vendas: um noindex global a tira do Google sem
       nenhum erro aparecer. As telas do app se marcam uma por uma. */
    assert.ok(!globais!.headers.some((h) => h.key === "X-Robots-Tag"));
    assert.ok(!("X-Robots-Tag" in CABECALHOS));
  });
});

describe("CSP", () => {
  const diretiva = (nome: string): string =>
    CSP.split(";").map((d) => d.trim()).find((d) => d.startsWith(nome + " ")) ?? "";

  it("script só de arquivo nosso, sem inline e sem eval", () => {
    const s = diretiva("script-src");
    assert.equal(s, "script-src 'self'");
    for (const veneno of ["'unsafe-inline'", "'unsafe-eval'", "data:", "*"]) {
      assert.ok(!s.includes(veneno), `script-src aceita ${veneno}: a CSP deixa de valer`);
    }
  });

  it("fecha as diretivas que não têm fallback em default-src", () => {
    /* base-uri, form-action e frame-ancestors NÃO herdam de default-src:
       esquecer uma delas é deixar a porta aberta sem parecer. */
    assert.ok(CSP.includes("base-uri 'none'"));
    assert.ok(CSP.includes("form-action 'self'"));
    assert.ok(CSP.includes("frame-ancestors 'none'"));
  });

  it("nenhuma tela depende de script inline", () => {
    /* Se alguém adicionar um, a CSP o bloqueia e a tela quebra em
       produção, não aqui. Então quebra aqui. */
    const dirs = [resolve(RAIZ, "app/web"), RAIZ];
    const arquivos: string[] = [];
    const varrer = (d: string, fundo: boolean) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name.startsWith(".")) continue;
        const caminho = resolve(d, e.name);
        if (e.isDirectory() && fundo) varrer(caminho, fundo);
        else if (/\.(ts|html)$/.test(e.name)) arquivos.push(caminho);
      }
    };
    varrer(dirs[0]!, true);
    varrer(RAIZ, false);

    for (const a of arquivos) {
      const txt = readFileSync(a, "utf8");
      /* Inline e EXECUTÁVEL é o que a CSP bloqueia. Um `<script>` com
         `type` que não é JavaScript é bloco de dados: o navegador nem
         tenta rodar. São dois no projeto e os dois são legítimos — o
         bootstrap (`application/json`) e o JSON-LD da landing
         (`application/ld+json`), que é o que põe o site no Google. */
      for (const m of txt.matchAll(/<script([^>]*)>/g)) {
        const attrs = m[1] ?? "";
        if (attrs.includes("src=")) continue;
        const tipo = attrs.match(/type\s*=\s*["']([^"']+)["']/)?.[1] ?? "";
        const executavel = tipo === "" || /javascript|module|ecmascript/i.test(tipo);
        if (!executavel) continue;
        assert.fail(`${a}: <script${attrs}> é inline e executável — a CSP vai bloquear`);
      }
      /* Atributo de evento inline (onclick=...) também é bloqueado. */
      const evento = txt.match(/\son(?:click|change|submit|input|load|focus|blur)\s*=\s*["']/);
      assert.equal(evento, null, `${a}: handler inline ${evento?.[0]?.trim()} — a CSP bloqueia`);
    }
  });
});

describe("cache", () => {
  it("tela e API não vão para cache; arquivo estático vai", () => {
    assert.equal(ehEstatico("/assets/css/nutrielive.css"), true);
    assert.equal(ehEstatico("/app-assets/islands/base.js"), true);
    assert.equal(ehEstatico("/org/pessoas/u1"), false);
    assert.equal(ehEstatico("/api/me/today"), false);
  });
});
