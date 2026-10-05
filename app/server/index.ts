/* =========================================================================
   Nutri&Live — servidor comum

   Abre a porta e serve o app de `app.ts`. É o que roda em desenvolvimento,
   em contêiner e em qualquer máquina com processo de pé.

   Na Vercel quem entra é `api/index.ts`, na raiz do repositório: lá não há
   porta para abrir, e por isso o app mora em arquivo separado.
   ========================================================================= */
import { serve } from "@hono/node-server";
import app from "./app.js";
import { avisosDeProducao, conferirAmbienteDeProducao, env } from "./lib/env.js";
import { log } from "./lib/log.js";

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

for (const aviso of avisosDeProducao()) log.warn(aviso);

const port = Number(env.PORT || 8787);
if (env.NODE_ENV !== "test") {
  serve({ fetch: app.fetch, port }, (info) => {
    log.info(`Nutri&Live no ar em http://localhost:${info.port} · banco: ${env.DB_DRIVER}`);
  });
}

export default app;
