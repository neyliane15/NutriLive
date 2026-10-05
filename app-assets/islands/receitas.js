/* =========================================================================
   Ilha: Receitas. Manda os ingredientes para a IA e espera o job.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  var $ = NL.$, $$ = NL.$$;

  var num = function (v) { return Number(v || 0).toLocaleString("pt-BR"); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  function meta(r) {
    var p = [];
    if (r.timeMin) p.push(num(r.timeMin) + " min");
    if (r.kcal) p.push(num(r.kcal) + " kcal");
    var m = r.macros || {};
    if (m.protein != null) p.push(num(m.protein) + " g de proteína");
    if (m.carb != null) p.push(num(m.carb) + " g de carbo");
    if (m.fat != null) p.push(num(m.fat) + " g de gordura");
    return p.join(" · ");
  }

  function receitaHTML(r) {
    var combina = r.matchPct != null
      ? '<div><div class="bar"><i style="width:' + Math.max(0, Math.min(100, r.matchPct)) + '%"></i></div>' +
        '<p class="nl-legenda" style="color:var(--leaf-700);font-weight:var(--fw-semi)">' +
        num(r.matchPct) + "% de combinação com o seu plano</p></div>"
      : "";
    var detalhe = "";
    var ing = r.ingredients || [], passos = r.steps || [];
    if (ing.length || passos.length) {
      detalhe = '<details><summary class="link" style="cursor:pointer;min-height:44px;display:flex;align-items:center">Ver o modo de fazer</summary>' +
        (ing.length ? '<p class="nl-rotulo" style="margin-top:var(--sp-3)">Ingredientes</p><ul style="margin:.375rem 0 0;padding-left:1.125rem;font-size:var(--fs-sm);color:var(--text-muted);display:grid;gap:.25rem">' +
          ing.map(function (i) { return "<li>" + esc(i) + "</li>"; }).join("") + "</ul>" : "") +
        (passos.length ? '<p class="nl-rotulo" style="margin-top:var(--sp-4)">Passo a passo</p><ol style="margin:.375rem 0 0;padding-left:1.125rem;font-size:var(--fs-sm);color:var(--text-muted);display:grid;gap:.375rem">' +
          passos.map(function (s) { return "<li>" + esc(s) + "</li>"; }).join("") + "</ol>" : "") +
        "</details>";
    }
    return '<article class="card" style="display:grid;gap:.625rem">' +
      '<h3 style="font-size:var(--fs-h4);font-weight:var(--fw-bold);letter-spacing:-0.016em">' + esc(r.title) + "</h3>" +
      '<p style="font-size:var(--fs-sm);color:var(--text-muted)">' + esc(meta(r)) + "</p>" +
      combina + detalhe + "</article>";
  }

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
    var form = $("#form-receitas");
    var espera = $("#espera-receitas");
    var botao = $("#botao-receitas");
    if (!form) return;

    var relogio = null;
    function contar(desde) {
      var t = $('[data-nl="espera-tempo"]');
      relogio = setInterval(function () {
        var s = Math.round((Date.now() - desde) / 1000);
        if (t) t.textContent = s < 60 ? "já faz " + s + " segundos" : "já faz " + Math.floor(s / 60) + " min " + (s % 60) + " s";
      }, 1000);
    }

    function esperando(ligado) {
      if (espera) espera.hidden = !ligado;
      form.hidden = ligado;
      if (botao) botao.classList.toggle("is-loading", ligado);
    }

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      NL.limparErros(form);
      var dados = new FormData(form);
      var ingredientes = String(dados.get("ingredients") || "").trim();
      if (ingredientes.length < 3) {
        NL.mostrarErros(form, { code: "dados_invalidos", message: "Diga o que você tem em casa.",
          fields: { ingredients: "Escreva pelo menos um ingrediente." } });
        return;
      }
      var corpo = { ingredients: ingredientes };
      var minutos = parseInt(String(dados.get("maxMinutes") || "0"), 10);
      if (minutos > 0) corpo.maxMinutes = minutos;

      esperando(true);
      passo("fila");
      contar(Date.now());

      try {
        var job = await NL.api("/api/ai/recipes", { method: "POST", body: corpo });
        var pronto = await NL.esperarJob(job.jobId, function (j) {
          if (j.status === "processando") passo("processando");
        });

        if (pronto.status === "erro") {
          NL.aviso(pronto.error || "A IA não conseguiu montar receitas com isso. Tente outros ingredientes.", "erro");
          return;
        }

        passo("montando");
        var saida = pronto.output || {};
        var lista = saida.receitas || saida.recipes || (Array.isArray(saida) ? saida : []);
        var alvo = $('[data-nl="lista-receitas"]');
        if (!alvo) return;

        if (!lista.length) {
          alvo.innerHTML = '<div class="empty"><h3>Nada deu certo com esses ingredientes</h3>' +
            "<p>Tente acrescentar uma proteína ou aumentar o tempo de preparo.</p></div>";
          return;
        }
        alvo.innerHTML = '<div class="nl-pares">' + lista.map(receitaHTML).join("") + "</div>";
        var titulo = $("#resultados h2");
        var sub = $("#resultados .panel-sub");
        if (sub) sub.textContent = lista.length + (lista.length === 1 ? " opção" : " opções");
        if (titulo) { titulo.setAttribute("tabindex", "-1"); titulo.focus(); }
        NL.aviso(lista.length + (lista.length === 1 ? " receita encontrada." : " receitas encontradas."));
      } catch (erro) {
        NL.aviso(erro.code === "indisponivel"
          ? "A busca de receitas está fora do ar neste instante. Tente de novo em alguns minutos."
          : (erro.message || "Não conseguimos buscar receitas agora."), "erro");
      } finally {
        esperando(false);
        if (relogio) { clearInterval(relogio); relogio = null; }
      }
    });
  });
})();
