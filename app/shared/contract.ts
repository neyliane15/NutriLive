/* =========================================================================
   Nutri&Live — contrato da API
   Fonte única da verdade entre servidor e front. Todo agente implementa
   contra este arquivo; quem precisar de um endpoint novo acrescenta aqui
   PRIMEIRO e avisa, para os dois lados não divergirem.

   Convenções:
   - Dinheiro sempre em centavos (inteiro). Nunca float.
   - Datas sempre ISO-8601 com fuso.
   - Resposta de erro sempre { error: { code, message, fields? } }.
   - Rotas de app vivem sob /api; páginas renderizadas no servidor não.
   ========================================================================= */
import { z } from "zod";

/* ------------------------------- primitivos ------------------------------ */
export const uuid = z.string().uuid();
export const email = z.string().email().max(320);
export const cents = z.number().int().nonnegative();
export const isoDate = z.string().datetime({ offset: true });

export const Role = z.enum(["admin", "pessoal", "nutricionista", "academia", "paciente", "aluno"]);
export const Segment = z.enum(["pessoal", "nutricionista", "academia"]);
export const PayMethod = z.enum(["credito", "debito", "pix"]);
export const SubStatus = z.enum(["pendente", "ativa", "atrasada", "cancelada", "expirada"]);

export type Role = z.infer<typeof Role>;
export type Segment = z.infer<typeof Segment>;
export type PayMethod = z.infer<typeof PayMethod>;

/* --------------------------------- erros --------------------------------- */
export const ERROR_CODES = [
  "nao_autenticado", "sem_permissao", "nao_encontrado", "dados_invalidos",
  "email_em_uso", "credenciais_invalidas", "token_expirado", "limite_atingido",
  "assinatura_inativa", "pagamento_recusado", "conflito", "excesso_de_tentativas",
  "indisponivel", "erro_interno"
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

export const ApiError = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    fields: z.record(z.string()).optional()
  })
});
export type ApiError = z.infer<typeof ApiError>;

/* --------------------------------- sessão -------------------------------- */
export const MeOut = z.object({
  user: z.object({
    id: uuid,
    name: z.string(),
    email,
    role: Role,
    status: z.enum(["convidado", "ativo", "suspenso"]),
    orgId: uuid.nullable(),
    mustChangePassword: z.boolean()
  }),
  org: z.object({
    id: uuid, type: z.enum(["nutricionista", "academia"]),
    name: z.string(), seatLimit: z.number().int(), seatsUsed: z.number().int()
  }).nullable(),
  subscription: z.object({
    planKey: z.string(), planName: z.string(), status: SubStatus,
    priceCents: cents, method: PayMethod, currentPeriodEnd: isoDate.nullable()
  }).nullable()
});

/* ======================================================================== */
/*  AUTENTICAÇÃO                                                            */
/* ======================================================================== */
export const auth = {
  /** POST /api/auth/login */
  login: {
    in: z.object({ email, password: z.string().min(8).max(200) }),
    out: z.object({ ok: z.literal(true), redirect: z.string() })
  },
  /** POST /api/auth/logout */
  logout: { in: z.object({}), out: z.object({ ok: z.literal(true) }) },
  /** GET /api/auth/me */
  me: { in: z.object({}), out: MeOut },
  /** POST /api/auth/first-access  — define a senha vinda do e-mail pós-pagamento */
  firstAccess: {
    in: z.object({ token: z.string().min(20), password: z.string().min(8).max(200) }),
    out: z.object({ ok: z.literal(true), redirect: z.string() })
  },
  /** POST /api/auth/forgot */
  forgot: { in: z.object({ email }), out: z.object({ ok: z.literal(true) }) },
  /** POST /api/auth/reset */
  reset: {
    in: z.object({ token: z.string().min(20), password: z.string().min(8).max(200) }),
    out: z.object({ ok: z.literal(true) })
  },
  /** POST /api/auth/change-password */
  changePassword: {
    in: z.object({ current: z.string().min(8), next: z.string().min(8).max(200) }),
    out: z.object({ ok: z.literal(true) })
  }
};

/* ======================================================================== */
/*  ASSINATURA E PAGAMENTO                                                  */
/* ======================================================================== */
export const CheckoutIn = z.object({
  segment: Segment,
  planKey: z.string().min(2).max(32),
  method: PayMethod,
  coupon: z.string().max(32).optional(),
  customer: z.object({
    name: z.string().min(5).max(160),
    email,
    cpf: z.string().length(11),
    phone: z.string().min(10).max(11)
  }),
  /** Organização, obrigatória para nutricionista e academia. */
  org: z.object({ name: z.string().min(2).max(160), cityState: z.string().max(120).optional() }).optional(),
  /** Token do cartão gerado pelo SDK do provedor. O PAN nunca chega aqui. */
  cardToken: z.string().max(256).optional(),
  acceptedTerms: z.literal(true)
});

