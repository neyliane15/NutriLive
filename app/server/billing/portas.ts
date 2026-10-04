/* =========================================================================
   Nutri&Live — portas da cobrança

   A cobrança não fala com o Drizzle direto: fala com este repositório.
   Existem duas implementações:
     repo-memoria.ts  roda sem Postgres (demonstração e teste)
     repo-pg.ts       roda sobre o Drizzle de server/db/index.ts

   Assim o fluxo de dinheiro é testável de ponta a ponta sem banco e sem rede.
   ========================================================================= */
import type { PayMethod, Role, Segment, SubStatus } from "../../shared/contract.js";

export type StatusPagamento = "pendente" | "aprovado" | "recusado" | "estornado" | "cancelado";
export type StatusUsuario = "convidado" | "ativo" | "suspenso";
export type TipoOrg = "nutricionista" | "academia";

/* -------------------------------- registros ------------------------------ */
export interface Usuario {
  id: string;
  email: string;
  name: string;
  cpf: string | null;
  phone: string | null;
  role: Role;
  status: StatusUsuario;
  orgId: string | null;
  mustChangePassword: boolean;
  lastLoginAt: Date | null;
  createdAt: Date;
}

export interface Organizacao {
  id: string;
  type: TipoOrg;
  name: string;
  slug: string;
  ownerUserId: string | null;
  seatLimit: number;
  cityState: string | null;
  createdAt: Date;
}

export interface Plano {
  key: string;
  segment: Segment;
  name: string;
  description: string;
  priceCents: number;
  seatLimit: number;
  features: string[];
  featured: boolean;
  active: boolean;
  sortOrder: number;
}

export interface Assinatura {
  id: string;
  userId: string;
  orgId: string | null;
  planKey: string;
  status: SubStatus;
  method: PayMethod;
  provider: string;
  providerSubId: string | null;
  priceCents: number;
  couponCode: string | null;
  currentPeriodEnd: Date | null;
  canceledAt: Date | null;
  cancelReason: string | null;
  createdAt: Date;
}

export interface Pagamento {
  id: string;
  subscriptionId: string | null;
  userId: string;
  provider: string;
  providerPaymentId: string | null;
  amountCents: number;
  method: PayMethod;
  status: StatusPagamento;
  brand: string | null;
  last4: string | null;
  pixQr: string | null;
  pixExpiresAt: Date | null;
  paidAt: Date | null;
  failureReason: string | null;
  createdAt: Date;
}

export interface EventoWebhook {
  id: string;
  provider: string;
  providerEventId: string;
  type: string;
  payload: unknown;
  processedAt: Date | null;
  error: string | null;
  receivedAt: Date;
}

export interface Comissao {
  id: string;
  orgId: string;
  subscriptionId: string | null;
  paymentId: string | null;
  period: string;
  baseCents: number;
  rateBp: number;
  amountCents: number;
  status: "prevista" | "apurada" | "paga";
  paidAt: Date | null;
  createdAt: Date;
}

export interface LinhaAuditoria {
  id: string;
  actorUserId: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: Date;
}

/* ------------------------------- parâmetros ------------------------------ */
export interface NovoUsuario {
  email: string;
  name: string;
  cpf?: string | null;
  phone?: string | null;
  role: Role;
  status: StatusUsuario;
  orgId?: string | null;
  mustChangePassword?: boolean;
}

export interface NovaOrganizacao {
  type: TipoOrg;
  name: string;
  slug: string;
  ownerUserId?: string | null;
  seatLimit: number;
  cityState?: string | null;
}

export interface NovaAssinatura {
  userId: string;
  orgId?: string | null;
  planKey: string;
  status: SubStatus;
  method: PayMethod;
  provider: string;
  providerSubId?: string | null;
  priceCents: number;
  couponCode?: string | null;
  currentPeriodEnd?: Date | null;
}

export interface NovoPagamento {
  subscriptionId?: string | null;
  userId: string;
  provider: string;
  providerPaymentId?: string | null;
  amountCents: number;
  method: PayMethod;
  status: StatusPagamento;
  brand?: string | null;
  last4?: string | null;
  pixQr?: string | null;
  pixExpiresAt?: Date | null;
  paidAt?: Date | null;
  failureReason?: string | null;
}

export interface NovaComissao {
  orgId: string;
  subscriptionId?: string | null;
  paymentId?: string | null;
  period: string;
  baseCents: number;
  rateBp: number;
  amountCents: number;
}

