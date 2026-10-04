/* =========================================================================
   Nutri&Live — sessão

   Sessão de servidor, sem JWT: o cookie guarda um token aleatório de 32
   bytes e o banco guarda apenas o HMAC-SHA256 desse token (chave
   SESSION_SECRET). Quem roubar o banco não consegue montar um cookie
   válido, e nós podemos encerrar qualquer sessão na hora.

   Cookie: httpOnly, SameSite=Lax (precisa sobreviver ao retorno do
   Mercado Pago), Secure só em produção (localhost é http), Path=/.
   ========================================================================= */
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import type { Linha } from "../db/index.js";
import { env, isProd } from "../lib/env.js";
import { clientIp } from "../lib/http.js";

export const COOKIE_SESSAO = "nl_sessao";

/** 30 dias. Renova quando faltam menos de 7 para o fim. */
const DURACAO_MS = 30 * 24 * 60 * 60 * 1000;
const RENOVAR_QUANDO_FALTAR_MS = 7 * 24 * 60 * 60 * 1000;

export type Usuario = Linha<typeof users>;
export type Sessao = Linha<typeof sessions>;

export const digerir = (token: string): string =>
  createHmac("sha256", env.SESSION_SECRET).update(token).digest("hex");

const iguaisEmTempoConstante = (a: string, b: string): boolean => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

const gravarCookie = (c: Context, token: string, expiraEm: Date): void => {
  setCookie(c, COOKIE_SESSAO, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: isProd,
    path: "/",
    expires: expiraEm
  });
};

/** Cria a sessão, grava o cookie e devolve o registro. */
export async function criarSessao(c: Context, usuarioId: string): Promise<Sessao> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + DURACAO_MS);
  const sessao = await db.inserir(sessions, {
    userId: usuarioId,
    tokenHash: digerir(token),
    expiresAt,
    ip: clientIp(c).slice(0, 45),
    userAgent: (c.req.header("user-agent") ?? "").slice(0, 400)
  });
  gravarCookie(c, token, expiresAt);
  await db.atualizar(users, { id: usuarioId }, { lastLoginAt: new Date() });
  return sessao;
}

/**
 * Lê a sessão do cookie. Devolve `null` quando não há cookie, quando o
 * token não existe, quando expirou (e aí já apaga o registro) ou quando o
 * usuário foi removido.
 */
export async function lerSessao(c: Context): Promise<{ sessao: Sessao; usuario: Usuario } | null> {
  const token = getCookie(c, COOKIE_SESSAO);
  if (!token) return null;

  const alvo = digerir(token);
  const sessao = await db.primeiro(sessions, { tokenHash: alvo });
  if (!sessao || !iguaisEmTempoConstante(sessao.tokenHash, alvo)) return null;

  if (sessao.expiresAt.getTime() <= Date.now()) {
    await db.remover(sessions, { id: sessao.id });
    deleteCookie(c, COOKIE_SESSAO, { path: "/" });
    return null;
  }

  const usuario = await db.primeiro(users, { id: sessao.userId, deletedAt: null });
  if (!usuario) {
    await db.remover(sessions, { id: sessao.id });
    return null;
  }

  /* Renovação deslizante: quem usa todo dia não é expulso no dia 30. */
  if (sessao.expiresAt.getTime() - Date.now() < RENOVAR_QUANDO_FALTAR_MS) {
    const novaValidade = new Date(Date.now() + DURACAO_MS);
    await db.atualizar(sessions, { id: sessao.id }, { expiresAt: novaValidade });
    gravarCookie(c, token, novaValidade);
    sessao.expiresAt = novaValidade;
  }

  return { sessao, usuario };
}

/** Encerra a sessão do cookie atual. */
export async function encerrarSessao(c: Context): Promise<void> {
  const token = getCookie(c, COOKIE_SESSAO);
  if (token) await db.remover(sessions, { tokenHash: digerir(token) });
  deleteCookie(c, COOKIE_SESSAO, { path: "/" });
}

/** Encerra todas as sessões do usuário — usado na troca e na redefinição de senha. */
export async function encerrarTodasAsSessoes(usuarioId: string, exceto?: string): Promise<number> {
  const abertas = await db.buscar(sessions, { userId: usuarioId });
  let fechadas = 0;
  for (const s of abertas) {
    if (exceto && s.id === exceto) continue;
    fechadas += await db.remover(sessions, { id: s.id });
  }
  return fechadas;
}

/** Limpeza de sessões vencidas. Chamado de vez em quando pelas rotas de auth. */
export async function faxinaDeSessoes(): Promise<number> {
  return db.remover(sessions, { expiresAt: { lt: new Date() } });
}
