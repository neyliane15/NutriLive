/* =========================================================================
   Nutri&Live — utilidades compartilhadas da cobrança
   Datas de período, dinheiro, slug, hash de token e período de competência.
   ========================================================================= */
import { createHash, randomBytes } from "node:crypto";
import { chaveDoDia } from "../lib/datas.js";

/** Fim do próximo ciclo mensal. Dia 31 em mês curto cai no último dia do mês. */
export function fimDoPeriodo(de: Date = new Date()): Date {
  const d = new Date(de.getTime());
  const dia = d.getDate();
  d.setMonth(d.getMonth() + 1);
  if (d.getDate() < dia) d.setDate(0);          /* volta para o último dia do mês */
  return d;
}

export const somarDias = (de: Date, dias: number): Date =>
  new Date(de.getTime() + dias * 24 * 60 * 60 * 1000);

/**
 * Competência no formato AAAA-MM, que é o que `commissions.period` guarda.
 *
 * Derivada de `chaveDoDia`, e não de `getFullYear()/getMonth()`, porque
 * aquelas seguem o fuso do PROCESSO — UTC no contêiner — enquanto o resto do
 * app usa o fuso do produto (−03:00 fixo, `lib/datas.ts`). A diferença
 * aparecia nas últimas três horas de todo dia e de todo mês: um pagamento
 * aprovado às 22:30 de 31/10 no Brasil é 01/11 em UTC, então caía na
 * competência do mês seguinte — a comissão da academia aparecia um mês
 * atrasada na tela, e a receita entrava no mês errado no painel do admin.
 */
export const competencia = (quando: Date = new Date()): string => chaveDoDia(quando).slice(0, 7);

/** "AAAA-MM-DD" do dia brasileiro em que esse instante caiu. */
export const diaIso = (quando: Date): string => chaveDoDia(quando);

export const moeda = (cents: number): string =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Comissão em pontos-base, arredondada para centavo inteiro. */
export const aplicarBp = (baseCents: number, rateBp: number): number =>
  Math.round((baseCents * rateBp) / 10_000);

export const normalizarEmail = (email: string): string => email.trim().toLowerCase();
export const soDigitos = (v: string): string => v.replace(/\D/g, "");

/** Slug de organização: minúsculo, sem acento, sem símbolo. */
export function gerarSlug(nome: string): string {
  const base = nome
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 48);
  return base || "org";
}

/**
 * Token de uso único e o seu hash.
 *
 * ATENÇÃO À INTEGRAÇÃO: `auth_tokens.token_hash` é lido por
 * `POST /api/auth/first-access`, que é de BE-1. O algoritmo tem que ser o
 * mesmo nos dois lados. Aqui é SHA-256 do token cru, em hexadecimal — o
 * mais comum e o que `server/auth/tokens.ts` deve usar. Se BE-1 usar HMAC
 * com SESSION_SECRET, basta trocar esta função (um lugar só).
 */
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const novoToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
