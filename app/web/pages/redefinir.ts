/* =========================================================================
   Tela: redefinir senha (link do e-mail de "esqueci minha senha").
   ========================================================================= */
import { publicShell } from "../layout.js";
import { campo, esc } from "../components/index.js";
import { estilos, ic } from "./_comuns.js";

export function paginaRedefinir(d: { token: string; expirado?: boolean }): string {
  if (d.expirado) {
    return publicShell({
      title: "Link expirado",
      islands: ["auth"],
      body: `
${estilos()}
<div class="auth-card">
  <div class="nl-ok-caixa">
    <span class="icon-tile" aria-hidden="true">${ic("cadeado", 24)}</span>
    <h1>Esse link já venceu</h1>
    <p>Links de redefinição valem por 1 hora. Peça um novo abaixo.</p>
  </div>
  <form data-rota="/api/auth/forgot" data-aviso="Link novo enviado. Olhe seu e-mail." novalidate>
    ${campo({ id: "email", label: "Seu e-mail", type: "email", autocomplete: "email",
              inputmode: "email", placeholder: "voce@email.com" })}
    <div class="nl-alerta" id="erro-esqueci" role="alert">${ic("alerta")}<span data-nl="texto"></span></div>
    <button class="btn btn-primary btn-block btn-lg" type="submit">Mandar link novo</button>
  </form>
</div>`
    });
  }

  return publicShell({
    title: "Nova senha",
    islands: ["auth"],
    body: `
${estilos()}
<div class="auth-card" id="caixa-redefinir">
  <h1>Criar uma senha nova</h1>
  <p>Escolha uma senha que você lembre. Depois dela, a sessão antiga sai do ar.</p>

  <form data-rota="/api/auth/reset" id="form-redefinir" data-esconde="caixa-redefinir" data-sucesso="caixa-pronto" novalidate>
    <input type="hidden" name="token" value="${esc(d.token)}">

    ${campo({ id: "password", label: "Nova senha", type: "password",
              autocomplete: "new-password", placeholder: "Pelo menos 8 caracteres" })}
    <div class="pw-meter" data-nl="medidor" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <p class="nl-barra-senha-nota" data-nl="forca" role="status">Força da senha: aguardando</p>
    <ul class="nl-regras" data-nl="regras">
      <li data-regra="tamanho">8 caracteres ou mais</li>
      <li data-regra="letras">letras maiúsculas e minúsculas</li>
      <li data-regra="numero">pelo menos um número</li>
    </ul>

    ${campo({ id: "confirmar", label: "Repita a nova senha", type: "password",
              autocomplete: "new-password", placeholder: "A mesma senha" })}

    <div class="nl-alerta" id="erro-redefinir" role="alert">${ic("alerta")}<span data-nl="texto"></span></div>

    <button class="btn btn-primary btn-block btn-lg" type="submit">Salvar senha</button>
  </form>
</div>

<div class="auth-card nl-oculto" id="caixa-pronto" hidden>
  <div class="nl-ok-caixa">
    <span class="icon-tile" aria-hidden="true">${ic("certo", 24)}</span>
    <h1>Senha trocada</h1>
    <p>Agora entre com a senha nova.</p>
    <a class="btn btn-primary btn-block" href="/entrar">Entrar</a>
  </div>
</div>`
  });
}

export default paginaRedefinir;
