/* =========================================================================
   Ilha: Hoje. Registra refeição e água e redesenha os números sem recarregar.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  var $ = NL.$, $$ = NL.$$;

  var NOME = {
    cafe: "Café da manhã", lanche_manha: "Lanche da manhã", almoco: "Almoço",
    lanche_tarde: "Lanche da tarde", jantar: "Jantar", ceia: "Ceia"
  };

  var pct = function (p, t) { return t > 0 ? Math.max(0, Math.min(100, Math.round((p / t) * 100))) : 0; };
  var num = function (v, c) { c = c || 0; return v.toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }); };
  var litros = function (ml) { return num(ml / 1000, 1); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var hora = function (iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "" : d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  function recadoDoScore(s) {
    if (s >= 85) return "Dia redondo. Continua assim.";
    if (s >= 60) return "Está indo bem. Falta pouco para fechar o dia.";
    if (s >= 30) return "Dá tempo de virar o dia. Comece pela água.";
    return "Nada registrado ainda. Um registro já muda esse número.";
  }

  function anelSVG(score) {
    var r = 15.5, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, score));
    return '<svg class="nl-anel" viewBox="0 0 40 40" width="104" height="104" role="img" aria-label="Score do dia: ' + p + ' de 100">' +
      '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="3.6"/>' +
      '<circle cx="20" cy="20" r="' + r + '" fill="none" stroke="var(--lime-300)" stroke-width="3.6" stroke-linecap="round" ' +
      'stroke-dasharray="' + c.toFixed(2) + '" stroke-dashoffset="' + (c * (1 - p / 100)).toFixed(2) + '" transform="rotate(-90 20 20)"/>' +
      '<text x="20" y="21.6" text-anchor="middle" font-size="12.6" font-weight="800" letter-spacing="-0.04em" fill="#fff">' + p + '</text>' +
      '<text x="20" y="27.4" text-anchor="middle" font-size="5.2" font-weight="700" letter-spacing="0.05em" fill="rgba(234,246,238,.66)">/100</text>' +
      "</svg>";
  }

  /* ----------------------------- redesenho ----------------------------- */
  function pintar(h) {
    if (!h) return;

    var alvoAnel = $('[data-nl="anel"]');
    if (alvoAnel) alvoAnel.innerHTML = anelSVG(h.score);
    var recado = $('[data-nl="recado"]');
    if (recado) recado.textContent = recadoDoScore(h.score);

    var chips = $('[data-nl="chips"]');
    if (chips) {
      var valores = [
        h.meals.length + " de 5",
        litros(h.waterMl.consumed) + " / " + litros(h.waterMl.target) + " L",
        pct(h.kcal.consumed, h.kcal.target) + "%",
        pct(h.protein.consumed, h.protein.target) + "%"
      ];
      $$(".nl-chip b", chips).forEach(function (b, i) { if (valores[i]) b.textContent = valores[i]; });
    }

    pintarMetrica($('[data-nl="cartao-kcal"]'), num(h.kcal.consumed), " de " + num(h.kcal.target) + " kcal",
      pct(h.kcal.consumed, h.kcal.target),
      h.kcal.consumed <= h.kcal.target
        ? "Ainda cabem " + num(Math.max(0, h.kcal.target - h.kcal.consumed)) + " kcal"
        : num(h.kcal.consumed - h.kcal.target) + " kcal acima da meta");

    pintarMetrica($('[data-nl="cartao-prot"]'), num(h.protein.consumed), " de " + num(h.protein.target) + " g",
      pct(h.protein.consumed, h.protein.target),
      pct(h.protein.consumed, h.protein.target) + "% da meta do dia");

    var agua = $('[data-nl="cartao-agua"]');
    if (agua) {
      var falta = h.waterMl.target - h.waterMl.consumed;
      pintarMetrica(agua, litros(h.waterMl.consumed), " de " + litros(h.waterMl.target) + " L",
        pct(h.waterMl.consumed, h.waterMl.target),
        falta > 0 ? "Faltam " + num(falta) + " ml" : "Meta do dia batida");
    }

    var lista = $('[data-nl="lista-refeicoes"]');
    if (lista) lista.innerHTML = listaHTML(h.meals);
    var sub = $('.panel-sub');
    if (sub && lista) sub.textContent = h.meals.length + (h.meals.length === 1 ? " registro" : " registros");
  }

  function pintarMetrica(raiz, valor, unidade, enchimento, pe) {
    if (!raiz) return;
    var v = $(".metric-value", raiz);
    if (v) v.innerHTML = esc(valor) + "<small>" + esc(unidade) + "</small>";
    var barra = $(".bar > i", raiz);
    if (barra) barra.style.width = enchimento + "%";
    var foot = $(".metric-foot", raiz);
    if (foot) foot.textContent = pe;
  }

  function listaHTML(ms) {
    if (!ms || !ms.length) {
      return '<div class="empty"><span class="icon-tile" aria-hidden="true"></span>' +
        "<h3>Nada registrado hoje</h3>" +
        "<p>Anote a primeira refeição e o score do dia já começa a subir.</p></div>";
    }
    return '<ul class="nl-lista">' + ms.map(function (m) {
      return '<li class="nl-linha"><span class="nl-linha-icone" aria-hidden="true"></span>' +
        '<span class="nl-linha-corpo"><b>' + esc(NOME[m.meal] || m.meal) + "</b><small>" +
        esc(m.description) + (hora(m.loggedAt) ? " · " + hora(m.loggedAt) : "") + "</small></span>" +
        '<span class="nl-linha-meta">' + num(m.kcal) + " kcal</span></li>";
    }).join("") + "</ul>";
  }

  /* ------------------------------ buscar ------------------------------- */
  async function recarregarDados(silencioso) {
    try {
      var h = await NL.api("/api/me/today");
      pintar(h);
      return h;
    } catch (erro) {
      if (!silencioso) {
        NL.aviso(erro.code === "indisponivel"
          ? "O resumo de hoje está fora do ar. Seu registro foi salvo."
          : (erro.message || "Não foi possível atualizar os números."), "erro");
      }
      return null;
    }
  }

  /* ---------------------------- interações ----------------------------- */
  NL.pronto(function () {
    /* abrir e fechar o formulário de refeição */
    var abrir = $('[data-nl="abrir-registro"]');
    var form = $("#form-refeicao");
    function mostrarForm(aberto) {
      if (!form || !abrir) return;
      form.hidden = !aberto;
      abrir.setAttribute("aria-expanded", aberto ? "true" : "false");
      abrir.hidden = aberto;
      if (aberto) { var p = $("#description", form); if (p) p.focus(); }
      else abrir.focus();
    }
    if (abrir) abrir.addEventListener("click", function () { mostrarForm(true); });
    var fechar = $('[data-nl="fechar-registro"]');
    if (fechar) fechar.addEventListener("click", function () { mostrarForm(false); });

    /* salvar refeição — o contrato pede kcal numérico, então o envio é nosso */
    if (form) {
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var botao = $('[type="submit"]', form);
        NL.limparErros(form);
        var dados = new FormData(form);
        var corpo = {
          meal: String(dados.get("meal") || "almoco"),
          description: String(dados.get("description") || "").trim()
        };
        var kcal = String(dados.get("kcal") || "").replace(/\D/g, "");
        if (kcal) corpo.kcal = parseInt(kcal, 10);

        if (corpo.description.length < 2) {
          NL.mostrarErros(form, { code: "dados_invalidos", message: "Diga o que você comeu.",
            fields: { description: "Escreva ao menos duas letras." } });
          return;
        }

        if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); }
        try {
          var r = await NL.api("/api/me/food-log", { method: "POST", body: corpo });
          form.reset();
          mostrarForm(false);
          NL.aviso("Refeição registrada" + (r && r.kcal ? " · " + num(r.kcal) + " kcal" : "") + ".");
          await recarregarDados(true);
        } catch (erro) {
          if (erro.code === "indisponivel") {
            NL.aviso("O registro de refeições está fora do ar agora. Tente de novo em instantes.", "erro");
          } else {
            NL.mostrarErros(form, erro);
          }
        } finally {
          if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); }
        }
      });
    }

    /* água */
    $$("[data-agua]").forEach(function (b) {
      b.addEventListener("click", async function () {
        var ml = parseInt(b.getAttribute("data-agua"), 10);
        b.classList.add("is-loading");
        b.setAttribute("aria-busy", "true");
        try {
          await NL.api("/api/me/water", { method: "POST", body: { ml: ml } });
          NL.aviso("+" + num(ml) + " ml de água.");
          await recarregarDados(true);
        } catch (erro) {
          NL.aviso(erro.code === "indisponivel"
            ? "Não deu para registrar a água agora. Tente de novo em instantes."
            : (erro.message || "Não deu para registrar a água."), "erro");
        } finally {
          b.classList.remove("is-loading");
          b.removeAttribute("aria-busy");
        }
      });
    });

    /* tentar de novo quando o servidor não entregou o dia */
    $$('[data-nl="recarregar"]').forEach(function (b) {
      b.addEventListener("click", function () { location.reload(); });
    });

    /* sem dados do servidor: tenta uma vez por conta própria */
    if (!NL.boot.hoje) {
      setTimeout(async function () {
        var h = await recarregarDados(true);
        if (h) location.reload();
      }, 2500);
    }
  });
})();
