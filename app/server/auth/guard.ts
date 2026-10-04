/* =========================================================================
   Nutri&Live — guardas

   Nenhuma rota lê cookie na mão: tudo passa por aqui. Os guardas são
   middlewares do Hono e deixam no contexto o que a rota precisa, para a
   rota não repetir consulta:

     requireUser        sessão válida e conta não suspensa  -> c.get("usuario")
     requireRole(...)   papel entre os aceitos
     requireOrg         usuário com organização             -> c.get("org")
     requireActiveSub   assinatura que paga o acesso        -> c.get("assinatura")
     canAccessMember    vínculo profissional-membro         -> devolve o care_link

   `canAccessMember` é o que impede uma nutricionista de abrir o paciente de
   outra: sem `care_links` ativo (dela ou da organização dela) a resposta é
   403, mesmo que o id exista.
   ========================================================================= */
import type { Context, MiddlewareHandler } from "hono";
import { db } from "../db/index.js";
import { auditLog, careLinks, organizations, subscriptions, users } from "../db/schema.js";
import type { Linha } from "../db/index.js";
import { AppError, clientIp } from "../lib/http.js";
import type { Role } from "../../shared/contract.js";
import { lerSessao, type Sessao, type Usuario } from "./sessao.js";

export type Organizacao = Linha<typeof organizations>;
export type Assinatura = Linha<typeof subscriptions>;
export type Vinculo = Linha<typeof careLinks>;

/** Tipagem do contexto compartilhada pelas rotas: `new Hono<Ambiente>()`. */
export type Ambiente = {
  Variables: {
    usuario: Usuario;
    sessao: Sessao;
    org: Organizacao;
    assinatura: Assinatura | null;
  };
};

/* Papéis que pagam e que, portanto, têm assinatura própria. */
export const PAPEIS_PAGANTES: Role[] = ["pessoal", "nutricionista", "academia"];
/* Papéis que acessam pelo vínculo com uma organização. */
export const PAPEIS_VINCULADOS: Role[] = ["paciente", "aluno"];
/* Papéis que administram uma organização. */
export const PAPEIS_PROFISSIONAIS: Role[] = ["nutricionista", "academia"];

/* ======================================================================== */
/*  requireUser                                                             */
/* ======================================================================== */

export const requireUser: MiddlewareHandler<Ambiente> = async (c, next) => {
  const atual = c.get("usuario");
  if (!atual) {
    const sessao = await lerSessao(c);
    if (!sessao) {
      throw new AppError("nao_autenticado", "Entre na sua conta para continuar.");
    }
    if (sessao.usuario.status === "suspenso") {
      throw new AppError("sem_permissao", "Esta conta está suspensa. Fale com o suporte.");
    }
    c.set("usuario", sessao.usuario);
    c.set("sessao", sessao.sessao);
  }
  await next();
};

/** Usuário da requisição. Só chame depois de `requireUser`. */
export function usuarioAtual(c: Context<Ambiente>): Usuario {
  const u = c.get("usuario");
  if (!u) throw new AppError("nao_autenticado", "Entre na sua conta para continuar.");
  return u;
}

/* ======================================================================== */
/*  requireRole                                                             */
/* ======================================================================== */

export const requireRole = (...papeis: Role[]): MiddlewareHandler<Ambiente> => async (c, next) => {
  await requireUser(c, async () => {});
  const u = usuarioAtual(c);
  if (!papeis.includes(u.role as Role)) {
    throw new AppError("sem_permissao", "Sua conta não tem acesso a esta área.");
  }
  await next();
};

/* ======================================================================== */
/*  requireOrg                                                              */
/* ======================================================================== */

export const requireOrg: MiddlewareHandler<Ambiente> = async (c, next) => {
  await requireUser(c, async () => {});
  const u = usuarioAtual(c);
  if (!u.orgId) {
    throw new AppError("sem_permissao", "Esta área é de nutricionistas e academias.");
  }
  const org = await db.primeiro(organizations, { id: u.orgId });
  if (!org) throw new AppError("nao_encontrado", "Organização não encontrada.");
  c.set("org", org);
  await next();
};

/** Organização da requisição. Só chame depois de `requireOrg`. */
export function orgAtual(c: Context<Ambiente>): Organizacao {
  const o = c.get("org");
  if (!o) throw new AppError("sem_permissao", "Esta área é de nutricionistas e academias.");
  return o;
}

/* ======================================================================== */
/*  requireActiveSub                                                        */
/* ======================================================================== */

/** Status que mantêm o acesso aberto. "atrasada" segue abrindo: cobrança
    atrasada vira aviso na tela, não porta fechada — cortar na hora é a
    forma mais rápida de perder um cliente que só trocou de cartão. */
const STATUS_QUE_LIBERAM = ["ativa", "atrasada"] as const;

const MENSAGEM_SEM_ASSINATURA: Record<string, string> = {
  paciente: "O acesso do seu nutricionista está suspenso. Fale com ele para liberar o app.",
  aluno: "O acesso da sua academia está suspenso. Fale com a recepção para liberar o app."
};

