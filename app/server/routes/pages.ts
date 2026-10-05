/* =========================================================================
   Nutri&Live — páginas renderizadas no servidor

   Este arquivo é a ponte entre `web/pages/*` (funções puras que devolvem
   HTML) e as rotas que o navegador pede. Três decisões valem para todas:

   1. SESSÃO NA ENTRADA, NÃO NO MEIO. Toda tela de app passa por `comSessao`,
      que resolve o usuário uma vez e redireciona para `/entrar?proximo=…`
      quem não tem sessão. Nunca se lê cookie na mão aqui.

   2. OS DADOS VÊM DA PRÓPRIA API, não de uma segunda implementação. Cada
      tela faz um pedido interno à mesma rota `/api/...` que a ilha de JS
      usaria, com o mesmo cookie, pelo `fetch` do próprio Hono (`pedir`).
      É mais lento que chamar a função de banco direto, e é de propósito:
      assim não existe caminho em que a tela e a API discordem, e o guarda
      de assinatura vale igual nos dois.

   3. FALHA NÃO É TELA BRANCA. `pedir` devolve `null` em qualquer erro, e
      toda página de `web/pages` aceita `null` e se explica — a ilha então
      busca de novo no cliente. Uma tela que carrega torta e se conserta em
      300 ms é melhor que um 500.

   Duas leituras fogem da regra 2 porque não existe endpoint de leitura para
   elas no contrato (a IA grava, o front só exibe o que veio no bootstrap):
   o plano ativo e as receitas salvas saem de `meal_plans` e `recipes`. Essa
   é a razão de `planoAtivo` e `receitasSalvas` morarem aqui.
   ========================================================================= */
import { Hono } from "hono";
import type { Context } from "hono";

import { lerSessao, encerrarSessao, type Usuario } from "../auth/sessao.js";
import { assinaturaDeAcesso } from "../auth/guard.js";
import { acessoVigente } from "../billing/acesso.js";
import { db } from "../db/index.js";
import { mealPlans, organizations, plans, recipes, users } from "../db/schema.js";
import { lerToken, type Proposito } from "../auth/tokens.js";
import { log } from "../lib/log.js";
import { rotaInicial } from "../lib/rotas.js";
import type { Role } from "../../shared/contract.js";

import { shell, type ShellUser } from "../../web/layout.js";
import paginaEntrar from "../../web/pages/entrar.js";
import paginaEsqueci from "../../web/pages/esqueci.js";
import paginaRedefinir from "../../web/pages/redefinir.js";
import paginaPrimeiroAcesso from "../../web/pages/primeiro-acesso.js";
import paginaHoje from "../../web/pages/hoje.js";
import paginaPlano, { type PlanoAtivo, type DiaPlano } from "../../web/pages/plano.js";
import paginaReceitas, { type Receita } from "../../web/pages/receitas.js";
import paginaCompras from "../../web/pages/compras.js";
import paginaEvolucao, { faixaValida } from "../../web/pages/evolucao.js";
import paginaConta from "../../web/pages/conta.js";
import orgPainel from "../../web/pages/org-painel.js";
import orgPessoas from "../../web/pages/org-pessoas.js";
import orgPessoa from "../../web/pages/org-pessoa.js";
import orgComissoes from "../../web/pages/org-comissoes.js";
import adminVisao from "../../web/pages/admin-visao.js";
import adminUsuarios from "../../web/pages/admin-usuarios.js";
import adminPagamentos from "../../web/pages/admin-pagamentos.js";
import adminIa from "../../web/pages/admin-ia.js";
import adminAuditoria from "../../web/pages/admin-auditoria.js";

/* ------------------------------------------------------------------------ */
/*  sessão e dados                                                          */
/* ------------------------------------------------------------------------ */

/** O usuário do jeito que a casca precisa: sem hash de senha, com a org. */
async function paraCasca(u: Usuario): Promise<ShellUser> {
  const org = u.orgId ? await db.primeiro(organizations, { id: u.orgId }) : null;
  return { id: u.id, name: u.name, email: u.email, role: u.role as Role, orgName: org?.name ?? null };
}

