/* =========================================================================
   Nutri&Live — rotas de autenticação

   Esta camada não tem regra de negócio: ela liga o HTTP ao que já existe.

     senha      `auth/senha.ts`    política, hash Argon2id, conferência
     sessão     `auth/sessao.ts`   cookie + registro em `sessions`
     tokens     `auth/tokens.ts`   link de e-mail de uso único
     limite     `auth/limite.ts`   força bruta por e-mail e por IP
     e-mail     `lib/email.ts`     modelos em português
     guardas    `auth/guard.ts`    quem é o usuário da requisição

   Duas decisões que valem explicação:

   1. `/forgot` responde sempre `{ ok: true }`, exista ou não a conta. Dizer
      "este e-mail não está cadastrado" entrega a lista de clientes para
      quem quiser varrer endereços.

   2. Trocar ou redefinir senha encerra as outras sessões. Se a senha foi
      trocada porque alguém entrou na conta, o invasor cai fora no mesmo ato.
   ========================================================================= */
import { Hono } from "hono";
import contract from "../../shared/contract.js";
import type { Role } from "../../shared/contract.js";
import { db } from "../db/index.js";
import { careLinks, invitations, organizations, plans, subscriptions, users } from "../db/schema.js";
import { AppError, body, clientIp } from "../lib/http.js";
import { conforme, iso } from "../lib/resposta.js";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import { rotaInicial, rotaPrimeiroAcesso, rotaRedefinicao } from "../lib/rotas.js";
import { emailRedefinicao, emailSenhaAlterada, enviarEmail } from "../lib/email.js";
import { conferirSenha, gerarHash, validarSenha } from "../auth/senha.js";
import {
  criarSessao, encerrarSessao, encerrarTodasAsSessoes, faxinaDeSessoes
} from "../auth/sessao.js";
import type { Usuario } from "../auth/sessao.js";
import { criarToken, lerToken, minutosDeValidade, usarToken } from "../auth/tokens.js";
import { conferirLimite, faxinaDeTentativas, limparTentativas, registrarFalha } from "../auth/limite.js";
import {
  assinaturaDeAcesso, registrarAuditoria, requireUser, usuarioAtual, type Ambiente
} from "../auth/guard.js";

const r = new Hono<Ambiente>();

/* ======================================================================== */
/*  ajudantes locais                                                        */
/* ======================================================================== */

const normalizarEmail = (e: string): string => e.trim().toLowerCase();

/** Vínculos que ocupam assento: o convidado já reserva a vaga. */
const VINCULO_VIVO = ["pendente", "ativo"] as const;

const assentosUsados = (orgId: string): Promise<number> =>
  db.contar(careLinks, { orgId, status: { in: VINCULO_VIVO } });

/** O bloco `MeOut` do contrato, montado a partir do usuário da sessão. */
async function montarMe(usuario: Usuario) {
  const org = usuario.orgId ? await db.primeiro(organizations, { id: usuario.orgId }) : null;
  const assinatura = usuario.role === "admin" ? null : await assinaturaDeAcesso(usuario);
  const plano = assinatura ? await db.primeiro(plans, { key: assinatura.planKey }) : null;
  const propria = assinatura ? assinatura.userId === usuario.id : false;
  const pagante = assinatura && !propria ? await db.primeiro(users, { id: assinatura.userId }) : null;

  return {
    user: {
      id: usuario.id,
      name: usuario.name,
      email: usuario.email,
      role: usuario.role,
      status: usuario.status,
      orgId: usuario.orgId ?? null,
      mustChangePassword: usuario.mustChangePassword
    },
    org: org
      ? {
          id: org.id,
          type: org.type,
          name: org.name,
          seatLimit: org.seatLimit,
          seatsUsed: await assentosUsados(org.id)
        }
      : null,
    subscription: assinatura
      ? {
          planKey: assinatura.planKey,
          planName: plano?.name ?? assinatura.planKey,
          status: assinatura.status,
          priceCents: assinatura.priceCents,
          method: assinatura.method,
          ownedByMe: propria,
          paidByName: propria ? null : (org?.name ?? pagante?.name ?? null),
          currentPeriodEnd: iso(assinatura.currentPeriodEnd)
        }
      : null
  };
}

