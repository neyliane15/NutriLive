/* =========================================================================
   Nutri&Live — a renovação do Pix, de ponta a ponta

   Pix no Mercado Pago é cobrança avulsa: não existe recorrência para o
   provedor cobrar sozinho. Quem assina por Pix só continua pagando porque
   `billing/renovacao.ts` emite a cobrança e avisa. Se este caminho quebrar
   em silêncio, a receita de todo assinante de Pix para — e ninguém vê.

   O que mais importa aqui não é "emitiu": é NÃO EMITIR DUAS VEZES. Duas
   cobranças válidas do mesmo mês na caixa de entrada e a pessoa paga as
   duas.
   ========================================================================= */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import { db, schema, reiniciarBanco } from "../server/db/index.js";
import {
  assinaturasAVencer, cobrancaEmAberto, renovarAssinatura, rodarRenovacoes,
  DIAS_DE_ANTECEDENCIA
} from "../server/billing/renovacao.js";
import { aplicarPagamentoAprovado } from "../server/billing/acesso.js";
/* A renovação manda e-mail por `lib/email.ts`, que tem a própria caixa de
   saída — `billing/email.ts` tem outra, da cobrança. Ler a errada daria
   "nenhum e-mail" com o e-mail enviado. */
import { caixaDeSaida, limparCaixaDeSaida } from "../server/lib/email.js";

const DIA = 86_400_000;

/** Uma assinatura de Pix que vence daqui a `dias`. */
async function assinante(dias: number, email = "pix@exemplo.com.br") {
  const usuario = await db.inserir(schema.users, {
    email, name: "Fulana de Tal", passwordHash: "x", role: "pessoal", status: "ativo",
    cpf: "11144477735", phone: "11999998888"
  });
  const assinatura = await db.inserir(schema.subscriptions, {
    userId: usuario.id, planKey: "plus", status: "ativa", method: "pix",
    provider: "simulado", priceCents: 3990,
    currentPeriodEnd: new Date(Date.now() + dias * DIA)
  });
  return { usuario, assinatura };
}

beforeEach(async () => {
  await reiniciarBanco({ semear: false });
  limparCaixaDeSaida();
});

test("só entra na varredura quem vence dentro da janela", async () => {
  const perto = await assinante(3, "perto@exemplo.com.br");
  await assinante(40, "longe@exemplo.com.br");

  const alvos = await assinaturasAVencer(DIAS_DE_ANTECEDENCIA);
  assert.equal(alvos.length, 1);
  assert.equal(alvos[0]!.id, perto.assinatura.id);
});

test("cartão não entra: o provedor cobra sozinho", async () => {
  const { usuario } = await assinante(2, "cartao@exemplo.com.br");
  await db.inserir(schema.subscriptions, {
    userId: usuario.id, planKey: "plus", status: "ativa", method: "credito",
    provider: "simulado", priceCents: 3990, currentPeriodEnd: new Date(Date.now() + 2 * DIA)
  });
  const alvos = await assinaturasAVencer();
  assert.ok(alvos.every((a) => a.method === "pix"), "entrou assinatura de cartão na varredura");
});

test("quem cancelou não recebe cobrança", async () => {
  const { assinatura } = await assinante(2, "saiu@exemplo.com.br");
  await db.atualizar(schema.subscriptions, { id: assinatura.id }, { status: "cancelada" });
  const alvos = await assinaturasAVencer();
  assert.equal(alvos.length, 0);
});

test("emite a cobrança com QR de verdade e avisa por e-mail", async () => {
  const { assinatura } = await assinante(4);
  const r = await renovarAssinatura(assinatura);

  assert.equal(r.desfecho, "emitida");
  const pagamento = await db.primeiro(schema.payments, { id: r.pagamentoId! });
  assert.ok(pagamento, "o pagamento não foi gravado");
  assert.equal(pagamento.status, "pendente");
  assert.equal(pagamento.amountCents, 3990);
  assert.equal(pagamento.subscriptionId, assinatura.id);
  assert.ok(pagamento.pixQr && pagamento.pixQr.length > 50, "sem BR Code");
  /* BR Code do Pix começa com o payload format indicator. */
  assert.ok(pagamento.pixQr.startsWith("000201"), "o BR Code não tem cara de BR Code");

  const enviados = caixaDeSaida;
  assert.equal(enviados.length, 1);
  assert.match(enviados[0]!.assunto, /Pix/i);
  assert.match(enviados[0]!.texto, /\/renovar/);
});

test("NÃO emite segunda cobrança enquanto a primeira está aberta", async () => {
  const { assinatura } = await assinante(4);
  const primeira = await renovarAssinatura(assinatura);
  limparCaixaDeSaida();

  const segunda = await renovarAssinatura(assinatura);
  assert.equal(segunda.desfecho, "ja_aberta");
  assert.equal(segunda.pagamentoId, primeira.pagamentoId);

  const todos = await db.buscar(schema.payments, { subscriptionId: assinatura.id });
  assert.equal(todos.length, 1, "emitiu duas cobranças para o mesmo mês");
  assert.equal(caixaDeSaida.length, 0, "mandou e-mail fora dos dias de lembrete");
});

