/* =========================================================================
   Tela: entrar. Casca pública, e-mail e senha, erro honesto.
   ========================================================================= */
import { publicShell } from "../layout.js";
import { campo, esc } from "../components/index.js";
import { estilos, ic } from "./_comuns.js";

export type DadosEntrar = {
  /** E-mail já conhecido (veio do link do e-mail ou de um erro anterior). */
  email?: string;
  /** Para onde ir depois de entrar. */
  proximo?: string;
  /** Recado vindo do servidor: sessão expirada, senha redefinida, etc. */
  recado?: string;
};

export function paginaEntrar(d: DadosEntrar = {}): string {
  return publicShell({
    title: "Entrar",
    islands: ["auth"],
    bootstrap: { proximo: d.proximo ?? "/hoje" },
    body: `
${estilos()}
<div class="auth-card">
  <h1>Entrar</h1>
  <p>Seu plano, seu diário e sua evolução num só lugar.</p>

  ${d.recado ? `<div class="notice" role="status" style="margin-top:var(--sp-5)">${ic("certo")}<span>${esc(d.recado)}</span></div>` : ""}

  <form data-rota="/api/auth/login" data-redirect="${esc(d.proximo ?? "/hoje")}" novalidate>
    ${campo({ id: "email", label: "E-mail", type: "email", autocomplete: "email",
              inputmode: "email", placeholder: "voce@email.com", value: d.email })}
    ${campo({ id: "password", label: "Senha", type: "password", autocomplete: "current-password",
              placeholder: "Sua senha" })}

    <div class="nl-alerta" id="erro-entrar" role="alert">${ic("alerta")}<span data-nl="texto"></span></div>

    <button class="btn btn-primary btn-block btn-lg" type="submit">Entrar</button>
  </form>

  <p class="auth-foot"><a class="link" href="/esqueci">Esqueci minha senha</a></p>
</div>

<p class="auth-foot">
  Ainda não tem conta? <a class="link" href="/#planos">Ver os planos</a>
</p>`
  });
}

export default paginaEntrar;