export interface NovoTokenAuth {
  userId: string;
  purpose: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface NovaSessao {
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  ip?: string | null;
  userAgent?: string | null;
}

export interface FiltroUsuarios {
  q?: string | undefined;
  role?: Role | undefined;
  status?: string | undefined;
  page: number;
  porPagina: number;
}

export interface UsuarioComAssinatura extends Usuario {
  orgName: string | null;
  planKey: string | null;
  subStatus: SubStatus | null;
}

export interface PagamentoComUsuario extends Pagamento {
  userName: string;
  userEmail: string;
}

/* ------------------------------ o repositório ---------------------------- */
export interface RepositorioCobranca {
  /** Roda tudo ou nada. No modo memória o desfazer é por diário de reversão. */
  transacao<T>(fn: (repo: RepositorioCobranca) => Promise<T>): Promise<T>;

  /* usuários */
  acharUsuarioPorEmail(email: string): Promise<Usuario | null>;
  buscarUsuario(id: string): Promise<Usuario | null>;
  criarUsuario(dados: NovoUsuario): Promise<Usuario>;
  atualizarUsuario(id: string, patch: Partial<Usuario>): Promise<Usuario>;
  listarUsuarios(filtro: FiltroUsuarios): Promise<{ total: number; usuarios: UsuarioComAssinatura[] }>;
  contarUsuariosPorPapel(): Promise<Record<string, number>>;
  cadastrosPorDia(dias: number): Promise<{ day: string; count: number }[]>;

  /* organizações */
  criarOrganizacao(dados: NovaOrganizacao): Promise<Organizacao>;
  buscarOrganizacao(id: string): Promise<Organizacao | null>;
  acharOrganizacaoPorSlug(slug: string): Promise<Organizacao | null>;

  /* planos */
  listarPlanos(segment: Segment): Promise<Plano[]>;
  buscarPlano(key: string): Promise<Plano | null>;

  /* assinaturas */
  criarAssinatura(dados: NovaAssinatura): Promise<Assinatura>;
  buscarAssinatura(id: string): Promise<Assinatura | null>;
  assinaturaPorProviderSubId(provider: string, providerSubId: string): Promise<Assinatura | null>;
  assinaturaDoUsuario(userId: string): Promise<Assinatura | null>;
  atualizarAssinatura(id: string, patch: Partial<Assinatura>): Promise<Assinatura>;
  listarAssinaturasPorStatus(status: SubStatus[]): Promise<Assinatura[]>;
  canceladasNoMes(periodo: string): Promise<number>;

  /* pagamentos */
  criarPagamento(dados: NovoPagamento): Promise<Pagamento>;
  buscarPagamento(id: string): Promise<Pagamento | null>;
  pagamentoPorProviderId(provider: string, providerPaymentId: string): Promise<Pagamento | null>;
  atualizarPagamento(id: string, patch: Partial<Pagamento>): Promise<Pagamento>;
  pagamentosDaAssinatura(subscriptionId: string): Promise<Pagamento[]>;
  pagamentosDoUsuario(userId: string): Promise<Pagamento[]>;
  listarPagamentos(filtro: { status?: string | undefined; page: number; porPagina: number }):
    Promise<{ total: number; pagamentos: PagamentoComUsuario[] }>;
  receitaPorMes(meses: number): Promise<{ period: string; cents: number }[]>;

  /* webhooks */
  /** Insere com unicidade em (provider, provider_event_id). `novo: false` = repetido. */
  registrarEventoWebhook(dados: { provider: string; providerEventId: string; type: string; payload: unknown }):
    Promise<{ evento: EventoWebhook; novo: boolean }>;
  marcarEventoProcessado(id: string, erro?: string | null): Promise<void>;
  listarEventosWebhook(limite: number): Promise<EventoWebhook[]>;

  /* comissões */
  criarComissao(dados: NovaComissao): Promise<Comissao>;
  comissaoPorPagamento(paymentId: string): Promise<Comissao | null>;
  comissoesDaOrganizacao(orgId: string): Promise<Comissao[]>;

  /* tokens, sessões e auditoria */
  criarTokenAuth(dados: NovoTokenAuth): Promise<{ id: string }>;
  criarSessao(dados: NovaSessao): Promise<{ id: string }>;
  sessaoPorTokenHash(hash: string): Promise<{ userId: string; expiresAt: Date } | null>;
  registrarAuditoria(dados: Omit<LinhaAuditoria, "id" | "createdAt">): Promise<void>;
  listarAuditoria(page: number, porPagina: number): Promise<LinhaAuditoria[]>;

  /* IA — só leitura, para o painel do admin */
  estatisticasIa(): Promise<{ last24h: number; errorRate: number }>;
}

/* --------------------------------- e-mail -------------------------------- */
export interface Mensagem {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}
export interface EnviadorEmail {
  enviar(msg: Mensagem): Promise<void>;
}
