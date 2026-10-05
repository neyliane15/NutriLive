/* =========================================================================
   Ilha: Conta. Salva o perfil e mostra as metas recalculadas, mede a força
   da nova senha e conduz o cancelamento com confirmação.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  var $ = NL.$, $$ = NL.$$;

  var num = function (v) { return Number(v || 0).toLocaleString("pt-BR"); };
  var lista = function (texto) {
    return String(texto || "").split(/[,;\n]/).map(function (t) { return t.trim(); })
      .filter(function (t) { return t.length > 0; });
  };

  function alerta(chave, texto) {
    var caixa = $('[data-nl="erro-' + chave + '"]');
    if (!caixa) return;
    var alvo = $('[data-nl="erro-' + chave + '-texto"]', caixa) || caixa;
    if (texto) {
      alvo.textContent = texto;
      caixa.setAttribute("data-cheio", "1");
    } else {
      alvo.textContent = "";
      caixa.removeAttribute("data-cheio");
    }
  }

  /* ============================ perfil ================================= */
  function ligarPerfil() {
    var form = $("#form-perfil");
    if (!form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      NL.limparErros(form);
      alerta("perfil", "");

      var dados = new FormData(form);
      var corpo = {};

      var nasc = String(dados.get("birthDate") || "").trim();
      if (nasc) corpo.birthDate = nasc;
      var sexo = String(dados.get("sex") || "").trim();
      if (sexo) corpo.sex = sexo;

      var alturaBruta = String(dados.get("heightCm") || "").replace(/\D/g, "");
      if (alturaBruta) {
        var altura = parseInt(alturaBruta, 10);
        if (!(altura >= 90 && altura <= 250)) {
          NL.mostrarErros(form, {
            code: "dados_invalidos", message: "Altura fora do esperado.",
            fields: { heightCm: "Use um valor entre 90 e 250 cm." }
          });
          return;
        }
        corpo.heightCm = altura;
      }

      var objetivo = dados.get("goal");
      if (objetivo) corpo.goal = String(objetivo);
      var atividade = String(dados.get("activityLevel") || "");
      if (atividade) corpo.activityLevel = atividade;
      var estilo = String(dados.get("dietStyle") || "");
      if (estilo) corpo.dietStyle = estilo;

      var marcadas = dados.getAll("restriction").map(String);
      corpo.restrictions = marcadas.concat(lista(dados.get("restrictionsOutras")));
      corpo.dislikes = lista(dados.get("dislikes"));

      var botao = $('[type="submit"]', form);
      if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); }
      try {
        var r = await NL.api("/api/me/profile", { method: "PUT", body: corpo });
        NL.aviso("Perfil salvo. As suas metas foram recalculadas.");
        pintarMetas(r);
      } catch (erro) {
        if (erro.code === "indisponivel") {
          alerta("perfil", "O serviço de perfil está fora do ar neste instante. Tente de novo em alguns minutos.");
        } else if (erro.fields) {
          NL.mostrarErros(form, erro);
        } else {
          alerta("perfil", erro.message || "Não deu para salvar o perfil agora.");
        }
      } finally {
        if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); }
      }
    });
  }

  function pintarMetas(r) {
    if (!r) return;
    var pares = [["meta-kcal", r.kcalTarget], ["meta-prot", r.proteinTargetG], ["meta-agua", r.waterTargetMl]];
    pares.forEach(function (par) {
      var el = $('[data-nl="' + par[0] + '"]');
      if (el && par[1] != null) el.textContent = num(par[1]);
    });
    var painel = $("#painel-metas");
    if (painel) {
      painel.setAttribute("data-atualizado", "1");
      setTimeout(function () { painel.removeAttribute("data-atualizado"); }, 1800);
    }
  }

  /* ============================= senha ================================= */
  /** Força de 0 a 4. Conta tamanho e variedade, não truques. */
  function forcaDaSenha(s) {
    s = String(s || "");
    if (!s) return { score: 0, texto: "Use oito caracteres ou mais." };
    var regras = {
      tamanho: s.length >= 8,
      letra: /[a-zA-ZÀ-ÿ]/.test(s),
      numero: /\d/.test(s),
      variado: /[A-ZÀ-Þ]/.test(s) || /[^\w\sÀ-ÿ]/.test(s)
    };
    var pontos = 0;
    Object.keys(regras).forEach(function (k) { if (regras[k]) pontos++; });
    if (s.length >= 14 && pontos >= 3) pontos = 4;
    if (s.length < 8) pontos = Math.min(pontos, 1);
    var textos = ["Use oito caracteres ou mais.", "Fraca — ainda dá para adivinhar.",
      "Razoável — dá para melhorar.", "Boa senha.", "Senha forte."];
    return { score: pontos, texto: textos[pontos], regras: regras };
  }

  function ligarSenha() {
    var form = $("#form-senha");
    if (!form) return;
    var nova = $("#next", form);
    var medidor = $('[data-nl="forca"]', form);
    var textoForca = $('[data-nl="forca-texto"]', form);
    var regras = $('[data-nl="regras"]', form);

    function medir() {
      var f = forcaDaSenha(nova.value);
      if (medidor) medidor.setAttribute("data-score", String(f.score));
      if (textoForca) textoForca.textContent = f.texto;
      if (regras && f.regras) {
        $$("li", regras).forEach(function (li) {
          var k = li.getAttribute("data-regra");
          if (f.regras[k]) li.setAttribute("data-ok", "1");
          else li.removeAttribute("data-ok");
        });
      }
    }
    if (nova) nova.addEventListener("input", medir);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      NL.limparErros(form);
      alerta("senha", "");
      var dados = new FormData(form);
      var atual = String(dados.get("current") || "");
      var proxima = String(dados.get("next") || "");
      var repete = String(dados.get("confirm") || "");

      if (atual.length < 8) {
        NL.mostrarErros(form, { code: "dados_invalidos", message: "Confira a senha atual.",
          fields: { current: "Digite a sua senha de hoje." } });
        return;
      }
      if (proxima.length < 8) {
        NL.mostrarErros(form, { code: "dados_invalidos", message: "A nova senha é curta demais.",
          fields: { next: "Use pelo menos 8 caracteres." } });
        return;
      }
      if (proxima === atual) {
        NL.mostrarErros(form, { code: "dados_invalidos", message: "A nova senha é igual à atual.",
          fields: { next: "Escolha uma senha diferente da atual." } });
        return;
      }
      if (proxima !== repete) {
        NL.mostrarErros(form, { code: "dados_invalidos", message: "As senhas não batem.",
          fields: { confirm: "Repita exatamente a nova senha." } });
        return;
      }

      var botao = $('[type="submit"]', form);
      if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); }
      try {
        await NL.api("/api/auth/change-password", { method: "POST", body: { current: atual, next: proxima } });
        form.reset();
        if (medidor) medidor.setAttribute("data-score", "0");
        if (textoForca) textoForca.textContent = "Use oito caracteres ou mais.";
        if (regras) $$("li", regras).forEach(function (li) { li.removeAttribute("data-ok"); });
        NL.aviso("Senha trocada. As outras sessões foram encerradas.");
      } catch (erro) {
        if (erro.code === "indisponivel") {
          alerta("senha", "A troca de senha está fora do ar neste instante. Tente de novo em alguns minutos.");
        } else if (erro.fields) {
          NL.mostrarErros(form, erro);
        } else if (erro.code === "credenciais_invalidas") {
          NL.mostrarErros(form, { code: erro.code, message: erro.message,
            fields: { current: "Essa não é a sua senha atual." } });
        } else {
          alerta("senha", erro.message || "Não deu para trocar a senha agora.");
        }
      } finally {
        if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); }
      }
    });
  }

  /* =========================== cancelamento ============================ */
  function ligarCancelamento() {
    var dialogo = $("#dlg-cancelar");
    var abrir = $('[data-nl="abrir-cancelar"]');
    if (!dialogo || !abrir) return;
    var form = $("#form-cancelar", dialogo);
    var erro = $('[data-nl="erro-cancelar"]', dialogo);
    var voltarPara = null;

    function mostrarErro(texto) {
      if (!erro) return;
      erro.textContent = texto || "";
      if (texto) erro.setAttribute("data-cheio", "1");
      else erro.removeAttribute("data-cheio");
    }

    function abrirDialogo() {
      voltarPara = document.activeElement;
      mostrarErro("");
      if (typeof dialogo.showModal === "function") dialogo.showModal();
      else dialogo.setAttribute("open", "");
      var primeiro = $("#motivo", dialogo);
      if (primeiro) primeiro.focus();
    }
    function fechar() {
      if (typeof dialogo.close === "function") dialogo.close();
      else dialogo.removeAttribute("open");
      if (voltarPara && voltarPara.focus) voltarPara.focus();
    }

    abrir.addEventListener("click", abrirDialogo);
    $$('[data-nl="fechar-cancelar"]', dialogo).forEach(function (b) {
      b.addEventListener("click", fechar);
    });

    if (!form) return;
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      mostrarErro("");
      var dados = new FormData(form);
      if (!dados.get("ciente")) {
        mostrarErro("Marque a confirmação para seguir com o cancelamento.");
        var caixa = $("#ciente", form);
        if (caixa) caixa.focus();
        return;
      }
      var motivo = String(dados.get("motivo") || "").trim();
      var texto = String(dados.get("reason") || "").trim();
      var corpo = {};
      var junto = [motivo, texto].filter(Boolean).join(" — ");
      if (junto) corpo.reason = junto.slice(0, 400);

      var botao = $('[type="submit"]', form);
      if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); }
      try {
        var r = await NL.api("/api/subscription/cancel", { method: "POST", body: corpo });
        fechar();
        var ate = (r && r.accessUntil) || (NL.boot && NL.boot.acessoAte);
        var quando = ate ? new Date(ate).toLocaleDateString("pt-BR") : null;
        NL.aviso(quando
          ? "Assinatura cancelada. Seu acesso continua até " + quando + "."
          : "Assinatura cancelada.");
        setTimeout(function () { location.reload(); }, 1400);
      } catch (err) {
        mostrarErro(err.code === "indisponivel"
          ? "O cancelamento está fora do ar neste instante. Tente de novo em alguns minutos — nada foi cobrado a mais."
          : (err.message || "Não deu para cancelar agora."));
      } finally {
        if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); }
      }
    });
  }

  NL.pronto(function () {
    ligarPerfil();
    ligarSenha();
    ligarCancelamento();
    $$('[data-nl="recarregar"]').forEach(function (b) {
      b.addEventListener("click", function () { location.reload(); });
    });
  });
})();
