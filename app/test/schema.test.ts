/* =========================================================================
   Nutri&Live — o registro de tabelas não pode ficar atrás do arquivo

   `schema.ts` exporta cada tabela e, no fim, um objeto `schema` com todas.
   Esse objeto é mantido à mão, e dele dependem três coisas: a lista de
   tabelas que `npm run db:conferir` exige no banco, as coleções do motor
   em memória e o `db.limpar()`.

   Tabela que fica fora é invisível para os três. Aconteceu com
   `rate_limits`: o conferir anunciava "as 21 tabelas estão lá" num banco
   de 22 e aprovaria um banco sem ela — justamente a tabela que guarda o
   limite de força bruta.
   ========================================================================= */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import * as arquivo from "../server/db/schema.js";

const MARCA = Symbol.for("drizzle:Name");
const ehTabela = (v: unknown): v is PgTable =>
  typeof v === "object" && v !== null && (is(v, PgTable) || MARCA in v);

describe("registro de tabelas", () => {
  const exportadas = Object.entries(arquivo).filter(([nome, v]) => nome !== "schema" && ehTabela(v));
  const registradas = new Set(Object.keys(arquivo.schema));

  it("tem tabelas para conferir", () => {
    assert.ok(exportadas.length >= 22, `esperava 22+ tabelas exportadas, achei ${exportadas.length}`);
  });

  for (const [nome] of Object.entries(arquivo).filter(([n, v]) => n !== "schema" && ehTabela(v))) {
    it(`${nome} está no objeto schema`, () => {
      assert.ok(
        registradas.has(nome),
        `${nome} é exportada mas não está em \`schema\`: db:conferir não vai exigi-la, ` +
        `o motor em memória não vai criá-la e db.limpar() não vai limpá-la`
      );
    });
  }

  it("não há entrada no schema que não seja tabela", () => {
    for (const [nome, valor] of Object.entries(arquivo.schema)) {
      assert.ok(ehTabela(valor), `schema.${nome} não é uma tabela`);
    }
  });

  it("nenhum nome de tabela repetido", () => {
    const nomes = Object.values(arquivo.schema).map((t) => getTableName(t as PgTable));
    assert.equal(new Set(nomes).size, nomes.length, `nome duplicado em: ${nomes.join(", ")}`);
  });
});
