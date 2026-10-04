/* =========================================================================
   Ilha: Plano. Gera o plano pela IA e acompanha a espera sem parecer travado.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  var $ = NL.$, $$ = NL.$$;

  var NOME = {
    cafe: "Café da manhã", lanche_manha: "Lanche da manhã", almoco: "Almoço",
    lanche_tarde: "Lanche da tarde", jantar: "Jantar", ceia: "Ceia"
  };
  var num = function (v) { return Number(v || 0).toLocaleString("pt-BR"); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  /* --------------------------- abas de dia ----------------------------- */
  function ligarAbas(raiz) {
    var abas = $$('[role="tab"]', raiz);
    if (!abas.length) return;
    function selecionar(i, foco) {
      abas.forEach(function (aba, n) {
        var on = n === i;
        aba.setAttribute("aria-selected", on ? "true" : "false");
        aba.tabIndex = on ? 0 : -1;
        var painel = document.getElementById(aba.getAttribute("aria-controls"));
        if (painel) painel.hidden = !on;
      });
      if (foco && abas[i]) abas[i].focus();
    }
    abas.forEach(function (aba, i) {
      aba.addEventListener("click", function () { selecionar(i); });
      aba.addEventListener("keydown", function (e) {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); selecionar((i + 1) % abas.length, true); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); selecionar((i - 1 + abas.length) % abas.length, true); }
        if (e.key === "Home") { e.preventDefault(); selecionar(0, true); }
        if (e.key === "End") { e.preventDefault(); selecionar(abas.length - 1, true); }
      });
    });
  }

  /* --------------------------- desenhar plano --------------------------- */
  function macrosTexto(m) {
    if (!m) return "";
    var t = [];
    if (m.protein != null) t.push(num(m.protein) + " g de proteína");
    if (m.carb != null) t.push(num(m.carb) + " g de carbo");
    if (m.fat != null) t.push(num(m.fat) + " g de gordura");
    return t.join(" · ");
  }

  function planoHTML(p) {
    var dias = (p && p.dias) || [];
    if (!dias.length) return "";
    var abas = '<div class="nl-dias" role="tablist" aria-label="Dias do plano">' + dias.map(function (d, i) {
      return '<button class="nl-dia" type="button" role="tab" id="aba-' + i + '" aria-controls="dia-' + i +
        '" aria-selected="' + (i === 0) + '" tabindex="' + (i === 0 ? 0 : -1) + '">' + esc(d.dia || "Dia " + (i + 1)) + "</button>";
    }).join("") + "</div>";
    var paineis = dias.map(function (d, i) {
      var itens = (d.refeicoes || []).map(function (r) {
        var mt = macrosTexto(r.macros);
        return '<li class="nl-linha"><span class="nl-linha-icone" aria-hidden="true"></span>' +
          '<span class="nl-linha-corpo"><b>' + esc(NOME[r.meal] || r.meal || "Refeição") + " · " + esc(r.titulo) + "</b>" +
          "<small>" + num(r.kcal) + " kcal" + (mt ? " · " + esc(mt) : "") + "</small></span></li>";
      }).join("");
      return '<div class="nl-painel-dia" id="dia-' + i + '" role="tabpanel" aria-labelledby="aba-' + i + '"' +
        (i === 0 ? "" : " hidden") + ' tabindex="0"><ul class="nl-lista">' + itens + "</ul>" +
        (d.kcal ? '<p class="nl-legenda">Total do dia: ' + num(d.kcal) + " kcal</p>" : "") + "</div>";
    }).join("");
    return abas + paineis;
  }

  /* ------------------------------ espera ------------------------------- */
  var PASSOS = ["fila", "processando", "montando"];
  function passo(nome) {
    var lista = $('[data-nl="passos"]');
    if (!lista) return;
    var alvo = PASSOS.indexOf(nome);
    $$("li", lista).forEach(function (li, i) {
      li.setAttribute("data-estado", i < alvo ? "feito" : i === alvo ? "indo" : "espera");
    });
  }

  NL.pronto(function () {
    ligarAbas($("#plano-ativo"));

    var form = $("#form-gerar");
    var espera = $("#espera-plano");
    var botao = $("#botao-gerar");
    if (!form) return;

    var relogio = null;
    function contar(desde) {
      var t = $('[data-nl="espera-tempo"]');
      relogio = setInterval(function () {
        var s = Math.round((Date.now() - desde) / 1000);
        if (t) t.textContent = s < 60 ? "já faz " + s + " segundos" : "já faz " + Math.floor(s / 60) + " min " + (s % 60) + " s";
      }, 1000);
    }
    function pararRelogio() { if (relogio) { clearInterval(relogio); relogio = null; } }

    function esperando(ligado) {
      if (espera) espera.hidden = !ligado;
      form.hidden = ligado;
      if (botao) botao.classList.toggle("is-loading", ligado);
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var dados = new FormData(form);
      var dias = parseInt(String(dados.get("days") || "3"), 10);
      var notas = String(dados.get("notes") || "").trim();
      var corpo = { days: dias };
      if (notas) corpo.notes = notas;

      esperando(true);
      passo("fila");
      contar(Date.now());

      try {
        var job = await NL.api("/api/ai/meal-plan", { method: "POST", body: corpo });
        passo(job.status === "processando" ? "processando" : "fila");

        var pronto = await NL.esperarJob(job.jobId, function (j) {
          if (j.status === "processando") passo("processando");
        });

        if (pronto.status === "erro") {
          NL.aviso(pronto.error || "A IA não conseguiu montar o plano. Tente de novo.", "erro");
          esperando(false);
          pararRelogio();
          return;
        }

        passo("montando");
        var saida = pronto.output || {};
        var plano = saida.plano || saida;
        var corpoPlano = $('[data-nl="plano-corpo"]');
        var html = planoHTML(plano);
        if (corpoPlano && html) {
          corpoPlano.innerHTML = html;
          ligarAbas($("#plano-ativo"));
          var cabeca = $("#plano-ativo h2");
          if (cabeca && plano.titulo) cabeca.textContent = plano.titulo;
          var sub = $("#plano-ativo .panel-sub");
          if (sub && plano.dias) sub.textContent = plano.dias.length + (plano.dias.length === 1 ? " dia" : " dias");
          NL.aviso("Plano pronto. Bom apetite.");
          $("#plano-ativo").scrollIntoView({ behavior: "smooth", block: "start" });
          cabeca && cabeca.setAttribute("tabindex", "-1");
          cabeca && cabeca.focus();
        } else {
          NL.aviso("O plano foi gerado, recarregando a tela.");
          location.reload();
        }
      } catch (erro) {
        NL.aviso(erro.code === "indisponivel"
          ? "A geração de planos está fora do ar neste instante. Tente de novo em alguns minutos."
          : (erro.message || "Não conseguimos gerar o plano agora."), "erro");
      } finally {
        esperando(false);
        pararRelogio();
      }
    });
  });
})();