/**
 * Pedido interno à própria API, com o cookie da pessoa.
 *
 * O `app.fetch` do Hono atende em memória: não sai para a rede, não abre
 * porta, e passa pelos MESMOS middlewares — então o 403 de assinatura
 * vencida acontece aqui igual aconteceria no cliente. Qualquer coisa fora
 * de 2xx devolve `null`, que é o contrato de degradação das telas.
 */
async function pedir<T>(c: Context, caminho: string): Promise<T | null> {
  return (await pedirDetalhado<T>(c, caminho)).dados;
}

/**
 * Igual a `pedir`, mas devolve o status também.
 *
 * Existe porque "sem dados" tem motivos diferentes, e a tela precisa saber
 * qual. A ficha de um membro recém-convidado responde 403 — a pessoa não
 * aceitou o convite, o prontuário é dela — e a tela dizia "o serviço
 * respondeu que está fora do ar". Serviço no ar, resposta correta, recado
 * errado: a profissional ficaria esperando um serviço voltar.
 */
async function pedirDetalhado<T>(
  c: Context, caminho: string
): Promise<{ dados: T | null; status: number }> {
  try {
    const url = new URL(caminho, new URL(c.req.url).origin);
    const resp = await (await appInterno()).fetch(
      new Request(url, { headers: { cookie: c.req.header("cookie") ?? "" } })
    );
    if (!resp.ok) {
      log.warn(`página: ${caminho} respondeu ${resp.status}`);
      return { dados: null, status: resp.status };
    }
    return { dados: (await resp.json()) as T, status: resp.status };
  } catch (e) {
    log.warn(`página: ${caminho} falhou — ${(e as Error).message}`);
    return { dados: null, status: 0 };
  }
}

/* O app completo é importado sob demanda: `index.ts` importa este arquivo,
   e um `import` no topo fecharia o ciclo. */
let cacheApp: { fetch: (r: Request) => Response | Promise<Response> } | null = null;
async function appInterno() {
  if (!cacheApp) cacheApp = (await import("../index.js")).default;
  return cacheApp;
}

/** Vários pedidos de uma tela, em paralelo. Um que falhe não derruba os outros. */
const juntos = <T extends readonly Promise<unknown>[]>(ps: T) => Promise.all(ps) as Promise<{
  -readonly [K in keyof T]: Awaited<T[K]>
}>;

/* ------------------------------------------------------------------------ */
/*  adaptadores: banco -> formato da tela                                   */
/* ------------------------------------------------------------------------ */

/**
 * `meal_plans.content` tem duas origens com formatos diferentes: o que a IA
 * grava (`refeicoes[].tipo/titulo/macros`, dia numerado com data) e o que a
 * nutricionista monta pelo seed (`refeicoes[].refeicao/descricao/proteinaG`,
 * dia com nome). A tela conhece um formato só, então a tradução é aqui — e
 * é aqui porque é o único lugar que lê a coluna.
 */
function normalizarDias(cru: unknown): DiaPlano[] {
  const lista = Array.isArray((cru as { dias?: unknown })?.dias) ? (cru as { dias: unknown[] }).dias : [];
  return lista.map((d, i) => {
    const dia = d as Record<string, unknown>;
    const refeicoes = Array.isArray(dia["refeicoes"]) ? (dia["refeicoes"] as Record<string, unknown>[]) : [];
    return {
      dia: typeof dia["dia"] === "string" ? dia["dia"] : `Dia ${Number(dia["dia"] ?? i + 1)}`,
      kcal: typeof dia["kcal"] === "number" ? dia["kcal"] : undefined,
      refeicoes: refeicoes.map((r) => {
        const macrosCru = r["macros"] as Record<string, number> | undefined;
        /* O formato do seed guarda só proteína, e guarda em `proteinaG`. */
        const proteina = typeof r["proteinaG"] === "number" ? (r["proteinaG"] as number) : macrosCru?.["protein"];
        return {
          meal: String(r["tipo"] ?? r["refeicao"] ?? ""),
          titulo: String(r["titulo"] ?? r["descricao"] ?? ""),
          kcal: Number(r["kcal"] ?? 0),
          macros: proteina == null && !macrosCru ? null : {
            protein: proteina,
            carb: macrosCru?.["carb"],
            fat: macrosCru?.["fat"]
          }
        };
      })
    };
  });
}

