/* =========================================================================
   Ilha: Compras. Marcar e desmarcar item sem esperar o servidor — se a API
   recusar, o item volta como estava e a pessoa é avisada. Os números do
   topo e de cada seção acompanham cada clique.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  var $ = NL.$, $$ = NL.$$;

  /* a lista que o servidor desenhou; é dela que vêm os preços */
  var lista = (NL.boot && NL.boot.lista) || null;
  var itens = (lista && lista.items) || [];

  var brl = NL.brl;

  function recado(marcados, total) {
    if (total === 0) return "Lista vazia.";
    if (marcados === 0) return "Nada no carrinho ainda. Comece pelo hortifrúti.";
    if (marcados >= total) return "Feira completa. Pode ir para o caixa.";
    var falta = total - marcados;
    return "Faltam " + falta + (falta === 1 ? " item." : " itens.");
  }

  /* ---------------------------- redesenho ------------------------------ */
  /** Lê o estado das caixas na tela e refaz os totais. Fonte: os preços do boot. */
  function recalcular() {
    var caixas = $$('input[name="item"]');
    var total = 0, falta = 0, marcados = 0;

    caixas.forEach(function (c) {
      var i = parseInt(c.value, 10);
      var item = itens[i];
      var preco = item ? (item.cents || 0) : 0;
      total += preco;
      if (c.checked) marcados++;
      else falta += preco;
    });

    var elTotal = $$('[data-nl="total"]');
    elTotal.forEach(function (e) { e.textContent = brl(total); });
    var elFalta = $('[data-nl="falta"]');
    if (elFalta) elFalta.textContent = brl(falta);
    var elMarcados = $('[data-nl="marcados"]');
    if (elMarcados) elMarcados.textContent = String(marcados);
    var barra = $('[data-nl="barra"]');
    if (barra) barra.style.width = (caixas.length ? Math.round((marcados / caixas.length) * 100) : 0) + "%";
    var rec = $('[data-nl="recado"]');
    if (rec) rec.textContent = recado(marcados, caixas.length);

    /* contagem por seção */
    $$("#conteudo .panel").forEach(function (p) {
      var caixasDaSecao = $$('input[name="item"]', p);
      if (!caixasDaSecao.length) return;
      var sub = $(".panel-sub", p);
      if (!sub) return;
      var feitos = caixasDaSecao.filter(function (c) { return c.checked; }).length;
      sub.textContent = feitos + " de " + caixasDaSecao.length + (caixasDaSecao.length === 1 ? " item" : " itens");
    });
  }

  /* --------------------------- marcar item ----------------------------- */
  async function alternar(caixa) {
    var indice = parseInt(caixa.value, 10);
    var querido = caixa.checked;
    var linha = caixa.closest(".nl-linha");

    /* otimista: a tela já mudou, os números também */
    if (itens[indice]) itens[indice].done = querido;
    recalcular();
    if (linha) { linha.setAttribute("data-salvando", "1"); linha.removeAttribute("data-falhou"); }

    try {
      await NL.api("/api/me/shopping-list", { method: "PATCH", body: { index: indice, done: querido } });
      if (linha) linha.removeAttribute("data-salvando");
    } catch (erro) {
      /* desfazer: volta tudo ao que era antes do clique */
      caixa.checked = !querido;
      if (itens[indice]) itens[indice].done = !querido;
      recalcular();
      if (linha) { linha.removeAttribute("data-salvando"); linha.setAttribute("data-falhou", "1"); }
      setTimeout(function () { if (linha) linha.removeAttribute("data-falhou"); }, 2600);
      NL.aviso(erro.code === "indisponivel"
        ? "A lista de compras está fora do ar neste instante. O item voltou como estava."
        : (erro.message || "Não deu para salvar esse item. Ele voltou como estava."), "erro");
    }
  }

  /* ------------------------- buscar a lista ---------------------------- */
  async function buscar(botao, aviso) {
    if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); botao.disabled = true; }
    try {
      var nova = await NL.api("/api/me/shopping-list");
      if (nova && nova.items && nova.items.length) {
        NL.aviso(aviso || "Lista pronta.");
        location.reload();
        return;
      }
      NL.aviso("Ainda não há itens para listar. Gere um plano alimentar primeiro.", "erro");
    } catch (erro) {
      NL.aviso(erro.code === "indisponivel"
        ? "A lista de compras está fora do ar neste instante. Tente de novo em alguns minutos."
        : (erro.message || "Não deu para montar a lista agora."), "erro");
    } finally {
      if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); botao.disabled = false; }
    }
  }

  /* ---------------------------- interações ----------------------------- */
  NL.pronto(function () {
    document.addEventListener("change", function (e) {
      var alvo = e.target;
      if (alvo && alvo.name === "item" && alvo.type === "checkbox") alternar(alvo);
    });

    var gerar = $('[data-nl="gerar-lista"]');
    if (gerar) gerar.addEventListener("click", function () { buscar(gerar, "Lista da semana pronta."); });

    var atualizar = $('[data-nl="atualizar"]');
    if (atualizar) atualizar.addEventListener("click", function () { buscar(atualizar, "Lista atualizada."); });

    $$('[data-nl="recarregar"]').forEach(function (b) {
      b.addEventListener("click", function () { location.reload(); });
    });

    /* o servidor não entregou a lista: tenta sozinho uma vez */
    if (!lista) {
      setTimeout(async function () {
        try {
          await NL.api("/api/me/shopping-list");
          location.reload();
        } catch (e) { /* segue com o aviso que já está na tela */ }
      }, 2500);
    }

    recalcular();
  });
})();
