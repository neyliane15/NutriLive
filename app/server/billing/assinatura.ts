/* =========================================================================
   Nutri&Live — contratação, cancelamento e faturas

   O fluxo de contratação, em ordem:
     1. valida plano x segmento e aplica cupom
     2. resolve o usuário (e-mail novo, e-mail já cadastrado, checkout
        abandonado que pode ser retomado)
     3. grava NUMA TRANSAÇÃO: usuário + organização + assinatura + pagamento
     4. cobra no provedor (fora da transação, para não existir cobrança órfã)
     5. aprovado -> acesso liberado na hora + e-mail de primeiro acesso
        recusado -> nada liberado, e-mail explicando
        Pix       -> BR Code devolvido e e-mail com o código
   ========================================================================= */
import { db, schema, bancoPronto } from "../db/index.js";
import type { Linha } from "../db/index.js";
import { AppError } from "../lib/http.js";
import { log } from "../lib/log.js";
import type { PayMethod, Segment } from "../../shared/contract.js";
import { PLANOS, acharCupom, precificar } from "./planos.js";
import { provedor } from "./provedor.js";
import type { PedidoCobranca } from "./provedor.js";
import { aplicarPagamentoAprovado, aplicarPagamentoRecusado, acessoVigente } from "./acesso.js";
import { enviarEmail, emailCancelamento, emailPagamentoRecusado, emailPixPendente } from "./email.js";
import { gerarSlug, normalizarEmail, soDigitos } from "./nucleo.js";
import { emTransacao } from "./unidade.js";
import { ligarWebhookSimulado } from "./webhook.js";

type Plano = Linha<typeof schema.plans>;
type Assinatura = Linha<typeof schema.subscriptions>;
type Pagamento = Linha<typeof schema.payments>;

/* ----------------------------- catálogo --------------------------------- */
/**
 * Garante que a tabela `plans` tem o catálogo. O seed de BE-1 é a fonte;
 * isto só preenche buraco, para o checkout não quebrar enquanto o seed não
 * existir. Inserção faltante só — nunca sobrescreve preço do seed.
 */
export async function garantirPlanos(): Promise<void> {
  await bancoPronto();
  const existentes = await db.buscar(schema.plans);
  const chaves = new Set(existentes.map((p) => p.key));
  const faltando = PLANOS.filter((p) => !chaves.has(p.key));
  if (!faltando.length) return;
  for (const plano of faltando) {
    try {
      await db.inserir(schema.plans, plano);
    } catch (e) {
      log.debug(`catálogo: plano ${plano.key} já existia`, e);
    }
  }
}

export async function listarPlanos(segment: Segment): Promise<Plano[]> {
  await garantirPlanos();
  const planos = await db.buscar(
    schema.plans,
    { segment, active: true },
    { ordem: { campo: "sortOrder", dir: "asc" } }
  );
  return planos;
}

async function exigirPlano(planKey: string, segment: Segment): Promise<Plano> {
  await garantirPlanos();
  const plano = await db.primeiro(schema.plans, { key: planKey });
  if (!plano || !plano.active) {
    throw new AppError("nao_encontrado", "Esse plano não está disponível.", { planKey: "Plano inválido." });
  }
  if (plano.segment !== segment) {
    throw new AppError("dados_invalidos", "Esse plano não é do segmento escolhido.", {
      planKey: `O plano ${plano.name} pertence a outro segmento.`
    });
  }
  return plano;
}

/* ----------------------------- contratação ------------------------------ */
export interface EntradaContratacao {
  segment: Segment;
  planKey: string;
  method: PayMethod;
  coupon?: string | undefined;
  customer: { name: string; email: string; cpf: string; phone: string };
  org?: { name: string; cityState?: string | undefined } | undefined;
  cardToken?: string | undefined;
  acceptedTerms: true;
}

export interface SaidaContratacao {
  subscriptionId: string;
  status: Assinatura["status"];
  pix?: { qrCode: string; qrCodeBase64?: string; expiresAt: string; paymentId: string };
  nextStep: "acesso_liberado" | "aguardando_pix" | "aguardando_emissor" | "recusado";
  message: string;
}