/** A política de senha, sempre com o dono em mãos (nome e e-mail barrados). */
const conferirPolitica = (usuario: Usuario, nova: string, campo = "password"): void =>
  validarSenha(nova, { nome: usuario.name, email: usuario.email }, campo);

/** Grava a senha nova. A política já foi conferida antes de chegar aqui. */
async function aplicarSenha(usuario: Usuario, nova: string): Promise<void> {
  await db.atualizar(users, { id: usuario.id }, {
    passwordHash: await gerarHash(nova),
    mustChangePassword: false,
    status: usuario.status === "convidado" ? "ativo" : usuario.status,
    emailVerifiedAt: usuario.emailVerifiedAt ?? new Date()
  });
}

async function avisarSenhaAlterada(usuario: Usuario): Promise<void> {
  const m = emailSenhaAlterada(usuario.name);
  await enviarEmail({
    para: usuario.email,
    assunto: "Sua senha do Nutri&Live foi alterada",
    texto: m.texto,
    html: m.html,
    tipo: "senha_alterada"
  });
}

/**
 * Quem chega por link de convite aceita o vínculo no mesmo ato de definir a
 * senha: é o que faz a pessoa aparecer como "ativo" na carteira do
 * profissional sem ninguém clicar em nada.
 */
async function aceitarConvites(usuario: Usuario): Promise<void> {
  await db.atualizar(careLinks, { memberUserId: usuario.id, status: "pendente" }, { status: "ativo" });
  await db.atualizar(invitations, { email: usuario.email, acceptedAt: null }, { acceptedAt: new Date() });
}

/**
 * Para onde mandar depois de entrar, quando a pessoa foi barrada no meio do
 * caminho. `pages.ts` já redirecionava com `?proximo=/evolucao` e o
 * comentário prometia "depois de entrar ela cai lá, não num painel
 * genérico" — mas o login SEMPRE devolvia `rotaInicial(papel)`, e o `||` do
 * cliente nunca chegava no valor guardado. Era código morto nos dois lados.
 *
 * Só caminho interno é aceito: tem de começar com uma barra e não pode
 * começar com duas (`//outro.site` é URL absoluta para o navegador) nem
 * conter `:` ou `\`. Sem isso, um link de login com
 * `?proximo=https://site-falso` viraria redirecionamento aberto — a pessoa
 * digita a senha no nosso domínio e aterrissa em outro.
 */
export function destinoSeguro(bruto: string | undefined): string | null {
  if (!bruto) return null;
  const alvo = bruto.trim();
  if (!alvo.startsWith("/") || alvo.startsWith("//")) return null;
  if (alvo.includes(":") || alvo.includes("\\")) return null;
  /* Voltar para a própria tela de entrar seria um laço. */
  if (alvo === "/entrar" || alvo.startsWith("/entrar?")) return null;
  return alvo;
}

/* ======================================================================== */
/*  POST /api/auth/login                                                    */
/* ======================================================================== */

