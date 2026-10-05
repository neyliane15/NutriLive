import { db, schema } from "../server/db/index.js";
import { aplicarPagamentoAprovado } from "../server/billing/acesso.js";
import { competencia } from "../server/billing/nucleo.js";
await new Promise(r => setTimeout(r, 4000));

const org = await db.primeiro(schema.organizations, { slug: "corpo-e-movimento" });
const antes = await db.buscar(schema.commissions, { orgId: org!.id });
const soma = (l:any[]) => l.reduce((t,c)=>t+c.amountCents,0);
console.log("comissoes antes:", antes.length, "soma", soma(antes));

const aluno = await db.primeiro(schema.users, { email: "bruno.carvalho@exemplo.com.br" });
const ass = await db.primeiro(schema.subscriptions, { userId: aluno!.id });
const pags = await db.buscar(schema.payments, { subscriptionId: ass!.id, status: "aprovado" });
console.log("reprocessando", pags.length, "pagamentos aprovados do seed (webhook reentregue / consulta de status)");
for (const p of pags) await aplicarPagamentoAprovado(p.id);

const depois = await db.buscar(schema.commissions, { orgId: org!.id });
console.log("comissoes depois:", depois.length, "soma", soma(depois));
console.log("periodo atual:", competencia());
const doMes = depois.filter(c=>c.period===competencia());
console.log("linhas na competencia corrente:", doMes.length, "soma", soma(doMes));
process.exit(0);