test("no dia do lembrete avisa de novo, sem gerar outra cobrança", async () => {
  const { assinatura } = await assinante(3);          /* D-3 é dia de lembrete */
  const primeira = await renovarAssinatura(assinatura, new Date(Date.now() + 1 * DIA));
  assert.equal(primeira.desfecho, "emitida");
  limparCaixaDeSaida();

  /* Agora de verdade: faltam 3 dias. */
  const lembrete = await renovarAssinatura(assinatura);
  assert.equal(lembrete.desfecho, "lembrete");
  assert.equal(lembrete.pagamentoId, primeira.pagamentoId, "o lembrete apontou para outra cobrança");

  const todos = await db.buscar(schema.payments, { subscriptionId: assinatura.id });
  assert.equal(todos.length, 1, "o lembrete gerou cobrança nova");
  assert.equal(caixaDeSaida.length, 1);
});

test("pagar a renovação estende o período a partir do fim do anterior", async () => {
  const { assinatura } = await assinante(4);
  const fimAntigo = assinatura.currentPeriodEnd!;
  const r = await renovarAssinatura(assinatura);
  const pagamento = (await db.primeiro(schema.payments, { id: r.pagamentoId! }))!;

  await aplicarPagamentoAprovado(pagamento.id, { renovacao: true });

  const depois = (await db.primeiro(schema.subscriptions, { id: assinatura.id }))!;
  assert.equal(depois.status, "ativa");
  assert.ok(
    depois.currentPeriodEnd!.getTime() > fimAntigo.getTime(),
    "o período não foi estendido"
  );
  /* Renovar não encurta o que já foi pago: o novo fim conta a partir do
     antigo, não de hoje. */
  const umMesDepoisDoAntigo = fimAntigo.getTime() + 27 * DIA;
  assert.ok(
    depois.currentPeriodEnd!.getTime() >= umMesDepoisDoAntigo,
    `o novo período (${depois.currentPeriodEnd!.toISOString()}) encurtou o que já estava pago`
  );
});

test("depois de pago, a cobrança sai de aberto e a próxima pode ser emitida", async () => {
  const { assinatura } = await assinante(4);
  const r = await renovarAssinatura(assinatura);
  const pagamento = (await db.primeiro(schema.payments, { id: r.pagamentoId! }))!;
  await aplicarPagamentoAprovado(pagamento.id, { renovacao: true });

  assert.equal(await cobrancaEmAberto(assinatura.id), null, "paga e ainda consta em aberto");
});

test("quem já venceu continua recebendo: a folga do guarda é de sete dias", async () => {
  const { assinatura } = await assinante(-2, "vencido@exemplo.com.br");
  const resumo = await rodarRenovacoes();
  assert.equal(resumo.olhadas, 1, "quem venceu ficou de fora da varredura");
  assert.equal(resumo.emitidas, 1);
  const todos = await db.buscar(schema.payments, { subscriptionId: assinatura.id });
  assert.equal(todos.length, 1);
});

test("a varredura inteira é idempotente no mesmo dia", async () => {
  await assinante(4, "a@exemplo.com.br");
  await assinante(2, "b@exemplo.com.br");

  const primeira = await rodarRenovacoes();
  assert.equal(primeira.emitidas, 2);

  const segunda = await rodarRenovacoes();
  assert.equal(segunda.emitidas, 0, "a segunda varredura cobrou de novo");
  assert.equal(segunda.jaAbertas, 2);

  const todos = await db.buscar(schema.payments);
  assert.equal(todos.length, 2, "mais cobranças do que assinantes");
});

test("cobrança vencida não trava a próxima", async () => {
  const { assinatura } = await assinante(4);
  const r = await renovarAssinatura(assinatura);
  await db.atualizar(schema.payments, { id: r.pagamentoId! },
    { pixExpiresAt: new Date(Date.now() - DIA) });

  assert.equal(await cobrancaEmAberto(assinatura.id), null, "Pix vencido ainda conta como aberto");
  const nova = await renovarAssinatura(assinatura);
  assert.equal(nova.desfecho, "emitida");
});

test("parceria de preço zero NUNCA é cobrada", async () => {
  /* O registro de parceria da academia é `pix`, está `ativa` e tem data de
     fim — tudo que a varredura procura. Mas a academia não paga nada: ela
     ganha comissão por aluno. Um Pix de R$ 0,00 para o parceiro é uma
     cobrança que não existe. */
  const org = await db.inserir(schema.organizations, {
    type: "academia", name: "Academia Teste", slug: "academia-teste", seatLimit: 2000
  });
  const gestor = await db.inserir(schema.users, {
    email: "gestor@exemplo.com.br", name: "Gestor", passwordHash: "x",
    role: "academia", status: "ativo", orgId: org.id
  });
  await db.inserir(schema.subscriptions, {
    userId: gestor.id, orgId: org.id, planKey: "parceria", status: "ativa", method: "pix",
    provider: "parceria", priceCents: 0, currentPeriodEnd: new Date(Date.now() + 2 * DIA)
  });

  const alvos = await assinaturasAVencer();
  assert.equal(alvos.length, 0, "a parceria entrou na varredura de cobrança");

  const resumo = await rodarRenovacoes();
  assert.equal(resumo.emitidas, 0);
  assert.equal((await db.buscar(schema.payments)).length, 0, "emitiu cobrança de R$ 0,00");
});

test("assinatura sem data de fim não é cobrada: não há o que renovar", async () => {
  const { usuario } = await assinante(5, "semfim@exemplo.com.br");
  await db.inserir(schema.subscriptions, {
    userId: usuario.id, planKey: "plus", status: "ativa", method: "pix",
    provider: "simulado", priceCents: 3990, currentPeriodEnd: null
  });
  const alvos = await assinaturasAVencer();
  assert.ok(alvos.every((a) => a.currentPeriodEnd !== null), "entrou assinatura sem período");
});
