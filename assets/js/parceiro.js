/* =========================================================================
   Nutri&Live — cadastro de academia parceira
   O site é estático: o envio monta uma mensagem e abre o e-mail do visitante,
   com cópia dos dados à mão caso ele não tenha cliente configurado.
   ========================================================================= */
(function () {
  "use strict";

  var DESTINO = "contatonelsystems@gmail.com";
  var form = document.querySelector("[data-partner-form]");
  if (!form) return;

  var $ = function (s, r) { return (r || document).querySelector(s); };

  var digits = function (v) { return (v || "").replace(/\D/g, ""); };

  function maskPhone(v) {
    var d = digits(v).slice(0, 11);
    if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  }

  var whats = $("#p-whats");
  whats.addEventListener("input", function () { whats.value = maskPhone(whats.value); });

  var RULES = {
    "p-academia": { test: function (v) { return v.trim().length >= 2; }, msg: "Diga o nome da academia." },
    "p-responsavel": { test: function (v) { return v.trim().length >= 5 && v.trim().indexOf(" ") > 0; }, msg: "Nome e sobrenome de quem vai falar com a gente." },
    "p-email": { test: function (v) { return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v.trim()); }, msg: "Confira o e-mail — parece que falta algo." },
    "p-whats": { test: function (v) { var d = digits(v); return d.length === 10 || d.length === 11; }, msg: "Informe o DDD e o número." },
    "p-cidade": { test: function (v) { return v.trim().length >= 3; }, msg: "Cidade e estado, por favor." },
    "p-alunos": { test: function (v) { return !!v; }, msg: "Escolha uma faixa." }
  };

  function setError(id, msg) {
    var field = $('[data-field="' + id + '"]');
    var err = $("#err-" + id);
    if (err) err.textContent = msg || "";
    if (field) {
      field.classList.toggle("has-error", !!msg);
      var input = $(".input", field);
      if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
    }
  }

  Object.keys(RULES).forEach(function (id) {
    var el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("blur", function () { if (el.value.trim()) setError(id, RULES[id].test(el.value) ? "" : RULES[id].msg); });
    el.addEventListener("input", function () {
      var f = $('[data-field="' + id + '"]');
      if (f && f.classList.contains("has-error") && RULES[id].test(el.value)) setError(id, "");
    });
  });

  function montarMensagem() {
    var val = function (id) { return (document.getElementById(id).value || "").trim(); };
    var linhas = [
      "Cadastro de academia parceira — Nutri&Live",
      "",
      "Academia: " + val("p-academia"),
      "Responsável: " + val("p-responsavel"),
      "E-mail: " + val("p-email"),
      "WhatsApp: " + val("p-whats"),
      "Cidade/UF: " + val("p-cidade"),
      "Alunos ativos: " + val("p-alunos")
    ];
    var msg = val("p-msg");
    if (msg) linhas.push("", "Observações:", msg);
    linhas.push("", "Enviado pelo site em " + new Date().toLocaleString("pt-BR"));
    return linhas.join("\n");
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var geral = $("#err-partner");
    geral.textContent = "";

    var ok = true, primeiro = null;
    Object.keys(RULES).forEach(function (id) {
      var el = document.getElementById(id);
      if (!RULES[id].test(el.value)) {
        setError(id, RULES[id].msg);
        ok = false;
        if (!primeiro) primeiro = el;
      } else setError(id, "");
    });

    if (!ok) {
      geral.textContent = "Confira os campos destacados para continuar.";
      if (primeiro) {
        primeiro.focus({ preventScroll: true });
        primeiro.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      return;
    }

    var corpo = montarMensagem();
    form.dataset.corpo = corpo;

    var assunto = "Parceria Nutri&Live — " + (document.getElementById("p-academia").value || "").trim();
    var href = "mailto:" + DESTINO + "?subject=" + encodeURIComponent(assunto) + "&body=" + encodeURIComponent(corpo);

    var aviso = $("[data-partner-sent]");
    aviso.hidden = false;
    aviso.setAttribute("role", "status");
    aviso.scrollIntoView({ behavior: "smooth", block: "center" });

    // Um link clicado deixa a página intacta se o visitante não tiver
    // cliente de e-mail; atribuir location.href pode esvaziar a aba.
    var a = document.createElement("a");
    a.href = href;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); }, 0);
  });

  var copiar = $("[data-partner-copy]");
  if (copiar) {
    copiar.addEventListener("click", function () {
      var texto = form.dataset.corpo || montarMensagem();
      var feito = function () {
        var rotulo = copiar.querySelector("span");
        var antes = rotulo.textContent;
        rotulo.textContent = "Copiado";
        setTimeout(function () { rotulo.textContent = antes; }, 2400);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(feito, fallback);
      } else fallback();
      function fallback() {
        var ta = document.createElement("textarea");
        ta.value = texto;
        ta.setAttribute("readonly", "");
        ta.style.cssText = "position:absolute;left:-9999px";
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand("copy"); feito(); } catch (err) {}
        document.body.removeChild(ta);
      }
    });
  }
})();