export const CheckoutOut = z.object({
  subscriptionId: uuid,
  status: SubStatus,
  /** Presente apenas quando method === "pix". */
  pix: z.object({
    qrCode: z.string(), qrCodeBase64: z.string().optional(),
    expiresAt: isoDate, paymentId: uuid
  }).optional(),
  /** Para cartão: já aprovado, ou aguardando desafio do emissor. */
  nextStep: z.enum(["acesso_liberado", "aguardando_pix", "aguardando_emissor", "recusado"]),
  message: z.string()
});

export const billing = {
  /** GET /api/plans?segment= */
  listPlans: {
    in: z.object({ segment: Segment }),
    out: z.object({
      plans: z.array(z.object({
        key: z.string(), name: z.string(), description: z.string(),
        priceCents: cents, seatLimit: z.number().int(),
        features: z.array(z.string()), featured: z.boolean()
      }))
    })
  },
  /** POST /api/checkout  — público; cria usuário + organização + assinatura */
  checkout: { in: CheckoutIn, out: CheckoutOut },
  /** GET /api/checkout/:paymentId/status — consulta do Pix enquanto espera */
  paymentStatus: {
    in: z.object({ paymentId: uuid }),
    out: z.object({ status: z.enum(["pendente", "aprovado", "recusado", "estornado", "cancelado"]), accessGranted: z.boolean() })
  },
  /** POST /api/webhooks/mercadopago — público, validado por assinatura */
  webhook: { in: z.any(), out: z.object({ ok: z.literal(true) }) },
  /** POST /api/subscription/cancel */
  cancel: { in: z.object({ reason: z.string().max(400).optional() }), out: z.object({ ok: z.literal(true), accessUntil: isoDate.nullable() }) },
  /** GET /api/subscription/invoices */
  invoices: {
    in: z.object({}),
    out: z.object({ invoices: z.array(z.object({
      id: uuid, amountCents: cents, method: PayMethod,
      status: z.string(), paidAt: isoDate.nullable(), createdAt: isoDate
    })) })
  }
};

/* ======================================================================== */
/*  APP — PESSOAL                                                           */
/* ======================================================================== */
export const Macros = z.object({ protein: z.number(), carb: z.number(), fat: z.number() });

export const me = {
  /** GET /api/me/today */
  today: {
    in: z.object({}),
    out: z.object({
      score: z.number().int().min(0).max(100),
      kcal: z.object({ consumed: z.number().int(), target: z.number().int() }),
      protein: z.object({ consumed: z.number().int(), target: z.number().int() }),
      waterMl: z.object({ consumed: z.number().int(), target: z.number().int() }),
      meals: z.array(z.object({
        id: uuid, meal: z.string(), description: z.string(),
        kcal: z.number().int(), loggedAt: isoDate
      })),
      nextMeal: z.object({ at: z.string(), title: z.string(), kcal: z.number().int() }).nullable()
    })
  },
  /** POST /api/me/food-log */
  logFood: {
    in: z.object({
      meal: z.enum(["cafe", "lanche_manha", "almoco", "lanche_tarde", "jantar", "ceia"]),
      description: z.string().min(2).max(240),
      kcal: z.number().int().nonnegative().optional(),
      macros: Macros.partial().optional()
    }),
    out: z.object({ id: uuid, kcal: z.number().int(), macros: Macros })
  },
  /** POST /api/me/water */
  logWater: { in: z.object({ ml: z.number().int().positive().max(5000) }), out: z.object({ totalMl: z.number().int() }) },
  /** GET /api/me/progress?range=7d|30d|3m|6m|1y */
  progress: {
    in: z.object({ range: z.enum(["7d", "30d", "3m", "6m", "1y"]) }),
    out: z.object({
      weight: z.array(z.object({ at: isoDate, kg: z.number() })),
      measurements: z.array(z.object({ at: isoDate, waist: z.number().nullable(), hip: z.number().nullable(), arm: z.number().nullable() })),
      streakDays: z.number().int(),
      loggedDays: z.number().int(),
      totalDays: z.number().int()
    })
  },
  /** POST /api/me/measurements */
  addMeasurement: {
    in: z.object({
      weightKg: z.number().positive().max(400).optional(),
      waistCm: z.number().positive().max(300).optional(),
      hipCm: z.number().positive().max(300).optional(),
      armCm: z.number().positive().max(150).optional(),
      note: z.string().max(400).optional()
    }),
    out: z.object({ id: uuid })
  },
  /** GET /api/me/shopping-list */
  shoppingList: {
    in: z.object({}),
    out: z.object({
      id: uuid.nullable(), weekStart: z.string(), estimatedCents: cents,
      items: z.array(z.object({ group: z.string(), name: z.string(), qty: z.string(), cents: cents, done: z.boolean() }))
    })
  },
  /** PATCH /api/me/shopping-list */
  toggleShoppingItem: { in: z.object({ index: z.number().int().nonnegative(), done: z.boolean() }), out: z.object({ ok: z.literal(true) }) },
  /** GET /api/me/profile  |  PUT /api/me/profile */
  getProfile: { in: z.object({}), out: z.record(z.any()) },
  saveProfile: {
    in: z.object({
      birthDate: z.string().optional(), sex: z.string().optional(),
      heightCm: z.number().int().optional(), goal: z.string().optional(),
      activityLevel: z.string().optional(), dietStyle: z.string().optional(),
      restrictions: z.array(z.string()).optional(), dislikes: z.array(z.string()).optional()
    }),
    out: z.object({ ok: z.literal(true), kcalTarget: z.number().int(), proteinTargetG: z.number().int(), waterTargetMl: z.number().int() })
  }
};

