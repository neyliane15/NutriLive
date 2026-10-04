/* =========================================================================
   Ilha: autenticação — entrar, primeiro acesso, esqueci, redefinir.
   Cuida de: força da senha, conferência da repetição, envio e erro honesto.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  var $ = NL.$, $$ = NL.$$;

  /* --------------------- mensagens de erro honestas -------------------- */
  var RECADO = {
    credenciais_invalidas: "E-mail ou senha não conferem. Confira e tente de novo.",
    nao_encontrado: "Não achamos essa conta.",
    token_expirado: "Esse link já venceu. Peça um novo logo abaixo.",
    excesso_de_tentativas: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
    assinatura_inativa: "Sua assinatura está inativa. Veja a cobrança na tela de conta.",
    indisponivel: "O login está fora do ar neste instante. Tente de novo em alguns minutos.",
    erro_interno: "Algo quebrou do nosso lado. Já estamos sabendo — tente de novo em instantes."
  };
  function recado(erro) {
    if (erro && erro.code === "dados_invalidos" && erro.fields) return "";
    return (erro && RECADO[erro.code]) || (erro && erro.message) || "Não foi possível continuar.";
  }

  function alerta(form, texto) {
    var caixa = $(".nl-alerta", form);
    if (!caixa) { if (texto) NL.aviso(texto, "erro"); return; }
    var alvo = $('[data-nl="texto"]', caixa) || caixa;
    alvo.textContent = texto || "";
    caixa.setAttribute("data-cheio", texto ? "1" : "0");
  }

  /* ------------------------- força da senha ---------------------------- */
  function medir(senha) {
    var regras = {
      tamanho: senha.length >= 8,
      letras: /[a-zà-ú]/.test(senha) && /[A-ZÀ-Ú]/.test(senha),
      numero: /\d/.test(senha)
    };
    var pontos = 0;
    if (regras.tamanho) pontos++;
    if (regras.letras) pontos++;
    if (regras.numero) pontos++;
    if (senha.length >= 12) pontos++;
    if (/^(\d)\1+$/.test(senha) || /^12345678/.test(senha) || /senha/i.test(senha)) pontos = Math.min(pontos, 1);
    return { pontos: Math.min(pontos, 4), regras: regras };
  }
  var NOME_FORCA = ["aguardando", "fraca", "média", "boa", "forte"];

  function ligarMedidor(form) {
    var entrada = $("#password", form);
    var medidor = $('[data-nl="medidor"]', form);
    if (!entrada || !medidor) return;
    var textoForca = $('[data-nl="forca"]', form);
    var regras = $$('[data-nl="regras"] li', form);
    entrada.addEventListener("input", function () {
      var m = medir(entrada.value);
      medidor.setAttribute("data-score", entrada.value ? String(Math.max(1, m.pontos)) : "0");
      if (textoForca) textoForca.textContent = "Força da senha: " + NOME_FORCA[entrada.value ? Math.max(1, m.pontos) : 0];
      regras.forEach(function (li) {
        li.setAttribute("data-ok", m.regras[li.getAttribute("data-regra")] ? "1" : "0");
      });
    });
  }

  /* ---------------------- conferência da repetição --------------------- */
  function conferirRepeticao(form) {
    var a = $("#password", form), b = $("#confirmar", form);
    if (!a || !b) return true;
    var campo = b.closest(".field");
    var span = campo && $(".field-error", campo);
    if (a.value !== b.value) {
      if (campo) campo.classList.add("has-error");
      if (span) span.textContent = "As duas senhas precisam ser iguais.";
      b.setAttribute("aria-invalid", "true");
      b.focus();
      return false;
    }
    if (campo) campo.classList.remove("has-error");
    if (span) span.textContent = "";
    b.removeAttribute("aria-invalid");
    return true;
  }

  /* ----------------------------- envio --------------------------------- */
  function ligarEnvio(form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var botao = $('[type="submit"]', form);
      NL.limparErros(form);
      alerta(form, "");
      if (!conferirRepeticao(form)) return;

      var corpo = {};
      new FormData(form).forEach(function (v, k) {
        if (k === "confirmar") return;
        corpo[k] = typeof v === "string" ? v.trim() : v;
      });
      if (corpo.password) corpo.password = String(new FormData(form).get("password"));

      if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); }
      try {
        var r = await NL.api(form.getAttribute("data-rota"), { method: "POST", body: corpo });

        var esconder = form.getAttribute("data-esconde");
        var mostrar = form.getAttribute("data-sucesso");
        if (mostrar) {
          var caixa = document.getElementById(mostrar);
          var email = $('[data-nl="email"]', caixa || document);
          if (email && corpo.email) email.textContent = corpo.email;
          if (esconder) { var velha = document.getElementById(esconder); if (velha) velha.hidden = true; }
          if (caixa) {
            caixa.hidden = false;
            var titulo = $("h1", caixa);
            if (titulo) { titulo.setAttribute("tabindex", "-1"); titulo.focus(); }
          }
          return;
        }

        var destino = (r && r.redirect) || form.getAttribute("data-redirect");
        if (destino) { location.href = destino; return; }
        if (form.getAttribute("data-aviso")) NL.aviso(form.getAttribute("data-aviso"));
      } catch (erro) {
        if (erro.code === "dados_invalidos" && erro.fields) NL.mostrarErros(form, erro);
        alerta(form, recado(erro));
      } finally {
        if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); }
      }
    });
  }

  NL.pronto(function () {
    $$("form[data-rota]").forEach(function (form) {
      ligarMedidor(form);
      ligarEnvio(form);
    });
    /* Primeiro acesso: a pessoa acabou de pagar, já deixa o cursor na senha. */
    var primeiro = $("#form-primeiro");
    if (primeiro && window.matchMedia("(min-width: 700px)").matches) {
      var s = $("#password", primeiro);
      if (s) s.focus();
    }
  });
})();