/** Plano que a pessoa deve ver: o ativo; se não houver, o último enviado. */
async function planoAtivo(userId: string): Promise<PlanoAtivo | null> {
  const todos = await db.buscar(mealPlans, { userId }, { ordem: { campo: "createdAt", dir: "desc" } });
  const escolhido =
    todos.find((p) => p.status === "ativo") ??
    todos.find((p) => p.status === "enviado") ??
    null;
  if (!escolhido) return null;
  return {
    id: escolhido.id,
    titulo: escolhido.title,
    dias: normalizarDias(escolhido.content),
    kcalTarget: escolhido.kcalTarget,
    proteinTargetG: escolhido.macros?.protein ?? null,
    criadoEm: escolhido.createdAt.toISOString(),
    fonte: escolhido.source
  };
}

async function receitasSalvas(userId: string): Promise<Receita[]> {
  const linhas = await db.buscar(recipes, { userId }, {
    ordem: { campo: "createdAt", dir: "desc" }, limite: 12
  });
  return linhas.map((r) => ({
    id: r.id, title: r.title, timeMin: r.timeMin, kcal: r.kcal,
    macros: r.macros ?? null, matchPct: r.matchPct,
    ingredients: r.ingredients ?? [], steps: r.steps ?? []
  }));
}

/* ------------------------------------------------------------------------ */
/*  o roteador                                                              */
/* ------------------------------------------------------------------------ */
const r = new Hono();

const html = (c: Context, corpo: string) => c.html(corpo);

/**
 * Guarda das telas de app. Sem sessão, manda para `/entrar` guardando onde a
 * pessoa queria chegar — depois de entrar ela cai lá, não num painel
 * genérico. Com papel errado para a tela, vai para a tela inicial do papel
 * dela: dizer "403" a quem só clicou num link antigo não ajuda ninguém.
 */
function comSessao(
  papeis: Role[] | null,
  desenhar: (c: Context, u: Usuario, casca: ShellUser) => Promise<string>,
  opcoes: { exigeAcesso?: boolean } = {}
) {
  const exigeAcesso = opcoes.exigeAcesso !== false;
  return async (c: Context) => {
    const sessao = await lerSessao(c);
    if (!sessao) {
      const destino = new URL(c.req.url).pathname + new URL(c.req.url).search;
      return c.redirect(`/entrar?proximo=${encodeURIComponent(destino)}`);
    }
    const u = sessao.usuario;
    if (papeis && !papeis.includes(u.role as Role)) return c.redirect(rotaInicial(u.role as Role));

    /* Sem acesso pago, a tela do app não deve abrir vazia.
       -------------------------------------------------------------------
       Com o paywall ligado na API, `/hoje` continuava respondendo 200 e
       dizendo "Não conseguimos carregar o seu dia agora — ficou
       indisponível por um instante. Tentar de novo". Isso é mentira: o
       motivo não é instante nenhum, é que a assinatura acabou. A pessoa
       apertaria "tentar de novo" para sempre.

       Então ela vai para /conta, que é onde o painel de assinatura explica
       a situação e oferece o caminho de volta. /conta e /sair ficam abertas
       de propósito: trancar a porta por onde se volta a pagar seria o pior
       resultado possível. */
    if (exigeAcesso && u.role !== "admin") {
      const assinatura = await assinaturaDeAcesso(u);
      if (!acessoVigente(assinatura)) return c.redirect("/conta?acesso=encerrado");
    }

    return html(c, await desenhar(c, u, await paraCasca(u)));
  };
}

const PESSOAIS: Role[] = ["pessoal", "paciente", "aluno", "nutricionista"];
const PROFISSIONAIS: Role[] = ["nutricionista", "academia"];
const ADMIN: Role[] = ["admin"];

/* ----------------------------- raiz e saída ----------------------------- */
r.get("/", async (c) => {
  const sessao = await lerSessao(c);
  return c.redirect(sessao ? rotaInicial(sessao.usuario.role as Role) : "/entrar");
});

/* Sair é POST porque apaga estado: link que encerra sessão é apagado por
   pré-carregador de navegador e por antivírus de e-mail. */
