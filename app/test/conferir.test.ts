/* =========================================================================
   Nutri&Live — as mensagens de `npm run db:conferir`

   Este comando é a última coisa entre a pessoa e um banco aberto na internet,
   e a parte dele que mais importa é o texto: quem roda isto não sabe ler um
   stack trace. Os casos abaixo são os erros que apareceram de verdade ao
   testar contra um Postgres com autenticação por senha.
   ========================================================================= */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { explicarErroDeLigacao, problemaObvioNaUrl } from "../server/db/conferir.js";

describe("conferir: a URL antes de conectar", () => {
  it("vê o [YOUR-PASSWORD] que o Supabase deixa na connection string", () => {
    const r = problemaObvioNaUrl(
      "postgresql://postgres.abc:[YOUR-PASSWORD]@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"
    );
    assert.ok(r, "placeholder não preenchido tem de ser apontado antes de qualquer ligação");
    assert.match(r[0]!, /senha não foi preenchida/);
  });

  it("não confunde host IPv6 entre colchetes com placeholder", () => {
    /* Os colchetes só valem como placeholder antes do @; depois dele são host. */
    assert.equal(problemaObvioNaUrl("postgresql://u:senha123@[::1]:5432/postgres"), null);
  });

  it("recusa o que não é uma URL de Postgres", () => {
    const r = problemaObvioNaUrl("aws-0-sa-east-1.pooler.supabase.com:6543");
    assert.match(r![0]!, /postgresql:\/\//);
  });

  it("deixa passar uma URL preenchida", () => {
    assert.equal(
      problemaObvioNaUrl("postgresql://postgres.abc:s3nh4@aws-0-sa-east-1.pooler.supabase.com:6543/postgres"),
      null
    );
  });
});

describe("conferir: traduzir o erro do driver", () => {
  const casos: [string, RegExp][] = [
    ["28P01", /senha recusada/],          /* senha errada, ou não codificada */
    ["3D000", /não existe/],              /* /postgres trocado por outro nome */
    ["ENOTFOUND", /não foi encontrado/],  /* host direto db.<projeto>, só IPv6 */
    ["ETIMEDOUT", /não respondeu/]        /* projeto grátis hibernando */
  ];
  for (const [codigo, esperado] of casos) {
    it(`${codigo} vira uma frase com saída`, () => {
      const linhas = explicarErroDeLigacao({ code: codigo, message: "x" });
      assert.match(linhas[0]!, esperado);
      assert.ok(linhas.length > 1, `${codigo} precisa dizer o que fazer, não só o que houve`);
      assert.ok(linhas.slice(1).some((l) => l.startsWith("→")), "a saída vem marcada com →");
    });
  }

  it("um erro desconhecido ainda mostra a mensagem original", () => {
    const [linha] = explicarErroDeLigacao({ code: "XX999", message: "coisa nova" });
    assert.match(linha!, /coisa nova/);
  });
});
