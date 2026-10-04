/* =========================================================================
   Nutri&Live — envio de e-mail

   Dois motores, como todo serviço externo do projeto:
     EMAIL_PROVIDER=resend   manda de verdade pela API da Resend
     EMAIL_PROVIDER=console  (padrão) imprime no terminal e guarda na
                             caixa de saída em memória

   A caixa de saída é o que permite testar primeiro acesso e redefinição
   de senha sem servidor de e-mail: o teste lê o link que o usuário leria.
   ========================================================================= */
import { env } from "./env.js";
import { log } from "./log.js";

export type Mensagem = {
  para: string;
  assunto: string;
  texto: string;
  html?: string;
  /** Marcador para a caixa de saída: "primeiro_acesso", "convite", ... */
  tipo?: string;
};

/** Últimas 200 mensagens. Só existe fora de produção. */
export const caixaDeSaida: (Mensagem & { em: Date })[] = [];

export function limparCaixaDeSaida(): void {
  caixaDeSaida.length = 0;
}

/** Última mensagem enviada para um endereço (o que o teste quer olhar). */
export function ultimaMensagem(para: string, tipo?: string): (Mensagem & { em: Date }) | undefined {
  for (let i = caixaDeSaida.length - 1; i >= 0; i--) {
    const m = caixaDeSaida[i];
    if (m && m.para.toLowerCase() === para.toLowerCase() && (!tipo || m.tipo === tipo)) return m;
  }
  return undefined;
}

export async function enviarEmail(m: Mensagem): Promise<void> {
  if (env.EMAIL_PROVIDER === "resend" && env.RESEND_API_KEY) {
    try {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: env.EMAIL_FROM, to: [m.para], subject: m.assunto, text: m.texto, html: m.html })
      });
      if (!r.ok) log.warn(`e-mail recusado pela Resend (${r.status}) para ${m.para}`);
      else log.info(`e-mail enviado para ${m.para}: ${m.assunto}`);
      return;
    } catch (e) {
      /* E-mail não derruba requisição: o usuário pode pedir reenvio. */
      log.error(`falha ao enviar e-mail para ${m.para}`, e);
      return;
    }
  }

  if (env.NODE_ENV !== "production") {
    caixaDeSaida.push({ ...m, em: new Date() });
    if (caixaDeSaida.length > 200) caixaDeSaida.shift();
  }
  log.info(`[e-mail/console] para=${m.para} assunto="${m.assunto}"\n${m.texto}`);
}

/* ----------------------------- modelos ---------------------------------- */

const rodape = `
—
Nutri&Live · comer bem virou a parte fácil do seu dia
Se não foi você que pediu, ignore esta mensagem.`;

const corpo = (titulo: string, linhas: string[], botao?: { rotulo: string; href: string }) => ({
  texto: [titulo, "", ...linhas, botao ? `\n${botao.rotulo}: ${botao.href}` : "", rodape].join("\n"),
  html: `<div style="font-family:system-ui,sans-serif;max-width:520px;line-height:1.6;color:#1a2b23">
  <h2 style="color:#126e4e">${titulo}</h2>
  ${linhas.map((l) => `<p>${l}</p>`).join("")}
  ${botao ? `<p><a href="${botao.href}" style="display:inline-block;background:#1aa06d;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none">${botao.rotulo}</a></p>
  <p style="font-size:13px;color:#5b6b64">Se o botão não abrir, copie este endereço:<br>${botao.href}</p>` : ""}
  <hr style="border:none;border-top:1px solid #e3ebe7">
  <p style="font-size:12px;color:#5b6b64">Nutri&amp;Live · comer bem virou a parte fácil do seu dia</p>
</div>`
});

export const emailPrimeiroAcesso = (nome: string, link: string, horas: number) =>
  corpo(`Bem-vindo(a), ${nome.split(" ")[0]}!`, [
    "Seu pagamento foi aprovado e sua conta no Nutri&amp;Live já está pronta.",
    `Falta só definir sua senha. O link abaixo vale por ${horas} horas.`
  ], { rotulo: "Definir minha senha", href: link });

export const emailConvite = (nome: string, organizacao: string, link: string, horas: number) =>
  corpo(`${nome.split(" ")[0]}, ${organizacao} te convidou`, [
    `${organizacao} criou seu acesso ao Nutri&amp;Live — plano alimentar, diário e evolução, sem custo para você.`,
    `Defina sua senha pelo link abaixo. Ele vale por ${horas} horas.`
  ], { rotulo: "Criar minha senha", href: link });

export const emailRedefinicao = (nome: string, link: string, minutos: number) =>
  corpo("Redefinir sua senha", [
    `Olá, ${nome.split(" ")[0]}. Recebemos um pedido para trocar a senha da sua conta.`,
    `O link abaixo vale por ${minutos} minutos e só pode ser usado uma vez.`
  ], { rotulo: "Escolher nova senha", href: link });

export const emailSenhaAlterada = (nome: string) =>
  corpo("Sua senha foi alterada", [
    `Olá, ${nome.split(" ")[0]}. A senha da sua conta acabou de ser trocada.`,
    "Se não foi você, responda este e-mail agora mesmo — nós bloqueamos o acesso."
  ]);
