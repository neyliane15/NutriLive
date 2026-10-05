/* =========================================================================
   Nutri&Live — a conferência de produção

   Cada caso aqui é um jeito de o sistema subir parecendo certo e estar
   errado. O teste roda num processo separado por caso, porque
   `server/lib/env.ts` lê process.env uma vez, no import.
   ========================================================================= */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const RAIZ = resolve(import.meta.dirname, "..");

/** Roda a conferência com um ambiente montado à mão e devolve as faltas. */
function conferir(ambiente: Record<string, string>): { faltas: string[]; avisos: string[]; prod: boolean } {
  const codigo =
    'import { conferirAmbienteDeProducao, avisosDeProducao, isProd } from "./server/lib/env.js";' +
    'console.log(JSON.stringify({ faltas: conferirAmbienteDeProducao(), avisos: avisosDeProducao(), prod: isProd }));';
  const saida = execFileSync(process.execPath, ["--import", "tsx", "--eval", codigo], {
    cwd: RAIZ,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...ambiente }
  });
  return JSON.parse(saida.trim().split("\n").at(-1)!);
}

/** Configuração completa e correta, para variar um item por vez. */
const COMPLETA: Record<string, string> = {
  NODE_ENV: "production",
  SESSION_SECRET: "x".repeat(48),
  DATABASE_URL: "postgresql://u:s@host.pooler.supabase.com:6543/postgres",
  APP_URL: "https://nutrielive.com.br",
  EMAIL_PROVIDER: "resend",
  RESEND_API_KEY: "re_teste",
  MP_ACCESS_TOKEN: "APP_USR-teste",
  MP_WEBHOOK_SECRET: "segredo-do-webhook"
};

const semA = (chave: string): Record<string, string> => {
  const copia = { ...COMPLETA };
  delete copia[chave];
  return copia;
};

describe("produção: o que impede a subida", () => {
  it("configuração completa passa", () => {
    const r = conferir(COMPLETA);
    assert.deepEqual(r.faltas, [], "configuração correta não deveria ter falta");
    assert.deepEqual(r.avisos, []);
  });

  it("pagamento simulado NÃO sobe calado", () => {
    /* Sem MP_ACCESS_TOKEN o provedor aprova qualquer cartão: seria o
       produto de graça para quem digitasse um número qualquer. */
    const r = conferir(semA("MP_ACCESS_TOKEN"));
    assert.match(r.faltas.join(" "), /SIMULADO|MP_ACCESS_TOKEN/);
  });

  it("pagamento simulado liberado de propósito sobe, mas avisa", () => {
    const r = conferir({ ...semA("MP_ACCESS_TOKEN"), PAGAMENTO_SIMULADO_OK: "1" });
    assert.deepEqual(r.faltas, [], "liberado por escrito, não deve bloquear");
    assert.match(r.avisos.join(" "), /SIMULADO/);
  });

  it("Mercado Pago sem segredo de webhook não sobe", () => {
    /* Falha fechada: o cliente paga e a assinatura nunca ativa, porque a
       notificação é recusada na porta. */
    const r = conferir(semA("MP_WEBHOOK_SECRET"));
    assert.match(r.faltas.join(" "), /MP_WEBHOOK_SECRET/);
  });

  for (const [chave, padrao] of [
    ["SESSION_SECRET", /SESSION_SECRET/],
    ["DATABASE_URL", /DATABASE_URL/],
    ["RESEND_API_KEY", /EMAIL_PROVIDER|RESEND/]
  ] as [string, RegExp][]) {
    it(`sem ${chave} não sobe`, () => {
      assert.match(conferir(semA(chave)).faltas.join(" "), padrao);
    });
  }

  it("APP_URL em localhost não sobe", () => {
    assert.match(
      conferir({ ...COMPLETA, APP_URL: "http://localhost:8787" }).faltas.join(" "),
      /APP_URL/
    );
  });
});

describe("produção: como ela é detectada", () => {
  it("NODE_ENV=production é produção", () => {
    assert.equal(conferir(COMPLETA).prod, true);
  });

  it("a Vercel é produção mesmo sem NODE_ENV", () => {
    /* Esquecer NODE_ENV no painel desligava, de uma vez: a flag Secure do
       cookie de sessão e TODAS as conferências acima. E não dá erro — o
       sistema sobe e parece funcionar. */
    const r = conferir({ ...semA("NODE_ENV"), VERCEL: "1" });
    assert.equal(r.prod, true, "na Vercel sem NODE_ENV o sistema ficava em modo desenvolvimento");
    assert.ok(r.faltas.length === 0);
  });

  it("preview da Vercel também é produção", () => {
    /* Preview com dado real é produção para quem vaza. */
    assert.equal(conferir({ ...semA("NODE_ENV"), VERCEL_ENV: "preview" }).prod, true);
  });

  it("sem nada disso, não é produção e nada é exigido", () => {
    const r = conferir({ NODE_ENV: "development" });
    assert.equal(r.prod, false);
    assert.deepEqual(r.faltas, []);
  });
});
