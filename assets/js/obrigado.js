(function () {
  "use strict";
  var $ = function (s) { return document.querySelector(s); };
  var p = new URLSearchParams(location.search);
  var order = {};
  try { order = JSON.parse(sessionStorage.getItem("nl:order") || "{}"); } catch (e) {}

  var brl = function (c) {
    return "R$ " + (c / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  var METHOD = {
    credito: "Cartão de crédito",
    debito: "Cartão de débito (recorrente)",
    pix: "Pix"
  };
  var SEG = { voce: "Para você", nutri: "Para nutricionistas", academia: "Para academias" };

  var nome = p.get("nome");
  if (nome) $("[data-greeting]").textContent = "Tudo certo, " + nome + "!";

  var email = p.get("email");
  if (email) {
    $("[data-success-line]").innerHTML =
      "Sua assinatura está ativa. Enviamos o acesso para <b>" + email.replace(/[<>&]/g, "") + "</b>.";
  }

  var planName = order.planName || (p.get("plan") || "").replace(/^./, function (c) { return c.toUpperCase(); });
  var seg = p.get("seg") || order.seg;
  $("[data-r-plan]").textContent = "Plano " + (planName || "—") + (SEG[seg] ? " · " + SEG[seg] : "");
  var cycle = p.get("ciclo") || order.cycle || "mensal";
  $("[data-r-cycle]").textContent = cycle === "anual" ? "Anual (12 meses)" : "Mensal";
  var method = p.get("metodo") || order.method || "credito";
  $("[data-r-method]").textContent = METHOD[method] || "—";
  $("[data-r-renew]").textContent = order.renew || "—";
  var total = parseInt(p.get("total") || order.total || "0", 10);
  $("[data-r-total]").textContent = total ? brl(total) : "—";

  // Deterministic-looking order id
  var seed = (email || "nutrielive") + (order.renew || "");
  var h = 0;
  for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  var yr = new Date().getFullYear();
  $("[data-order-id]").textContent = "NL-" + yr + "-" + ("000000" + (h % 999983)).slice(-6);

  document.querySelectorAll("[data-noop]").forEach(function (a) {
    a.addEventListener("click", function (e) { if (a.getAttribute("href") === "#") e.preventDefault(); });
  });
})();
