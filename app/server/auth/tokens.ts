/* =========================================================================
   Nutri&Live — tokens de uso único

   Um mesmo mecanismo serve aos três casos em que a pessoa chega por link
   de e-mail:

     primeiro_acesso  pagamento aprovado, ela define a senha e entra
     convite          nutricionista/academia cadastrou a pessoa
     redefinicao      ela esqueceu a senha

   O token em claro só existe dentro do link do e-mail. No banco fica o
   HMAC-SHA256 (chave SESSION_SECRET), igual à sessão. Ao ser usado o
   registro recebe `used_at` e nunca mais vale; criar um token novo do
   mesmo propósito invalida os anteriores, para não ficar link velho
   funcionando na caixa de entrada.
   ========================================================================= */
import { randomBytes } from "node:crypto";
import { db } from "../db/index.js";
import { authTokens } from "../db/schema.js";
import type { Linha } from "../db/index.js";
import { AppError } from "../lib/http.js";
import { digerir } from "./sessao.js";

export type Proposito = "primeiro_acesso" | "convite" | "redefinicao";

/** Validade de cada propósito, em milissegundos. */
export const VALIDADE: Record<Proposito, number> = {
  primeiro_acesso: 72 * 60 * 60 * 1000,   /* 72 h — o e-mail pós-pagamento pode esperar o fim de semana */
  convite: 14 * 24 * 60 * 60 * 1000,      /* 14 dias — paciente demora a ver e-mail do nutri */
  redefinicao: 60 * 60 * 1000             /* 1 h — janela curta, é o caso mais sensível */
};

export const horasDeValidade = (p: Proposito): number => Math.round(VALIDADE[p] / 3_600_000);
export const minutosDeValidade = (p: Proposito): number => Math.round(VALIDADE[p] / 60_000);

export type TokenCriado = { token: string; registro: Linha<typeof authTokens>; expiraEm: Date };

/**
 * Atalho que `billing/acesso.ts` procura por nome ao liberar o acesso depois do
 * pagamento. Sem ele, aquele módulo caía num plano B que gravava sha256(token)
 * enquanto `lerToken` procura por `digerir(token)` (HMAC com SESSION_SECRET) —
 * e o link do e-mail de primeiro acesso nunca era aceito. Este é o ponto único
 * onde o hash do token é decidido; nenhum outro módulo deve calculá-lo.
 */
export async function criarTokenPrimeiroAcesso(usuarioId: string): Promise<string> {
  const { token } = await criarToken(usuarioId, "primeiro_acesso");
  return token;
}

/** Cria o token, invalidando os anteriores do mesmo propósito. */
export async function criarToken(usuarioId: string, proposito: Proposito): Promise<TokenCriado> {
  await db.remover(authTokens, { userId: usuarioId, purpose: proposito, usedAt: null });

  const token = randomBytes(32).toString("base64url");
  const expiraEm = new Date(Date.now() + VALIDADE[proposito]);
  const registro = await db.inserir(authTokens, {
    userId: usuarioId,
    purpose: proposito,
    tokenHash: digerir(token),
    expiresAt: expiraEm
  });
  return { token, registro, expiraEm };
}

/**
 * Confere o token sem consumir. Serve para a tela de primeiro acesso dizer
 * "este link expirou" antes de pedir a senha.
 */
export async function lerToken(token: string, propositos: Proposito[]): Promise<Linha<typeof authTokens>> {
  const registro = await db.primeiro(authTokens, { tokenHash: digerir(token ?? "") });
  if (!registro || !propositos.includes(registro.purpose as Proposito)) {
    throw new AppError("token_expirado", "Este link não é válido. Peça um novo.", { token: "Link inválido." });
  }
  if (registro.usedAt) {
    throw new AppError("token_expirado", "Este link já foi usado. Peça um novo.", { token: "Link já usado." });
  }
  if (registro.expiresAt.getTime() <= Date.now()) {
    throw new AppError("token_expirado", "Este link expirou. Peça um novo.", { token: "Link expirado." });
  }
  return registro;
}

/** Confere e consome o token, devolvendo o id do usuário. */
export async function usarToken(token: string, propositos: Proposito[]): Promise<string> {
  const registro = await lerToken(token, propositos);
  const marcados = await db.atualizar(
    authTokens,
    { id: registro.id, usedAt: null },
    { usedAt: new Date() }
  );
  /* Se outra requisição consumiu primeiro, o filtro `usedAt: null` não casa. */
  if (!marcados.length) {
    throw new AppError("token_expirado", "Este link já foi usado. Peça um novo.", { token: "Link já usado." });
  }
  return registro.userId;
}
