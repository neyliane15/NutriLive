/* =========================================================================
   Nutri&Live — cabeçalhos de segurança

   Vivem aqui, num lugar só, porque são servidos de DOIS lugares:

     - a função da Vercel responde as telas do app (este módulo);
     - a Vercel serve os arquivos da landing direto do disco, sem invocar
       função nenhuma, e aí quem manda cabeçalho é o `vercel.json`.

   Se as duas políticas divergirem, o navegador aplica a INTERSEÇÃO das
   duas — o que não afrouxa a segurança, mas quebra a tela sem erro
   visível. test/seguranca.test.ts compara as duas e reprova se saírem de
   sincronia.

   Por que a CSP importa aqui: todas as telas são string de HTML
   concatenada. Um `esc` esquecido num campo livre vira XSS — já aconteceu
   duas vezes neste repositório (o nome dentro do bloco JSON e o título da
   ficha da pessoa). A CSP não corrige o escape; ela faz com que o próximo
   escape esquecido não execute nada.

   `script-src 'self'` sem `'unsafe-inline'` só é possível porque o projeto
   não tem UM script inline nem UM atributo onclick: as ilhas são arquivos
   em /app-assets/islands/ e o bootstrap é
   `<script type="application/json">`, que o navegador não executa. Antes
   de adicionar script inline, leia isto: ele não vai rodar.
   ========================================================================= */

/** Política de conteúdo. Uma diretiva por linha, montada numa string. */
export const CSP: string = [
  /* Tudo o que não tiver regra própria cai aqui. */
  "default-src 'self'",
  /* Script só de arquivo nosso. Sem 'unsafe-inline' e sem 'unsafe-eval':
     é o que transforma um escape esquecido em texto feio em vez de
     sessão roubada. */
  "script-src 'self'",
  /* `style="..."` é usado em ~95 lugares nas telas. Estilo inline não
     executa código; o risco que sobra é visual. */
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  /* As telas só falam com a nossa própria API. */
  "connect-src 'self'",
  /* Formulário não pode postar para fora: impede que um HTML injetado
     mande a senha digitada para outro servidor. */
  "form-action 'self'",
  /* Ninguém nos coloca dentro de um iframe (clickjacking). */
  "frame-ancestors 'none'",
  "frame-src 'none'",
  /* `<base href>` injetado reescreveria todo caminho relativo da página,
     inclusive o src das ilhas. */
  "base-uri 'none'",
  "object-src 'none'"
].join("; ");

/**
 * Cabeçalhos aplicados em toda resposta.
 *
 * `Strict-Transport-Security` fica de fora daqui de propósito: ele não faz
 * nada em http (desenvolvimento) e, se for emitido com um domínio errado,
 * trava o navegador naquele domínio por dois anos. Quem o emite é a
 * Vercel, pelo `vercel.json`, onde o domínio já é https.
 */
export const CABECALHOS: Record<string, string> = {
  "Content-Security-Policy": CSP,
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  /* Recursos que o sistema não usa. Negar aqui significa que uma tela
     injetada também não consegue pedi-los. */
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), usb=(), magnetometer=()"
};

/* NÃO coloque `X-Robots-Tag: noindex` aqui.

   Estes cabeçalhos também saem pelo `vercel.json` na regra `/(.*)`, que
   cobre os arquivos da LANDING PAGE — o site de vendas, que precisa ser
   indexado pelo Google. Um noindex global tiraria a landing da busca sem
   nenhum erro aparecer. As telas do app já se marcam uma por uma, com
   `<meta name="robots" content="noindex">` em web/layout.ts. */

/**
 * Caminhos que são arquivo estático, não tela.
 *
 * Serve para o `Cache-Control: no-store`: tela com dado de saúde não pode
 * ficar no cache do navegador (quem abre o histórico depois do logout lê o
 * prontuário), mas CSS e fonte têm de ser cacheados, senão cada tela baixa
 * tudo de novo.
 */
export const ehEstatico = (caminho: string): boolean =>
  caminho.startsWith("/assets/") || caminho.startsWith("/app-assets/");
