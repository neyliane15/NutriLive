/* =========================================================================
   Tela: esqueci minha senha. Pede o e-mail e confirma o envio sem dizer
   se a conta existe — não entregamos quem é cliente para quem chuta e-mail.
   ========================================================================= */
import { publicShell } from "../layout.js";
import { campo } from "../components/index.js";
import { estilos, ic } from "./_comuns.js";

export function paginaEsqueci(d: { email?: string } = {}): string {
  return publicShell({
    title: "Esqueci minha senha",
    islands: ["auth"],
    body: `
${estilos()}
<div class="auth-card" id="caixa-esqueci">
  <h1>Esqueci minha senha</h1>
  <p>Diga o e-mail da sua conta. Mandamos um link para você criar uma senha nova.</p>

  <form data-rota="/api/auth/forgot" id="form-esqueci" data-esconde="caixa-esqueci" data-sucesso="caixa-enviado" novalidate>
    ${campo({ id: "email", label: "E-mail", type: "email", autocomplete: "email",
              inputmode: "email", placeholder: "voce@email.com", value: d.email })}
    <div class="nl-alerta" id="erro-esqueci" role="alert">${ic("alerta")}<span data-nl="texto"></span></div>
    <button class="btn btn-primary btn-block btn-lg" type="submit">Enviar o link</button>
  </form>
</div>

<div class="auth-card nl-oculto" id="caixa-enviado" hidden>
  <div class="nl-ok-caixa">
    <span class="icon-tile" aria-hidden="true">${ic("certo", 24)}</span>
    <h1>Olhe seu e-mail</h1>
    <p>Se existir uma conta com <b data-nl="email">esse endereço</b>, o link chega em poucos minutos.
       Ele vale por 1 hora.</p>
    <a class="btn btn-secondary btn-block" href="/entrar">Voltar para entrar</a>
  </div>
</div>

<p class="auth-foot">Não achou o e-mail? Veja em spam ou lixo eletrônico.</p>`
  });
}

export default paginaEsqueci;