r.post("/login", async (c) => {
  const entrada = await body(c, contract.auth.login.in);
  const email = normalizarEmail(entrada.email);
  const ip = clientIp(c);

  /* Antes de conferir a senha: bloqueado não chega a ser medido pelo tempo. */
  await conferirLimite("login_ip", ip);
  await conferirLimite("login_email", email);

  const usuario = await db.primeiro(users, { email, deletedAt: null });
  const senhaOk = await conferirSenha(usuario?.passwordHash, entrada.password);

  if (!usuario || !senhaOk) {
    await registrarFalha("login_email", email);
    await registrarFalha("login_ip", ip);
    /* Uma mensagem só para conta inexistente e senha errada. */
    throw new AppError("credenciais_invalidas", "E-mail ou senha não conferem.", {
      password: "Confira o e-mail e a senha."
    });
  }

  if (usuario.status === "suspenso") {
    throw new AppError("sem_permissao", "Esta conta está suspensa. Fale com o suporte.");
  }

  await limparTentativas("login_email", email);
  await criarSessao(c, usuario.id);
  await registrarAuditoria(c, usuario.id, "auth.login", "users", usuario.id, { role: usuario.role });

  /* Faxina oportunista: sessão vencida não precisa de cron para sair. */
  if (Math.random() < 0.05) {
    void faxinaDeSessoes().catch((e) => log.warn(`faxina de sessões falhou: ${e}`));
    /* A tabela de tentativas só cresce: sem faxina, cada login falho do
       ano passado continua ocupando linha. */
    void faxinaDeTentativas().catch((e) => log.warn(`faxina de tentativas falhou: ${e}`));
  }

  return c.json(conforme(contract.auth.login.out, {
    ok: true as const,
    redirect: destinoSeguro(entrada.next) ?? rotaInicial(usuario.role as Role)
  }));
});

/* ======================================================================== */
/*  POST /api/auth/logout                                                   */
/* ======================================================================== */

r.post("/logout", async (c) => {
  await encerrarSessao(c);
  return c.json(conforme(contract.auth.logout.out, { ok: true as const }));
});

/* ======================================================================== */
/*  GET /api/auth/me                                                        */
/* ======================================================================== */

r.get("/me", requireUser, async (c) => {
  const usuario = usuarioAtual(c);
  return c.json(conforme(contract.auth.me.out, await montarMe(usuario)));
});

/* ======================================================================== */
/*  POST /api/auth/first-access                                             */
/* ======================================================================== */

r.post("/first-access", async (c) => {
  const entrada = await body(c, contract.auth.firstAccess.in);
  const ip = clientIp(c);
  await conferirLimite("token_ip", ip);

  /* Confere SEM consumir: senha fora da política não pode queimar o link,
     senão a pessoa erra uma vez e precisa pedir outro e-mail. */
  const PROPOSITOS = ["primeiro_acesso", "convite"] as const;
  let registro;
  try {
    /* O mesmo mecanismo serve ao pós-pagamento e ao convite do profissional. */
    registro = await lerToken(entrada.token, [...PROPOSITOS]);
  } catch (e) {
    await registrarFalha("token_ip", ip);
    throw e;
  }

  const usuario = await db.primeiro(users, { id: registro.userId, deletedAt: null });
  if (!usuario) throw new AppError("nao_encontrado", "Conta não encontrada. Fale com o suporte.");
  if (usuario.status === "suspenso") {
    throw new AppError("sem_permissao", "Esta conta está suspensa. Fale com o suporte.");
  }

  conferirPolitica(usuario, entrada.password);
  await usarToken(entrada.token, [...PROPOSITOS]);      /* só agora o link morre */
  await aplicarSenha(usuario, entrada.password);
  await aceitarConvites(usuario);

  /* Ninguém herda sessão antiga ao definir a primeira senha. */
  await encerrarTodasAsSessoes(usuario.id);
  await criarSessao(c, usuario.id);
  await registrarAuditoria(c, usuario.id, "auth.primeiro_acesso", "users", usuario.id, null);

  return c.json(conforme(contract.auth.firstAccess.out, {
    ok: true as const,
    redirect: rotaInicial(usuario.role as Role)
  }));
});

/* ======================================================================== */
/*  POST /api/auth/forgot                                                   */
/* ======================================================================== */

