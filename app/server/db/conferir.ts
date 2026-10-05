/* =========================================================================
   Nutri&Live — conferir o banco antes de confiar nele

   Roda depois das migrações e responde uma pergunta por vez, em português,
   com veredito no fim. Existe porque as duas coisas que mais quebram num
   banco gerenciado não dão erro: elas simplesmente não acontecem.

     - a migração 0001 não rodou, e o schema `public` do Supabase continua
       legível pela API pública com a chave anônima — hashes de senha,
       tokens de sessão e prontuários;
     - o DATABASE_URL aponta para a porta errada, e o app vai quebrar sob
       carga em vez de na subida.

   Não escreve nada. Pode rodar quantas vezes quiser.
   ========================================================================= */
import { env } from "../lib/env.js";
import { ehPooler } from "./index.js";
import { schema } from "./schema.js";
import { getTableName } from "drizzle-orm";

const VERDE = "\x1b[32m", VERMELHO = "\x1b[31m", AMARELO = "\x1b[33m", FIM = "\x1b[0m";
const ok = (t: string) => console.log(`  ${VERDE}✓${FIM} ${t}`);
const falha = (t: string) => console.log(`  ${VERMELHO}✗${FIM} ${t}`);
const aviso = (t: string) => console.log(`  ${AMARELO}!${FIM} ${t}`);

/** Tabelas que o sistema espera, lidas do próprio schema. */
const esperadas = Object.values(schema)
  .filter((t): t is any => typeof t === "object" && t !== null && Symbol.for("drizzle:Name") in t)
  .map((t) => getTableName(t))
  .sort();

/* -------------------------------------------------------------------------
   Por que isto existe: errar a URL é o jeito mais provável de esta conferência
   falhar, e o driver responde com um stack trace de Node. Quem só quer subir o
   sistema não tem como ler aquilo. Cada caso abaixo foi visto de verdade.
   ------------------------------------------------------------------------- */
/** Erros que se vêem na URL sem precisar conectar. O new URL() do Node aceita
    [YOUR-PASSWORD] sem reclamar, e aí o erro de rede que vem depois manda a
    pessoa resolver um problema que ela não tem. */
export function problemaObvioNaUrl(bruta: string): string[] | null {
  const usuario = bruta.slice(0, Math.max(0, bruta.lastIndexOf("@")));
  if (/\[|\]/.test(usuario) || /YOUR[-_]PASSWORD/i.test(bruta)) return [
    "a senha não foi preenchida na DATABASE_URL.",
    "→ O Supabase mostra [YOUR-PASSWORD] como lugar a preencher. Troque esse",
    "  trecho pela senha do banco, sem os colchetes.",
    "→ Esqueceu a senha? Project Settings › Database › Database password › Reset."
  ];
  if (!/^postgres(ql)?:\/\//.test(bruta)) return [
    "a DATABASE_URL não começa com postgresql://.",
    "→ Copie a connection string inteira em Project Settings › Database."
  ];
  return null;
}

export function explicarErroDeLigacao(erro: unknown): string[] {
  const e = erro as { code?: string; message?: string };
  const codigo = e?.code ?? "";
  const recado = e?.message ?? String(erro);

  if (codigo === "28P01") return [
    "senha recusada pelo banco.",
    "→ No Supabase: Project Settings › Database › Database password › Reset.",
    "→ Se a senha tem caractere especial (@ : / ? # & %), ela precisa ir",
    "  codificada na URL — @ vira %40, # vira %23. Ou troque por uma senha",
    "  só com letras e números, que é mais simples do que acertar isso."
  ];
  if (codigo === "3D000") return [
    "o banco pedido na URL não existe.",
    '→ No Supabase o nome é "postgres" — a URL termina em /postgres.'
  ];
  if (codigo === "ENOTFOUND" || codigo === "EAI_AGAIN") return [
    "o endereço do banco não foi encontrado.",
    "→ Copie a URL de novo em Project Settings › Database › Connection string,",
    "  aba Transaction pooler. O host dela termina em .pooler.supabase.com.",
    "→ O host db.<projeto>.supabase.co (conexão direta) só responde em IPv6 e",
    "  não funciona na Vercel nem aqui."
  ];
  if (codigo === "ECONNREFUSED" || codigo === "ETIMEDOUT" || codigo === "CONNECT_TIMEOUT") return [
    "o banco não respondeu.",
    "→ Projeto grátis do Supabase hiberna depois de uma semana sem uso.",
    "  Abra o painel do projeto, clique em Restore/Resume e rode de novo."
  ];
  return [`não foi possível conectar: ${recado}`];
}

