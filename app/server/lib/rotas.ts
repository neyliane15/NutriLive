/* =========================================================================
   Para onde cada perfil vai depois de entrar. Fica num lugar só para o
   front e o servidor nunca discordarem; se o nome de uma tela mudar em
   `web/pages`, muda aqui e acabou.
   ========================================================================= */
import type { Role } from "../../shared/contract.js";

export const ROTA_INICIAL: Record<Role, string> = {
  admin: "/admin",
  nutricionista: "/pacientes",
  academia: "/alunos",
  pessoal: "/hoje",
  paciente: "/hoje",
  aluno: "/hoje"
};

export const rotaInicial = (papel: Role): string => ROTA_INICIAL[papel] ?? "/hoje";

/** Página pública onde a pessoa define a senha vinda do e-mail. */
export const rotaPrimeiroAcesso = (token: string): string => `/primeiro-acesso?token=${encodeURIComponent(token)}`;
export const rotaRedefinicao = (token: string): string => `/redefinir-senha?token=${encodeURIComponent(token)}`;
