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


  /* ====================================================================== */
  /*  ui — peças que as telas de organização e de admin usam igual          */
  /* ====================================================================== */
  /*  Vive aqui, e não numa das ilhas, porque as duas precisam das mesmas
      coisas: <dialog>, erro dentro do diálogo, filtro que navega por
      querystring, paginação e o recado que precisa sobreviver a uma
      recarga. Duas cópias disso divergiriam na primeira correção. */

  function esc(v) {
    return String(v === null || v === undefined ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function limparErro(raiz) {
    $$("[data-fe2-erro]", raiz).forEach(function (p) { p.textContent = ""; });
    limparErros(raiz);
  }

  /** Erro de campo vai para o campo; o resto vai para a linha de erro do
      próprio diálogo — avisar num toast atrás do modal é não avisar. */
  function erroNoDialogo(raiz, erro) {
    var linha = $("[data-fe2-erro]", raiz);
    if (erro && erro.fields) {
      mostrarErros(raiz, { fields: erro.fields, message: "" });
      if (linha) linha.textContent = "";
      return;
    }
    var texto = (erro && erro.message) || "Não foi possível continuar.";
    if (linha) linha.textContent = texto;
    else aviso(texto, "erro");
  }

  function abrir(id) {
    var d = document.getElementById(id);
    if (!d) return null;
    limparErro(d);
    if (typeof d.showModal === "function") d.showModal(); else d.setAttribute("open", "");
    var primeiro = $(".input:not([disabled]), input[type=checkbox]", d);
    if (primeiro) setTimeout(function () { primeiro.focus(); }, 30);
    return d;
  }
  function fechar(d) {
    if (!d) return;
    if (typeof d.close === "function") d.close(); else d.removeAttribute("open");
  }

  /** Botão em espera enquanto a promessa não volta, sempre destravado no fim. */
  async function enviando(botao, tarefa) {
    if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); botao.disabled = true; }
    try { return await tarefa(); }
    finally { if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); botao.disabled = false; } }
  }

  /** Formulário de diálogo (data-fe2-form), que o ligarFormularios acima
      não pega de propósito: estes precisam do erro dentro do modal. */
  function ligarForm(seletor, aoEnviar) {
    var form = $(seletor);
    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      limparErro(form);
      var botao = $('[type="submit"]', form);
      try { await enviando(botao, function () { return aoEnviar(form); }); }
      catch (erro) { erroNoDialogo(form, erro); }
    });
  }

  var campoTexto = function (form, nome) {
    var el = form.elements[nome];
    return el ? String(el.value || "").trim() : "";
  };

  /** Uma tentativa de recuperação, não um laço: se a API continua fora,
      insistir só gasta bateria e deixa "tentando buscar de novo" para
      sempre na tela. Uma falha e a tela admite que falhou. */
  async function recuperar(rota) {
    if (!$("[data-fe2-recarregando]")) return;
    await new Promise(function (r) { setTimeout(r, 1200); });
    try { await api(rota); location.reload(); }
    catch (e) {
      $$("[data-fe2-recarregando]").forEach(function (el) {
        el.textContent = "Não conseguimos buscar agora. Recarregue a página em alguns instantes.";
      });
    }
  }

  /** Recado guardado antes de uma recarga: é como a confirmação de uma
      escrita sobrevive ao reload que ela mesma disparou. */
  function guardarRecado(texto, tom) {
    try { sessionStorage.setItem(tom === "erro" ? "nl-recado-erro" : "nl-recado", texto); } catch (e) {}
  }
  function mostrarRecado() {
    try {
      var ok = sessionStorage.getItem("nl-recado");
      var ruim = sessionStorage.getItem("nl-recado-erro");
      if (ok) { sessionStorage.removeItem("nl-recado"); aviso(ok); }
      if (ruim) { sessionStorage.removeItem("nl-recado-erro"); aviso(ruim, "erro"); }
    } catch (e) {}
  }

  /** Filtros que navegam por querystring. Sem JS a página ainda responde ao
      ?q= na URL, então isto é atalho, não requisito. `campos` é um objeto
      {idDoElemento: nomeDoParametro}; valor vazio ou "todos" não entra. */
  function ligarFiltros(base, campos, extras) {
    var ids = Object.keys(campos);
    var ir = function () {
      var p = new URLSearchParams();
      ids.forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;
        var v = String(el.value || "").trim();
        if (v && v !== "todos") p.set(campos[id], v);
      });
      Object.keys(extras || {}).forEach(function (k) { if (extras[k]) p.set(k, extras[k]); });
      var busca = p.toString();
      location.href = base + (busca ? "?" + busca : "");
    };
    ids.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      if (el.tagName === "SELECT") { el.addEventListener("change", ir); return; }
      /* Enter busca na hora; digitar espera o dedo parar, senão cada letra
         vira uma navegação. */
      var tempo = null;
      el.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); clearTimeout(tempo); ir(); }
      });
      el.addEventListener("input", function () { clearTimeout(tempo); tempo = setTimeout(ir, 650); });
    });
    return ir;
  }

  /** Botões de página (data-fe2-pagina) preservando os filtros atuais. */
  function ligarPaginacao() {
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-fe2-pagina]");
      if (!b || b.disabled) return;
      e.preventDefault();
      var destino = Number(b.getAttribute("data-fe2-pagina"));
      if (!destino || destino < 1) return;
      var p = new URLSearchParams(location.search);
      p.set("pagina", String(destino));
      p.delete("page");
      location.href = location.pathname + "?" + p.toString();
    });
  }

  /* Abrir e fechar diálogo funcionam em qualquer tela, sem a ilha pedir. */
  document.addEventListener("click", function (e) {
    var ab = e.target.closest("[data-fe2-abrir]");
    if (ab) { e.preventDefault(); abrir(ab.getAttribute("data-fe2-abrir")); return; }
    var fe = e.target.closest("[data-fe2-fechar]");
    if (fe) { e.preventDefault(); fechar(fe.closest("dialog")); }
  });

  window.NL = {
    boot: boot, api: api, aviso: aviso, $: $, $$: $$,
    mascara: mascara, soDigitos: so, aplicarMascaras: aplicarMascaras,
    limparErros: limparErros, mostrarErros: mostrarErros,
    esperarJob: esperarJob, pronto: pronto,
    ui: {
      esc: esc, abrir: abrir, fechar: fechar, limparErro: limparErro,
      erroNoDialogo: erroNoDialogo, enviando: enviando, ligarForm: ligarForm,
      campoTexto: campoTexto, recuperar: recuperar, guardarRecado: guardarRecado,
      ligarFiltros: ligarFiltros, ligarPaginacao: ligarPaginacao
    },
    brl: function (c) { return "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  };

  pronto(function () { aplicarMascaras(); ligarFormularios(); mostrarRecado(); });
})();
