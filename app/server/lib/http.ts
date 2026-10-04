/* Erros da API e utilidades de resposta. Todo erro sai no mesmo formato. */
import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import type { ErrorCode } from "../../shared/contract.js";
import { log } from "./log.js";

const STATUS: Record<ErrorCode, number> = {
  nao_autenticado: 401,
  sem_permissao: 403,
  nao_encontrado: 404,
  dados_invalidos: 422,
  email_em_uso: 409,
  credenciais_invalidas: 401,
  token_expirado: 410,
  limite_atingido: 409,
  assinatura_inativa: 402,
  pagamento_recusado: 402,
  conflito: 409,
  excesso_de_tentativas: 429,
  indisponivel: 503,
  erro_interno: 500
};

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: Record<string, string>
  ) {
    super(message);
    this.name = "AppError";
  }
  get status() { return STATUS[this.code]; }
}

export const fail = (code: ErrorCode, message: string, fields?: Record<string, string>): never => {
  throw new AppError(code, message, fields);
};

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof AppError) {
    return c.json({ error: { code: err.code, message: err.message, fields: err.fields } }, err.status as 400);
  }
  log.error("erro não tratado", err);
  return c.json(
    { error: { code: "erro_interno", message: "Algo quebrou do nosso lado. Já estamos sabendo." } },
    500
  );
};

export const notFound: NotFoundHandler = (c) =>
  c.req.path.startsWith("/api")
    ? c.json({ error: { code: "nao_encontrado", message: "Rota não encontrada." } }, 404)
    : c.html("<h1>404</h1><p>Página não encontrada.</p>", 404);

/** Valida o corpo com um schema do contrato e devolve tipado. */
export async function body<T>(c: Context, schema: { parse: (v: unknown) => T }): Promise<T> {
  let data: unknown;
  try {
    data = await c.req.json();
  } catch {
    fail("dados_invalidos", "Corpo da requisição não é um JSON válido.");
  }
  try {
    return schema.parse(data);
  } catch (e: any) {
    const fields: Record<string, string> = {};
    for (const issue of e?.issues ?? []) {
      fields[issue.path.join(".") || "_"] = issue.message;
    }
    throw new AppError("dados_invalidos", "Confira os campos destacados.", fields);
  }
}

export const clientIp = (c: Context): string =>
  c.req.header("cf-connecting-ip") ??
  c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
  "0.0.0.0";
