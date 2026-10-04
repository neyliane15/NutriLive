/* =========================================================================
   Nutri&Live — e-mails da cobrança

   O envio em si é de `server/lib/email.ts` (dono: BE-1). Enquanto esse
   arquivo não existir, ou quando EMAIL_PROVIDER=console, o e-mail sai no
   log do servidor e fica guardado em memória — é assim que a demonstração
   mostra o link de primeiro acesso sem precisar de caixa de entrada.

   A regra de ouro do produto vive aqui: pagamento aprovado -> e-mail com
   link de primeiro acesso, na hora, sem espera manual.
   ========================================================================= */
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";

export interface Mensagem {
  para: string;
  assunto: string;
  html: string;
  texto: string;
}

/** Últimos e-mails enviados, para a demonstração e para o teste. */
const caixaDeSaida: (Mensagem & { enviadoEm: Date })[] = [];
export const emailsEnviados = (): readonly (Mensagem & { enviadoEm: Date })[] => caixaDeSaida;
export const ultimoEmailPara = (para: string): (Mensagem & { enviadoEm: Date }) | undefined =>
  [...caixaDeSaida].reverse().find((m) => m.para.toLowerCase() === para.toLowerCase());
export const limparCaixaDeSaida = (): void => { caixaDeSaida.length = 0; };

type EnviadorExterno = (msg: Mensagem) => Promise<void>;
let externo: EnviadorExterno | null | undefined;

/**
 * Procura o enviador de verdade em `server/lib/email.ts`.
 * O especificador é montado em variável de propósito: o módulo é de outro
 * agente e pode ainda não existir, e um `import` literal quebraria o build.
 * INTEGRAÇÃO: quando `server/lib/email.ts` estiver no lugar, troque isto por
 * um import estático.
 */
async function acharEnviador(): Promise<EnviadorExterno | null> {
  if (externo !== undefined) return externo;
  externo = null;
  const caminho = "../lib/email.js";
  try {
    const mod: Record<string, unknown> = await import(/* @vite-ignore */ caminho);
    const candidatos = ["enviarEmail", "enviar", "sendEmail", "send", "default"];
    for (const nome of candidatos) {
      const fn = mod[nome];
      if (typeof fn === "function") {
        externo = async (msg) => {
          /* Aceita tanto o nosso formato quanto o inglês mais comum. */
          await (fn as (a: unknown) => unknown)({
            ...msg, to: msg.para, subject: msg.assunto, html: msg.html, text: msg.texto
          });
        };
        break;
      }
    }
  } catch {
    externo = null;
  }
  return externo;
}

export async function enviarEmail(msg: Mensagem): Promise<void> {
  caixaDeSaida.push({ ...msg, enviadoEm: new Date() });
  if (caixaDeSaida.length > 200) caixaDeSaida.shift();

  const enviador = await acharEnviador();
  if (enviador && env.EMAIL_PROVIDER !== "console") {
    try {
      await enviador(msg);
      return;
    } catch (e) {
      /* E-mail não derruba cobrança: o pagamento já foi aprovado. */
      log.error(`falha ao enviar e-mail para ${msg.para}`, e);
    }
  }
  log.info(`e-mail (${env.EMAIL_PROVIDER}) para ${msg.para}: ${msg.assunto}`);
  if (env.EMAIL_PROVIDER === "console") log.debug("corpo do e-mail", { texto: msg.texto });
}

/* ------------------------------- os textos ------------------------------- */
const moeda = (cents: number): string =>
  `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const casca = (titulo: string, corpo: string): string => `<!doctype html>
<html lang="pt-BR"><meta charset="utf-8">
<body style="margin:0;background:#F4F7F4;font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#13261D">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;padding:32px">
    <p style="margin:0 0 24px;font-weight:700;letter-spacing:.02em;color:#1E7A4B">Nutri&amp;Live</p>
    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25">${titulo}</h1>
    ${corpo}
    <p style="margin:32px 0 0;font-size:13px;color:#5B6B61">
      Você recebeu este e-mail porque contratou o Nutri&amp;Live. Dúvida? Responda esta mensagem.
    </p>
  </div>
