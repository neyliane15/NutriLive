/* =========================================================================
   Nutri&Live — checkout engine
   Masks, validation, live card preview, Pix BR Code + QR, order summary.
   No card data ever leaves the page in this demo build.
   ========================================================================= */
(function () {
  "use strict";

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var form = $("#checkout-form");
  if (!form) return;

  var CATALOGUE = JSON.parse($("#nl-catalogue").textContent);
  var SEG_LABEL = { voce: "Para você", nutri: "Para nutricionistas", academia: "Para academias" };
  var SEG_HOME = { voce: "index.html", nutri: "nutricionistas.html", academia: "academias.html" };

  /* ---------------- Money ---------------- */
  var brl = function (cents) {
    return "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ---------------- State ---------------- */
  var params = new URLSearchParams(location.search);
  var state = {
    seg: CATALOGUE[params.get("seg")] ? params.get("seg") : "voce",
    plan: null,
    cycle: params.get("ciclo") === "anual" ? "anual" : "mensal",
    method: "credito",
    coupon: null,
    bank: null
  };
  var segData = CATALOGUE[state.seg];
  state.plan =
    segData.plans.filter(function (p) { return p.key === params.get("plan"); })[0] ||
    segData.plans.filter(function (p) { return p.featured; })[0] ||
    segData.plans[0];

  var COUPONS = {
    BEMVINDO20: { off: 0.2, label: "20% no primeiro mês", once: true },
    NUTRI10: { off: 0.1, label: "10% de desconto", once: false },
    PRIMEIROMES: { off: 0.5, label: "50% no primeiro mês", once: true }
  };

  /* ---------------- Pricing ---------------- */
  function pricing() {
    var monthly = state.plan.monthly;
    var perMonth = state.cycle === "anual" ? state.plan.yearly : monthly;
    var months = state.cycle === "anual" ? 12 : 1;
    var base = monthly * months;
    var cycleDiscount = state.cycle === "anual" ? base - perMonth * 12 : 0;
    var afterCycle = base - cycleDiscount;
    var couponDiscount = 0;
    if (state.coupon) couponDiscount = Math.round(afterCycle * COUPONS[state.coupon].off);
    return {
      months: months,
      perMonth: perMonth,
      base: base,
      cycleDiscount: cycleDiscount,
      couponDiscount: couponDiscount,
      total: Math.max(0, afterCycle - couponDiscount)
    };
  }

  function renewDate() {
    var d = new Date();
    if (state.cycle === "anual") d.setFullYear(d.getFullYear() + 1);
    else d.setMonth(d.getMonth() + 1);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  }

  /* ---------------- Summary ---------------- */
  var tick =
    '<span class="tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9.25" fill="currentColor"/><path d="M16.2 9.3 10.7 14.9 7.8 12" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

  function renderSummary() {
    var p = pricing();
    $("[data-sum-plan]").textContent = "Plano " + state.plan.name;
    $("[data-sum-seg]").textContent = SEG_LABEL[state.seg];
    $("[data-sum-switch]").setAttribute("href", SEG_HOME[state.seg] + "#planos");
    $("[data-back]").setAttribute("href", SEG_HOME[state.seg] + "#planos");
    $("[data-sum-feats]").innerHTML = state.plan.top
      .map(function (f) { return "<li>" + tick + "<span>" + f + "</span></li>"; })
      .join("");

    $("[data-sum-cycle-label]").innerHTML =
      state.cycle === "anual"
        ? "12 meses de " + brl(state.plan.monthly) + "<br><small style=\"color:var(--ink-400)\">plano anual</small>"
        : "Assinatura mensal";
    $("[data-sum-base]").textContent = brl(p.base);

    var dRow = $("[data-sum-discount-row]");
    if (p.cycleDiscount > 0) {
      dRow.hidden = false;
      $("[data-sum-discount]").textContent = "− " + brl(p.cycleDiscount);
      $("[data-sum-discount-label]").textContent = "Desconto do plano anual (20%)";
    } else dRow.hidden = true;

    var cRow = $("[data-sum-coupon-row]");
    if (p.couponDiscount > 0) {
      cRow.hidden = false;
      $("[data-sum-coupon-code]").textContent = state.coupon;
      $("[data-sum-coupon]").textContent = "− " + brl(p.couponDiscount);
    } else cRow.hidden = true;

    $("[data-sum-total]").textContent = brl(p.total);
    $("[data-sum-renew]").textContent =
      "Depois " + brl(state.cycle === "anual" ? state.plan.yearly * 12 : state.plan.monthly) +
      (state.cycle === "anual" ? "/ano" : "/mês") + " · renova em " + renewDate();

    var label =
      state.method === "pix"
        ? "Já paguei o Pix"
        : state.cycle === "anual"
        ? "Assinar por " + brl(p.total) + "/ano"
        : "Assinar por " + brl(p.total) + "/mês";
    $("[data-submit-label]").textContent = label;

    // Annual on credit card can be split
    var inst = $("[data-installments]");
    if (state.method === "credito" && state.cycle === "anual") {
      inst.hidden = false;
      var sel = $("#cc-parcelas");
      if (sel.dataset.total !== String(p.total)) {
        sel.dataset.total = String(p.total);
        sel.innerHTML = "";
        for (var n = 1; n <= 12; n++) {
          var o = document.createElement("option");
          o.value = String(n);
          o.textContent = n + "× de " + brl(Math.round(p.total / n)) + (n === 1 ? " à vista" : " sem juros");
          sel.appendChild(o);
        }
        sel.value = "12";
      }
    } else inst.hidden = true;

    if (state.method === "pix") buildPix(p.total);
    persist();
  }

  function persist() {
    try {
      sessionStorage.setItem(
        "nl:order",
        JSON.stringify({
          seg: state.seg, plan: state.plan.key, planName: state.plan.name,
          cycle: state.cycle, method: state.method, coupon: state.coupon,
          total: pricing().total, renew: renewDate()
        })
      );
    } catch (e) {}
  }

  /* ---------------- Masks ---------------- */
  var digits = function (v) { return (v || "").replace(/\D/g, ""); };

  function maskCPF(v) {
    var d = digits(v).slice(0, 11);
    return d
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
  }
  function maskPhone(v) {
    var d = digits(v).slice(0, 11);
    if (d.length <= 10) return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d{1,4})$/, "$1-$2");
    return d.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{1,4})$/, "$1-$2");
  }
  function maskExpiry(v) {
    var d = digits(v).slice(0, 4);
    if (d.length >= 3) return d.slice(0, 2) + "/" + d.slice(2);
    if (d.length === 2) return d + "/";
    return d;
  }

  /* ---------------- Card brands ---------------- */
  var BRANDS = [
    { key: "amex", label: "AMEX", re: /^3[47]/, len: [15], cvv: 4, groups: [4, 6, 5], color: "#1F72CD" },
    { key: "diners", label: "DINERS", re: /^3(0[0-5]|[68])/, len: [14, 16], cvv: 3, groups: [4, 6, 4], color: "#0079BE" },
    { key: "elo", label: "ELO", re: /^(4011|4312|4389|4514|4573|5041|5066|5090|6277|6362|6363|6500|6504|6505|6516|6550)/, len: [16], cvv: 3, groups: [4, 4, 4, 4], color: "#FFCB05" },
    { key: "hiper", label: "HIPERCARD", re: /^(606282|3841)/, len: [16, 19], cvv: 3, groups: [4, 4, 4, 4], color: "#B3131B" },
    { key: "visa", label: "VISA", re: /^4/, len: [13, 16, 19], cvv: 3, groups: [4, 4, 4, 4], color: "#1A1F71" },
    { key: "master", label: "MASTERCARD", re: /^(5[1-5]|2[2-7])/, len: [16], cvv: 3, groups: [4, 4, 4, 4], color: "#EB001B" },
    { key: "discover", label: "DISCOVER", re: /^(6011|64[4-9]|65)/, len: [16, 19], cvv: 3, groups: [4, 4, 4, 4], color: "#FF6000" }
  ];
  function detectBrand(num) {
    var d = digits(num);
    for (var i = 0; i < BRANDS.length; i++) if (BRANDS[i].re.test(d)) return BRANDS[i];
    return null;
  }
  function maskCardNumber(v) {
    var b = detectBrand(v);
    var groups = b ? b.groups : [4, 4, 4, 4];
    var max = b ? Math.max.apply(null, b.len) : 19;
    var d = digits(v).slice(0, max);
    var out = [], i = 0;
    for (var g = 0; g < groups.length && i < d.length; g++) {
      out.push(d.substr(i, groups[g]));
      i += groups[g];
    }
    if (i < d.length) out.push(d.slice(i));
    return out.filter(Boolean).join(" ");
  }
  function luhn(num) {
    var d = digits(num), sum = 0, alt = false;
    if (d.length < 12) return false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = parseInt(d.charAt(i), 10);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  /* ---------------- Validators ---------------- */
  function validCPF(v) {
    var d = digits(v);
    if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
    var sum = 0, i;
    for (i = 0; i < 9; i++) sum += parseInt(d.charAt(i), 10) * (10 - i);
    var r = (sum * 10) % 11; if (r === 10) r = 0;
    if (r !== parseInt(d.charAt(9), 10)) return false;
    sum = 0;
    for (i = 0; i < 10; i++) sum += parseInt(d.charAt(i), 10) * (11 - i);
    r = (sum * 10) % 11; if (r === 10) r = 0;
    return r === parseInt(d.charAt(10), 10);
  }
  function validEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test((v || "").trim());
  }
  function validExpiry(v) {
    var d = digits(v);
    if (d.length !== 4) return false;
    var mm = parseInt(d.slice(0, 2), 10), yy = parseInt(d.slice(2), 10);
    if (mm < 1 || mm > 12) return false;
    var now = new Date();
    var year = 2000 + yy;
    if (year < now.getFullYear()) return false;
    if (year === now.getFullYear() && mm < now.getMonth() + 1) return false;
    if (year > now.getFullYear() + 20) return false;
    return true;
  }
  function validName(v) {
    var t = (v || "").trim();
    return t.length >= 5 && t.indexOf(" ") > 0 && /^[\p{L}\s'.-]+$/u.test(t);
  }
  function validPhone(v) {
    var d = digits(v);
    return d.length === 11 && d.charAt(2) === "9" && parseInt(d.slice(0, 2), 10) >= 11;
  }

  /* ---------------- Field error plumbing ---------------- */
  function setError(name, msg) {
    var field = $('[data-field="' + name + '"]');
    var err = $("#err-" + name);
    if (err) err.textContent = msg || "";
    if (field) {
      field.classList.toggle("has-error", !!msg);
      field.classList.toggle("is-valid", !msg);
      var input = $(".input", field);
      if (input) input.setAttribute("aria-invalid", msg ? "true" : "false");
    }
    return !msg;
  }

  var RULES = {
    nomeCompleto: { el: "#nome", test: validName, msg: "Digite o seu nome completo, como no documento." },
    email: { el: "#email", test: validEmail, msg: "Confira o e-mail — parece que falta algo." },
    cpf: { el: "#cpf", test: validCPF, msg: "Esse CPF não confere. Confira os números." },
    telefone: { el: "#telefone", test: validPhone, msg: "Informe o DDD e o celular com 9 dígitos." },
    numero: { el: "#cc-numero", test: function (v) { var b = detectBrand(v); return luhn(v) && (!b || b.len.indexOf(digits(v).length) > -1); }, msg: "Número do cartão inválido. Confira os dígitos." },
    nome: { el: "#cc-nome", test: validName, msg: "Digite o nome exatamente como está no cartão." },
    validade: { el: "#cc-validade", test: validExpiry, msg: "Validade inválida ou vencida." },
    cvv: { el: "#cc-cvv", test: function (v) { var b = detectBrand($("#cc-numero").value); var n = b ? b.cvv : 3; return digits(v).length === n; }, msg: "Código de segurança incompleto." },
    dnumero: { el: "#db-numero", test: function (v) { var b = detectBrand(v); return luhn(v) && (!b || b.len.indexOf(digits(v).length) > -1); }, msg: "Número do cartão inválido. Confira os dígitos." },
    dnome: { el: "#db-nome", test: validName, msg: "Digite o nome exatamente como está no cartão." },
    dvalidade: { el: "#db-validade", test: validExpiry, msg: "Validade inválida ou vencida." },
    dcvv: { el: "#db-cvv", test: function (v) { var b = detectBrand($("#db-numero").value); var n = b ? b.cvv : 3; return digits(v).length === n; }, msg: "Código de segurança incompleto." }
  };

  var GROUPS = {
    dados: ["nomeCompleto", "email", "cpf", "telefone"],
    credito: ["numero", "nome", "validade", "cvv"],
    debito: ["dnumero", "dnome", "dvalidade", "dcvv"],
    pix: []
  };

  function validateField(name) {
    var rule = RULES[name];
    if (!rule) return true;
    var el = $(rule.el);
    if (!el) return true;
    var ok = rule.test(el.value);
    setError(name, ok ? "" : rule.msg);
    return ok;
  }

  /* ---------------- Wiring: inputs & masks ---------------- */
  function bindMask(sel, fn, extra) {
    var el = $(sel);
    if (!el) return;
    el.addEventListener("input", function () {
      var before = el.value, pos = el.selectionStart;
      var after = fn(before);
      el.value = after;
      if (pos !== null && pos < before.length) {
        var delta = after.length - before.length;
        el.setSelectionRange(Math.max(0, pos + delta), Math.max(0, pos + delta));
      }
      if (extra) extra(el);
    });
  }

  bindMask("#cpf", maskCPF);
  bindMask("#telefone", maskPhone);
  bindMask("#cc-numero", maskCardNumber, function (el) { paintCard(); });
  bindMask("#db-numero", maskCardNumber, function (el) { paintAffix($("#db-numero")); });
  bindMask("#cc-validade", maskExpiry, paintCard);
  bindMask("#db-validade", maskExpiry);
  ["#cc-cvv", "#db-cvv"].forEach(function (s) {
    var el = $(s);
    el.addEventListener("input", function () { el.value = digits(el.value).slice(0, 4); paintCard(); });
  });
  $("#cc-nome").addEventListener("input", paintCard);

  // Validate on blur; clear the error as soon as the user fixes it
  Object.keys(RULES).forEach(function (name) {
    var el = $(RULES[name].el);
    if (!el) return;
    el.addEventListener("blur", function () { if (el.value.trim()) validateField(name); });
    el.addEventListener("input", function () {
      var field = $('[data-field="' + name + '"]');
      if (field && field.classList.contains("has-error") && RULES[name].test(el.value)) setError(name, "");
    });
  });

  /* ---------------- Live card preview ---------------- */
  function brandSvgMarkup(b) {
    if (!b) return "";
    if (b.key === "master")
      return '<svg viewBox="0 0 48 30" aria-hidden="true"><circle cx="18" cy="15" r="11" fill="#EB001B"/><circle cx="30" cy="15" r="11" fill="#F79E1B" fill-opacity=".9"/><path d="M24 6.6a11 11 0 0 0 0 16.8 11 11 0 0 0 0-16.8Z" fill="#FF5F00"/></svg>';
    if (b.key === "visa")
      return '<svg viewBox="0 0 48 16" aria-hidden="true"><text x="48" y="13.5" text-anchor="end" font-family="Inter,sans-serif" font-size="14" font-style="italic" font-weight="800" letter-spacing="-0.02em" fill="currentColor">VISA</text></svg>';
    return '<svg viewBox="0 0 66 16" aria-hidden="true"><text x="66" y="12.5" text-anchor="end" font-family="Inter,sans-serif" font-size="10.5" font-weight="800" letter-spacing="-0.01em" fill="currentColor">' + b.label + "</text></svg>";
  }

  function paintAffix(input) {
    var wrap = input.closest(".input-wrap");
    if (!wrap) return;
    var affix = $("[data-brand-affix]", wrap);
    var b = detectBrand(input.value);
    affix.innerHTML = b
      ? '<span style="color:' + (b.key === "visa" ? "#1A1F71" : b.key === "elo" ? "#111" : b.color) + ';display:flex;height:22px">' + brandSvgMarkup(b) + "</span>"
      : "";
  }

  function paintCard() {
    var numEl = $("#cc-numero");
    paintAffix(numEl);
    var b = detectBrand(numEl.value);
    var groups = b ? b.groups : [4, 4, 4, 4];
    var d = digits(numEl.value);
    var out = [], i = 0;
    for (var g = 0; g < groups.length; g++) {
      var chunk = d.substr(i, groups[g]);
      var placeholder = new Array(groups[g] + 1).join("•");
      var shown = chunk + placeholder.slice(chunk.length);
      out.push('<span class="' + (chunk.length ? "" : "ph") + '">' + shown + "</span>");
      i += groups[g];
    }
    $("[data-cc-number]").innerHTML = out.join("");
    $("[data-cc-name]").textContent = $("#cc-nome").value.trim() || "Seu nome aqui";
    $("[data-cc-exp]").textContent = $("#cc-validade").value || "MM/AA";
    var cvv = digits($("#cc-cvv").value);
    $("[data-cc-cvv]").textContent = cvv ? new Array(cvv.length + 1).join("•") : "•••";
    var mark = $("[data-cc-brand]");
    mark.innerHTML = b ? '<span style="color:#EAF6EE;display:flex;height:26px">' + brandSvgMarkup(b) + "</span>" : "";
    // CVV length hint follows the brand
    $("#cc-cvv").setAttribute("maxlength", String(b ? b.cvv : 4));
    $("#cc-cvv").setAttribute("placeholder", b && b.cvv === 4 ? "0000" : "CVV");
  }

  $("#cc-cvv").addEventListener("focus", function () { $("[data-cc-preview]").setAttribute("data-face", "back"); });
  $("#cc-cvv").addEventListener("blur", function () { $("[data-cc-preview]").setAttribute("data-face", "front"); });
  paintCard();

  /* ---------------- Payment method tabs ---------------- */
  var tabs = $$("[data-pm]");
  function selectMethod(key, focus) {
    state.method = key;
    tabs.forEach(function (t) {
      var on = t.getAttribute("data-pm") === key;
      t.setAttribute("aria-selected", String(on));
      t.setAttribute("tabindex", on ? "0" : "-1");
      if (on && focus) t.focus();
    });
    ["credito", "debito", "pix"].forEach(function (k) {
      $("#pm-" + k).hidden = k !== key;
    });
    $("#err-form").textContent = "";
    renderSummary();
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { selectMethod(t.getAttribute("data-pm")); });
    t.addEventListener("keydown", function (e) {
      var i = tabs.indexOf(t);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        selectMethod(tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length].getAttribute("data-pm"), true);
      }
    });
  });

  /* ---------------- Banks (debit) ---------------- */
  $$("[data-bank]").forEach(function (b) {
    b.addEventListener("click", function () {
      $$("[data-bank]").forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      state.bank = b.getAttribute("data-bank");
      $("#err-banco").textContent = "";
    });
  });

  /* ---------------- Coupon ---------------- */
  var couponToggle = $("[data-coupon-toggle]");
  couponToggle.addEventListener("click", function () {
    var open = couponToggle.getAttribute("aria-expanded") === "true";
    couponToggle.setAttribute("aria-expanded", String(!open));
    $("#coupon-form").hidden = open;
    if (!open) $("#cupom").focus();
  });
  function applyCoupon() {
    var code = ($("#cupom").value || "").trim().toUpperCase();
    var msg = $("[data-coupon-msg]");
    msg.hidden = false;
    if (COUPONS[code]) {
      state.coupon = code;
      msg.className = "co-coupon-msg ok";
      msg.textContent = "Cupom aplicado: " + COUPONS[code].label + ".";
    } else {
      state.coupon = null;
      msg.className = "co-coupon-msg bad";
      msg.textContent = code ? "Cupom “" + code + "” não encontrado ou expirado." : "Digite um código de cupom.";
    }
    renderSummary();
  }
  $("[data-coupon-apply]").addEventListener("click", applyCoupon);
  $("#cupom").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); applyCoupon(); }
  });

  /* ---------------- Pix ---------------- */
  function crc16(payload) {
    var crc = 0xffff;
    for (var i = 0; i < payload.length; i++) {
      crc ^= payload.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return ("0000" + crc.toString(16).toUpperCase()).slice(-4);
  }
  function tlv(id, value) {
    return id + ("00" + value.length).slice(-2) + value;
  }
  function txid() {
    var s = "NL", chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    for (var i = 0; i < 12; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
  }
  var currentTxid = txid();

  function brCode(cents) {
    var amount = (cents / 100).toFixed(2);
    var mai = tlv("00", "br.gov.bcb.pix") + tlv("01", "pagamentos@nutrielive.com.br");
    var payload =
      tlv("00", "01") +
      tlv("26", mai) +
      tlv("52", "0000") +
      tlv("53", "986") +
      tlv("54", amount) +
      tlv("58", "BR") +
      tlv("59", "NUTRI E LIVE TECNOLOGIA") +
      tlv("60", "SAO PAULO") +
      tlv("62", tlv("05", currentTxid)) +
      "6304";
    return payload + crc16(payload);
  }

  var pixBuilt = null;
  function buildPix(cents) {
    if (pixBuilt === cents) return;
    pixBuilt = cents;
    var code = brCode(cents);
    $("[data-pix-code]").textContent = code;
    $("[data-pix-code]").setAttribute("title", code);
    var host = $("[data-pix-qr]");
    if (window.NLQR) {
      host.innerHTML = window.NLQR.toSvg(code, {
        ecc: "M", border: 2, dark: "#0D3524", light: "#FFFFFF",
        label: "QR Code Pix no valor de " + brl(cents)
      });
      var svg = host.querySelector("svg");
      if (svg) { svg.setAttribute("width", "208"); svg.setAttribute("height", "208"); }
    }
    startPixClock();
  }

  var pixTimer = null, pixSeconds = 1800, pixSettled = false;
  function startPixClock() {
    if (pixTimer) return;
    var clock = $("[data-pix-clock]");
    pixTimer = setInterval(function () {
      pixSeconds--;
      var m = Math.floor(pixSeconds / 60), s = pixSeconds % 60;
      clock.textContent = m + ":" + ("0" + s).slice(-2);
      if (pixSeconds <= 0) {
        clearInterval(pixTimer); pixTimer = null;
        clock.textContent = "expirado";
        $("[data-pix-status-text]").textContent = "O código expirou. Gere um novo para continuar.";
        var sp = $("[data-pix-status] .spin");
        if (sp) sp.remove();
      }
    }, 1000);
  }

  $("[data-pix-copy]").addEventListener("click", function () {
    var code = $("[data-pix-code]").textContent;
    var done = function () {
      var flag = $("[data-pix-copied]");
      flag.hidden = false;
      setTimeout(function () { flag.hidden = true; }, 2600);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code).then(done, fallbackCopy);
    } else fallbackCopy();
    function fallbackCopy() {
      var ta = document.createElement("textarea");
      ta.value = code; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:absolute;left:-9999px";
      document.body.appendChild(ta); ta.select();
      try { document.execCommand("copy"); done(); } catch (e) {}
      document.body.removeChild(ta);
    }
  });

  /* ---------------- Submit ---------------- */
  function validateAll() {
    var names = GROUPS.dados.concat(GROUPS[state.method] || []);
    var ok = true, firstBad = null;
    names.forEach(function (n) {
      var el = $(RULES[n].el);
      if (!RULES[n].test(el.value)) {
        setError(n, RULES[n].msg);
        ok = false;
        if (!firstBad) firstBad = el;
      } else setError(n, "");
    });
    if (state.method === "debito") {
      if (!state.bank) {
        $("#err-banco").textContent = "Escolha o banco da conta que será debitada.";
        $("#err-banco").style.display = "flex";
        ok = false; if (!firstBad) firstBad = $("[data-bank]");
      } else { $("#err-banco").textContent = ""; }
      var auth = $("[data-auth-check]");
      if (!auth.checked) {
        setError("autorizacao", "Precisamos da sua autorização para o débito mensal.");
        ok = false; if (!firstBad) firstBad = auth;
      } else setError("autorizacao", "");
    }
    if (!$("[data-terms]").checked) {
      setError("termos", "Você precisa aceitar os termos para continuar.");
      ok = false; if (!firstBad) firstBad = $("[data-terms]");
    } else setError("termos", "");
    if (firstBad) {
      firstBad.focus({ preventScroll: true });
      firstBad.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    return ok;
  }

  function setStep(n) {
    $$("[data-step-ind]").forEach(function (s) {
      var i = parseInt(s.getAttribute("data-step-ind"), 10);
      s.setAttribute("data-state", i < n ? "done" : i === n ? "current" : "todo");
      var dot = $(".co-step-dot", s);
      dot.textContent = i < n ? "✓" : String(i);
    });
  }

  var dadosFields = GROUPS.dados.map(function (n) { return $(RULES[n].el); });
  dadosFields.forEach(function (el) {
    el.addEventListener("blur", function () {
      var done = GROUPS.dados.every(function (n) { return RULES[n].test($(RULES[n].el).value); });
      setStep(done ? 2 : 1);
    });
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("[data-submit]");
    var formErr = $("#err-form");
    formErr.textContent = "";
    if (!validateAll()) {
      formErr.textContent = "Confira os campos destacados acima para continuar.";
      return;
    }
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    setStep(3);
    persist();
    setTimeout(function () {
      var p = pricing();
      var qs = new URLSearchParams({
        seg: state.seg, plan: state.plan.key, ciclo: state.cycle,
        metodo: state.method, total: String(p.total),
        nome: $("#nome").value.trim().split(/\s+/)[0] || "",
        email: $("#email").value.trim()
      });
      location.href = "obrigado.html?" + qs.toString();
    }, 1500);
  });

  /* ---------------- Boot ---------------- */
  selectMethod(params.get("metodo") === "pix" ? "pix" : params.get("metodo") === "debito" ? "debito" : "credito");
  renderSummary();
})();