export async function conferir(): Promise<boolean> {
  if (env.DB_DRIVER === "memory") {
    console.log("\nDATABASE_URL não está definida: o sistema roda em memória.");
    console.log("Nada a conferir. Defina DATABASE_URL e rode de novo.\n");
    return true;
  }

  const obvio = problemaObvioNaUrl(env.DATABASE_URL);
  if (obvio) {
    console.log("\nLIGAÇÃO");
    falha(obvio[0]!);
    for (const linha of obvio.slice(1)) console.log(`    ${linha}`);
    console.log(`\n${VERMELHO}O banco NÃO está pronto.${FIM}\n`);
    return false;
  }

  let endereco: URL;
  try {
    endereco = new URL(env.DATABASE_URL);
  } catch {
    console.log("\nLIGAÇÃO");
    falha("a DATABASE_URL não é um endereço válido.");
    console.log("    → Ela precisa ter senha, host, porta e /postgres.");
    console.log("      Caractere especial na senha vai codificado: @ é %40, # é %23.");
    console.log(`\n${VERMELHO}O banco NÃO está pronto.${FIM}\n`);
    return false;
  }

  const postgres = (await import("postgres")).default;
  const sql = postgres(env.DATABASE_URL, { max: 1, prepare: false, ...(env.DATABASE_URL.includes("supabase.") ? { ssl: "require" as const } : {}) });

  let tudoBem = true;
  const reprovar = (t: string) => { falha(t); tudoBem = false; };

  try {
    /* ------------------------------ ligação ----------------------------- */
    console.log("\nLIGAÇÃO");
    let versao: { v: string } | undefined;
    try {
      [versao] = await sql<{ v: string }[]>`SELECT version() AS v`;
    } catch (erro) {
      const [primeira, ...resto] = explicarErroDeLigacao(erro);
      falha(primeira!);
      for (const linha of resto) console.log(`    ${linha}`);
      console.log(`\n${VERMELHO}O banco NÃO está pronto.${FIM}\n`);
      return false;
    }
    ok(`conectado · ${versao!.v.split(",")[0]}`);

    const url = endereco;
    const supabase = url.host.includes("supabase.");
    if (supabase) {
      if (ehPooler(env.DATABASE_URL)) {
        ok(`porta ${url.port} · pooler em modo transação, prepared statements desligados (o certo para a Vercel)`);
      } else {
        aviso(
          `porta ${url.port} · modo sessão. Serve para rodar migração da sua máquina, ` +
          `mas na Vercel use a 6543: a 5432 esgota o limite de conexões.`
        );
      }
    }

    /* ------------------------------ tabelas ----------------------------- */
    console.log("\nTABELAS");
    const tabelas = await sql<{ tablename: string; rowsecurity: boolean }[]>`
      SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
    const nomes = tabelas.map((t) => t.tablename);
    const faltando = esperadas.filter((e) => !nomes.includes(e));

    if (faltando.length) {
      reprovar(`faltam ${faltando.length} tabelas: ${faltando.join(", ")}`);
      console.log(`    → rode: npm run db:migrate`);
    } else {
      ok(`as ${esperadas.length} tabelas estão lá`);
    }

    /* ------------------- a porta que o Supabase abre --------------------- */
    console.log("\nROW LEVEL SECURITY");
    const semRls = tabelas.filter((t) => !t.rowsecurity).map((t) => t.tablename);
    if (semRls.length) {
      reprovar(`${semRls.length} tabela(s) SEM RLS: ${semRls.join(", ")}`);
      console.log(`    → No Supabase, o schema "public" é publicado numa API REST alcançável`);
      console.log(`      com a chave ANÔNIMA, que é pública. Sem RLS, qualquer pessoa lê`);
      console.log(`      users (com password_hash), sessions e clinical_notes — e escreve.`);
      console.log(`    → rode: npm run db:migrate   (é a migração 0001)`);
    } else if (tabelas.length) {
      ok(`RLS ligado nas ${tabelas.length} tabelas`);
    }

    const politicas = (await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'`)[0]!.n;
    /* Sem RLS, "zero políticas" não protege nada — protege demais só quando o RLS
       está ligado. Dizer ✓ aqui com o RLS desligado contradiz a linha de cima. */
    if (politicas > 0) {
      aviso(`${politicas} política(s) encontradas. O sistema não usa nenhuma; confira o que elas liberam.`);
    } else if (!semRls.length && tabelas.length) {
      ok("nenhuma política — então a API pública não devolve linha alguma");
    }

    /* ----------------------- privilégios de anon ------------------------ */
    const papeis = await sql<{ rolname: string }[]>`
      SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')`;
    if (papeis.length) {
      const privs = (await sql<{ n: number }[]>`
        SELECT count(*)::int AS n FROM information_schema.role_table_grants
        WHERE grantee IN ('anon', 'authenticated') AND table_schema = 'public'`)[0]!.n;
      if (privs === 0) ok("anon e authenticated não têm privilégio nenhum nas tabelas");
      else reprovar(`anon/authenticated ainda têm ${privs} privilégio(s) — a migração 0001 não rodou inteira`);
    } else {
      aviso("papéis anon/authenticated não existem: este não parece ser um banco do Supabase");
    }

    /* ------------------------------- dados ------------------------------ */
    console.log("\nDADOS");
    if (!faltando.length) {
      const usuarios = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users`)[0]!.n;
      const planos = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM plans`)[0]!.n;
      if (planos === 0) {
        aviso("catálogo de planos vazio — ele se preenche sozinho na primeira subida do app");
      } else {
        ok(`${planos} planos no catálogo`);
      }
      const demo = (await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM users WHERE email LIKE '%@exemplo.com.br'`)[0]!.n;
      if (demo > 0) {
        aviso(`${usuarios} usuários, dos quais ${demo} são de DEMONSTRAÇÃO (@exemplo.com.br)`);
        console.log("    → bom para conhecer o sistema; apague antes de abrir para clientes de verdade");
      } else {
        ok(`${usuarios} usuários, nenhum de demonstração`);
      }
    }

    /* ------------------------------ veredito ---------------------------- */
    console.log();
    if (tudoBem) {
      console.log(`${VERDE}O banco está pronto.${FIM} Pode seguir para a Vercel (docs/DEPLOY.md, passo 5).\n`);
    } else {
      console.log(`${VERMELHO}O banco NÃO está pronto.${FIM} Resolva o que está marcado acima e rode de novo.\n`);
    }
    return tudoBem;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

const executadoDireto = process.argv[1]?.replace(/\\/g, "/").endsWith("db/conferir.ts");
if (executadoDireto) {
  const bem = await conferir();
  process.exitCode = bem ? 0 : 1;
}
