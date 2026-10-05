/* =========================================================================
   Nutri&Live — entrada da Vercel

   A Vercel não dá porta: ela entrega uma requisição pronta e espera a
   resposta. Então aqui não há `serve()` — só o app de `app/server/app.ts`
   ligado ao formato que a plataforma usa.

   O que a Vercel serve SEM passar por aqui (regras em `vercel.json`):
   a landing inteira, `/assets/*` e `/app-assets/*`. Arquivo estático servido
   do disco é mais rápido, fica em cache e não gasta execução de função.

   Tudo o mais — `/api/*` e as telas do app — cai nesta função.
   ========================================================================= */
import app from "../app/server/app.js";
import { conferirAmbienteDeProducao } from "../app/server/lib/env.js";

export const config = {
  /* Node, e não Edge: o sistema usa Argon2 (binário nativo) para senha e o
     driver `postgres` para o banco. Nenhum dos dois roda no runtime Edge. */
  runtime: "nodejs",
  /* A geração local de plano alimentar leva alguns segundos quando não há
     n8n configurado. */
  maxDuration: 30
};

/* ------------------------------------------------------------------------
   A conferência de produção também vale aqui.

   No servidor comum ela roda em `index.ts` e o processo se recusa a subir.
   Numa função não existe "subir": cada requisição é um começo, e
   `process.exit` levaria junto a instância inteira sem dizer por quê. Então
   a função responde 503 com o motivo, que é o que um deploy mal configurado
   precisa mostrar — melhor que servir um site aparentemente normal em que
   ninguém consegue entrar depois de pagar.

   Calculado uma vez por instância: a configuração não muda no meio do voo.
   ------------------------------------------------------------------------ */
const faltas = conferirAmbienteDeProducao();

export default async function handler(req: Request): Promise<Response> {
  if (faltas.length) {
    return new Response(
      JSON.stringify({
        error: {
          code: "indisponivel",
          message: "Este ambiente está com a configuração incompleta e não pode atender.",
          faltas
        }
      }),
      { status: 503, headers: { "content-type": "application/json; charset=utf-8" } }
    );
  }
  return app.fetch(req);
}
