/* =========================================================================
   Nutri&Live — configuração do drizzle-kit

   Gera as migrações SQL a partir de `server/db/schema.ts`, que é a única
   definição do esquema no projeto. O motor de memória lê o mesmo arquivo em
   tempo de execução, então os dois ambientes nunca divergem.

   `npm run db:generate` escreve em `drizzle/`; `npm run db:migrate` aplica.
   ========================================================================= */
import type { Config } from "drizzle-kit";

export default {
  schema: "./server/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
  /* O esquema é só `public`; declarar evita o drizzle-kit propor DROP em
     tabelas de extensão (pg_stat_statements e afins) numa base gerenciada. */
  schemaFilter: ["public"],
  verbose: true,
  strict: true
} satisfies Config;
