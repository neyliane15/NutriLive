/* =========================================================================
   Nutri&Live — como a conexão com o banco é aberta

   Isto não é afinação de desempenho: é a diferença entre funcionar e
   quebrar, e quebrar do pior jeito.

   O Supabase atende em duas portas. A 5432 é sessão; a 6543 é o Supavisor
   em modo TRANSAÇÃO, que devolve a conexão ao pool a cada transação. Nada
   que dependa de estado de sessão sobrevive — e `postgres.js` usa PREPARED
   STATEMENTS por padrão, que são exatamente isso.

   Com `prepare` ligado contra a 6543, as primeiras consultas passam e
   depois começam a falhar com "prepared statement already exists", de forma
   intermitente, sob carga. Não aparece em teste manual; aparece com
   usuário. Daí este arquivo.
   ========================================================================= */
import { test } from "node:test";
import assert from "node:assert/strict";

import { ehPooler, opcoesDeConexao } from "../server/db/index.js";

const SUPABASE_TRANSACAO = "postgresql://postgres.abcdef:senha@aws-0-sa-east-1.pooler.supabase.com:6543/postgres";
const SUPABASE_SESSAO    = "postgresql://postgres.abcdef:senha@aws-0-sa-east-1.pooler.supabase.com:5432/postgres";
const SUPABASE_DIRETO    = "postgresql://postgres:senha@db.abcdef.supabase.co:5432/postgres";
const NEON               = "postgres://u:p@ep-x.sa-east-1.aws.neon.tech/db?sslmode=require";
const LOCAL              = "postgres://postgres:senha@localhost:5432/nutrielive";

test("a porta 6543 do Supabase é reconhecida como pooler em modo transação", () => {
  assert.equal(ehPooler(SUPABASE_TRANSACAO), true);
});

test("sessão e conexão direta NÃO são modo transação", () => {
  assert.equal(ehPooler(SUPABASE_SESSAO), false);
  assert.equal(ehPooler(SUPABASE_DIRETO), false);
  assert.equal(ehPooler(NEON), false);
  assert.equal(ehPooler(LOCAL), false);
});

test("pgbouncer=true na querystring também conta, em qualquer porta", () => {
  assert.equal(ehPooler("postgres://u:p@host:5432/db?pgbouncer=true"), true);
  assert.equal(ehPooler("postgres://u:p@host:5432/db?sslmode=require&pgbouncer=true"), true);
});

test("contra um pooler em modo transação, prepared statements FICAM DESLIGADOS", () => {
  const o = opcoesDeConexao(SUPABASE_TRANSACAO);
  assert.equal(o["prepare"], false, "prepare ligado contra a 6543 derruba o app sob carga");
});

test("contra sessão ou conexão direta, prepared statements ficam ligados", () => {
  for (const url of [SUPABASE_SESSAO, SUPABASE_DIRETO, NEON, LOCAL]) {
    assert.equal(opcoesDeConexao(url)["prepare"], true, url);
  }
});

test("com pooler na frente, o app pede UMA conexão", () => {
  /* Numa função sem estado cada invocação é um processo novo. Pedir dez
     conexões por invocação esgota o limite do banco com pouca gente online;
     quem divide é o pooler. */
  assert.equal(opcoesDeConexao(SUPABASE_TRANSACAO)["max"], 1);
  assert.equal(opcoesDeConexao(LOCAL)["max"], 10);
});

test("endereço do Supabase exige TLS", () => {
  for (const url of [SUPABASE_TRANSACAO, SUPABASE_SESSAO, SUPABASE_DIRETO]) {
    assert.equal(opcoesDeConexao(url)["ssl"], "require", url);
  }
  /* Fora do Supabase, quem manda é a querystring (`sslmode=`), e não nós. */
  assert.equal(opcoesDeConexao(NEON)["ssl"], undefined);
  assert.equal(opcoesDeConexao(LOCAL)["ssl"], undefined);
});

test("string fora do formato não derruba a subida", () => {
  /* Melhor abrir conexão com o padrão e falhar no `connect`, com mensagem do
     driver, do que estourar um TypeError antes de qualquer log. */
  assert.doesNotThrow(() => opcoesDeConexao("isto não é uma URL"));
  assert.equal(ehPooler("isto não é uma URL"), false);
  assert.equal(ehPooler("coisa:6543/solta"), true);
});
