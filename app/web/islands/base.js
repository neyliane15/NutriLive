/* =========================================================================
   Nutri&Live — base do cliente
   Carregado em toda tela. Expõe window.NL com o mínimo que as ilhas usam.
   Sem framework, sem build.
   ========================================================================= */
(function () {
  "use strict";

  var boot = {};
  try { boot = JSON.parse(document.getElementById("nl-boot").textContent || "{}"); } catch (e) {}

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ------------------------------ API ---------------------------------- */
  async function api(rota, opcoes) {
    opcoes = opcoes || {};
    var resp = await fetch(rota, {
      method: opcoes.method || (opcoes.body ? "POST" : "GET"),
      headers: opcoes.body ? { "content-type": "application/json" } : undefined,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined,
      credentials: "same-origin"
    });
    var dados = null;
    try { dados = await resp.json(); } catch (e) {}
    if (!resp.ok) {
      var erro = (dados && dados.error) || { code: "erro_interno", message: "Algo deu errado." };
      erro.status = resp.status;
      throw erro;
    }
    return dados;
  }

  /* ---------------------------- mensagens ------------------------------ */
  function area() {
    var a = $(".toast-area");
    if (!a) { a = document.createElement("div"); a.className = "toast-area"; document.body.appendChild(a); }
    return a;
  }
  function aviso(texto, tom) {
    var t = document.createElement("div");
    t.className = "toast" + (tom === "erro" ? " erro" : "");
    t.setAttribute("role", tom === "erro" ? "alert" : "status");
    t.textContent = texto;
    area().appendChild(t);
    setTimeout(function () { t.remove(); }, tom === "erro" ? 6000 : 3800);
  }

  /* --------------------------- erros de campo -------------------------- */
  function limparErros(form) {
    $$(".field.has-error", form).forEach(function (f) { f.classList.remove("has-error"); });
    $$(".field-error", form).forEach(function (e) { e.textContent = ""; });
  }
  function mostrarErros(form, erro) {
    limparErros(form);
    var primeiro = null;
    if (erro.fields) {
      Object.keys(erro.fields).forEach(function (nome) {
        var campo = $('[data-field="' + nome + '"]', form) || $('[data-field="' + nome.split(".").pop() + '"]', form);
        if (!campo) return;
        campo.classList.add("has-error");
        var span = $(".field-error", campo);
        if (span) span.textContent = erro.fields[nome];
        var input = $(".input", campo);
        if (input) { input.setAttribute("aria-invalid", "true"); if (!primeiro) primeiro = input; }
      });
    }
    if (primeiro) { primeiro.focus({ preventScroll: true }); primeiro.scrollIntoView({ behavior: "smooth", block: "center" }); }
    else aviso(erro.message || "Não foi possível continuar.", "erro");
  }

  /* ------------------------------ máscaras ----------------------------- */
  var so = function (v) { return String(v || "").replace(/\D/g, ""); };
  var mascara = {
    cpf: function (v) {
      var d = so(v).slice(0, 11);
      return d.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
    },
    telefone: function (v) {
      var d = so(v).slice(0, 11);
      if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
      return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
    },
    peso: function (v) {
      var d = so(v).slice(0, 4);
      return d.length > 1 ? d.slice(0, -1) + "," + d.slice(-1) : d;
    }
  };
  function aplicarMascaras(raiz) {
    $$("[data-mask]", raiz || document).forEach(function (el) {
      var fn = mascara[el.getAttribute("data-mask")];
      if (!fn || el.dataset.maskOn) return;
      el.dataset.maskOn = "1";
      el.addEventListener("input", function () { el.value = fn(el.value); });
    });
  }

  /* --------------------- envio de formulário padrão -------------------- */
  /* <form data-api="/api/rota" data-redirect="/hoje"> */
  function ligarFormularios(raiz) {
    $$("form[data-api]", raiz || document).forEach(function (form) {
      if (form.dataset.ligado) return;
      form.dataset.ligado = "1";
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var botao = $('[type="submit"]', form);
        limparErros(form);
        if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); }
        try {
          var corpo = {};
          new FormData(form).forEach(function (v, k) { corpo[k] = typeof v === "string" ? v.trim() : v; });
          if (form.dataset.unmask) {
            form.dataset.unmask.split(",").forEach(function (k) { if (corpo[k]) corpo[k] = so(corpo[k]); });
          }
          var r = await api(form.getAttribute("data-api"), { method: form.getAttribute("data-method") || "POST", body: corpo });
          form.dispatchEvent(new CustomEvent("nl:ok", { detail: r }));
          var destino = (r && r.redirect) || form.getAttribute("data-redirect");
          if (destino) location.href = destino;
          else if (form.getAttribute("data-aviso")) aviso(form.getAttribute("data-aviso"));
        } catch (erro) {
          mostrarErros(form, erro);
          form.dispatchEvent(new CustomEvent("nl:erro", { detail: erro }));
        } finally {
          if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); }
        }
      });
    });
  }

  /* ------------------------ espera de job de IA ------------------------ */
  async function esperarJob(jobId, aoMudar) {
    var espera = 900;
    for (var i = 0; i < 60; i++) {
      var j = await api("/api/ai/jobs/" + jobId);
      if (aoMudar) aoMudar(j);
      if (j.status === "concluido" || j.status === "erro") return j;
      await new Promise(function (r) { setTimeout(r, espera); });
      espera = Math.min(espera * 1.25, 4000);
    }
    throw { code: "indisponivel", message: "A geração demorou demais. Tente de novo." };
  }

  function pronto(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  window.NL = {
    boot: boot, api: api, aviso: aviso, $: $, $$: $$,
    mascara: mascara, soDigitos: so, aplicarMascaras: aplicarMascaras,
    limparErros: limparErros, mostrarErros: mostrarErros,
    esperarJob: esperarJob, pronto: pronto,
    brl: function (c) { return "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  };

  pronto(function () { aplicarMascaras(); ligarFormularios(); });
})();
