import { db, schema } from "../server/db/index.js";
import { contratar, situacaoDoPagamento } from "../server/billing/assinatura.js";
import { receberWebhook } from "../server/billing/webhook.js";
import { eventoSimulado } from "../server/billing/simulado.js";
import { aplicarEstorno } from "../server/billing/webhook.js";

process.env.PIX_SIM_CONFIRMA_MS = "100000";
await new Promise(r => setTimeout(r, 4000));   // espera a semente

const out = await contratar({
  segment: "pessoal", planKey: "plus", method: "pix", coupon: "corpo-e-movimento",
  customer: { name: "Aluno Indicado Teste", email: "indicado@exemplo.com.br", cpf: "11122233344", phone: "11988887777" },
  acceptedTerms: true
}, "1.2.3.4");
const pag = await db.primeiro(schema.payments, { id: out.pix!.paymentId });
const prov = pag!.providerPaymentId!;
const ass0 = await db.primeiro(schema.subscriptions, { id: pag!.subscriptionId! });
console.log("assinatura.orgId (indicacao):", ass0!.orgId, "cupom:", ass0!.couponCode, "preco:", ass0!.priceCents);

console.log("wh1:", (await receberWebhook(eventoSimulado("payment.approved", prov, "ev-1"))).repetido);
console.log("wh1 repetido:", (await receberWebhook(eventoSimulado("payment.approved", prov, "ev-1"))).repetido);
console.log("wh novo id, mesmo pagamento:", (await receberWebhook(eventoSimulado("payment.approved", prov, "ev-2"))).repetido);
let com = await db.buscar(schema.commissions, { paymentId: pag!.id });
console.log("comissoes:", com.length, com.map(c=>[c.baseCents,c.rateBp,c.amountCents,c.status,c.period]));

// --- estorno: derruba comissao prevista?
await aplicarEstorno(pag!.id, "teste");
com = await db.buscar(schema.commissions, { paymentId: pag!.id });
console.log("comissoes depois do estorno:", com.length);
const ass = await db.primeiro(schema.subscriptions, { id: pag!.subscriptionId! });
console.log("assinatura depois do estorno:", ass!.status, ass!.currentPeriodEnd);

// --- comissao PAGA sobrevive ao estorno?
const alunoPago = await db.primeiro(schema.users, { email: "bruno.carvalho@exemplo.com.br" });
const assBruno = await db.primeiro(schema.subscriptions, { userId: alunoPago!.id });
const pagsBruno = await db.buscar(schema.payments, { subscriptionId: assBruno!.id });
console.log("pagamentos de bruno:", pagsBruno.map(p=>[p.id.slice(0,8),p.status,p.amountCents]));
const comBruno = await db.buscar(schema.commissions, { subscriptionId: assBruno!.id });
console.log("comissoes de bruno (seed):", comBruno.map(c=>[c.status,c.paymentId,c.amountCents]));
process.exit(0);