const PAPEL_DO_SEGMENTO: Record<Segment, "pessoal" | "nutricionista" | "academia"> = {
  pessoal: "pessoal",
  nutricionista: "nutricionista",
  academia: "academia"
};

/** Slug livre a partir do nome, com sufixo quando já existe. */
async function slugLivre(nome: string): Promise<string> {
  const base = gerarSlug(nome);
  for (let i = 0; i < 50; i++) {
    const tentativa = i === 0 ? base : `${base}-${i + 1}`;
    const existe = await db.primeiro(schema.organizations, { slug: tentativa });
    if (!existe) return tentativa;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * O cupom serve a dois propósitos, e os dois são do contrato:
 * desconto (tabela CUPONS) e link de indicação de academia (slug da org).
 */
async function academiaIndicadora(codigo?: string): Promise<string | null> {
  if (!codigo) return null;
  const slug = gerarSlug(codigo);
  const org = await db.primeiro(schema.organizations, { slug });
  return org && org.type === "academia" ? org.id : null;
}

export async function contratar(entrada: EntradaContratacao, ip: string | null): Promise<SaidaContratacao> {
  /* Academia não assina: o programa é de parceria por indicação, aprovado
     por nós depois do formulário. Sem este recado, quem chegasse com
     ?seg=academia receberia "Plano inválido" — tecnicamente verdade (o
     plano de parceria é inativo justamente para fechar esta porta) e
     inútil para quem só quer saber como entrar. */
  if (entrada.segment === "academia") {
    throw new AppError(
      "dados_invalidos",
      "Academia não assina plano: o programa é de parceria, com comissão por aluno. Faça o cadastro em academias.html e nós respondemos.",
      { segment: "Use o formulário de parceria." }
    );
  }

  const plano = await exigirPlano(entrada.planKey, entrada.segment);
  const cupom = acharCupom(entrada.coupon);
  const { primeiraCents, recorrenteCents } = precificar(plano.priceCents, cupom);

  const email = normalizarEmail(entrada.customer.email);
  const cpf = soDigitos(entrada.customer.cpf);
  const telefone = soDigitos(entrada.customer.phone);

  if (entrada.segment === "nutricionista" && !entrada.org?.name) {
    throw new AppError("dados_invalidos", "Informe o nome da organização.", {
      "org.name": "Nome do consultório."
    });
  }
  if (entrada.method !== "pix" && !entrada.cardToken) {
    throw new AppError("dados_invalidos", "Faltou o cartão.", { cardToken: "Informe os dados do cartão." });
  }

  /* ---- 1. quem é essa pessoa ---------------------------------------- */
  const jaExiste = await db.primeiro(schema.users, { email });
  if (jaExiste) {
    const assinaturaAtual = await db.primeiro(
      schema.subscriptions, { userId: jaExiste.id }, { ordem: { campo: "createdAt", dir: "desc" } }
    );
    if (acessoVigente(assinaturaAtual)) {
      throw new AppError("conflito", "Esse e-mail já tem uma assinatura ativa. Entre na sua conta para trocar de plano.", {
        email: "Já existe assinatura ativa para este e-mail."
      });
    }
    /* Conta com senha definida: é login, não checkout público. */
    if (jaExiste.passwordHash !== null || jaExiste.status === "suspenso") {
      throw new AppError("email_em_uso", "Esse e-mail já tem conta no Nutri&Live. Entre para assinar.", {
        email: "E-mail já cadastrado."
      });
    }
    /* Convidado por uma organização não pode ser reaproveitado às cegas. */
    if (jaExiste.orgId !== null && entrada.segment !== "pessoal") {
      throw new AppError("email_em_uso", "Esse e-mail já está vinculado a uma organização.", {
        email: "E-mail já vinculado."
      });
    }
    /* Checkout abandonado: se houver Pix pendente igual, devolve o mesmo. */
    const pendente = assinaturaAtual && assinaturaAtual.status === "pendente" ? assinaturaAtual : null;
    if (pendente && pendente.planKey === plano.key && pendente.method === entrada.method) {
      const repetido = await pixPendenteDe(pendente);
      if (repetido) return repetido;
    }
  }

  const orgIndicadora = await academiaIndicadora(entrada.coupon);
  const papel = PAPEL_DO_SEGMENTO[entrada.segment];
  /* Só a nutricionista abre organização pelo checkout. A da academia é
     criada quando aprovamos a parceria, fora deste caminho. */
  const precisaOrg = entrada.segment === "nutricionista";
  const slug = precisaOrg ? await slugLivre(entrada.org?.name ?? entrada.customer.name) : null;

  /* ---- 2. grava tudo junto ------------------------------------------ */
  const criado = await emTransacao(async (u) => {
    const usuario = jaExiste ?? await u.inserir(schema.users, {
      email,
      name: entrada.customer.name.trim(),
      cpf,
      phone: telefone,
      role: papel,
      status: "convidado",
      mustChangePassword: true
    });

    let org: Linha<typeof schema.organizations> | null = null;
    if (precisaOrg && slug) {
      org = await u.inserir(schema.organizations, {
        type: "nutricionista",
        name: (entrada.org?.name ?? entrada.customer.name).trim(),
        slug,
        ownerUserId: usuario.id,
        seatLimit: plano.seatLimit,
        cityState: entrada.org?.cityState ?? null
      });
      await u.atualizar(schema.users, { id: usuario.id }, { orgId: org.id });
    }

    const assinatura = await u.inserir(schema.subscriptions, {
      userId: usuario.id,
      /* Organização da assinatura: a própria (nutri/academia) ou a academia
         que indicou (venda por link de parceiro). */
      orgId: org?.id ?? orgIndicadora,
      planKey: plano.key,
      status: "pendente",
      method: entrada.method,
      provider: (await provedor()).nome,
      priceCents: recorrenteCents,
      couponCode: cupom?.codigo ?? (orgIndicadora ? entrada.coupon?.toUpperCase() ?? null : null)
    });

    const pagamento = await u.inserir(schema.payments, {
      subscriptionId: assinatura.id,
      userId: usuario.id,
      provider: (await provedor()).nome,
      amountCents: primeiraCents,
      method: entrada.method,
      status: "pendente"
    });

    return { usuario, org, assinatura, pagamento };
  });

  await db.inserir(schema.auditLog, {
    actorUserId: null, action: "checkout_criado", entity: "subscription",
    entityId: criado.assinatura.id,
    meta: {
      planKey: plano.key, method: entrada.method, primeiraCents, recorrenteCents,
      cupom: cupom?.codigo ?? null, indicadoPor: orgIndicadora
    },
    ip
  });

  /* ---- 3. cobra no provedor ----------------------------------------- */
  const prov = await provedor();
  ligarWebhookSimulado();                /* o Pix simulado avisa por webhook */

  const pedido: PedidoCobranca = {
    referencia: criado.assinatura.id,
    planoKey: plano.key,
    planoNome: plano.name,
    valorCents: primeiraCents,
    recorrenteCents,
    metodo: entrada.method,
    cliente: { nome: criado.usuario.name, email, cpf, telefone },
    cardToken: entrada.cardToken,
    parcelas: 1
  };

  let resultado;
  try {
    resultado = entrada.method === "pix"
      ? await prov.criarPixAvulso(pedido)
      : await prov.criarAssinatura(pedido);
  } catch (e) {
    /* Cobrança não saiu: o pagamento fica com o motivo e nada é liberado. */
    const motivo = e instanceof AppError ? e.message : "Falha ao falar com o provedor de pagamento.";
    await db.atualizar(schema.payments, { id: criado.pagamento.id }, {
      status: "recusado", failureReason: motivo
    });
    throw e;
  }

  await db.atualizar(schema.payments, { id: criado.pagamento.id }, {
    providerPaymentId: resultado.providerPaymentId || null,
    brand: resultado.brand ?? null,
    last4: resultado.last4 ?? null,
    pixQr: resultado.pix?.qrCode ?? null,
    pixExpiresAt: resultado.pix?.expiraEm ?? null
  });
  if (resultado.providerSubId) {
    await db.atualizar(schema.subscriptions, { id: criado.assinatura.id }, {
      providerSubId: resultado.providerSubId
    });
  }

  /* ---- 4. desfecho --------------------------------------------------- */
  if (resultado.status === "aprovado") {
    await aplicarPagamentoAprovado(criado.pagamento.id);
    return {
      subscriptionId: criado.assinatura.id,
      status: "ativa",
      nextStep: "acesso_liberado",
      message: "Pagamento aprovado! Enviamos para o seu e-mail o link para criar a senha."
    };
  }

  if (resultado.status === "recusado") {
    const motivo = resultado.motivo ?? "o banco não autorizou a cobrança.";
    await aplicarPagamentoRecusado(criado.pagamento.id, motivo);
    await enviarEmail({ para: email, ...emailPagamentoRecusado(criado.usuario.name, motivo) });
    return {
      subscriptionId: criado.assinatura.id,
      status: "pendente",
      nextStep: "recusado",
      message: `Não deu: ${motivo} Nada foi cobrado — tente outro cartão ou pague por Pix.`
    };
  }

  if (resultado.pix) {
    await enviarEmail({
      para: email,
      ...emailPixPendente(criado.usuario.name, primeiraCents, resultado.pix.qrCode, resultado.pix.expiraEm)
    });
    return {
      subscriptionId: criado.assinatura.id,
      status: "pendente",
      nextStep: "aguardando_pix",
      pix: {
        qrCode: resultado.pix.qrCode,
        ...(resultado.pix.qrCodeBase64 ? { qrCodeBase64: resultado.pix.qrCodeBase64 } : {}),
        expiresAt: resultado.pix.expiraEm.toISOString(),
        paymentId: criado.pagamento.id
      },
      message: "Pix gerado. Assim que o pagamento cair, o acesso é liberado na hora."
    };
  }

  /* em análise: o emissor pediu autorização */
  return {
    subscriptionId: criado.assinatura.id,
    status: "pendente",
    nextStep: "aguardando_emissor",
    message: resultado.motivo
      ? `O banco está analisando: ${resultado.motivo} Avisamos por e-mail assim que sair.`
      : "O banco está analisando a cobrança. Avisamos por e-mail assim que sair."
  };
}

/** Pix pendente de uma assinatura, devolvido tal e qual para não cobrar duas vezes. */
async function pixPendenteDe(assinatura: Assinatura): Promise<SaidaContratacao | null> {
  if (assinatura.method !== "pix") return null;
  const pagamentos = await db.buscar(
    schema.payments,
    { subscriptionId: assinatura.id, status: "pendente" },
    { ordem: { campo: "createdAt", dir: "desc" }, limite: 1 }
  );
  const pagamento = pagamentos[0];
  if (!pagamento?.pixQr) return null;
  if (pagamento.pixExpiresAt && pagamento.pixExpiresAt <= new Date()) return null;
  log.info(`checkout: Pix pendente reaproveitado (${pagamento.id}) — sem cobrança nova`);
  return {
    subscriptionId: assinatura.id,
    status: assinatura.status,
    nextStep: "aguardando_pix",
    pix: {
      qrCode: pagamento.pixQr,
      expiresAt: (pagamento.pixExpiresAt ?? new Date(Date.now() + 30 * 60 * 1000)).toISOString(),
      paymentId: pagamento.id
    },
    message: "Esse Pix já estava gerado e continua valendo. Pague com ele para liberar o acesso."
  };
}

/* ------------------------- consulta do pagamento ------------------------ */
export async function situacaoDoPagamento(
  paymentId: string
): Promise<{ status: Pagamento["status"]; accessGranted: boolean }> {
  const pagamento = await db.primeiro(schema.payments, { id: paymentId });
  if (!pagamento) throw new AppError("nao_encontrado", "Pagamento não encontrado.");

  /* Pendente: pergunta ao provedor. É assim que o Pix da demonstração cai
     mesmo sem webhook externo chegando. */
  if (pagamento.status === "pendente" && pagamento.providerPaymentId) {
    const prov = await provedor();
    const consulta = await prov.consultarPagamento(pagamento.providerPaymentId);
    if (consulta.status === "aprovado") {
      await aplicarPagamentoAprovado(pagamento.id, { ...(consulta.pagoEm ? { pagoEm: consulta.pagoEm } : {}) });
    } else if (consulta.status === "recusado") {
      await aplicarPagamentoRecusado(pagamento.id, consulta.motivo ?? "o banco não autorizou a cobrança.");
    }
  }

  const atual = await db.primeiro(schema.payments, { id: paymentId });
  const assinatura = atual?.subscriptionId
    ? await db.primeiro(schema.subscriptions, { id: atual.subscriptionId })
    : null;
  return {
    status: atual?.status ?? "pendente",
    accessGranted: atual?.status === "aprovado" && acessoVigente(assinatura)
  };
}

/* ----------------------------- cancelamento ----------------------------- */
export async function cancelarAssinatura(
  userId: string, motivo?: string
): Promise<{ accessUntil: string | null }> {
  const assinatura = await db.primeiro(
    schema.subscriptions, { userId }, { ordem: { campo: "createdAt", dir: "desc" } }
  );
  if (!assinatura) throw new AppError("nao_encontrado", "Você não tem assinatura ativa.");
  if (assinatura.status === "cancelada") {
    return { accessUntil: assinatura.currentPeriodEnd?.toISOString() ?? null };
  }

  /* Corta a recorrência no provedor antes de mexer no nosso estado: se
     falhar, a pessoa não fica cancelada aqui e cobrada lá. */
  if (assinatura.providerSubId) {
    const prov = await provedor();
    await prov.cancelarAssinatura(assinatura.providerSubId);
  }

  await db.atualizar(schema.subscriptions, { id: assinatura.id }, {
    status: "cancelada",
    canceledAt: new Date(),
    cancelReason: motivo ?? null
  });

  /* O acesso NÃO é cortado agora: vai até o fim do período já pago. */
  const usuario = await db.primeiro(schema.users, { id: userId });
  if (usuario) {
    await enviarEmail({
      para: usuario.email,
      ...emailCancelamento(usuario.name, assinatura.currentPeriodEnd)
    });
  }
  await db.inserir(schema.auditLog, {
    actorUserId: userId, action: "assinatura_cancelada", entity: "subscription",
    entityId: assinatura.id, meta: { motivo: motivo ?? null, acessoAte: assinatura.currentPeriodEnd }
  });

  log.info(`assinatura ${assinatura.id} cancelada; acesso até ${assinatura.currentPeriodEnd?.toISOString() ?? "agora"}`);
  return { accessUntil: assinatura.currentPeriodEnd?.toISOString() ?? null };
}

/* -------------------------------- faturas ------------------------------- */
export async function faturasDoUsuario(userId: string): Promise<{
  id: string; amountCents: number; method: PayMethod; status: string;
  paidAt: string | null; createdAt: string;
}[]> {
  const pagamentos = await db.buscar(
    schema.payments, { userId }, { ordem: { campo: "createdAt", dir: "desc" }, limite: 60 }
  );
  return pagamentos.map((p) => ({
    id: p.id,
    amountCents: p.amountCents,
    method: p.method,
    status: p.status,
    paidAt: p.paidAt ? p.paidAt.toISOString() : null,
    createdAt: p.createdAt.toISOString()
  }));
}

/** Assinatura corrente do usuário, para a tela de conta e para os guardas. */
export async function assinaturaDoUsuario(userId: string): Promise<Assinatura | null> {
  return db.primeiro(schema.subscriptions, { userId }, { ordem: { campo: "createdAt", dir: "desc" } });
}
