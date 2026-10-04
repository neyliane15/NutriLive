/* =========================================================================
   Nutri&Live — senha

   Hash com Argon2id (@node-rs/argon2), que é o estado da arte e o que o
   OWASP recomenda hoje. Os parâmetros padrão da biblioteca já são os
   sugeridos pelo OWASP (m=19 MiB, t=2, p=1); deixamos explícito para não
   dependerem de uma atualização de versão.

   O hash do Argon2 já embute o sal aleatório, então não existe coluna de
   sal: `users.password_hash` guarda a string inteira `$argon2id$...`.
   ========================================================================= */
import { hash as argonHash, verify as argonVerify, Algorithm } from "@node-rs/argon2";
import { AppError } from "../lib/http.js";

const PARAMETROS = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19_456,     /* 19 MiB  */
  timeCost: 2,            /* 2 passes */
  parallelism: 1
} as const;

/** Senhas que aparecem em toda lista de vazamento. Barrar as óbvias já corta a maior parte do ataque. */
const PROIBIDAS = new Set([
  "12345678", "123456789", "1234567890", "senha123", "password", "password1", "qwerty123",
  "nutrielive", "nutrilive", "brasil123", "abcd1234", "11111111", "00000000", "aaaaaaaa",
  "mudar123", "trocar123", "senhasenha", "minhasenha", "iloveyou", "princesa", "corinthians",
  "flamengo", "palmeiras", "saopaulo", "futebol123"
]);

export const SENHA_MINIMA = 8;

/**
 * Política mínima, pensada para gente de verdade: tamanho é o que mais
 * importa, então exigimos 8 caracteres com pelo menos uma letra e um
 * número, e barramos o que é adivinhável (senha de lista, o próprio nome,
 * o próprio e-mail, repetição de um só caractere).
 *
 * Lança `dados_invalidos` com o campo já marcado para o formulário.
 */
export function validarSenha(senha: string, dono?: { nome?: string; email?: string }, campo = "password"): void {
  const erro = (mensagem: string): never => {
    throw new AppError("dados_invalidos", mensagem, { [campo]: mensagem });
  };

  if (typeof senha !== "string" || senha.length < SENHA_MINIMA) {
    erro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
  }
  if (senha.length > 200) erro("A senha passou de 200 caracteres.");
  if (senha.trim().length !== senha.length) erro("A senha não pode começar nem terminar com espaço.");
  if (!/[a-zA-ZÀ-ÿ]/.test(senha)) erro("Coloque pelo menos uma letra na senha.");
  if (!/[0-9]/.test(senha)) erro("Coloque pelo menos um número na senha.");

  const simples = senha.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (PROIBIDAS.has(simples)) erro("Essa senha é muito comum. Escolha outra.");
  if (/^(.)\1+$/.test(senha)) erro("Repetir o mesmo caractere não vale como senha.");
  if (/^(0123456789|1234567890|12345678|87654321|abcdefgh)/.test(simples)) {
    erro("Sequências óbvias não valem como senha.");
  }

  const local = (dono?.email ?? "").split("@")[0]?.toLowerCase() ?? "";
  if (local.length >= 4 && simples.includes(local)) erro("A senha não pode conter o seu e-mail.");

  for (const parte of (dono?.nome ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").split(/\s+/)) {
    if (parte.length >= 4 && simples.includes(parte)) erro("A senha não pode conter o seu nome.");
  }
}

/** Gera o hash Argon2id da senha. */
export const gerarHash = (senha: string): Promise<string> => argonHash(senha, PARAMETROS);

/**
 * Confere a senha contra o hash guardado. Nunca estoura: hash ausente ou
 * corrompido devolve `false`, para a rota responder "credenciais inválidas"
 * sem revelar nada sobre o estado da conta.
 */
export async function conferirSenha(hashGuardado: string | null | undefined, senha: string): Promise<boolean> {
  if (!hashGuardado || !senha) return false;
  try {
    return await argonVerify(hashGuardado, senha);
  } catch {
    return false;
  }
}
