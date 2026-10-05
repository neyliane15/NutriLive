/* =========================================================================
   Nutri&Live — esquema do banco (PostgreSQL via Drizzle)

   Três perfis pagantes e dois perfis vinculados:
     pessoal        assina para si
     nutricionista  assina e traz pacientes (vinculados, sem assinatura própria)
     academia       assina e traz alunos    (vinculados, sem assinatura própria)
     paciente/aluno acessam o app pelo vínculo com a organização
     admin          o nosso time, enxerga tudo
   ========================================================================= */
import {
  pgTable, pgEnum, uuid, text, varchar, timestamp, integer, boolean,
  jsonb, date, index, uniqueIndex, primaryKey
} from "drizzle-orm/pg-core";

/* ---------------------------------- enums -------------------------------- */
export const userRole = pgEnum("user_role", [
  "admin", "pessoal", "nutricionista", "academia", "paciente", "aluno"
]);
export const userStatus = pgEnum("user_status", ["convidado", "ativo", "suspenso"]);
export const orgType = pgEnum("org_type", ["nutricionista", "academia"]);
export const subStatus = pgEnum("sub_status", [
  "pendente", "ativa", "atrasada", "cancelada", "expirada"
]);
export const payMethod = pgEnum("pay_method", ["credito", "debito", "pix"]);
export const payStatus = pgEnum("pay_status", [
  "pendente", "aprovado", "recusado", "estornado", "cancelado"
]);
export const planSource = pgEnum("plan_source", ["ia", "nutricionista"]);
export const planStatus = pgEnum("plan_status", ["rascunho", "enviado", "ativo", "arquivado"]);
export const mealKind = pgEnum("meal_kind", [
  "cafe", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"
]);
export const linkStatus = pgEnum("link_status", ["pendente", "ativo", "encerrado"]);
export const aiKind = pgEnum("ai_kind", ["plano", "receita", "lista_compras", "analise"]);
export const aiStatus = pgEnum("ai_status", ["fila", "processando", "concluido", "erro"]);
export const commissionStatus = pgEnum("commission_status", ["prevista", "apurada", "paga"]);

/* ------------------------------ organizações ----------------------------- */
export const organizations = pgTable("organizations", {
  id: uuid("id").primaryKey().defaultRandom(),
  type: orgType("type").notNull(),
  name: text("name").notNull(),
  slug: varchar("slug", { length: 64 }).notNull(),
  ownerUserId: uuid("owner_user_id"),
  seatLimit: integer("seat_limit").notNull().default(15),
  cityState: varchar("city_state", { length: 120 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  slugIdx: uniqueIndex("organizations_slug_idx").on(t.slug)
}));

/* --------------------------------- usuários ------------------------------ */
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 320 }).notNull(),
  passwordHash: text("password_hash"),
  name: text("name").notNull(),
  cpf: varchar("cpf", { length: 11 }),
  phone: varchar("phone", { length: 11 }),
  role: userRole("role").notNull().default("pessoal"),
  status: userStatus("status").notNull().default("convidado"),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
  crn: varchar("crn", { length: 24 }),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true })
}, (t) => ({
  emailIdx: uniqueIndex("users_email_idx").on(t.email),
  orgIdx: index("users_org_idx").on(t.orgId),
  roleIdx: index("users_role_idx").on(t.role)
}));

/* --------------------------------- sessões ------------------------------- */
export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ip: varchar("ip", { length: 45 }),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  tokenIdx: uniqueIndex("sessions_token_idx").on(t.tokenHash),
  userIdx: index("sessions_user_idx").on(t.userId)
}));

/* Tentativas falhas, para o limite de força bruta.
   ------------------------------------------------------------------------
   Mora no banco, e não em memória do processo, porque na Vercel cada
   requisição pode cair numa instância nova: um contador em memória conta
   até um e recomeça, e o limite de 5 tentativas por e-mail simplesmente
   não existe. Era o caso aqui.

   Uma linha por falha, em vez de um contador que se incrementa: append-only
   não tem corrida. Duas tentativas simultâneas inserem duas linhas e a
   contagem fica certa; com UPDATE de contador, as duas leriam 4 e
   gravariam 5. */
export const rateLimits = pgTable("rate_limits", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** `politica:chave` — ex. `login_email:maria@exemplo.com.br`. */
  bucket: varchar("bucket", { length: 400 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  bucketIdx: index("rate_limits_bucket_idx").on(t.bucket, t.createdAt)
}));

/* Token de uso único: primeiro acesso, redefinição de senha, convite. */
export const authTokens = pgTable("auth_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  purpose: varchar("purpose", { length: 32 }).notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  tokenIdx: uniqueIndex("auth_tokens_token_idx").on(t.tokenHash),
  userPurposeIdx: index("auth_tokens_user_purpose_idx").on(t.userId, t.purpose)
}));

/* -------------------------------- catálogo ------------------------------- */
export const plans = pgTable("plans", {
  key: varchar("key", { length: 32 }).primaryKey(),
  segment: varchar("segment", { length: 16 }).notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  priceCents: integer("price_cents").notNull(),
  seatLimit: integer("seat_limit").notNull().default(0),
  features: jsonb("features").$type<string[]>().notNull().default([]),
  featured: boolean("featured").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0)
});