r.post("/sair", async (c) => {
  await encerrarSessao(c);
  return c.redirect("/entrar?recado=Você saiu da sua conta.");
});

/* --------------------------- telas sem sessão --------------------------- */
r.get("/entrar", async (c) => {
  const sessao = await lerSessao(c);
  if (sessao) return c.redirect(rotaInicial(sessao.usuario.role as Role));
  const q = c.req.query();
  return html(c, paginaEntrar({ email: q["email"], proximo: q["proximo"], recado: q["recado"] }));
});

r.get("/esqueci", (c) => html(c, paginaEsqueci({ email: c.req.query("email") })));
r.get("/esqueci-senha", (c) => c.redirect("/esqueci"));

/* O token é validado ANTES de desenhar: a pessoa que clicou num link vencido
   merece ver "peça um link novo" na hora, não depois de digitar uma senha
   duas vezes. `lerToken` não consome nada — quem consome é o POST. */
/** `lerToken` lança quando o link não vale; na tela isso não é erro, é o
    estado "peça um link novo". Daí envolver numa função que devolve null. */
async function donoDoToken(token: string, propositos: Proposito[]): Promise<Usuario | null> {
  if (!token) return null;
  try {
    const registro = await lerToken(token, propositos);
    return (await db.primeiro(users, { id: registro.userId })) ?? null;
  } catch {
    return null;
  }
}

r.get("/primeiro-acesso", async (c) => {
  const token = c.req.query("token") ?? "";
  /* O convite da nutricionista e o link pós-pagamento caem na mesma tela:
     para quem clicou é a mesma coisa — definir a primeira senha. */
  const dono = await donoDoToken(token, ["primeiro_acesso", "convite"]);
  if (!dono) return html(c, paginaPrimeiroAcesso({ token, expirado: true }));

  const assinatura = await assinaturaDeAcesso(dono);
  const plano = assinatura ? await db.primeiro(plans, { key: assinatura.planKey }) : null;
  return html(c, paginaPrimeiroAcesso({ token, nome: dono.name, plano: plano?.name ?? undefined }));
});

r.get("/redefinir-senha", async (c) => {
  const token = c.req.query("token") ?? "";
  const dono = await donoDoToken(token, ["redefinicao"]);
  return html(c, paginaRedefinir({ token, expirado: !dono }));
});
r.get("/redefinir", (c) => c.redirect(`/redefinir-senha${new URL(c.req.url).search}`));

/* ------------------------------ app pessoal ----------------------------- */
r.get("/hoje", comSessao(null, async (c, _u, usuario) => {
  const hoje = await pedir<Parameters<typeof paginaHoje>[0]["hoje"]>(c, "/api/me/today");
  return paginaHoje({ usuario, hoje });
}));

/* `GET /api/me/profile` devolve o perfil PLANO (os campos na raiz), não
   embrulhado em `{ profile }`. Três telas liam `.profile` daqui e abriam
   vazias sem nenhum erro aparente — o formulário sem valor e a assinatura
   em branco eram o único sintoma. Este é o formato de verdade. */
type PerfilApi = {
  name: string; email: string; role: string;
  birthDate: string | null; sex: string | null; heightCm: number | null;
  goal: string | null; activityLevel: string | null; dietStyle: string | null;
  restrictions: string[]; dislikes: string[];
  kcalTarget: number; proteinTargetG: number; waterTargetMl: number;
  weightKg: number | null; lastMeasuredAt: string | null; updatedAt: string | null;
};

r.get("/plano", comSessao(null, async (c, u, usuario) => {
  const [plano, perfil] = await juntos([
    planoAtivo(u.id),
    pedir<PerfilApi>(c, "/api/me/profile")
  ] as const);
  return paginaPlano({
    usuario, plano, semServidor: !perfil,
    perfil: perfil ? {
      dietStyle: perfil.dietStyle, kcalTarget: perfil.kcalTarget,
      proteinTargetG: perfil.proteinTargetG, restrictions: perfil.restrictions
    } : null
  });
}));

r.get("/receitas", comSessao(null, async (_c, u, usuario) =>
  paginaReceitas({ usuario, receitas: await receitasSalvas(u.id) })));

