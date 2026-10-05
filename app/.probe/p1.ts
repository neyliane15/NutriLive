import { db, schema } from "../server/db/index.js";
import { contratar } from "../server/billing/assinatura.js";
import { receberWebhook, ligarWebhookSimulado } from "../server/billing/webhook.js";
import { eventoSimulado } from "../server/billing/simulado.js";
import { situacaoDoPagamento } from "../server/billing/assinatura.js";

process.env.PIX_SIM_CONFIRMA_MS = "100000"; // nao cair sozinho

const out = await contratar({
  segment: "pessoal", planKey: "plus", method: "pix",
  coupon: "corpo-e-movimento",
  customer: { name: "Aluno Indicado Teste", email: "indicado@exemplo.com.br", cpf: "11122233344", phone: "11988887777" },
  acceptedTerms: true
}, "1.2.3.4");
console.log("checkout:", out.nextStep, out.status);

const pag = await db.primeiro(schema.payments, { id: out.pix!.paymentId });
const prov = pag!.providerPaymentId!;
console.log("providerPaymentId:", prov);

const ev = eventoSimulado("payment.approved", prov, "evento-fixo-1");
console.log("webhook 1:", await receberWebhook(ev));
console.log("webhook 2 (mesmo id):", await receberWebhook(eventoSimulado("payment.approved", prov, "evento-fixo-1")));
console.log("webhook 3 (id novo, mesmo pagamento):", await receberWebhook(eventoSimulado("payment.approved", prov, "evento-fixo-2")));

const com = await db.buscar(schema.commissions, { paymentId: pag!.id });
console.log("comissoes para este pagamento:", com.length, com.map(c => [c.baseCents, c.amountCents, c.status, c.period]));
const ass = await db.primeiro(schema.subscriptions, { id: pag!.subscriptionId! });
console.log("assinatura:", ass!.status, ass!.priceCents, ass!.orgId, "periodEnd", ass!.currentPeriodEnd);
const pg = await db.primeiro(schema.payments, { id: pag!.id });
console.log("pagamento:", pg!.status, pg!.amountCents);
const u = await db.primeiro(schema.users, { email: "indicado@exemplo.com.br" });
console.log("usuario:", u!.status, u!.role, u!.orgId);
process.exit(0);
