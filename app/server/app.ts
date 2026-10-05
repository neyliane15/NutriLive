/* =========================================================================
   Nutri&Live — o app

   Monta as rotas e nada mais: não abre porta, não lê argumento de linha de
   comando, não decide ambiente. Quem escuta é `index.ts` (servidor comum) ou
   `api/index.ts` na raiz do repositório (função da Vercel).

   A separação existe porque em plataforma sem estado NÃO HÁ porta para
   abrir: a plataforma entrega a requisição pronta e espera a resposta.
   Enquanto este arquivo chamava `serve()`, importá-lo lá dentro subia um
   servidor que ninguém ia usar e segurava o processo.
   ========================================================================= */
import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { log } from "./lib/log.js";
import { errorHandler, notFound } from "./lib/http.js";
import { CABECALHOS, ehEstatico } from "./lib/seguranca.js";

import authRoutes from "./routes/auth.js";
import meRoutes from "./routes/me.js";
import orgRoutes from "./routes/org.js";
import aiRoutes from "./routes/ai.js";
import checkoutRoutes from "./routes/checkout.js";
import webhookRoutes from "./routes/webhooks.js";
import subscriptionRoutes from "./routes/subscription.js";
import adminRoutes from "./routes/admin.js";
import cronRoutes from "./routes/cron.js";
import pageRoutes from "./routes/pages.js";

const app = new Hono();

app.onError(errorHandler);
app.notFound(notFound);

/* Cabeçalhos de segurança em TODA resposta, inclusive 404 e erro.

   Ficam aqui, e não só no `vercel.json`, por dois motivos: o `vercel.json`
   não vale em desenvolvimento nem em outro host, e um cabeçalho que só
   existe em produção é um cabeçalho que ninguém testa. Em produção os dois
   emitem a mesma política — test/seguranca.test.ts garante. */
app.use("*", async (c, next) => {
  await next();
  for (const [nome, valor] of Object.entries(CABECALHOS)) {
    if (!c.res.headers.has(nome)) c.res.headers.set(nome, valor);
  }
  /* Tela e API não vão para cache: depois do logout, o botão "voltar" não
     pode remontar o prontuário que estava aberto. Arquivo estático vai. */
  if (!ehEstatico(c.req.path) && !c.res.headers.has("Cache-Control")) {
    c.res.headers.set("Cache-Control", "no-store, private");
  }
});

/* Arquivos da landing e do app saem do mesmo lugar: o CSS é compartilhado.

   Em produção na Vercel estes dois caminhos NÃO chegam aqui: a plataforma
   serve o arquivo do disco antes de invocar a função, o que é mais rápido,
   fica em cache e não gasta execução. Isto aqui é o servidor comum —
   desenvolvimento, Docker, uma máquina qualquer. */
if (!process.env.VERCEL) {
  app.use("/assets/*", serveStatic({ root: "../" }));
  app.use("/app-assets/*", serveStatic({ root: "./web/", rewriteRequestPath: (p) => p.replace(/^\/app-assets/, "") }));
}

/* ------------------------------- API ------------------------------------ */
app.route("/api/auth", authRoutes);
app.route("/api/me", meRoutes);
app.route("/api/org", orgRoutes);
app.route("/api/ai", aiRoutes);
app.route("/api", checkoutRoutes);          // /api/plans, /api/checkout
app.route("/api/webhooks", webhookRoutes);
app.route("/api/subscription", subscriptionRoutes);
app.route("/api/admin", adminRoutes);
app.route("/api/cron", cronRoutes);

/* Health check é rota pública: diz que está de pé e nada mais.

   Antes devolvia `driver: "memory" | "postgres"`, o que entrega a um
   visitante qualquer se o ambiente está rodando no banco em memória — isto
   é, com os dados de demonstração e sem persistência. Quem precisa dessa
   informação tem o log da subida. */
app.get("/api/health", (c) => c.json({ ok: true, at: new Date().toISOString() }));

/* ----------------------------- páginas ---------------------------------- */
app.route("/", pageRoutes);

/* A conferência de produção NÃO roda aqui.

   Ela mora em quem entra: `index.ts` (servidor comum) derruba o processo, e
   `api/index.ts` (Vercel) responde 503 com o motivo. Aqui dentro ela era um
   `process.exit` no meio do import — numa função sem estado isso mata a
   instância inteira sem dizer por quê, e num teste mata o teste. */

export default app;