r.get("/compras", comSessao(PESSOAIS, async (c, u, usuario) => {
  const lista = await pedir<Parameters<typeof paginaCompras>[0]["lista"]>(c, "/api/me/shopping-list");
  return paginaCompras({ usuario, lista, temPlano: Boolean(await planoAtivo(u.id)), semServidor: !lista });
}));

r.get("/evolucao", comSessao(null, async (c, _u, usuario) => {
  const faixa = faixaValida(c.req.query("faixa"));
  const [progresso, perfil] = await juntos([
    pedir<Parameters<typeof paginaEvolucao>[0]["progresso"]>(c, `/api/me/progress?range=${faixa}`),
    pedir<PerfilApi>(c, "/api/me/profile")
  ] as const);
  return paginaEvolucao({ usuario, progresso, faixa, alturaCm: perfil?.heightCm ?? null });
}));

r.get("/conta", comSessao(null, async (c, u, usuario) => {
  /* Três fontes, porque são três assuntos: quem a pessoa é e o que ela
     assinou saem da sessão (`/api/auth/me`), o perfil e as metas saem de
     `/api/me/profile`, e as faturas de `/api/subscription/invoices`. */
  const [sessao, perfil, faturas] = await juntos([
    pedir<{
      user: Parameters<typeof paginaConta>[0]["user"];
      subscription: Parameters<typeof paginaConta>[0]["subscription"];
    }>(c, "/api/auth/me"),
    pedir<PerfilApi>(c, "/api/me/profile"),
    pedir<{ invoices: NonNullable<Parameters<typeof paginaConta>[0]["invoices"]> }>(c, "/api/subscription/invoices")
  ] as const);

  return paginaConta({
    usuario,
    /* Sem a sessão respondida, a tela ainda identifica quem está logado pelo
       cookie já resolvido: é pouco, mas é verdade, e evita um formulário com
       o nome em branco. */
    user: sessao?.user ?? { id: u.id, name: u.name, email: u.email, role: u.role, status: u.status, orgId: u.orgId },
    profile: perfil ? {
      birthDate: perfil.birthDate, sex: perfil.sex, heightCm: perfil.heightCm,
      goal: perfil.goal, activityLevel: perfil.activityLevel, dietStyle: perfil.dietStyle,
      restrictions: perfil.restrictions, dislikes: perfil.dislikes
    } : null,
    subscription: sessao?.subscription ?? null,
    invoices: faturas?.invoices ?? null,
    metas: perfil ? {
      kcalTarget: perfil.kcalTarget, proteinTargetG: perfil.proteinTargetG,
      waterTargetMl: perfil.waterTargetMl
    } : null,
    semServidor: !perfil || !sessao
  });
}, { exigeAcesso: false }));

/* --------------------------- consultório/academia ----------------------- */
r.get("/painel", comSessao(PROFISSIONAIS, async (c, _u, user) =>
  orgPainel({ user, dados: await pedir(c, "/api/org/dashboard") })));

/** Mesma tela, dois endereços: a nutricionista tem paciente, a academia tem
    aluno, e cada uma deve ver a palavra dela na barra de navegação. */
const telaPessoas = comSessao(PROFISSIONAIS, async (c, _u, user) => {
  const q = c.req.query();
  const busca = new URLSearchParams();
  if (q["q"]) busca.set("q", q["q"]);
  if (q["status"]) busca.set("status", q["status"]);
  const sufixo = busca.toString() ? `?${busca}` : "";
  return orgPessoas({
    user, dados: await pedir(c, `/api/org/members${sufixo}`), q: q["q"], status: q["status"]
  });
});
r.get("/pacientes", telaPessoas);
r.get("/alunos", telaPessoas);

const telaPessoa = comSessao(PROFISSIONAIS, async (c, _u, user) => {
  const userId = c.req.param("userId") ?? "";
  const r = await pedirDetalhado<Parameters<typeof orgPessoa>[0]["dados"]>(
    c, `/api/org/members/${encodeURIComponent(userId)}`
  );
  return orgPessoa({
    user, userId, dados: r.dados,
    /* 403 aqui quer dizer "ainda não aceitou o convite" ou "não é da sua
       carteira" — e nos dois casos a resposta certa é a mesma frase, porque
       confirmar qual dos dois é já contaria algo sobre a outra pessoa. */
    motivo: r.status === 403 ? "pendente" : "indisponivel"
  });
});
r.get("/pacientes/:userId", telaPessoa);
r.get("/alunos/:userId", telaPessoa);

