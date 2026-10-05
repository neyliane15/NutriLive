-- =========================================================================
-- Nutri&Live — esquema completo do banco, para colar no SQL Editor do Supabase.
--
-- GERADO por `npm run db:sql-unico`. Não edite à mão: a próxima geração apaga.
--
-- Equivale a rodar `npm run db:migrate`, inclusive no registro de controle do
-- Drizzle no fim — é ele que faz uma migração futura começar da 0002 em vez de
-- tentar recriar as tabelas.
--
-- Como usar: Supabase › SQL Editor › New query › colar tudo › Run.
-- Depois confira com `npm run db:conferir`, ou pelo aviso de RLS do painel.
--
-- Rodar duas vezes: a segunda para no primeiro CREATE TYPE com
-- "type already exists" e o BEGIN/COMMIT desfaz tudo — nada muda, nada
-- duplica. Testado. Se já rodou uma vez, não precisa rodar de novo.
--
-- Migrações incluídas: 0000_minor_nebula, 0001_supabase_rls
-- =========================================================================

BEGIN;

-- ----------------------------------------------------------------------
-- 0000_minor_nebula
-- ----------------------------------------------------------------------
CREATE TYPE "public"."ai_kind" AS ENUM('plano', 'receita', 'lista_compras', 'analise');--> statement-breakpoint
CREATE TYPE "public"."ai_status" AS ENUM('fila', 'processando', 'concluido', 'erro');--> statement-breakpoint
CREATE TYPE "public"."commission_status" AS ENUM('prevista', 'apurada', 'paga');--> statement-breakpoint
CREATE TYPE "public"."link_status" AS ENUM('pendente', 'ativo', 'encerrado');--> statement-breakpoint
CREATE TYPE "public"."meal_kind" AS ENUM('cafe', 'lanche_manha', 'almoco', 'lanche_tarde', 'jantar', 'ceia');--> statement-breakpoint
CREATE TYPE "public"."org_type" AS ENUM('nutricionista', 'academia');--> statement-breakpoint
CREATE TYPE "public"."pay_method" AS ENUM('credito', 'debito', 'pix');--> statement-breakpoint
CREATE TYPE "public"."pay_status" AS ENUM('pendente', 'aprovado', 'recusado', 'estornado', 'cancelado');--> statement-breakpoint
CREATE TYPE "public"."plan_source" AS ENUM('ia', 'nutricionista');--> statement-breakpoint
CREATE TYPE "public"."plan_status" AS ENUM('rascunho', 'enviado', 'ativo', 'arquivado');--> statement-breakpoint
CREATE TYPE "public"."sub_status" AS ENUM('pendente', 'ativa', 'atrasada', 'cancelada', 'expirada');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'pessoal', 'nutricionista', 'academia', 'paciente', 'aluno');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('convidado', 'ativo', 'suspenso');--> statement-breakpoint
CREATE TABLE "ai_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"requested_by_user_id" uuid,
	"kind" "ai_kind" NOT NULL,
	"status" "ai_status" DEFAULT 'fila' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"n8n_execution_id" varchar(64),
	"error" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_user_id" uuid,
	"action" varchar(64) NOT NULL,
	"entity" varchar(48) NOT NULL,
	"entity_id" varchar(64),
	"meta" jsonb,
	"ip" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auth_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" varchar(32) NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "care_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"professional_user_id" uuid NOT NULL,
	"member_user_id" uuid NOT NULL,
	"status" "link_status" DEFAULT 'pendente' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"next_return_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "clinical_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"care_link_id" uuid NOT NULL,
	"author_user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"subscription_id" uuid,
	"payment_id" uuid,
	"period" varchar(7) NOT NULL,
	"base_cents" integer NOT NULL,
	"rate_bp" integer NOT NULL,
	"amount_cents" integer NOT NULL,
	"status" "commission_status" DEFAULT 'prevista' NOT NULL,
	"paid_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "food_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"meal" "meal_kind" NOT NULL,
	"description" text NOT NULL,
	"kcal" integer DEFAULT 0 NOT NULL,
	"protein_g" integer DEFAULT 0 NOT NULL,
	"carb_g" integer DEFAULT 0 NOT NULL,
	"fat_g" integer DEFAULT 0 NOT NULL,
	"from_plan_id" uuid
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" uuid NOT NULL,
	"invited_by_user_id" uuid NOT NULL,
	"email" varchar(320) NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"role" "user_role" NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"title" text NOT NULL,
	"days" integer DEFAULT 1 NOT NULL,
	"kcal_target" integer,
	"macros" jsonb,
	"content" jsonb NOT NULL,
	"source" "plan_source" DEFAULT 'ia' NOT NULL,
	"status" "plan_status" DEFAULT 'rascunho' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"taken_at" timestamp with time zone DEFAULT now() NOT NULL,
	"weight_g" integer,
	"waist_mm" integer,
	"hip_mm" integer,
	"arm_mm" integer,
	"body_fat_bp" integer,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" "org_type" NOT NULL,
	"name" text NOT NULL,
	"slug" varchar(64) NOT NULL,
	"owner_user_id" uuid,
	"seat_limit" integer DEFAULT 15 NOT NULL,
	"city_state" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subscription_id" uuid,
	"user_id" uuid NOT NULL,
	"provider" varchar(24) DEFAULT 'mercadopago' NOT NULL,
	"provider_payment_id" varchar(128),
	"amount_cents" integer NOT NULL,
	"method" "pay_method" NOT NULL,
	"status" "pay_status" DEFAULT 'pendente' NOT NULL,
	"brand" varchar(24),
	"last4" varchar(4),
	"pix_qr" text,
	"pix_expires_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"failure_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"key" varchar(32) PRIMARY KEY NOT NULL,
	"segment" varchar(16) NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_cents" integer NOT NULL,
	"seat_limit" integer DEFAULT 0 NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"birth_date" date,
	"sex" varchar(16),
	"height_cm" integer,
	"goal" varchar(32),
	"activity_level" varchar(24),
	"diet_style" varchar(32),
	"restrictions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"dislikes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"kcal_target" integer,
	"protein_target_g" integer,
	"water_target_ml" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"title" text NOT NULL,
	"time_min" integer,
	"kcal" integer,
	"macros" jsonb,
	"ingredients" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"match_pct" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip" varchar(45),
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"org_id" uuid,
	"plan_key" varchar(32) NOT NULL,
	"status" "sub_status" DEFAULT 'pendente' NOT NULL,
	"method" "pay_method" NOT NULL,
	"provider" varchar(24) DEFAULT 'mercadopago' NOT NULL,
	"provider_sub_id" varchar(128),
	"price_cents" integer NOT NULL,
	"coupon_code" varchar(32),
	"current_period_end" timestamp with time zone,
	"canceled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(320) NOT NULL,
	"password_hash" text,
	"name" text NOT NULL,
	"cpf" varchar(11),
	"phone" varchar(11),
	"role" "user_role" DEFAULT 'pessoal' NOT NULL,
	"status" "user_status" DEFAULT 'convidado' NOT NULL,
	"org_id" uuid,
	"crn" varchar(24),
	"email_verified_at" timestamp with time zone,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "water_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ml" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" varchar(24) NOT NULL,
	"provider_event_id" varchar(128) NOT NULL,
	"type" varchar(64) NOT NULL,
	"payload" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_professional_user_id_users_id_fk" FOREIGN KEY ("professional_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "care_links" ADD CONSTRAINT "care_links_member_user_id_users_id_fk" FOREIGN KEY ("member_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_care_link_id_care_links_id_fk" FOREIGN KEY ("care_link_id") REFERENCES "public"."care_links"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_logs" ADD CONSTRAINT "food_logs_from_plan_id_meal_plans_id_fk" FOREIGN KEY ("from_plan_id") REFERENCES "public"."meal_plans"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_users_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plans" ADD CONSTRAINT "meal_plans_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_key_plans_key_fk" FOREIGN KEY ("plan_key") REFERENCES "public"."plans"("key") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_organizations_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_logs" ADD CONSTRAINT "water_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_jobs_user_idx" ON "ai_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ai_jobs_status_idx" ON "ai_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "audit_log" USING btree ("actor_user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_tokens_token_idx" ON "auth_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "auth_tokens_user_purpose_idx" ON "auth_tokens" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "care_links_pair_idx" ON "care_links" USING btree ("professional_user_id","member_user_id");--> statement-breakpoint
CREATE INDEX "care_links_org_idx" ON "care_links" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "clinical_notes_link_idx" ON "clinical_notes" USING btree ("care_link_id","created_at");--> statement-breakpoint
CREATE INDEX "commissions_org_period_idx" ON "commissions" USING btree ("org_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "commissions_payment_idx" ON "commissions" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "food_logs_user_idx" ON "food_logs" USING btree ("user_id","logged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitations_token_idx" ON "invitations" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invitations_org_email_idx" ON "invitations" USING btree ("org_id","email");--> statement-breakpoint
CREATE INDEX "meal_plans_user_idx" ON "meal_plans" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "measurements_user_idx" ON "measurements" USING btree ("user_id","taken_at");--> statement-breakpoint
CREATE UNIQUE INDEX "organizations_slug_idx" ON "organizations" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_provider_idx" ON "payments" USING btree ("provider_payment_id");--> statement-breakpoint
CREATE INDEX "payments_user_idx" ON "payments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "recipes_user_idx" ON "recipes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_token_idx" ON "sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shopping_lists_user_week_idx" ON "shopping_lists" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "subscriptions_user_idx" ON "subscriptions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscriptions_provider_idx" ON "subscriptions" USING btree ("provider_sub_id");--> statement-breakpoint
CREATE INDEX "subscriptions_status_idx" ON "subscriptions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "users_org_idx" ON "users" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "users_role_idx" ON "users" USING btree ("role");--> statement-breakpoint
CREATE INDEX "water_logs_user_idx" ON "water_logs" USING btree ("user_id","logged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_event_idx" ON "webhook_events" USING btree ("provider","provider_event_id");

-- ----------------------------------------------------------------------
-- 0001_supabase_rls
-- ----------------------------------------------------------------------
-- =============================================================================
-- Nutri&Live — fechar a porta que o Supabase abre sozinho
--
-- O Supabase publica o schema `public` numa API REST automática (PostgREST),
-- alcançável com a chave ANÔNIMA — que é pública por desenho: ela vai no
-- JavaScript do navegador. O que decide o que essa chave pode fazer NÃO é a
-- chave, é o Row Level Security da tabela.
--
-- Sem isto, qualquer pessoa com o endereço do projeto e a chave anônima lê
-- `users` (com `password_hash`), `sessions` (com o token da sessão),
-- `clinical_notes` (prontuário) e `payments` — e escreve neles.
--
-- A correção é ligar RLS em todas as tabelas e NÃO criar política nenhuma:
-- sem política, `anon` e `authenticated` não enxergam linha alguma. O nosso
-- servidor não usa a API REST: ele conecta direto no Postgres com o papel
-- dono das tabelas, que ignora RLS. Então o app continua igual e a porta
-- fecha.
--
-- O FORCE é o cinto de segurança: sem ele, o dono da tabela ficaria isento
-- mesmo que alguém criasse uma política errada depois. Como o nosso servidor
-- usa o papel `postgres` (superusuário), ele passa de todo jeito — o FORCE
-- vale contra um papel dono que não seja superusuário.
--
-- Também revogamos os privilégios de tabela de `anon` e `authenticated`: RLS
-- sozinho já bastaria, mas duas trancas custam uma linha cada.
-- =============================================================================

ALTER TABLE "public"."ai_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."ai_jobs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."audit_log" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."auth_tokens" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."auth_tokens" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."care_links" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."care_links" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."clinical_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clinical_notes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."commissions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."commissions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."food_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."food_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."invitations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."invitations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."meal_plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."meal_plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."measurements" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."measurements" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."organizations" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."payments" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."plans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."plans" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."profiles" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recipes" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sessions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."shopping_lists" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."shopping_lists" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."subscriptions" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."users" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."water_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."water_logs" FORCE ROW LEVEL SECURITY;
ALTER TABLE "public"."webhook_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."webhook_events" FORCE ROW LEVEL SECURITY;

-- Nenhuma política é criada DE PROPÓSITO. Sem política, ninguém que passe
-- pela API REST enxerga nada. Se um dia o front falar direto com o Supabase,
-- cada tabela precisará da sua política escrita à mão, com cuidado.

-- A revogação é condicional porque `anon` e `authenticated` são papéis do
-- Supabase: em Postgres comum (local, Neon, um contêiner) eles não existem e
-- o REVOKE derrubaria a migração inteira. O RLS acima, esse vale em qualquer
-- Postgres.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM anon;
    RAISE NOTICE 'privilégios revogados de anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA "public" FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA "public" FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA "public" FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM authenticated;
    RAISE NOTICE 'privilégios revogados de authenticated';
  END IF;
END $$;

-- ----------------------------------------------------------------------
-- Registro de controle do Drizzle
--
-- O hash é o sha256 do arquivo .sql; o created_at é o campo "when" do
-- journal. É assim que o Drizzle grava — conferido contra um Postgres 16,
-- comparando este arquivo com o que `npm run db:migrate` produz: mesmo
-- schema, linha por linha, e um db:migrate depois disto não refaz nada.
-- O WHERE NOT EXISTS evita registro duplicado se alguém inserir à mão.
-- ----------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
SELECT 'f711347dea23808642ead973695ac2a50ac764cafeff25d5cc85ef1354b058bb', 1791221397531
WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = 'f711347dea23808642ead973695ac2a50ac764cafeff25d5cc85ef1354b058bb');  -- 0000_minor_nebula

INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at)
SELECT '34cbb46a766179da8dbf2e43d1623ff8cbc333fdf4cd8254135a1f72b17d46eb', 1791221398531
WHERE NOT EXISTS (SELECT 1 FROM "drizzle"."__drizzle_migrations" WHERE hash = '34cbb46a766179da8dbf2e43d1623ff8cbc333fdf4cd8254135a1f72b17d46eb');  -- 0001_supabase_rls

COMMIT;
