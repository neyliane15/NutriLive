/* =========================================================================
   Nutri&Live — servidor
   Monta as rotas e nada mais. A lógica mora nos módulos.
   ========================================================================= */
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { conferirAmbienteDeProducao, env } from "./lib/env.js";
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

/* Arquivos da landing e do app saem do mesmo lugar: o CSS é compartilhado. */
app.use("/assets/*", serveStatic({ root: "../" }));
app.use("/app-assets/*", serveStatic({ root: "./web/", rewriteRequestPath: (p) => p.replace(/^\/app-assets/, "") }));

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

/* ------------------------- conferência de subida ------------------------ */
/*  Em produção, configuração pela metade não deve virar servidor no ar: o
    deploy que não sobe se corrige em minutos; o que sobe com segredo de
    exemplo ou com e-mail indo para o log só aparece quando um cliente paga
    e não consegue entrar. Em desenvolvimento isto não roda. */
const faltas = conferirAmbienteDeProducao();
if (faltas.length) {
  log.error("Configuração de produção incompleta — o servidor não vai subir:");
  for (const f of faltas) log.error(`  · ${f}`);
  process.exit(1);
}

const port = Number(env.PORT || 8787);
if (env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port }, (info) => {
    log.info(`Nutri&Live no ar em http://localhost:${info.port} · banco: ${env.DB_DRIVER}`);
  });
}

export default app;