</body></html>`;

const botao = (href: string, rotulo: string): string =>
  `<p style="margin:0 0 24px"><a href="${href}" style="display:inline-block;background:#1E7A4B;color:#fff;text-decoration:none;padding:14px 24px;border-radius:999px;font-weight:600">${rotulo}</a></p>`;

export function emailPrimeiroAcesso(nome: string, planoNome: string, link: string): Omit<Mensagem, "para"> {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
  return {
    assunto: "Seu acesso ao Nutri&Live está liberado",
    html: casca("Pagamento confirmado. Bem-vindo!", `
      <p style="margin:0 0 16px">Oi, ${primeiroNome}! Seu plano <b>${planoNome}</b> já está ativo.</p>
      <p style="margin:0 0 24px">Só falta você criar a sua senha. O link abaixo vale por 72 horas e só pode ser usado uma vez.</p>
      ${botao(link, "Criar minha senha")}
      <p style="margin:0;font-size:13px;color:#5B6B61">Se o botão não abrir, copie e cole este endereço:<br>${link}</p>`),
    texto: `Oi, ${primeiroNome}! Pagamento confirmado e seu plano ${planoNome} está ativo.\n` +
      `Crie a sua senha neste link (vale por 72 horas, uso único):\n${link}\n`
  };
}

export function emailPixPendente(nome: string, valorCents: number, codigo: string, expiraEm: Date): Omit<Mensagem, "para"> {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
  return {
    assunto: `Seu Pix de ${moeda(valorCents)} está esperando`,
    html: casca("Falta o Pix para liberar o acesso", `
      <p style="margin:0 0 16px">Oi, ${primeiroNome}! Copie o código abaixo e pague no aplicativo do seu banco.</p>
      <p style="margin:0 0 16px;word-break:break-all;font:13px/1.5 ui-monospace,monospace;background:#F4F7F4;padding:16px;border-radius:12px">${codigo}</p>
      <p style="margin:0">O código vale até ${expiraEm.toLocaleString("pt-BR")}. Assim que o Pix cair, o acesso é liberado na hora e você recebe o link para criar a senha.</p>`),
    texto: `Oi, ${primeiroNome}! Pague ${moeda(valorCents)} com este Pix (vale até ${expiraEm.toLocaleString("pt-BR")}):\n${codigo}\n`
  };
}

export function emailPagamentoRecusado(nome: string, motivo: string): Omit<Mensagem, "para"> {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
  return {
    assunto: "Não conseguimos aprovar o seu pagamento",
    html: casca("O pagamento não passou", `
      <p style="margin:0 0 16px">Oi, ${primeiroNome}. O seu banco não autorizou a cobrança: ${motivo}</p>
      <p style="margin:0 0 24px">Nada foi cobrado. Dá para tentar de novo com outro cartão ou pagar por Pix.</p>
      ${botao(`${env.APP_URL}/assinar`, "Tentar de novo")}`),
    texto: `Oi, ${primeiroNome}. O pagamento não foi autorizado: ${motivo}. Nada foi cobrado. Tente de novo em ${env.APP_URL}/assinar\n`
  };
}

export function emailCobrancaFalhou(nome: string, tentativa: number, proximaEm: Date | null): Omit<Mensagem, "para"> {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
  const quando = proximaEm ? `Vamos tentar de novo em ${proximaEm.toLocaleDateString("pt-BR")}.` : "";
  const fim = proximaEm
    ? "Seu acesso continua liberado enquanto isso."
    : "Como foi a última tentativa, a assinatura foi pausada — sem multa e sem dívida. Você pode reativar quando quiser.";
  return {
    assunto: proximaEm ? "A cobrança da sua assinatura falhou" : "Sua assinatura foi pausada",
    html: casca(proximaEm ? "A cobrança não passou" : "Assinatura pausada", `
      <p style="margin:0 0 16px">Oi, ${primeiroNome}. A cobrança da renovação falhou (tentativa ${tentativa} de 3). ${quando}</p>
      <p style="margin:0 0 24px">${fim}</p>
      ${botao(`${env.APP_URL}/conta`, "Atualizar forma de pagamento")}`),
    texto: `Oi, ${primeiroNome}. A cobrança falhou (tentativa ${tentativa} de 3). ${quando} ${fim}\n`
  };
}

export function emailCancelamento(nome: string, acessoAte: Date | null): Omit<Mensagem, "para"> {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
  const ate = acessoAte
    ? `Seu acesso continua até ${acessoAte.toLocaleDateString("pt-BR")}, o fim do período que você já pagou.`
    : "Seu acesso foi encerrado agora.";
  return {
    assunto: "Assinatura cancelada",
    html: casca("Pronto, cancelamos", `
      <p style="margin:0 0 16px">Oi, ${primeiroNome}. Sua assinatura foi cancelada e não haverá novas cobranças.</p>
      <p style="margin:0">${ate}</p>`),
    texto: `Oi, ${primeiroNome}. Assinatura cancelada, sem novas cobranças. ${ate}\n`
  };
}

export function emailEstorno(nome: string, valorCents: number): Omit<Mensagem, "para"> {
  const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;
  return {
    assunto: `Estorno de ${moeda(valorCents)} em andamento`,
    html: casca("Seu estorno foi solicitado", `
      <p style="margin:0 0 16px">Oi, ${primeiroNome}. Pedimos o estorno de ${moeda(valorCents)}.</p>
      <p style="margin:0">No cartão, o valor volta em até 5 dias úteis. No Pix, em até 1 dia útil.</p>`),
    texto: `Oi, ${primeiroNome}. Estorno de ${moeda(valorCents)} solicitado: cartão em até 5 dias úteis, Pix em até 1 dia útil.\n`
  };
}
