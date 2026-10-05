CREATE TABLE "rate_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" varchar(400) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_limits_bucket_idx" ON "rate_limits" USING btree ("bucket","created_at");
--> statement-breakpoint
-- A tabela nasce FECHADA, igual às 21 da migração 0001.
--
-- No Supabase, toda tabela do schema "public" é publicada numa API REST
-- alcançável com a chave anônima. Sem RLS, esta tabela em particular deixa
-- qualquer pessoa APAGAR as linhas de tentativa — isto é, zerar o limite de
-- força bruta e voltar a ter tentativas infinitas de senha. Ligar RLS sem
-- criar política nenhuma é o que fecha: `anon` não vê nem escreve linha
-- alguma, e o servidor conecta direto no Postgres, com BYPASSRLS.
ALTER TABLE "public"."rate_limits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "public"."rate_limits" FORCE ROW LEVEL SECURITY;