/* ======================================================================== */
/*  IA (via n8n)                                                            */
/* ======================================================================== */
export const ai = {
  /** POST /api/ai/meal-plan — enfileira; responde com o job */
  mealPlan: {
    in: z.object({
      days: z.union([z.literal(1), z.literal(3), z.literal(7)]),
      /** Nutricionista gerando para um paciente seu. */
      forUserId: uuid.optional(),
      notes: z.string().max(600).optional()
    }),
    out: z.object({ jobId: uuid, status: z.enum(["fila", "processando", "concluido", "erro"]) })
  },
  /** POST /api/ai/recipes */
  recipes: {
    in: z.object({ ingredients: z.string().min(3).max(300), maxMinutes: z.number().int().optional() }),
    out: z.object({ jobId: uuid, status: z.string() })
  },
  /** GET /api/ai/jobs/:id */
  job: {
    in: z.object({ id: uuid }),
    out: z.object({
      id: uuid, kind: z.string(), status: z.enum(["fila", "processando", "concluido", "erro"]),
      output: z.any().nullable(), error: z.string().nullable()
    })
  },
  /** POST /api/ai/callback — chamado pelo n8n, autenticado por N8N_WEBHOOK_TOKEN */
  callback: {
    in: z.object({
      jobId: uuid, status: z.enum(["concluido", "erro"]),
      output: z.any().optional(), error: z.string().optional(),
      executionId: z.string().optional(), tokensIn: z.number().optional(), tokensOut: z.number().optional()
    }),
    out: z.object({ ok: z.literal(true) })
  }
};

/* ======================================================================== */
/*  ORGANIZAÇÃO — nutricionista e academia                                  */
/* ======================================================================== */
export const org = {
  /** GET /api/org/members?status=&q= */
  listMembers: {
    in: z.object({ status: z.enum(["todos", "ativo", "convidado", "risco"]).default("todos"), q: z.string().max(80).optional() }),
    out: z.object({
      seatLimit: z.number().int(), seatsUsed: z.number().int(),
      members: z.array(z.object({
        userId: uuid, name: z.string(), email, status: z.string(),
        linkStatus: z.string(), adherencePct: z.number().int().nullable(),
        lastLogAt: isoDate.nullable(), nextReturnAt: isoDate.nullable(),
        riskLevel: z.enum(["ok", "atencao", "risco"])
      }))
    })
  },
  /** POST /api/org/members — convida uma pessoa */
  invite: {
    in: z.object({ name: z.string().min(2).max(160), email, note: z.string().max(300).optional() }),
    out: z.object({ userId: uuid, invitationId: uuid, seatsUsed: z.number().int() })
  },
  /** POST /api/org/members/bulk — importa por CSV colado */
  inviteBulk: {
    in: z.object({ rows: z.array(z.object({ name: z.string(), email })).max(500) }),
    out: z.object({
      created: z.number().int(), skipped: z.number().int(),
      errors: z.array(z.object({ email: z.string(), reason: z.string() }))
    })
  },
  /** DELETE /api/org/members/:userId — encerra o vínculo (não apaga a pessoa) */
  removeMember: { in: z.object({ userId: uuid }), out: z.object({ ok: z.literal(true), seatsUsed: z.number().int() }) },
  /** GET /api/org/members/:userId — ficha completa */
  member: {
    in: z.object({ userId: uuid }),
    out: z.object({
      user: z.object({ id: uuid, name: z.string(), email, status: z.string() }),
      profile: z.record(z.any()).nullable(),
      adherence: z.array(z.object({ weekStart: z.string(), pct: z.number().int() })),
      weight: z.array(z.object({ at: isoDate, kg: z.number() })),
      plans: z.array(z.object({ id: uuid, title: z.string(), status: z.string(), createdAt: isoDate })),
      notes: z.array(z.object({ id: uuid, body: z.string(), authorName: z.string(), createdAt: isoDate }))
    })
  },
  /** POST /api/org/members/:userId/notes */
  addNote: { in: z.object({ userId: uuid, body: z.string().min(1).max(4000) }), out: z.object({ id: uuid }) },
  /** POST /api/org/members/:userId/plan — envia um plano ao paciente/aluno */
  sendPlan: { in: z.object({ userId: uuid, planId: uuid }), out: z.object({ ok: z.literal(true) }) },
  /** GET /api/org/dashboard */
  dashboard: {
    in: z.object({}),
    out: z.object({
      seatsUsed: z.number().int(), seatLimit: z.number().int(),
      avgAdherencePct: z.number().int(), atRisk: z.number().int(),
      adherenceByWeek: z.array(z.object({ weekStart: z.string(), pct: z.number().int() })),
      needsAttention: z.array(z.object({ userId: uuid, name: z.string(), reason: z.string(), level: z.enum(["atencao", "risco"]) }))
    })
  }
};

