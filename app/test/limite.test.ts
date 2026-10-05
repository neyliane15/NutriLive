/* =========================================================================
   Nutri&Live — limite de tentativas de senha

   O teste que importa aqui é o da penúltima asserção: o contador tem de
   viver no BANCO, não na memória do processo. Na Vercel cada requisição
   pode cair numa instância nova, e um contador em memória conta até um e
   recomeça — o limite de 5 tentativas por e-mail simplesmente não existe
   onde ele é necessário, sem erro nenhum aparecer. Era o caso.

   Então não basta "bloqueia na 6ª tentativa": o teste recarrega o módulo
   do limite, que é o mais perto que dá de uma instância nova lendo o mesmo
   banco, e exige que o bloqueio continue de pé.
   ========================================================================= */
import { describe, it, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

type App = { fetch: (r: Request) => Promise<Response> };

let app: App;
let db: Awaited<typeof import("../server/db/index.js")>["db"];
let schema: typeof import("../server/db/schema.js");
let limite: typeof import("../server/auth/limite.js");
let email: string;

const EMAIL_BASE = "limite.teste";
const SENHA = "SenhaCerta123";
/* Tem de passar pela validação do contrato (tamanho mínimo), senão a rota
   responde 422 ANTES de chegar ao limite e o teste mede outra coisa — foi
   o que aconteceu na primeira versão: `"errada"` dava 422 e o teste
   concluía que o limite não gravava nada. */
const SENHA_ERRADA = "SenhaErrada999";

const tentar = (corpo: Record<string, unknown>, ip = "203.0.113.7") =>
  app.fetch(new Request("http://local/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(corpo)
  }));

before(async () => {
  const banco = await import("../server/db/index.js");
  db = banco.db;
  schema = await import("../server/db/schema.js");
  limite = await import("../server/auth/limite.js");
  app = (await import("../server/app.js")).default as App;
  await banco.bancoPronto();
});

beforeEach(async () => {
  await limite.limparTodosOsLimites();
  const { gerarHash } = await import("../server/auth/senha.js");
  email = `${EMAIL_BASE}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}@exemplo.com.br`;
  await db.inserir(schema.users, {
    email, name: "Pessoa de Teste", role: "pessoal", status: "ativo",
    passwordHash: await gerarHash(SENHA)
  });
});

