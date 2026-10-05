/* =========================================================================
   Nutri&Live — ilha da administração

   Cinco telas: visão geral, usuários, pagamentos, IA e auditoria. As peças
   genéricas (diálogo, filtro por querystring, paginação, recado que
   atravessa recarga) vêm de `NL.ui`; aqui ficam só as duas ações que pesam.

   As duas ações que pesam, e por que elas confirmam antes:

     ENTRAR COMO USUÁRIO  passa a navegar com a sessão de outra pessoa.
     ESTORNAR             devolve dinheiro e não desfaz.

   Nas duas, o servidor grava auditoria com o nome de quem clicou. A caixa
   "estou ciente" não é formalidade: o diálogo diz em texto que o registro
   existe e não pode ser apagado, e é isso que transforma a ação em decisão
   consciente em vez de clique de reflexo. O motivo do estorno é obrigatório
   pelo mesmo motivo — "estorno sem motivo" três meses depois é um prejuízo
   que ninguém sabe explicar.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  if (!NL) return;

  var boot = NL.boot || {};
  var $ = NL.$, ui = NL.ui;
  var campoTexto = ui.campoTexto;

  /* ====================================================================== */
  /*  TELA: usuários                                                        */
  /* ====================================================================== */
  function telaUsuarios() {
    ui.recuperar("/api/admin/users");
    ui.ligarFiltros("/admin/usuarios", { q: "q", role: "role", status: "status" });
    ui.ligarPaginacao();

    /* ------------------------- suspender / reativar ---------------------- */
    var alvo = null;   /* { id, para, nome } */
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-fe2-suspender]");
      if (!b) return;
      e.preventDefault();
      var linha = b.closest("[data-fe2-user]");
      alvo = {
        id: b.getAttribute("data-fe2-suspender"),
        para: b.getAttribute("data-fe2-para") || "suspenso",
        nome: (linha && linha.getAttribute("data-fe2-nome")) || "este usuário"
      };
      var texto = $("[data-fe2-suspender-texto]");
      if (texto) {
        texto.textContent = alvo.para === "suspenso"
          ? alvo.nome + " perde o acesso agora e as sessões abertas dela são encerradas."
          : alvo.nome + " volta a entrar normalmente, com a assinatura como está.";
      }
      var dlg = ui.abrir("dlg-suspender");
      var confirma = dlg && $("[data-fe2-confirmar]", dlg);
      if (confirma) confirma.textContent = alvo.para === "suspenso" ? "Suspender" : "Reativar";
    });

    var dlgSuspender = document.getElementById("dlg-suspender");
    if (dlgSuspender) {
      $("[data-fe2-confirmar]", dlgSuspender).addEventListener("click", async function (e) {
        e.preventDefault();
        if (!alvo) return;
        ui.limparErro(dlgSuspender);
        try {
          await ui.enviando(e.currentTarget, function () {
            return NL.api("/api/admin/users/" + encodeURIComponent(alvo.id),
              { method: "PATCH", body: { status: alvo.para } });
          });
          ui.guardarRecado(alvo.para === "suspenso"
            ? alvo.nome + " foi suspenso e as sessões dele foram encerradas."
            : alvo.nome + " foi reativado.");
          location.reload();
        } catch (erro) {
          ui.erroNoDialogo(dlgSuspender, erro);
        }
      });
    }

    /* --------------------------- entrar como ----------------------------- */
    var impersonar = null;
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-fe2-impersonar]");
      if (!b) return;
      e.preventDefault();
      var linha = b.closest("[data-fe2-user]");
      impersonar = {
        id: b.getAttribute("data-fe2-impersonar"),
        nome: (linha && linha.getAttribute("data-fe2-nome")) || "este usuário"
      };
      var nome = $("[data-fe2-imp-nome]");
      if (nome) nome.textContent = impersonar.nome;
      var dlg = ui.abrir("dlg-impersonar");
      /* A caixa nunca vem marcada de uma abertura anterior. */
      var ciente = dlg && $("#ciente", dlg);
      if (ciente) ciente.checked = false;
    });

    ui.ligarForm('[data-fe2-form="impersonar"]', async function (form) {
      if (!impersonar) throw { message: "Escolha um usuário na lista." };
      var ciente = form.elements["ciente"];
      if (!ciente || !ciente.checked) {
        throw { fields: { ciente: "Marque para confirmar que você sabe que isto fica registrado." } };
      }
      var r = await NL.api("/api/admin/users/" + encodeURIComponent(impersonar.id) + "/impersonate",
        { method: "POST", body: {} });
      /* A sessão agora é de outra pessoa: nada do que está nesta tela vale
         mais, então vai direto para onde o papel dela começa. */
      location.href = (r && r.redirect) || "/hoje";
    });
  }

  /* ====================================================================== */
  /*  TELA: pagamentos                                                      */
  /* ====================================================================== */
  function telaPagamentos() {
    ui.recuperar("/api/admin/payments");
    ui.ligarFiltros("/admin/pagamentos", { status: "status" });
    ui.ligarPaginacao();

    var pago = null;
    document.addEventListener("click", function (e) {
      var b = e.target.closest("[data-fe2-estornar]");
      if (!b) return;
      e.preventDefault();
      var linha = b.closest("[data-fe2-pag]");
      pago = {
        id: b.getAttribute("data-fe2-estornar"),
        nome: (linha && linha.getAttribute("data-fe2-nome")) || "o cliente",
        cents: Number(linha && linha.getAttribute("data-fe2-valor")) || 0
      };
      var nome = $("[data-fe2-est-nome]");
      var valor = $("[data-fe2-est-valor]");
      if (nome) nome.textContent = pago.nome;
      if (valor) valor.textContent = NL.brl(pago.cents);
      ui.abrir("dlg-estorno");
    });

    ui.ligarForm('[data-fe2-form="estorno"]', async function (form) {
      if (!pago) throw { message: "Escolha um pagamento na lista." };
      var motivo = campoTexto(form, "reason");
      /* Exigido aqui e no servidor: o motivo é o que explica o estorno três
         meses depois, quando ninguém lembra da conversa. */
      if (motivo.length < 5) {
        throw { fields: { reason: "Escreva o motivo — ele fica gravado em auditoria." } };
      }
      await NL.api("/api/admin/payments/" + encodeURIComponent(pago.id) + "/refund",
        { method: "POST", body: { reason: motivo } });
      ui.guardarRecado("Estorno de " + NL.brl(pago.cents) + " enviado ao provedor para " + pago.nome + ".");
      location.reload();
    });
  }

  /* ====================================================================== */
  /*  TELA: auditoria                                                       */
  /* ====================================================================== */
  function telaAuditoria() {
    ui.recuperar("/api/admin/audit");
    ui.ligarPaginacao();

    /* O filtro de ação é da PÁGINA CARREGADA, como a própria tela avisa: a
       rota de auditoria não recebe filtro de ação, e fingir que recebe faria
       a pessoa achar que varreu a base inteira quando varreu 25 linhas. */
    var seletor = document.getElementById("acao");
    if (!seletor) return;
    var contador = $("[data-fe2-tabela] ~ * [aria-live], .fe2-seats-num[aria-live]");

    var aplicar = function () {
      var escolhida = String(seletor.value || "").trim();
      var visiveis = 0;
      NL.$$("[data-fe2-audit]").forEach(function (tr) {
        var casa = !escolhida || tr.getAttribute("data-fe2-acao") === escolhida;
        tr.hidden = !casa;
        if (casa) visiveis++;
      });
      if (contador) {
        contador.innerHTML = "<b>" + visiveis + "</b> registro" + (visiveis === 1 ? "" : "s") +
          (escolhida ? " desta ação nesta página" : " nesta página");
      }
      /* A escolha fica na URL para a paginação não perdê-la e para o link
         ser compartilhável — sem recarregar, porque o filtro é local. */
      var p = new URLSearchParams(location.search);
      if (escolhida) p.set("acao", escolhida); else p.delete("acao");
      history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
    };

    seletor.addEventListener("change", aplicar);
    if (String(seletor.value || "").trim()) aplicar();
  }

  /* ====================================================================== */
  /*  TELAS de leitura: visão geral e IA                                    */
  /* ====================================================================== */
  function telaVisao() { ui.recuperar("/api/admin/overview"); }
  function telaIa() {
    var p = new URLSearchParams(location.search).get("pagina") || boot.pagina || 1;
    ui.recuperar("/api/admin/ai?page=" + encodeURIComponent(p));
    ui.ligarPaginacao();
  }

  NL.pronto(function () {
    var telas = {
      visao: telaVisao, usuarios: telaUsuarios, pagamentos: telaPagamentos,
      ia: telaIa, auditoria: telaAuditoria
    };
    var fn = telas[boot.tela];
    if (fn) fn();
  });
})();
