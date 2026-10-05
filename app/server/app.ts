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
import { env } from "./lib/env.js";
import { log } from "./lib/log.js";
import { errorHandler, notFound } from "./lib/http.js";

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

app.get("/api/health", (c) => c.json({ ok: true, at: new Date().toISOString(), driver: env.DB_DRIVER }));

/* ----------------------------- páginas ---------------------------------- */
app.route("/", pageRoutes);

/* A conferência de produção NÃO roda aqui.

   Ela mora em quem entra: `index.ts` (servidor comum) derruba o processo, e
   `api/index.ts` (Vercel) responde 503 com o motivo. Aqui dentro ela era um
   `process.exit` no meio do import — numa função sem estado isso mata a
   instância inteira sem dizer por quê, e num teste mata o teste. */

export default app;