r.get("/comissoes", comSessao(["academia"], async (c, _u, user) => {
  /* A competência é validada AQUI, e não só na API, porque o valor cru da
     querystring chegava à tela quando a API recusava o formato — e a tela
     o imprimia. Era um XSS refletido de um clique: ?periodo=<img onerror>.
     A tela também escapa; isto é a porta, aquilo é a tranca. */
  const cru = c.req.query("periodo") ?? c.req.query("period") ?? "";
  const periodo = /^\d{4}-\d{2}$/.test(cru) ? cru : "";
  const sufixo = periodo ? `?period=${encodeURIComponent(periodo)}` : "";
  const dados = await pedir<Parameters<typeof orgComissoes>[0]["dados"]>(c, `/api/org/commissions${sufixo}`);
  return orgComissoes({ user, dados, periodo: periodo || undefined });
}));

/* --------------------------------- admin -------------------------------- */
const pagina = (c: Context) => Math.max(1, Number(c.req.query("pagina") ?? c.req.query("page") ?? 1) || 1);

r.get("/admin", comSessao(ADMIN, async (c, _u, user) =>
  adminVisao({ user, dados: await pedir(c, "/api/admin/overview") })));

r.get("/admin/usuarios", comSessao(ADMIN, async (c, _u, user) => {
  const q = c.req.query();
  const busca = new URLSearchParams({ page: String(pagina(c)) });
  for (const chave of ["q", "role", "status"]) if (q[chave]) busca.set(chave, q[chave]!);
  return adminUsuarios({
    user, dados: await pedir(c, `/api/admin/users?${busca}`),
    q: q["q"], role: q["role"], status: q["status"]
  });
}));

r.get("/admin/pagamentos", comSessao(ADMIN, async (c, _u, user) => {
  const p = pagina(c);
  const status = c.req.query("status");
  const busca = new URLSearchParams({ page: String(p) });
  if (status) busca.set("status", status);
  return adminPagamentos({ user, dados: await pedir(c, `/api/admin/payments?${busca}`), status, pagina: p });
}));

r.get("/admin/ia", comSessao(ADMIN, async (c, _u, user) => {
  const p = pagina(c);
  const [dados, visao] = await juntos([
    pedir<Parameters<typeof adminIa>[0]["dados"]>(c, `/api/admin/ai?page=${p}`),
    pedir<{ aiJobs: Parameters<typeof adminIa>[0]["resumo"] }>(c, "/api/admin/overview")
  ] as const);
  return adminIa({ user, dados, resumo: visao?.aiJobs ?? null, pagina: p });
}));

r.get("/admin/auditoria", comSessao(ADMIN, async (c, _u, user) => {
  const p = pagina(c);
  return adminAuditoria({
    user, dados: await pedir(c, `/api/admin/audit?page=${p}`),
    pagina: p, acao: c.req.query("acao")
  });
}));

/* ------------------------------ 404 de tela ----------------------------- */
/*  Endereço que não existe dentro do app não deve virar JSON de API: quem
    digitou errado está num navegador e precisa de um caminho de volta. */
r.all("*", async (c) => {
  const sessao = await lerSessao(c);
  const volta = sessao ? rotaInicial(sessao.usuario.role as Role) : "/entrar";
  const corpo = `
<section class="card" style="display:grid;gap:.75rem;max-width:34rem;margin:3rem auto;text-align:center">
  <h2 style="margin:0">Esta tela não existe</h2>
  <p style="margin:0;color:var(--text-muted)">O endereço <code>${c.req.path.replace(/[<&]/g, "")}</code> não corresponde a nenhuma tela.</p>
  <p style="margin:0"><a class="btn btn-primary" href="${volta}">Voltar para o início</a></p>
</section>`;
  if (!sessao) return c.html(corpo, 404);
  return c.html(shell({
    title: "Tela não encontrada", user: await paraCasca(sessao.usuario), active: "", body: corpo
  }), 404);
});

export default r;
