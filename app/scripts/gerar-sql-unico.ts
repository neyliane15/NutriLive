/* =========================================================================
   Nutri&Live — gerar drizzle/supabase-tudo.sql

   Existe por um motivo prático: criar o banco com `npm run db:migrate` exige
   Node, git e npm install na máquina de quem está subindo o sistema. Nem
   sempre tem. O SQL Editor do Supabase está ali, no navegador, já logado.

   O arquivo gerado faz exatamente o que a migração faz — incluindo escrever
   as linhas de controle do Drizzle. Sem essas linhas, um `db:migrate` futuro
   tentaria aplicar a 0000 de novo e falharia em "relation already exists".
   Com elas, o Drizzle entende que a 0000 e a 0001 já rodaram e segue da 0002.

   Gerado, nunca editado à mão: `npm run db:sql-unico`. O teste
   test/sql-unico.test.ts falha se o arquivo no repositório ficar atrasado em
   relação às migrações.
   ========================================================================= */
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const PASTA = resolve(import.meta.dirname, "../drizzle");
export const DESTINO = resolve(PASTA, "supabase-tudo.sql");

type Entrada = { idx: number; when: number; tag: string };

export function gerar(): string {
  const journal = JSON.parse(readFileSync(resolve(PASTA, "meta/_journal.json"), "utf8")) as {
    entries: Entrada[];
  };
  const entradas = [...journal.entries].sort((a, b) => a.idx - b.idx);

  const partes: string[] = [
    "-- =========================================================================",
    "-- Nutri&Live — esquema completo do banco, para colar no SQL Editor do Supabase.",
    "--",
    "-- GERADO por `npm run db:sql-unico`. Não edite à mão: a próxima geração apaga.",
    "--",
    "-- Equivale a rodar `npm run db:migrate`, inclusive no registro de controle do",
    "-- Drizzle no fim — é ele que faz uma migração futura começar da 0002 em vez de",
    "-- tentar recriar as tabelas.",
    "--",
    "-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.",
    "-- Depois confira com `npm run db:conferir`, ou pelo aviso de RLS do painel.",
    "--",
    "-- Rodar duas vezes: a segunda para no primeiro CREATE TYPE com",
    "-- \"type already exists\" e o BEGIN/COMMIT desfaz tudo — nada muda, nada",
    "-- duplica. Testado. Se já rodou uma vez, não precisa rodar de novo.",
    "--",
    `-- Migrações incluídas: ${entradas.map((e) => e.tag).join(", ")}`,
    "-- =========================================================================",
    "",
    "BEGIN;",
    ""
  ];

  for (const e of entradas) {
    const sql = readFileSync(resolve(PASTA, `${e.tag}.sql`), "utf8");
    partes.push(
      `-- ----------------------------------------------------------------------`,
      `-- ${e.tag}`,
      `-- ----------------------------------------------------------------------`,
      /* O marcador do Drizzle é comentário SQL: separa statements para o driver
         dele e não atrapalha quem executa o arquivo inteiro de uma vez. */
      sql.trimEnd(),
      ""
    );
  }

  partes.push(
    "-- ----------------------------------------------------------------------",
    "-- Registro de controle do Drizzle",
    "--",
    "-- O hash é o sha256 do arquivo .sql; o created_at é o campo \"when\" do",
    "-- journal. É assim que o Drizzle grava — conferido contra um Postgres 16,",
    "-- comparando este arquivo com o que `npm run db:migrate` produz: mesmo",
    "-- schema, linha por linha, e um db:migrate depois disto não refaz nada.",
    "-- O WHERE NOT EXISTS evita registro duplicado se alguém inserir à mão.",
    "-- ----------------------------------------------------------------------",
    'CREATE SCHEMA IF NOT EXISTS "drizzle";',
    'CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (',
    '  id SERIAL PRIMARY KEY,',
    '  hash text NOT NULL,',
    '  created_at bigint',
    ');',
    ""
  );
  for (const e of entradas) {
    const hash = createHash("sha256")
      .update(readFileSync(resolve(PASTA, `${e.tag}.sql`), "utf8"))
      .digest("hex");
    partes.push(
      `INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)`,
      `SELECT '${hash}', ${e.when}`,
      `WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = '${hash}');  -- ${e.tag}`,
      ""
    );
  }

  partes.push("COMMIT;", "");
  return partes.join("\n");
}

const executadoDireto = process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/gerar-sql-unico.ts");
if (executadoDireto) {
  writeFileSync(DESTINO, gerar(), "utf8");
  console.log(`escrito: ${DESTINO}`);
}
