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
    debito: "Cartão de débito",
    pix: "Pix"
  };
  var SEG = { voce: "Para você", nutri: "Para nutricionistas", academia: "Para academias" };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[<>&"]/g, ""); };
  var set = function (sel, text) { var el = $(sel); if (el) el.textContent = text; };

  /* ---------- Greeting ---------- */
  var nome = esc(p.get("nome") || (order.name || "").split(/\s+/)[0]);
  if (nome) set("[data-greeting]", "Tudo certo, " + nome + "!");

  var email = esc(p.get("email") || order.email);
  if (email) {
    $("[data-success-line]").innerHTML =
      "Sua assinatura está ativa. Enviamos o acesso para <b>" + email + "</b>.";
  }

  /* ---------- Receipt ---------- */
  var planName = order.planName || (p.get("plan") || "").replace(/^./, function (c) { return c.toUpperCase(); });
  var seg = p.get("seg") || order.seg;
  set("[data-r-plan]", "Plano " + (planName || "—") + (SEG[seg] ? " · " + SEG[seg] : ""));


  var method = p.get("metodo") || order.method || "credito";
  set("[data-r-method]", METHOD[method] || "—");

  /* The detail line is what makes the receipt feel real: brand + last 4,
     the bank behind a recurring debit, or how the Pix settled. */
  var subEl = $("[data-r-method-sub]");
  var sub = "";
  if (method === "credito") {
    if (order.brand || order.last4) sub = [order.brand, order.last4 ? "•••• " + order.last4 : ""].filter(Boolean).join(" ");
    var n = parseInt(order.installments || 1, 10);
    var totalCents = parseInt(p.get("total") || order.total || "0", 10);
    if (n > 1 && totalCents) sub += (sub ? " · " : "") + n + "× de " + brl(Math.round(totalCents / n)) + " sem juros";
  } else if (method === "debito") {
    sub = [order.brand, order.last4 ? "•••• " + order.last4 : "", order.bank].filter(Boolean).join(" · ");
    sub = (sub ? sub + " · " : "") + "débito recorrente autorizado";
  } else if (method === "pix") {
    sub = "Compensado na hora, sem taxa";
  }
  if (sub) { subEl.textContent = sub; subEl.hidden = false; }

  if (order.coupon) {
    $("[data-r-coupon-row]").hidden = false;
    set("[data-r-coupon]", order.coupon + (order.couponLabel ? " · " + order.couponLabel : ""));
  }

  set("[data-r-renew]", order.renew || "—");

  var total = parseInt(p.get("total") || order.total || "0", 10);
  set("[data-r-total]", total ? brl(total) : "—");

  /* If a first-month coupon made today cheaper, say what comes next. */
  var recurring = parseInt(order.recurring || 0, 10);
  if (recurring && total && recurring !== total) {
    var after = $("[data-r-after]");
    after.textContent = "Depois " + brl(recurring) + "/mês";
    after.hidden = false;
  }

  if (total) {
    var paid = $("[data-paid-line]");
    paid.innerHTML =
      (method === "pix"
        ? "Recebemos o seu Pix de <b>" + brl(total) + "</b>."
        : "Cobrança de <b>" + brl(total) + "</b> aprovada" + (order.last4 ? " no cartão •••• " + esc(order.last4) : "") + ".") +
      " Nada mais é cobrado até " + (order.renew || "a próxima renovação") + ".";
    paid.hidden = false;
  }

  /* ---------- Deterministic-looking order id ---------- */
  var seed = (email || "nutrielive") + (order.renew || "") + (order.at || "");
  var h = 0;
  for (var i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  var yr = new Date().getFullYear();
  set("[data-order-id]", "NL-" + yr + "-" + ("000000" + (h % 999983)).slice(-6));

  /* ---------- Landing straight here without an order ---------- */
  if (!total && !order.plan && !p.get("plan")) {
    var badge = $("[data-head-badge]");
    if (badge) badge.hidden = true;
    var receipt = document.querySelector(".receipt");
    if (receipt) {
      receipt.innerHTML =
        '<p class="co-panel-sub" style="margin:0">Não encontramos os detalhes deste pedido nesta sessão. ' +
        'Eles estão no e-mail de confirmação e no app, em <b>Menu › Assinatura</b>.</p>';
    }
  }

  /* Send screen readers to the confirmation instead of the top of the page */
  var h1 = $("[data-greeting]");
  if (h1) setTimeout(function () { h1.focus({ preventScroll: true }); }, 120);

  document.querySelectorAll("[data-noop]").forEach(function (a) {
    a.addEventListener("click", function (e) { if (a.getAttribute("href") === "#") e.preventDefault(); });
  });
})();