/* ------------------------------- assinaturas ----------------------------- */
export const subscriptions = pgTable("subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  orgId: uuid("org_id").references(() => organizations.id, { onDelete: "set null" }),
  planKey: varchar("plan_key", { length: 32 }).notNull().references(() => plans.key),
  status: subStatus("status").notNull().default("pendente"),
  method: payMethod("method").notNull(),
  provider: varchar("provider", { length: 24 }).notNull().default("mercadopago"),
  providerSubId: varchar("provider_sub_id", { length: 128 }),
  priceCents: integer("price_cents").notNull(),
  couponCode: varchar("coupon_code", { length: 32 }),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  canceledAt: timestamp("canceled_at", { withTimezone: true }),
  cancelReason: text("cancel_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  userIdx: index("subscriptions_user_idx").on(t.userId),
  providerIdx: uniqueIndex("subscriptions_provider_idx").on(t.providerSubId),
  statusIdx: index("subscriptions_status_idx").on(t.status)
}));

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 24 }).notNull().default("mercadopago"),
  providerPaymentId: varchar("provider_payment_id", { length: 128 }),
  amountCents: integer("amount_cents").notNull(),
  method: payMethod("method").notNull(),
  status: payStatus("status").notNull().default("pendente"),
  brand: varchar("brand", { length: 24 }),
  last4: varchar("last4", { length: 4 }),
  pixQr: text("pix_qr"),
  pixExpiresAt: timestamp("pix_expires_at", { withTimezone: true }),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  providerIdx: uniqueIndex("payments_provider_idx").on(t.providerPaymentId),
  userIdx: index("payments_user_idx").on(t.userId)
}));

/* Idempotência de webhook: o mesmo evento pode chegar várias vezes. */
export const webhookEvents = pgTable("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: varchar("provider", { length: 24 }).notNull(),
  providerEventId: varchar("provider_event_id", { length: 128 }).notNull(),
  type: varchar("type", { length: 64 }).notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  eventIdx: uniqueIndex("webhook_events_event_idx").on(t.provider, t.providerEventId)
}));

/* --------------------------- perfil e acompanhamento --------------------- */
export const profiles = pgTable("profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  birthDate: date("birth_date"),
  sex: varchar("sex", { length: 16 }),
  heightCm: integer("height_cm"),
  goal: varchar("goal", { length: 32 }),
  activityLevel: varchar("activity_level", { length: 24 }),
  dietStyle: varchar("diet_style", { length: 32 }),
  restrictions: jsonb("restrictions").$type<string[]>().notNull().default([]),
  dislikes: jsonb("dislikes").$type<string[]>().notNull().default([]),
  kcalTarget: integer("kcal_target"),
  proteinTargetG: integer("protein_target_g"),
  waterTargetMl: integer("water_target_ml"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const measurements = pgTable("measurements", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
  weightKg: integer("weight_g"),
  waistCm: integer("waist_mm"),
  hipCm: integer("hip_mm"),
  armCm: integer("arm_mm"),
  bodyFatPct: integer("body_fat_bp"),
  note: text("note")
}, (t) => ({
  userIdx: index("measurements_user_idx").on(t.userId, t.takenAt)
}));

export const mealPlans = pgTable("meal_plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  createdByUserId: uuid("created_by_user_id").references(() => users.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  days: integer("days").notNull().default(1),
  kcalTarget: integer("kcal_target"),
  macros: jsonb("macros").$type<{ protein: number; carb: number; fat: number }>(),
  content: jsonb("content").notNull(),
  source: planSource("source").notNull().default("ia"),
  status: planStatus("status").notNull().default("rascunho"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  userIdx: index("meal_plans_user_idx").on(t.userId, t.createdAt)
}));

export const foodLogs = pgTable("food_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  meal: mealKind("meal").notNull(),
  description: text("description").notNull(),
  kcal: integer("kcal").notNull().default(0),
  proteinG: integer("protein_g").notNull().default(0),
  carbG: integer("carb_g").notNull().default(0),
  fatG: integer("fat_g").notNull().default(0),
  fromPlanId: uuid("from_plan_id").references(() => mealPlans.id, { onDelete: "set null" })
}, (t) => ({
  userIdx: index("food_logs_user_idx").on(t.userId, t.loggedAt)
}));

export const waterLogs = pgTable("water_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  loggedAt: timestamp("logged_at", { withTimezone: true }).notNull().defaultNow(),
  ml: integer("ml").notNull()
}, (t) => ({
  userIdx: index("water_logs_user_idx").on(t.userId, t.loggedAt)
}));

export const recipes = pgTable("recipes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  timeMin: integer("time_min"),
  kcal: integer("kcal"),
  macros: jsonb("macros").$type<{ protein: number; carb: number; fat: number }>(),
  ingredients: jsonb("ingredients").$type<string[]>().notNull().default([]),
  steps: jsonb("steps").$type<string[]>().notNull().default([]),
  matchPct: integer("match_pct"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  userIdx: index("recipes_user_idx").on(t.userId)
}));