/** A assinatura que paga o acesso desta pessoa (a dela ou a da organização). */
export async function assinaturaDeAcesso(usuario: Usuario): Promise<Assinatura | null> {
  const propria = await db.buscar(subscriptions, { userId: usuario.id }, { ordem: { campo: "createdAt", dir: "desc" } });
  const viva = propria.find((s) => (STATUS_QUE_LIBERAM as readonly string[]).includes(s.status));
  if (viva) return viva;

  /* Paciente e aluno não pagam: quem paga é a organização que os cadastrou.
     Vale também para a nutricionista funcionária de uma clínica. */
  if (usuario.orgId) {
    const daOrg = await db.buscar(subscriptions, { orgId: usuario.orgId }, { ordem: { campo: "createdAt", dir: "desc" } });
    const vivaOrg = daOrg.find((s) => (STATUS_QUE_LIBERAM as readonly string[]).includes(s.status));
    if (vivaOrg) return vivaOrg;
  }

  /* Cancelada mas ainda dentro do período pago continua valendo. */
  const emCarencia = propria.find(
    (s) => s.status === "cancelada" && s.currentPeriodEnd && s.currentPeriodEnd.getTime() > Date.now()
  );
  return emCarencia ?? null;
}

export const requireActiveSub: MiddlewareHandler<Ambiente> = async (c, next) => {
  await requireUser(c, async () => {});
  const u = usuarioAtual(c);

  if (u.role === "admin") {               /* o nosso time não assina nada */
    c.set("assinatura", null);
    await next();
    return;
  }

  const assinatura = await assinaturaDeAcesso(u);
  if (!assinatura) {
    throw new AppError(
      "assinatura_inativa",
      MENSAGEM_SEM_ASSINATURA[u.role] ??
        "Sua assinatura não está ativa. Regularize para voltar a usar o app."
    );
  }
  c.set("assinatura", assinatura);
  await next();
};

/* ======================================================================== */
/*  canAccessMember                                                         */
/* ======================================================================== */

const VINCULO_VIVO = ["pendente", "ativo"] as const;

/**
 * Devolve o vínculo entre o profissional e o membro, ou estoura 403.
 *
 * Aceita dois caminhos:
 *   1. vínculo direto profissional -> membro;
 *   2. vínculo de um colega da MESMA organização (plano Clínica permite
 *      até 5 nutricionistas na mesma conta, e a academia tem vários
 *      atendentes) — neste caso o membro tem que estar na mesma `org_id`.
 *
 * Fora disso, não existe acesso: é esta função que impede a nutricionista
 * A de abrir o paciente da nutricionista B.
 */
export async function canAccessMember(professionalId: string, memberId: string): Promise<Vinculo> {
  const negar = (): never => {
    throw new AppError("sem_permissao", "Esta pessoa não está na sua carteira.");
  };
  if (!professionalId || !memberId) negar();

  const direto = await db.primeiro(careLinks, {
    professionalUserId: professionalId,
    memberUserId: memberId,
    status: { in: VINCULO_VIVO }
  });
  if (direto) return direto;

  const profissional = await db.primeiro(users, { id: professionalId, deletedAt: null });
  if (!profissional?.orgId) return negar();

  const daOrg = await db.primeiro(careLinks, {
    orgId: profissional.orgId,
    memberUserId: memberId,
    status: { in: VINCULO_VIVO }
  });
  if (daOrg) return daOrg;

  return negar();
}

/**
 * Mesma verificação, mas ciente do admin: o nosso time passa por cima do
 * vínculo e a passagem fica registrada em `audit_log` (regra 4 da
 * arquitetura). Devolve `null` quando é admin e não existe vínculo.
 */
export async function acessoAoMembro(
  c: Context<Ambiente>,
  ator: Usuario,
  memberId: string
): Promise<Vinculo | null> {
  if (ator.role !== "admin") return canAccessMember(ator.id, memberId);

  const vinculo = await db.primeiro(careLinks, { memberUserId: memberId, status: { in: VINCULO_VIVO } });
  await registrarAuditoria(c, ator.id, "admin.le_membro", "users", memberId, { via: "guard" });
  return vinculo;
}

/* ======================================================================== */
/*  auditoria                                                               */
/* ======================================================================== */

export async function registrarAuditoria(
  c: Context<Ambiente> | null,
  atorId: string | null,
  acao: string,
  entidade: string,
  entidadeId: string | null,
  meta?: unknown
): Promise<void> {
  await db.inserir(auditLog, {
    actorUserId: atorId,
    action: acao.slice(0, 64),
    entity: entidade.slice(0, 48),
    entityId: entidadeId ? entidadeId.slice(0, 64) : null,
    meta: (meta ?? null) as never,
    ip: c ? clientIp(c).slice(0, 45) : null
  });
}

/* ======================================================================== */
/*  combinações usadas pelas rotas                                          */
/* ======================================================================== */

/** App do usuário final: qualquer papel que use o app, com acesso pago em dia. */
export const guardaApp: MiddlewareHandler<Ambiente>[] = [
  requireRole("pessoal", "nutricionista", "academia", "paciente", "aluno", "admin"),
  requireActiveSub
];

/** Painel de organização: dono da conta nutricionista/academia (ou admin). */
export const guardaOrg: MiddlewareHandler<Ambiente>[] = [
  requireRole("nutricionista", "academia", "admin"),
  requireOrg,
  requireActiveSub
];
