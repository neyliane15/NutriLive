/* =========================================================================
   Nutri&Live — drizzle/supabase-tudo.sql não pode ficar atrasado

   O arquivo é gerado e versionado, e é por ele que o banco de produção pode
   nascer (colado no SQL Editor do Supabase). Se alguém criar a migração 0002
   e esquecer de regerar, o arquivo cria um banco antigo — e, pior, registra
   que está em dia. Este teste é o que impede isso.
   ========================================================================= */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { gerar, DESTINO } from "../scripts/gerar-sql-unico.js";

const PASTA = resolve(import.meta.dirname, "../drizzle");

describe("supabase-tudo.sql", () => {
  it("está igual ao que a geração produz agora", () => {
    assert.equal(
      readFileSync(DESTINO, "utf8"),
      gerar(),
      "drizzle/supabase-tudo.sql está atrasado — rode `npm run db:sql-unico` e comite o resultado"
    );
  });

  it("inclui todas as migrações da pasta, não só as que alguém lembrou", () => {
    const arquivos = readdirSync(PASTA).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
    const gerado = gerar();
    for (const a of arquivos) {
      assert.ok(gerado.includes(a.replace(/\.sql$/, "")), `${a} ficou fora do arquivo único`);
    }
  });

  it("traz o registro de controle do Drizzle, senão um db:migrate futuro quebra", () => {
    const gerado = gerar();
    /* Sem estas linhas o Drizzle tentaria aplicar a 0000 de novo e pararia em
       "relation already exists" — com o banco já de pé e a pessoa sem pista. */
    assert.match(gerado, /CREATE SCHEMA IF NOT EXISTS "drizzle"/);
    assert.match(gerado, /INSERT INTO "drizzle"\."__drizzle_migrations"/);
  });

  it("roda dentro de uma transação, para um erro no meio não deixar banco pela metade", () => {
    const gerado = gerar();
    assert.ok(gerado.trimStart().startsWith("-- ="), "começa pelo cabeçalho explicativo");
    assert.match(gerado, /^BEGIN;$/m);
    assert.match(gerado, /^COMMIT;$/m);
  });

  it("liga RLS em toda tabela que cria — é a razão da migração 0001 existir", () => {
    const gerado = gerar();
    /* A 0000 cria sem qualificar o schema ("users"); a 0001 altera qualificando
       ("public"."users"). As duas formas apontam para a mesma tabela. */
    const criadas = [...gerado.matchAll(/^CREATE TABLE(?: IF NOT EXISTS)? "(\w+)" \(/gm)].map((m) => m[1]!);
    /* O `" (` acima deixa de fora "drizzle"."__drizzle_migrations": ela mora em
       outro schema, que o PostgREST não publica, então não precisa de RLS. */
    assert.ok(criadas.length >= 21, `esperava 21+ tabelas, achei ${criadas.length}`);
    for (const t of criadas) {
      assert.match(
        gerado,
        new RegExp(`ALTER TABLE "public"\\."${t}" ENABLE ROW LEVEL SECURITY`),
        `a tabela ${t} nasce sem RLS: ficaria legível pela API pública do Supabase`
      );
    }
  });
});