export const shoppingLists = pgTable("shopping_lists", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  weekStart: date("week_start").notNull(),
  items: jsonb("items").$type<
    { group: string; name: string; qty: string; cents: number; done: boolean }[]
  >().notNull().default([]),
  estimatedCents: integer("estimated_cents").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  userWeekIdx: uniqueIndex("shopping_lists_user_week_idx").on(t.userId, t.weekStart)
}));

/* ------------------------- vínculo profissional ------------------------- */
export const careLinks = pgTable("care_links", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  professionalUserId: uuid("professional_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  memberUserId: uuid("member_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  status: linkStatus("status").notNull().default("pendente"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
  nextReturnAt: timestamp("next_return_at", { withTimezone: true })
}, (t) => ({
  pairIdx: uniqueIndex("care_links_pair_idx").on(t.professionalUserId, t.memberUserId),
  orgIdx: index("care_links_org_idx").on(t.orgId)
}));

export const clinicalNotes = pgTable("clinical_notes", {
  id: uuid("id").primaryKey().defaultRandom(),
  careLinkId: uuid("care_link_id").notNull().references(() => careLinks.id, { onDelete: "cascade" }),
  authorUserId: uuid("author_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  linkIdx: index("clinical_notes_link_idx").on(t.careLinkId, t.createdAt)
}));

export const invitations = pgTable("invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  invitedByUserId: uuid("invited_by_user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: varchar("email", { length: 320 }).notNull(),
  name: text("name").notNull().default(""),
  role: userRole("role").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  tokenIdx: uniqueIndex("invitations_token_idx").on(t.tokenHash),
  orgEmailIdx: index("invitations_org_email_idx").on(t.orgId, t.email)
}));

/* ------------------------------- comissões ------------------------------- */
export const commissions = pgTable("commissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  orgId: uuid("org_id").notNull().references(() => organizations.id, { onDelete: "cascade" }),
  subscriptionId: uuid("subscription_id").references(() => subscriptions.id, { onDelete: "set null" }),
  paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
  period: varchar("period", { length: 7 }).notNull(),
  baseCents: integer("base_cents").notNull(),
  rateBp: integer("rate_bp").notNull(),
  amountCents: integer("amount_cents").notNull(),
  status: commissionStatus("status").notNull().default("prevista"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  orgPeriodIdx: index("commissions_org_period_idx").on(t.orgId, t.period),
  /* Uma comissão por pagamento, garantida pelo banco. `comissao.ts` sempre
     afirmou que esta era a trava da idempotência; ela não existia, e
     webhook reentregue (ou a consulta de status que a tela do Pix faz em
     laço) pagava comissão duas vezes pelo mesmo dinheiro. */
  pagamentoIdx: uniqueIndex("commissions_payment_idx").on(t.paymentId)
}));

/* ----------------------------------- IA ---------------------------------- */
export const aiJobs = pgTable("ai_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id, { onDelete: "set null" }),
  kind: aiKind("kind").notNull(),
  status: aiStatus("status").notNull().default("fila"),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  n8nExecutionId: varchar("n8n_execution_id", { length: 64 }),
  error: text("error"),
  tokensIn: integer("tokens_in"),
  tokensOut: integer("tokens_out"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true })
}, (t) => ({
  userIdx: index("ai_jobs_user_idx").on(t.userId, t.createdAt),
  statusIdx: index("ai_jobs_status_idx").on(t.status)
}));

/* ------------------------------- auditoria ------------------------------- */
export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 64 }).notNull(),
  entity: varchar("entity", { length: 48 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }),
  meta: jsonb("meta"),
  ip: varchar("ip", { length: 45 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => ({
  actorIdx: index("audit_log_actor_idx").on(t.actorUserId, t.createdAt),
  entityIdx: index("audit_log_entity_idx").on(t.entity, t.entityId)
}));

/**
 * Registro das tabelas. Mantido à mão e, por isso, conferido por teste.
 *
 * Quem usa: a conferência do banco (`npm run db:conferir`) deriva daqui a
 * lista de tabelas que PRECISAM existir, o motor em memória monta uma
 * coleção por entrada, e `db.limpar()` só limpa o que está aqui. Tabela de
 * fora deste objeto existe no banco e é invisível para tudo isso — foi o
 * que aconteceu com `rateLimits`: o conferir dizia "as 21 tabelas estão
 * lá" num banco de 22, e teria aprovado um banco sem ela.
 *
 * test/schema.test.ts compara este objeto com os `pgTable` exportados do
 * arquivo e reprova quando um fica de fora.
 */
export const schema = {
  organizations, users, sessions, authTokens, plans, subscriptions, payments,
  webhookEvents, profiles, measurements, mealPlans, foodLogs, waterLogs,
  recipes, shoppingLists, careLinks, clinicalNotes, invitations, commissions,
  aiJobs, auditLog, rateLimits
};