/* ======================================================================== */
/*  ADMIN                                                                   */
/* ======================================================================== */
export const admin = {
  /** GET /api/admin/overview */
  overview: {
    in: z.object({}),
    out: z.object({
      mrrCents: cents, activeSubs: z.number().int(), trialing: z.number().int(),
      pastDue: z.number().int(), canceledThisMonth: z.number().int(),
      users: z.object({ total: z.number().int(), pessoal: z.number().int(), nutricionista: z.number().int(), academia: z.number().int(), vinculados: z.number().int() }),
      revenueByMonth: z.array(z.object({ period: z.string(), cents })),
      signupsByDay: z.array(z.object({ day: z.string(), count: z.number().int() })),
      aiJobs: z.object({ last24h: z.number().int(), errorRate: z.number() })
    })
  },
  /** GET /api/admin/users?q=&role=&status=&page= */
  listUsers: {
    in: z.object({ q: z.string().max(120).optional(), role: Role.optional(), status: z.string().optional(), page: z.number().int().min(1).default(1) }),
    out: z.object({
      total: z.number().int(), page: z.number().int(),
      users: z.array(z.object({
        id: uuid, name: z.string(), email, role: Role, status: z.string(),
        orgName: z.string().nullable(), planKey: z.string().nullable(),
        subStatus: SubStatus.nullable(), createdAt: isoDate, lastLoginAt: isoDate.nullable()
      }))
    })
  },
  /** PATCH /api/admin/users/:id */
  updateUser: {
    in: z.object({ id: uuid, status: z.enum(["ativo", "suspenso"]).optional(), role: Role.optional() }),
    out: z.object({ ok: z.literal(true) })
  },
  /** POST /api/admin/users/:id/impersonate — entra como o usuário, registrado em auditoria */
  impersonate: { in: z.object({ id: uuid }), out: z.object({ ok: z.literal(true), redirect: z.string() }) },
  /** GET /api/admin/payments?status=&page= */
  listPayments: {
    in: z.object({ status: z.string().optional(), page: z.number().int().min(1).default(1) }),
    out: z.object({
      total: z.number().int(),
      payments: z.array(z.object({
        id: uuid, userName: z.string(), userEmail: email, amountCents: cents,
        method: PayMethod, status: z.string(), paidAt: isoDate.nullable(), createdAt: isoDate
      }))
    })
  },
  /** POST /api/admin/payments/:id/refund */
  refund: { in: z.object({ id: uuid, reason: z.string().max(400) }), out: z.object({ ok: z.literal(true) }) },
  /** GET /api/admin/audit?page= */
  audit: {
    in: z.object({ page: z.number().int().min(1).default(1) }),
    out: z.object({ entries: z.array(z.object({
      id: uuid, actorName: z.string().nullable(), action: z.string(),
      entity: z.string(), entityId: z.string().nullable(), createdAt: isoDate, meta: z.any()
    })) })
  },
  /** GET /api/admin/webhooks — fila e falhas */
  webhooks: {
    in: z.object({}),
    out: z.object({ events: z.array(z.object({
      id: uuid, type: z.string(), processedAt: isoDate.nullable(),
      error: z.string().nullable(), receivedAt: isoDate
    })) })
  }
};

export const contract = { auth, billing, me, ai, org, admin };
export default contract;
