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
/**
 * Vínculo que ABRE o prontuário. Não é o mesmo conjunto que ocupa assento.
 *
 * `pendente` significa convidada, não consentida: a pessoa foi cadastrada e
 * ainda não aceitou. Enquanto esse status abria o prontuário, bastava
 * conhecer o e-mail de alguém para ler tudo dela — `convidar` reaproveita o
 * usuário que já existe, e quem não pertencia a nenhuma organização
 * (qualquer assinante `pessoal`, e o admin) era adotado em silêncio: sem
 * aviso, sem aprovação, sem nem mudar de `orgId`. Com um vínculo pendente a
 * profissional lia o prontuário inteiro, gerava plano no nome da pessoa,
 * ARQUIVAVA o plano ativo dela e gravava nota clínica.
 *
 * O consentimento é o aceite: `aceitarConvites` passa o vínculo de
 * `pendente` para `ativo` quando a pessoa define a senha pelo link do
 * convite, ou quando aceita o convite já tendo conta. Até lá a profissional
 * vê a pessoa na lista — com o nome que ela mesma digitou — e nada além.
 *
 * O assento continua contado por `VINCULO_VIVO`: convite feito já reserva a
 * vaga, senão a conta estoura no dia em que todos aceitarem.
 */
export const VINCULO_COM_ACESSO = ["ativo"] as const;

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
/**
 * Dias de folga depois do fim do período pago.
 *
 * `ativa` e `atrasada` liberavam o acesso SEM olhar `current_period_end`, e
 * nada no sistema muda `ativa` para `expirada` — não há cron nem rotina que
 * faça isso; só o webhook do provedor, quando ele vem. Então um mês pago
 * valia acesso para sempre, e no Pix nem existe o webhook (a cobrança é
 * avulsa, sem `preapproval`): R$ 39,90 uma vez e pronto.
 *
 * A folga existe porque cobrança falha por motivo bobo — cartão trocado,
 * limite do dia — e cortar na hora é a forma mais rápida de perder cliente
 * que ia pagar. Depois dela, acabou.
 */
export const CARENCIA_POS_VENCIMENTO_DIAS = 7;

/** O período pago desta assinatura ainda cobre hoje (com a folga)? */
function vigente(s: Assinatura, agora = Date.now()): boolean {
  /* Sem data de fim, não há o que vencer: é o registro de parceria (preço
     zero) e a assinatura que ainda espera o primeiro webhook. */
  if (!s.currentPeriodEnd) return true;
  return s.currentPeriodEnd.getTime() + CARENCIA_POS_VENCIMENTO_DIAS * 86_400_000 > agora;
}

export async function assinaturaDeAcesso(usuario: Usuario): Promise<Assinatura | null> {
  const propria = await db.buscar(subscriptions, { userId: usuario.id }, { ordem: { campo: "createdAt", dir: "desc" } });
  const viva = propria.find((s) => (STATUS_QUE_LIBERAM as readonly string[]).includes(s.status) && vigente(s));
  if (viva) return viva;

  /* Paciente coberto pelo plano do consultório.
     ---------------------------------------------------------------------
     Aqui morava um furo de receita grande, porque `subscriptions.org_id`
     tem DOIS significados no código:

       - no checkout e na comissão, é "a academia que INDICOU esta venda";
       - aqui, era lido como "a organização que PAGA pelos membros dela".

     Como todo aluno tem `users.org_id` = academia, este trecho achava
     qualquer assinatura viva com aquele `org_id` — a assinatura PESSOAL de
     um colega — e liberava o acesso. Resultado: a academia convidava gente
     (até 2000 assentos) e cada convidado usava o app pago de graça, sem
     gerar comissão; e aluno que parava de pagar continuava dentro, porque
     a assinatura de outro aluno o cobria. Pior ainda depois do registro de
     parceria: ele é uma assinatura viva de preço ZERO com `org_id` da
     academia, então liberava todos os alunos sem ninguém pagar nada.

     Duas condições fecham isso: só organização que PAGA por assento
     (consultório; academia é parceira, cada aluno paga o dele) e só a
     assinatura DO DONO da organização, nunca a de um membro. */
  if (usuario.orgId) {
    const org = await db.primeiro(organizations, { id: usuario.orgId });
    if (org && org.type === "nutricionista" && org.ownerUserId) {
      const doDono = await db.buscar(
        subscriptions,
        { userId: org.ownerUserId },
        { ordem: { campo: "createdAt", dir: "desc" } }
      );
      const vivaOrg = doDono.find((s) => (STATUS_QUE_LIBERAM as readonly string[]).includes(s.status));
      if (vivaOrg && vigente(vivaOrg)) return vivaOrg;
    }
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
    status: { in: VINCULO_COM_ACESSO }
  });
  if (direto) return direto;

  const profissional = await db.primeiro(users, { id: professionalId, deletedAt: null });
  if (!profissional?.orgId) return negar();

  const daOrg = await db.primeiro(careLinks, {
    orgId: profissional.orgId,
    memberUserId: memberId,
    status: { in: VINCULO_COM_ACESSO }
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

  const vinculo = await db.primeiro(careLinks, { memberUserId: memberId, status: { in: VINCULO_COM_ACESSO } });
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