describe("limite de tentativas", () => {
  it("bloqueia depois de 5 senhas erradas no mesmo e-mail", async () => {
    const { tentativas } = limite.POLITICAS.login_email;

    for (let i = 1; i <= tentativas; i++) {
      const r = await tentar({ email, password: `${SENHA_ERRADA}-${i}` });
      assert.equal(r.status, 401, `tentativa ${i} devia ser recusada por credencial, não bloqueada`);
    }

    const bloqueada = await tentar({ email, password: `${SENHA_ERRADA}-${tentativas + 1}` });
    assert.equal(bloqueada.status, 429, "a 6ª tentativa tinha de ser bloqueada");
    const corpo = await bloqueada.json() as { error: { code: string; message: string } };
    assert.equal(corpo.error.code, "excesso_de_tentativas");
    assert.match(corpo.error.message, /\d+ minutos?/, "a mensagem tem de dizer quanto esperar");
  });

  it("bloqueado nem confere a senha — a certa também é recusada", async () => {
    /* Se a senha certa passasse durante o bloqueio, o atacante mediria o
       tempo de resposta e saberia quando acertou. */
    for (let i = 0; i < limite.POLITICAS.login_email.tentativas; i++) {
      const r = await tentar({ email, password: SENHA_ERRADA });
      assert.equal(r.status, 401, "tinha de ser recusa de credencial, não erro de validação");
    }
    const r = await tentar({ email, password: SENHA });
    assert.equal(r.status, 429, "durante o bloqueio, nem a senha certa entra");
  });

  it("o contador vive no banco, não na memória do processo", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await tentar({ email, password: SENHA_ERRADA });
      assert.equal(r.status, 401, "tinha de ser recusa de credencial, não erro de validação");
    }

    const linhas = await db.buscar(schema.rateLimits, {});
    const doEmail = linhas.filter((l) => l.bucket === `login_email:${email.toLowerCase()}`);
    assert.equal(doEmail.length, 3, "as falhas tinham de estar gravadas em rate_limits");

    /* Uma instância nova da Vercel: módulo recarregado, mesmo banco. O
       bloqueio tem de continuar valendo — é exatamente isto que a versão
       em memória não fazia. */
    const outraInstancia = await import(`../server/auth/limite.js?instancia=${Date.now()}`);
    assert.equal(await outraInstancia.tentativasRestantes("login_email", email), 2);

    for (let i = 0; i < 2; i++) await tentar({ email, password: SENHA_ERRADA });
    await assert.rejects(
      () => outraInstancia.conferirLimite("login_email", email),
      /Muitas tentativas/,
      "a instância nova tinha de ver o bloqueio gravado pela anterior"
    );
  });

  it("acerto limpa o contador do e-mail", async () => {
    for (let i = 0; i < 3; i++) {
      const r = await tentar({ email, password: SENHA_ERRADA });
      assert.equal(r.status, 401, "tinha de ser recusa de credencial, não erro de validação");
    }
    const ok = await tentar({ email, password: SENHA });
    assert.equal(ok.status, 200, "3 erros não bloqueiam; a senha certa tinha de entrar");
    assert.equal(await limite.tentativasRestantes("login_email", email), 5);
  });

  it("o bloqueio de um e-mail não bloqueia outro", async () => {
    for (let i = 0; i < 6; i++) {
      const r = await tentar({ email, password: SENHA_ERRADA });
      /* As 5 primeiras são recusa de credencial; a 6ª já é o bloqueio. */
      assert.equal(r.status, i < 5 ? 401 : 429, `tentativa ${i + 1} devolveu ${r.status}`);
    }
    /* IP diferente para não bater no limite de vizinhança. */
    const outro = await tentar({ email: "ninguem@exemplo.com.br", password: SENHA_ERRADA }, "198.51.100.3");
    assert.notEqual(outro.status, 429);
  });

  it("a faxina apaga tentativa velha e preserva a recente", async () => {
    await limite.registrarFalha("login_email", email);
    const velha = await db.inserir(schema.rateLimits, { bucket: `login_email:antigo@exemplo.com.br` });
    await db.atualizar(schema.rateLimits, { id: velha.id },
      { createdAt: new Date(Date.now() - 100 * 24 * 3600 * 1000) });

    await limite.faxinaDeTentativas();
    const restantes = await db.buscar(schema.rateLimits, {});
    assert.ok(restantes.some((l) => l.bucket.includes(email.toLowerCase())), "apagou a recente");
    assert.ok(!restantes.some((l) => l.id === velha.id), "não apagou a velha");
  });
});

describe("limite por IP: o balde compartilhado", () => {
  it("sem IP conhecido, o limite por IP não se aplica", async () => {
    /* Na Vercel sem TRUST_PROXY, clientIp devolve 0.0.0.0 para TODO
       mundo. Um limite por IP aí não é defesa: 25 senhas erradas de um
       visitante qualquer trancariam o login de todos os clientes. */
    const { IP_DESCONHECIDO } = await import("../server/lib/http.js");
    const politica = limite.POLITICAS.login_ip;

    for (let i = 0; i < politica.tentativas + 5; i++) {
      await limite.registrarFalha("login_ip", IP_DESCONHECIDO);
    }
    await limite.conferirLimite("login_ip", IP_DESCONHECIDO);   /* não lança */

    const linhas = await db.buscar(schema.rateLimits, {});
    assert.equal(
      linhas.filter((l) => l.bucket.includes(IP_DESCONHECIDO)).length, 0,
      "nem gravar: um balde que tranca todo mundo não deve nem existir"
    );
  });

  it("com IP conhecido, o limite por IP vale", async () => {
    const politica = limite.POLITICAS.login_ip;
    for (let i = 0; i < politica.tentativas; i++) {
      await limite.registrarFalha("login_ip", "198.51.100.44");
    }
    await assert.rejects(() => limite.conferirLimite("login_ip", "198.51.100.44"), /Muitas tentativas/);
  });

  it("o limite por e-mail continua valendo mesmo sem IP", async () => {
    /* É esta a defesa de cada conta; a de IP é só vizinhança. */
    for (let i = 0; i < limite.POLITICAS.login_email.tentativas; i++) {
      await limite.registrarFalha("login_email", email);
    }
    await assert.rejects(() => limite.conferirLimite("login_email", email), /Muitas tentativas/);
  });
});
