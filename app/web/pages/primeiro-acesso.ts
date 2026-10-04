/* =========================================================================
   Tela: primeiro acesso.
   A pessoa chega aqui pelo link do e-mail logo depois de pagar. Ela está
   ansiosa para usar: a tela precisa confirmar que deu tudo certo, pedir
   uma senha e sair da frente.
   ========================================================================= */
import { publicShell } from "../layout.js";
import { campo, esc } from "../components/index.js";
import { estilos, ic } from "./_comuns.js";

export type DadosPrimeiroAcesso = {
  /** Token do link do e-mail. */
  token: string;
  /** Nome de quem acabou de assinar, se o servidor já souber. */
  nome?: string;
  /** Nome do plano assinado, para a pessoa reconhecer a compra. */
  plano?: string;
  /** Token inválido ou vencido: a tela vira pedido de novo link. */
  expirado?: boolean;
};

export function paginaPrimeiroAcesso(d: DadosPrimeiroAcesso): string {
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
    <p>Por segurança o link de primeiro acesso vale por 48 horas. Pedimos outro
       agora mesmo para o seu e-mail — sua assinatura continua ativa.</p>
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

  const primeiroNome = (d.nome ?? "").trim().split(/\s+/)[0] ?? "";

  return publicShell({
    title: "Primeiro acesso",
    islands: ["auth"],
    bootstrap: { primeiroAcesso: true },
    body: `
${estilos()}
<div class="auth-card">
  <span class="badge badge-lime" style="margin-bottom:var(--sp-4)">${ic("certo", 14)} Pagamento aprovado</span>
  <h1>${primeiroNome ? `Boas-vindas, ${esc(primeiroNome)}!` : "Boas-vindas à Nutri&amp;Live!"}</h1>
  <p>${d.plano ? `Sua assinatura <b>${esc(d.plano)}</b> está ativa.` : "Sua assinatura está ativa."}
     Falta só criar uma senha — leva 20 segundos e depois já dá para montar o plano de hoje.</p>

  <form data-rota="/api/auth/first-access" id="form-primeiro" novalidate>
    <input type="hidden" name="token" value="${esc(d.token)}">

    ${campo({ id: "password", label: "Crie sua senha", type: "password",
              autocomplete: "new-password", placeholder: "Pelo menos 8 caracteres",
              hint: "Use 8 caracteres ou mais. Nada de 12345678." })}
    <div class="pw-meter" data-nl="medidor" data-score="0" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <p class="nl-barra-senha-nota" data-nl="forca" role="status">Força da senha: aguardando</p>
    <ul class="nl-regras" data-nl="regras">
      <li data-regra="tamanho">8 caracteres ou mais</li>
      <li data-regra="letras">letras maiúsculas e minúsculas</li>
      <li data-regra="numero">pelo menos um número</li>
    </ul>

    ${campo({ id: "confirmar", label: "Repita a senha", type: "password",
              autocomplete: "new-password", placeholder: "A mesma senha" })}

    <div class="nl-alerta" id="erro-primeiro" role="alert">${ic("alerta")}<span data-nl="texto"></span></div>

    <button class="btn btn-primary btn-block btn-lg" type="submit">Criar senha e entrar</button>
  </form>
</div>

<p class="auth-foot">Esse link é só seu. Não repasse para ninguém.</p>`
  });
}

export default paginaPrimeiroAcesso;
