/* =========================================================================
   Nutri&Live — ilha da organização (consultório e academia)

   Quatro telas num arquivo, porque compartilham tudo que importa: os mesmos
   diálogos, o mesmo jeito de mostrar erro e a mesma regra de recuperação.
   `NL.boot.tela` diz qual ligar. As peças genéricas (diálogo, filtro,
   paginação, recado que atravessa recarga) moram em `NL.ui`, na base.

   Duas decisões valem para o arquivo inteiro:

   1. RECUPERAÇÃO É RECARGA, NÃO RE-RENDERIZAÇÃO. Quando o servidor não
      conseguiu os dados, a tela vem com `dados: null` e um aviso; a ilha
      pergunta à API e, se ela responder, recarrega. A alternativa —
      remontar a tabela em JS — exigiria uma segunda cópia de cada template
      aqui dentro, e duas cópias divergem na primeira correção.

   2. ESCRITA BEM-SUCEDIDA TAMBÉM RECARREGA, com uma exceção. Cadastrar,
      encerrar vínculo e enviar plano mudam números que aparecem em três
      lugares da tela (assentos, contagem, risco); recalcular cada um na mão
      é onde nasce a tela que mostra "9 de 10" com 10 linhas na tabela. A
      exceção é a anotação clínica: ela só entra numa lista que já está ali,
      e recarregar faria a profissional perder a rolagem no meio da consulta.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  if (!NL) return;

  var boot = NL.boot || {};
  var $ = NL.$, $$ = NL.$$, ui = NL.ui;
  var esc = ui.esc, campoTexto = ui.campoTexto;
  var termos = boot.termos || { pessoa: "pessoa", pessoas: "pessoas" };

  /* ====================================================================== */
  /*  TELA: pessoas (pacientes ou alunos)                                   */
  /* ====================================================================== */
  function telaPessoas() {
    ui.ligarFiltros(boot.rotaPessoas || location.pathname, { q: "q", status: "status" });
    ui.recuperar("/api/org/members");

    /* --------------------------- abas do diálogo ------------------------- */
    $$("[data-fe2-aba]").forEach(function (aba) {
      aba.addEventListener("click", function () {
        var alvo = aba.getAttribute("data-fe2-aba");
        $$("[data-fe2-aba]").forEach(function (outra) {
          var ativa = outra === aba;
          outra.setAttribute("aria-selected", ativa ? "true" : "false");
          outra.tabIndex = ativa ? 0 : -1;
          var painel = document.getElementById("pnl-" + outra.getAttribute("data-fe2-aba"));
          if (painel) painel.hidden = !ativa;
        });
        var campo = $(".input", document.getElementById("pnl-" + alvo));
        if (campo) campo.focus();
      });
    });

    /* ------------------------ cadastrar uma pessoa ----------------------- */
    ui.ligarForm('[data-fe2-form="uma"]', async function (form) {
      var corpo = { name: campoTexto(form, "nome"), email: campoTexto(form, "email") };
      var nota = campoTexto(form, "note");
      if (nota) corpo.note = nota;
      var r = await NL.api("/api/org/members", { method: "POST", body: corpo });
      ui.guardarRecado(corpo.name.split(" ")[0] +
        " foi cadastrado e recebeu o e-mail de primeiro acesso." +
        (r && typeof r.seatsUsed === "number" ? " Assentos usados: " + r.seatsUsed + "." : ""));
      location.reload();
    });

    /* ---------------------------- importar lista ------------------------- */
    /*  Separador: vírgula, ponto e vírgula ou tabulação, como a dica diz.
        O e-mail é reconhecido pelo arroba e não pela posição, porque
        planilha de verdade vem nas duas ordens. */
    function lerLinhas(texto) {
      var boas = [], ruins = [];
      String(texto || "").split(/\r?\n/).forEach(function (linha, i) {
        var bruto = linha.trim();
        if (!bruto) return;
        var partes = bruto.split(/[,;\t]+/).map(function (p) { return p.trim(); }).filter(Boolean);
        var email = null, nome = [];
        partes.forEach(function (p) {
          if (!email && p.indexOf("@") > 0) email = p.toLowerCase();
          else nome.push(p);
        });
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          ruins.push({ linha: i + 1, texto: bruto, motivo: "sem e-mail válido" });
        } else if (nome.join(" ").length < 2) {
          ruins.push({ linha: i + 1, texto: bruto, motivo: "sem nome" });
        } else {
          boas.push({ name: nome.join(" "), email: email });
        }
      });
      /* E-mail repetido na própria lista: o servidor recusaria o segundo, e
         é melhor dizer isso antes de enviar 500 linhas. */
      var vistos = {}, unicas = [];
      boas.forEach(function (b) {
        if (vistos[b.email]) ruins.push({ linha: 0, texto: b.email, motivo: "repetido na lista" });
        else { vistos[b.email] = 1; unicas.push(b); }
      });
      return { boas: unicas, ruins: ruins };
    }

    var formMassa = $('[data-fe2-form="massa"]');
    if (formMassa) {
      var area = $("[data-fe2-previa-area]", formMassa);
      var confirmar = $("[data-fe2-confirmar-massa]", formMassa);
      var pronta = null;

      var previa = function () {
        var r = lerLinhas(campoTexto(formMassa, "lista"));
        pronta = r.boas;
        confirmar.disabled = r.boas.length === 0;
        if (!r.boas.length && !r.ruins.length) { area.innerHTML = ""; return; }
        area.innerHTML =
          '<div class="notice" style="margin-top:var(--sp-4)"><span><b>' + r.boas.length + "</b> " +
            (r.boas.length === 1 ? "pessoa pronta" : "pessoas prontas") + " para cadastrar" +
            (r.ruins.length ? ", <b>" + r.ruins.length + "</b> fora" : "") + ".</span></div>" +
          (r.boas.length
            ? '<ul class="fe2-previa">' + r.boas.slice(0, 8).map(function (b) {
                return "<li>" + esc(b.name) + ' <span class="soft">' + esc(b.email) + "</span></li>";
              }).join("") +
              (r.boas.length > 8 ? '<li class="soft">e mais ' + (r.boas.length - 8) + "…</li>" : "") + "</ul>"
            : "") +
          (r.ruins.length
            ? '<ul class="fe2-previa fe2-previa-ruim">' + r.ruins.slice(0, 6).map(function (b) {
                return "<li>" + (b.linha ? "linha " + b.linha + ": " : "") + esc(b.texto) +
                  ' <span class="soft">' + esc(b.motivo) + "</span></li>";
              }).join("") + "</ul>"
            : "");
      };

      $("[data-fe2-previa]", formMassa).addEventListener("click", previa);
      /* Mexeu no texto depois da prévia? Então a prévia não vale mais. */
      $("#lista").addEventListener("input", function () { pronta = null; confirmar.disabled = true; });

      ui.ligarForm('[data-fe2-form="massa"]', async function () {
        if (!pronta || !pronta.length) { previa(); throw { message: "Veja a prévia antes de confirmar." }; }
        var r = await NL.api("/api/org/members/bulk", { method: "POST", body: { rows: pronta } });
        var recado = r.created + (r.created === 1 ? " pessoa cadastrada" : " pessoas cadastradas");
        if (r.skipped) recado += ", " + r.skipped + " já existia" + (r.skipped === 1 ? "" : "m");
        ui.guardarRecado(recado + ".");
        if (r.errors && r.errors.length) {
          ui.guardarRecado(
            r.errors.length + (r.errors.length === 1 ? " linha não entrou: " : " linhas não entraram: ") +
            r.errors.slice(0, 3).map(function (x) { return x.email + " (" + x.reason + ")"; }).join("; "),
            "erro");
        }
        location.reload();
      });
    }

    /* --------------------------- encerrar vínculo ------------------------ */
    var aEncerrar = null;
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-fe2-encerrar]");
      if (!b) return;
      e.preventDefault();
      aEncerrar = b.getAttribute("data-fe2-encerrar");
      var nome = b.getAttribute("data-fe2-nome") || "esta pessoa";
      var email = b.getAttribute("data-fe2-email") || "";
      var alvo = $("[data-fe2-encerrar-nome]");
      if (alvo) alvo.textContent = nome + (email ? " · " + email : "");
      ui.abrir("dlg-encerrar");
    });

    var dlgEncerrar = document.getElementById("dlg-encerrar");
    if (dlgEncerrar) {
      $("[data-fe2-confirmar]", dlgEncerrar).addEventListener("click", async function (e) {
        e.preventDefault();
        if (!aEncerrar) return;
        ui.limparErro(dlgEncerrar);
        try {
          await ui.enviando(e.currentTarget, function () {
            return NL.api("/api/org/members/" + encodeURIComponent(aEncerrar), { method: "DELETE" });
          });
          ui.guardarRecado("Vínculo encerrado. O assento voltou para o plano.");
          location.reload();
        } catch (erro) {
          ui.erroNoDialogo(dlgEncerrar, erro);
        }
      });
    }
  }

  /* ====================================================================== */
  /*  TELA: ficha de uma pessoa                                             */
  /* ====================================================================== */
  function telaPessoa() {
    var userId = boot.userId || "";
    ui.recuperar("/api/org/members/" + encodeURIComponent(userId));

    /* ------------------------- anotação clínica ------------------------- */
    ui.ligarForm('[data-fe2-form="nota"]', async function (form) {
      var texto = campoTexto(form, "body");
      if (!texto) throw { fields: { body: "Escreva a anotação antes de salvar." } };
      await NL.api("/api/org/members/" + encodeURIComponent(userId) + "/notes",
        { method: "POST", body: { body: texto } });

      var lista = $("[data-fe2-notas]");
      var semNada = $("[data-fe2-notas-vazio]");
      if (semNada) semNada.remove();
      if (lista) {
        /* Montada por nó, não por innerHTML: o texto vem de um campo livre
           e vai para a tela de quem escreveu — textContent resolve. */
        var art = document.createElement("article");
        art.className = "fe2-note";
        var corpo = document.createElement("p");
        corpo.textContent = texto;
        var pe = document.createElement("p");
        pe.className = "fe2-note-foot";
        pe.textContent = "Você · agora";
        art.appendChild(corpo); art.appendChild(pe);
        lista.insertBefore(art, lista.firstChild);
      }
      form.reset();
      NL.aviso("Anotação salva. Só você vê.");
    });

    /* ---------------------------- enviar plano -------------------------- */
    document.addEventListener("click", async function (e) {
      var b = e.target.closest("[data-fe2-enviar-plano]");
      if (!b) return;
      e.preventDefault();
      var planId = b.getAttribute("data-fe2-enviar-plano");
      try {
        await ui.enviando(b, function () {
          return NL.api("/api/org/members/" + encodeURIComponent(userId) + "/plan",
            { method: "POST", body: { planId: planId } });
        });
        ui.guardarRecado("Plano enviado. Já aparece no app d" +
          (termos.pessoa === "aluno" ? "o aluno" : "a paciente") + ".");
        location.reload();
      } catch (erro) {
        NL.aviso((erro && erro.message) || "Não foi possível enviar o plano.", "erro");
      }
    });

    /* ------------------------- gerar plano com IA ----------------------- */
    ui.ligarForm('[data-fe2-form="ia"]', async function (form) {
      var status = $("[data-fe2-ia-status]", form);
      var dias = Number(campoTexto(form, "days")) || 7;
      var corpo = { days: dias, forUserId: userId };
      var notas = campoTexto(form, "notes");
      if (notas) corpo.notes = notas;

      var diga = function (t) {
        if (status) status.innerHTML = '<p class="notice" role="status"><span>' + esc(t) + "</span></p>";
      };
      diga("Enviando para a IA…");
      var job = await NL.api("/api/ai/meal-plan", { method: "POST", body: corpo });
      diga("Gerando o plano de " + dias + (dias === 1 ? " dia" : " dias") + ". Leva alguns segundos.");

      var fim = await NL.esperarJob(job.jobId, function (j) {
        if (j.status === "processando") diga("A IA está montando o cardápio…");
      });
      if (fim.status === "erro") {
        /* A IA recusa plano fora de faixa segura, e o motivo é informação
           clínica: mostrar inteiro, nunca "erro ao gerar". */
        throw { message: fim.error || "A IA não conseguiu gerar este plano." };
      }
      ui.guardarRecado("Plano gerado. Revise e envie quando quiser.");
      location.reload();
    });
  }

  /* ====================================================================== */
  /*  TELAS de leitura: painel e comissões                                  */
  /* ====================================================================== */
  function telaPainel() { ui.recuperar("/api/org/dashboard"); }
  function telaComissoes() {
    var p = new URLSearchParams(location.search).get("periodo") || "";
    ui.recuperar("/api/org/commissions" + (p ? "?period=" + encodeURIComponent(p) : ""));
  }

  NL.pronto(function () {
    var telas = {
      pessoas: telaPessoas, pessoa: telaPessoa,
      painel: telaPainel, comissoes: telaComissoes
    };
    var fn = telas[boot.tela];
    if (fn) fn();
  });
})();
