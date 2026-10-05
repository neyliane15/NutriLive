/* =========================================================================
   Nutri&Live — pagar a renovação do Pix

   Esta tela existe por uma limitação concreta e não por escolha: no Mercado
   Pago, Pix é cobrança avulsa. Cartão o provedor cobra sozinho todo mês;
   Pix não tem o que cobrar. Então a gente emite a cobrança antes do
   vencimento e a pessoa vem aqui pagar.

   A tela diz isso em português, no lugar onde a pergunta nasce — "por que
   eu tenho que pagar de novo à mão?" —, porque a alternativa é a pessoa
   achar que o sistema esqueceu de cobrar, ou que cobrou duas vezes.
   ========================================================================= */
import { shell, type ShellUser } from "../layout.js";
import { panel, esc, vazio, brl, dataBR } from "../components/index.js";
import { estilos, ic } from "./_comuns.js";

export type Renovacao = {
  paymentId: string;
  amountCents: number;
  planName: string;
  qrCode: string;
  expiresAt: string | null;
  accessUntil: string | null;
};

export type DadosRenovar = {
  usuario: ShellUser;
  /** null quando não há nada a pagar agora. */
  renovacao: Renovacao | null;
  /** SVG do QR Code, já renderizado no servidor. */
  qrSvg: string | null;
  /** true quando a leitura falhou — diferente de "não há cobrança". */
  semServidor?: boolean;
};

const estilosRenovar = `
<style>
  .nl-pix { display:grid; gap:var(--sp-6); grid-template-columns: minmax(0,18rem) minmax(0,1fr); align-items:start; }
  .nl-pix-qr { background:#fff; border:1px solid var(--border); border-radius:var(--r-lg); padding:var(--sp-4); }
  .nl-pix-qr svg { width:100%; height:auto; display:block; }
  .nl-copia { display:flex; gap:var(--sp-2); align-items:stretch; }
  .nl-copia code {
    flex:1; min-width:0; font-size:var(--fs-xs); line-height:1.5; word-break:break-all;
    background:var(--surface-sunk); border:1px solid var(--border-subtle);
    border-radius:var(--r-md); padding:var(--sp-3); max-height:7rem; overflow:auto;
  }
  @media (max-width: 820px) { .nl-pix { grid-template-columns: 1fr; } }
</style>`;

export function paginaRenovar(d: DadosRenovar): string {
  const r = d.renovacao;

  const corpo = !r
    ? panel({
      title: "Renovação",
      body: d.semServidor
        ? `<div class="loading" data-nl="recarregando">Tentando buscar de novo…</div>`
        : vazio({
          titulo: "Não há nada a pagar agora",
          texto: "Quando faltarem cinco dias para o seu acesso vencer, a gente gera o Pix e manda por e-mail. Ele aparece aqui também.",
          acao: `<a class="btn btn-secondary" href="/conta">Ver minha assinatura</a>`,
          icone: ic("certo", 24)
        })
    })
    : `
${panel({
      title: "Pague para continuar",
      sub: `${esc(r.planName)} · ${brl(r.amountCents)} por mês`,
      body: `
<p class="notice" role="status">${ic("info", 18)}
  <span>Você assinou por <b>Pix</b>, e Pix não tem cobrança automática: a gente gera
  o código todo mês e você paga quando puder. ${r.accessUntil
    ? `Seu acesso está garantido até <b>${esc(dataBR(r.accessUntil))}</b>.`
    : ""}</span></p>

<div class="nl-pix" style="margin-top:var(--sp-5)">
  <div class="nl-pix-qr">${d.qrSvg ?? `<p class="nl-legenda">Não foi possível desenhar o QR. Use o código ao lado.</p>`}</div>
  <div style="display:grid;gap:var(--sp-4);min-width:0">
    <div>
      <p class="nl-rotulo">Pix copia e cola</p>
      <div class="nl-copia" style="margin-top:var(--sp-2)">
        <code id="pix-codigo" data-nl="pix-codigo">${esc(r.qrCode)}</code>
        <button class="btn btn-secondary" type="button" data-nl="copiar-pix">Copiar</button>
      </div>
    </div>
    <ol style="display:grid;gap:.5rem;font-size:var(--fs-sm);color:var(--text-muted);padding-left:1.25rem;list-style:decimal">
      <li>Abra o aplicativo do seu banco e escolha Pix.</li>
      <li>Leia o QR Code ou cole o código acima.</li>
      <li>Confira o valor de <b>${brl(r.amountCents)}</b> e confirme.</li>
    </ol>
    <p class="nl-legenda" data-nl="pix-estado" aria-live="polite">
      ${r.expiresAt ? `Este código vale até ${esc(dataBR(r.expiresAt))}.` : "Assim que o pagamento cair, seu acesso continua sem interrupção."}
    </p>
  </div>
</div>`
    })}
${panel({
      title: "Por que não é automático",
      body: `<p style="font-size:var(--fs-sm);color:var(--text-muted);margin:0">
        No cartão a cobrança se repete sozinha. No Pix, não: cada cobrança é uma só,
        e o banco não guarda autorização para a próxima. Por isso a gente avisa com
        cinco dias de antecedência, por e-mail e aqui. Se preferir não pensar nisso
        todo mês, troque para cartão na sua <a class="link" href="/conta">conta</a>.
      </p>`
    })}`;

  return shell({
    title: "Renovar",
    user: d.usuario,
    active: "/conta",
    islands: ["renovar"],
    bootstrap: { renovacao: r },
    body: `${estilos()}${estilosRenovar}${corpo}`
  });
}

export default paginaRenovar;
