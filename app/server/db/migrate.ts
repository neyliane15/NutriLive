/* =========================================================================
   Nutri&Live — migração

   Em Postgres aplica as migrações SQL geradas pelo drizzle-kit (pasta
   `app/drizzle`, criada por `npm run db:generate`).

   Em modo memória não há o que migrar: o esquema é o próprio `schema.ts`,
   lido em tempo de execução pelo motor de memória. O comando então só
   avisa e sai com sucesso, para o mesmo `npm run db:migrate` servir nos
   dois ambientes (útil em script de implantação).
   ========================================================================= */
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";

const PASTA = resolve(process.cwd(), "drizzle");

export async function migrar(): Promise<void> {
  if (env.DB_DRIVER === "memory") {
    log.info("migração: DATABASE_URL não definida — o sistema roda em memória, nada a migrar.");
    log.info("migração: para usar Postgres, preencha DATABASE_URL no .env e rode de novo.");
    return;
  }

  if (!existsSync(PASTA) || !readdirSync(PASTA).some((f) => f.endsWith(".sql"))) {
    log.error(`migração: nenhuma migração encontrada em ${PASTA}.`);
    log.error("migração: rode `npm run db:generate` (precisa de app/drizzle.config.ts) e tente outra vez.");
    process.exitCode = 1;
    return;
  }

  const { drizzle } = await import("drizzle-orm/postgres-js");
  const { migrate } = await import("drizzle-orm/postgres-js/migrator");
  const postgres = (await import("postgres")).default;

  /* Conexão própria, com uma única ligação: migração não divide pool.

     `onnotice` não é detalhe: a migração 0001 usa RAISE NOTICE para dizer que
     revogou os privilégios de anon, e o driver, sem isto, despeja o aviso como
     um objeto com severity/file/line/routine — idêntico a um erro. Quem está
     subindo o sistema lê aquilo e conclui que quebrou, justamente no passo que
     fecha o banco. */
  const sql = postgres(env.DATABASE_URL, {
    max: 1,
    onnotice: (aviso: { message?: string }) => {
      if (aviso.message) log.info(`migração: ${aviso.message}`);
    },
    ...(env.DATABASE_URL.includes("supabase.") ? { ssl: "require" as const } : {})
  });
  try {
    log.info(`migração: aplicando ${PASTA}`);
    await migrate(drizzle(sql), { migrationsFolder: PASTA });
    log.info("migração: concluída.");
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const executadoDireto = process.argv[1]?.replace(/\\/g, "/").endsWith("db/migrate.ts");
if (executadoDireto) await migrar();