r.post("/forgot", async (c) => {
  const entrada = await body(c, contract.auth.forgot.in);
  const email = normalizarEmail(entrada.email);
  const ip = clientIp(c);

  await conferirLimite("esqueci_ip", ip);
  await conferirLimite("esqueci_email", email);
  /* Pedir link é a "tentativa" aqui: contamos todas, acerte ou não. */
  await registrarFalha("esqueci_ip", ip);
  await registrarFalha("esqueci_email", email);

  const usuario = await db.primeiro(users, { email, deletedAt: null });

  if (usuario && usuario.status !== "suspenso") {
    /* Conta ainda sem senha recebe link de primeiro acesso, não de troca:
       a tela e a validade são outras. */
    const semSenha = !usuario.passwordHash;
    const proposito = semSenha ? "primeiro_acesso" : "redefinicao";
    const { token } = await criarToken(usuario.id, proposito);
    const link = `${env.APP_URL}${semSenha ? rotaPrimeiroAcesso(token) : rotaRedefinicao(token)}`;

    if (semSenha) {
      await enviarEmail({
        para: usuario.email,
        assunto: "Seu acesso ao Nutri&Live",
        texto: `Olá, ${usuario.name.split(" ")[0]}. Defina sua senha por este link: ${link}`,
        tipo: "primeiro_acesso"
      });
    } else {
      const m = emailRedefinicao(usuario.name, link, minutosDeValidade("redefinicao"));
      await enviarEmail({
        para: usuario.email,
        assunto: "Redefinir sua senha do Nutri&Live",
        texto: m.texto,
        html: m.html,
        tipo: "redefinicao"
      });
    }
    await registrarAuditoria(c, usuario.id, "auth.esqueci_senha", "users", usuario.id, { proposito });
  } else {
    log.info(`/forgot para endereço sem conta ativa: ${email}`);
  }

  /* Resposta igual nos dois casos: a lista de clientes não vaza por aqui. */
  return c.json(conforme(contract.auth.forgot.out, { ok: true as const }));
});

/* ======================================================================== */
/*  POST /api/auth/reset                                                    */
/* ======================================================================== */

r.post("/reset", async (c) => {
  const entrada = await body(c, contract.auth.reset.in);
  const ip = clientIp(c);
  await conferirLimite("token_ip", ip);

  let registro;
  try {
    registro = await lerToken(entrada.token, ["redefinicao"]);
  } catch (e) {
    await registrarFalha("token_ip", ip);
    throw e;
  }

  const usuario = await db.primeiro(users, { id: registro.userId, deletedAt: null });
  if (!usuario) throw new AppError("nao_encontrado", "Conta não encontrada. Fale com o suporte.");

  conferirPolitica(usuario, entrada.password);
  await usarToken(entrada.token, ["redefinicao"]);      /* só agora o link morre */
  await aplicarSenha(usuario, entrada.password);

  /* Senha nova derruba tudo que estava aberto, inclusive quem invadiu. */
  await encerrarTodasAsSessoes(usuario.id);
  await encerrarSessao(c);
  await limparTentativas("login_email", usuario.email);
  await avisarSenhaAlterada(usuario);
  await registrarAuditoria(c, usuario.id, "auth.redefiniu_senha", "users", usuario.id, null);

  return c.json(conforme(contract.auth.reset.out, { ok: true as const }));
});

/* ======================================================================== */
/*  POST /api/auth/change-password                                          */
/* ======================================================================== */

r.post("/change-password", requireUser, async (c) => {
  const entrada = await body(c, contract.auth.changePassword.in);
  const usuario = usuarioAtual(c);
  const sessao = c.get("sessao");

  if (!await conferirSenha(usuario.passwordHash, entrada.current)) {
    throw new AppError("credenciais_invalidas", "A senha atual não confere.", {
      current: "Senha atual incorreta."
    });
  }
  if (entrada.current === entrada.next) {
    throw new AppError("dados_invalidos", "A senha nova tem que ser diferente da atual.", {
      next: "Escolha uma senha diferente da atual."
    });
  }

  conferirPolitica(usuario, entrada.next, "next");
  await aplicarSenha(usuario, entrada.next);

  /* A sessão de quem trocou continua; as outras caem. */
  await encerrarTodasAsSessoes(usuario.id, sessao?.id);
  await avisarSenhaAlterada(usuario);
  await registrarAuditoria(c, usuario.id, "auth.trocou_senha", "users", usuario.id, null);

  return c.json(conforme(contract.auth.changePassword.out, { ok: true as const }));
});

export default r;
