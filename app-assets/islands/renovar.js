/* =========================================================================
   Nutri&Live — ilha da renovação

   Duas coisas: copiar o código e perceber quando o pagamento cair.

   A consulta de estado usa a rota pública de status do pagamento, a mesma
   que o checkout usa enquanto espera o Pix. Ela PARA sozinha depois de
   cinco minutos: deixar um laço batendo no servidor numa aba esquecida é
   uma conta que alguém paga.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  if (!NL) return;
  var boot = NL.boot || {};

  NL.pronto(function () {
    var botao = NL.$('[data-nl="copiar-pix"]');
    var codigo = NL.$('[data-nl="pix-codigo"]');
    if (botao && codigo) {
      botao.addEventListener("click", async function () {
        var texto = codigo.textContent.trim();
        try {
          await navigator.clipboard.writeText(texto);
          botao.textContent = "Copiado";
          setTimeout(function () { botao.textContent = "Copiar"; }, 2200);
        } catch (e) {
          /* Sem permissão de área de transferência: seleciona para a pessoa
             copiar com o teclado, em vez de dizer que copiou sem ter copiado. */
          var faixa = document.createRange();
          faixa.selectNodeContents(codigo);
          var sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(faixa);
          NL.aviso("Não consegui copiar sozinho. O código está selecionado — use Ctrl+C.", "erro");
        }
      });
    }

    var r = boot.renovacao;
    if (!r || !r.paymentId) return;
    var estado = NL.$('[data-nl="pix-estado"]');
    var fim = Date.now() + 5 * 60 * 1000;
    var espera = 4000;

    (async function esperar() {
      if (Date.now() > fim) {
        if (estado) estado.textContent =
          "Parei de conferir para não ficar batendo no servidor. Recarregue a página depois de pagar.";
        return;
      }
      try {
        var s = await NL.api("/api/checkout/" + encodeURIComponent(r.paymentId) + "/status");
        if (s && s.status === "aprovado") {
          if (estado) estado.textContent = "Pagamento confirmado. Seu acesso foi renovado.";
          NL.aviso("Pagamento confirmado. Obrigado!");
          setTimeout(function () { location.href = "/conta"; }, 1600);
          return;
        }
      } catch (e) { /* uma falha de rede não derruba a espera */ }
      setTimeout(esperar, espera);
      espera = Math.min(espera * 1.2, 15000);
    })();
  });
})();
