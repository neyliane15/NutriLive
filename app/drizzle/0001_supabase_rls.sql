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
