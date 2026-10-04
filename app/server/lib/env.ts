/* Leitura de ambiente com valores padrão seguros para desenvolvimento. */
const raw = process.env;

const required = (key: string, fallback?: string): string => {
  const v = raw[key] ?? fallback;
  if (v === undefined) throw new Error(`Variável de ambiente ausente: ${key}`);
  return v;
};

export const env = {
  NODE_ENV: raw.NODE_ENV ?? "development",
  PORT: raw.PORT ?? "8787",
  APP_URL: raw.APP_URL ?? "http://localhost:8787",
  SESSION_SECRET: required("SESSION_SECRET", "desenvolvimento-apenas-troque-em-producao-0001"),

  DATABASE_URL: raw.DATABASE_URL ?? "",
  /** Sem DATABASE_URL o sistema roda inteiro em memória, com o seed carregado. */
  DB_DRIVER: (raw.DATABASE_URL ? "postgres" : "memory") as "postgres" | "memory",

  MP_ACCESS_TOKEN: raw.MP_ACCESS_TOKEN ?? "",
  MP_PUBLIC_KEY: raw.MP_PUBLIC_KEY ?? "",
  MP_WEBHOOK_SECRET: raw.MP_WEBHOOK_SECRET ?? "",
  /** Sem token do Mercado Pago o checkout usa o provedor simulado. */
  PAY_DRIVER: (raw.MP_ACCESS_TOKEN ? "mercadopago" : "simulado") as "mercadopago" | "simulado",

  EMAIL_PROVIDER: raw.EMAIL_PROVIDER ?? "console",
  RESEND_API_KEY: raw.RESEND_API_KEY ?? "",
  EMAIL_FROM: raw.EMAIL_FROM ?? "Nutri&Live <oi@nutrielive.com.br>",

  N8N_BASE_URL: raw.N8N_BASE_URL ?? "",
  N8N_WEBHOOK_TOKEN: raw.N8N_WEBHOOK_TOKEN ?? "",
  /** Sem n8n a IA responde com um gerador local determinístico. */
  AI_DRIVER: (raw.N8N_BASE_URL ? "n8n" : "local") as "n8n" | "local",

  COMMISSION_RATE_BP: Number(raw.COMMISSION_RATE_BP ?? 2000)
};

export const isProd = env.NODE_ENV === "production";
