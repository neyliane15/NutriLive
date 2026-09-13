/* =========================================================================
   Nutri&Live — checkout engine
   Masks, validation, live card preview, Pix BR Code + QR, order summary,
   declined-payment recovery and screen-reader announcements.
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
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Money ---------------- */
  var brl = function (cents) {
    return "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ---------------- Screen-reader announcements ---------------- */
  var liveEl = $("[data-live]");
  var liveTimer = null;
  function announce(msg) {
    if (!liveEl || !msg) return;
    clearTimeout(liveTimer);
    liveEl.textContent = "";
    liveTimer = setTimeout(function () { liveEl.textContent = msg; }, 60);
  }

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
      cyclePct: base ? Math.round((cycleDiscount / base) * 100) : 0,
      couponDiscount: couponDiscount,
      recurring: afterCycle,
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

  var lastTotal = null;
  function renderSummary(opts) {
    opts = opts || {};
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
        ? "12 meses de " + brl(state.plan.monthly) + "<small>plano anual</small>"
        : "Assinatura mensal";
    $("[data-sum-base]").textContent = brl(p.base);

    var dRow = $("[data-sum-discount-row]");
    if (p.cycleDiscount > 0) {
      dRow.hidden = false;
      $("[data-sum-discount]").textContent = "− " + brl(p.cycleDiscount);
      $("[data-sum-discount-label]").textContent = "Desconto do plano anual (" + p.cyclePct + "%)";
    } else dRow.hidden = true;

    var cRow = $("[data-sum-coupon-row]");
    if (p.couponDiscount > 0) {
      cRow.hidden = false;
      $("[data-sum-coupon-code]").textContent = state.coupon;
      $("[data-sum-coupon]").textContent = "− " + brl(p.couponDiscount);
    } else cRow.hidden = true;

    var totalEl = $("[data-sum-total]");
    var totalText = brl(p.total);
    var changed = lastTotal !== null && lastTotal !== p.total;
    totalEl.textContent = totalText;
    $("[data-sum-total-mini]").textContent = totalText;
    if (changed && !reduceMotion) {
      totalEl.classList.remove("is-bump");
      void totalEl.offsetWidth;
      totalEl.classList.add("is-bump");
    }
    if (changed && !opts.silent) announce("Total atualizado: " + totalText + ".");
    lastTotal = p.total;

    $("[data-sum-renew]").textContent =
      "Depois " + brl(p.recurring) + (state.cycle === "anual" ? "/ano" : "/mês") + " · renova em " + renewDate();

    var label =
      state.method === "pix"
        ? "Já paguei o Pix"
        : state.cycle === "anual"
        ? "Assinar por " + totalText + "/ano"
        : "Assinar por " + totalText + "/mês";
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

  function cardMeta(prefix) {
    var num = $("#" + prefix + "-numero");
    if (!num) return null;
    var d = digits(num.value);
    if (d.length < 4) return null;
    var b = detectBrand(d);
    return { brand: b ? b.label : "", last4: d.slice(-4) };
  }

  function persist() {
    var p = pricing();
    var meta = state.method === "credito" ? cardMeta("cc") : state.method === "debito" ? cardMeta("db") : null;
    var inst = $("#cc-parcelas");
    try {
      sessionStorage.setItem(
        "nl:order",
        JSON.stringify({
          seg: state.seg, plan: state.plan.key, planName: state.plan.name,
          cycle: state.cycle, method: state.method, coupon: state.coupon,
          couponLabel: state.coupon ? COUPONS[state.coupon].label : null,
          total: p.total, recurring: p.recurring, renew: renewDate(),
          brand: meta ? meta.brand : null,
          last4: meta ? meta.last4 : null,
          bank: state.method === "debito" ? state.bank : null,
          installments:
            state.method === "credito" && state.cycle === "anual" && inst && inst.value
              ? parseInt(inst.value, 10)
              : 1,
          name: ($("#nome").value || "").trim(),
          email: ($("#email").value || "").trim(),
          at: Date.now()
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
    if (err && err.textContent !== (msg || "")) err.textContent = msg || "";
    if (field) {
      field.classList.toggle("has-error", !!msg);
      field.classList.toggle("is-valid", !msg);
      var input = $(".input, input[type=checkbox]", field);
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

  function groupComplete(list) {
    return list.every(function (n) { return RULES[n].test($(RULES[n].el).value); });
  }
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
    var apply = function () {
      var before = el.value, pos = el.selectionStart;
      var after = fn(before);
      if (after !== before) {
        el.value = after;
        if (pos !== null && pos < before.length) {
          var delta = after.length - before.length;
          el.setSelectionRange(Math.max(0, pos + delta), Math.max(0, pos + delta));
        }
      }
      if (extra) extra(el);
    };
    el.addEventListener("input", apply);
    // Browser autofill fires "change" without "input" in some engines
    el.addEventListener("change", apply);
  }

  bindMask("#cpf", maskCPF);
  bindMask("#telefone", maskPhone);
  bindMask("#cc-numero", maskCardNumber, function () { paintCard(); });
  bindMask("#db-numero", maskCardNumber, function () { paintAffix($("#db-numero")); syncCvvLimit("db"); });
  bindMask("#cc-validade", maskExpiry, paintCard);
  bindMask("#db-validade", maskExpiry);
  ["cc", "db"].forEach(function (p) {
    var el = $("#" + p + "-cvv");
    el.addEventListener("input", function () {
      var b = detectBrand($("#" + p + "-numero").value);
      el.value = digits(el.value).slice(0, b ? b.cvv : 4);
      if (p === "cc") paintCard();
    });
  });
  $("#cc-nome").addEventListener("input", paintCard);

  // Validate on blur; clear the error as soon as the user fixes it
  Object.keys(RULES).forEach(function (name) {
    var el = $(RULES[name].el);
    if (!el) return;
    el.addEventListener("blur", function () {
      if (el.value.trim()) validateField(name);
      refreshProgress();
    });
    el.addEventListener("input", function () {
      var field = $('[data-field="' + name + '"]');
      if (field && field.classList.contains("has-error") && RULES[name].test(el.value)) setError(name, "");
      if (RULES[name].test(el.value)) field.classList.add("is-valid");
      refreshProgress();
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
    if (b && affix.dataset.brand !== b.key) announce("Cartão " + b.label + " identificado.");
    affix.dataset.brand = b ? b.key : "";
  }

  function syncCvvLimit(prefix) {
    var b = detectBrand($("#" + prefix + "-numero").value);
    var n = b ? b.cvv : 4;
    var cvv = $("#" + prefix + "-cvv");
    cvv.setAttribute("maxlength", String(n));
    cvv.setAttribute("placeholder", n === 4 ? "0000" : "CVV");
    if (digits(cvv.value).length > n) cvv.value = digits(cvv.value).slice(0, n);
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
    syncCvvLimit("cc");
  }

  $("#cc-cvv").addEventListener("focus", function () { $("[data-cc-preview]").setAttribute("data-face", "back"); });
  $("#cc-cvv").addEventListener("blur", function () { $("[data-cc-preview]").setAttribute("data-face", "front"); });
  paintCard();

  var cvvHelp = $("[data-cvv-help]");
  if (cvvHelp) {
    cvvHelp.addEventListener("click", function () {
      var open = cvvHelp.getAttribute("aria-expanded") === "true";
      cvvHelp.setAttribute("aria-expanded", String(!open));
      $("#cvv-help").hidden = open;
      $("[data-cc-preview]").setAttribute("data-face", open ? "front" : "back");
    });
  }

  /* ---------------- Payment method tabs ---------------- */
  var tabs = $$("[data-pm]");
  var payPanelBox = $('[data-step="2"]');
  function selectMethod(key, focus) {
    if (state.method === key && $("#pm-" + key) && !$("#pm-" + key).hidden) {
      if (focus) $("#tab-" + key).focus();
      return;
    }
    var anchorBefore = payPanelBox.getBoundingClientRect().top;
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
    hidePayAlert();
    renderSummary({ silent: true });
    // Keep the payment card visually anchored — panels have different heights
    var anchorAfter = payPanelBox.getBoundingClientRect().top;
    if (Math.abs(anchorAfter - anchorBefore) > 1) window.scrollBy(0, anchorAfter - anchorBefore);
    refreshProgress();
  }
  tabs.forEach(function (t) {
    t.addEventListener("click", function () { selectMethod(t.getAttribute("data-pm")); });
    t.addEventListener("keydown", function (e) {
      var i = tabs.indexOf(t), next = null;
      if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (i + tabs.length - 1) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      if (next === null) return;
      e.preventDefault();
      selectMethod(tabs[next].getAttribute("data-pm"), true);
    });
  });

  /* ---------------- Banks (debit) ---------------- */
  $$("[data-bank]").forEach(function (b) {
    b.addEventListener("click", function () {
      $$("[data-bank]").forEach(function (o) { o.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      state.bank = b.getAttribute("data-bank");
      setError("banco", "");
      announce(state.bank + " selecionado.");
      persist();
      refreshProgress();
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
      announce("Cupom " + code + " aplicado: " + COUPONS[code].label + ".");
    } else {
      state.coupon = null;
      msg.className = "co-coupon-msg bad";
      msg.textContent = code
        ? "Cupom “" + code + "” não encontrado ou expirado."
        : "Digite um código de cupom.";
      announce(msg.textContent);
    }
    renderSummary({ silent: true });
  }
  $("[data-coupon-apply]").addEventListener("click", applyCoupon);
  $("#cupom").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); applyCoupon(); }
  });
  $("[data-coupon-remove]").addEventListener("click", function () {
    state.coupon = null;
    $("#cupom").value = "";
    var msg = $("[data-coupon-msg]");
    msg.hidden = true; msg.textContent = "";
    renderSummary({ silent: true });
    announce("Cupom removido.");
    couponToggle.focus();
  });

  /* ---------------- Collapsible / sticky summary ---------------- */
  var mqNarrow = window.matchMedia("(max-width: 979.98px)");
  var layout = $(".co-layout");
  var mainCol = $(".co-col-main");
  var aside = $(".co-aside");
  var summaryEl = $("[data-summary]");
  var summaryToggle = $("[data-summary-toggle]");
  var userOpened = false;

  function placeAside() {
    if (mqNarrow.matches) {
      if (layout.firstElementChild !== aside) layout.insertBefore(aside, mainCol);
      setSummaryOpen(userOpened);
    } else {
      if (aside.previousElementSibling !== mainCol) layout.appendChild(aside);
      setSummaryOpen(true);
    }
  }
  function setSummaryOpen(open) {
    summaryEl.setAttribute("data-collapsed", open ? "false" : "true");
    summaryToggle.setAttribute("aria-expanded", String(!!open));
  }
  summaryToggle.addEventListener("click", function () {
    userOpened = summaryToggle.getAttribute("aria-expanded") !== "true";
    setSummaryOpen(userOpened);
    announce(userOpened ? "Resumo do pedido aberto." : "Resumo do pedido fechado.");
  });
  (mqNarrow.addEventListener ? mqNarrow.addEventListener("change", placeAside) : mqNarrow.addListener(placeAside));
  placeAside();

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
      tlv("01", "12") + // QR de uso único, com valor — exigência do BR Code
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

  var PIX_TTL = 1800;                 // 30 min
  var PIX_SETTLE_MS = 12000;          // "webhook" do banco chega sozinho
  var PIX_SETTLE_AFTER_COPY_MS = 6000;
  var pixBuilt = null, pixTimer = null, pixSeconds = PIX_TTL;
  var pixSettleTimer = null, pixState = "waiting";

  function pixStatus(stateName, title, sub, markHtml) {
    pixState = stateName;
    var box = $("[data-pix-status]");
    box.setAttribute("data-state", stateName);
    $("[data-pix-status] .pix-status-mark").innerHTML = markHtml;
    $("[data-pix-status-text]").textContent = title;
    $("[data-pix-status-sub]").textContent = sub;
  }
  var SPIN = '<span class="spin"></span>';
  var CHECK = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="currentColor" opacity=".16"/><path d="M16.6 9 10.7 15 7.4 11.8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var BANG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.4v5.2M12 16.4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

  function buildPix(cents) {
    if (pixBuilt === cents && pixState !== "expired") return;
    pixBuilt = cents;
    currentTxid = txid();
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
    resetPixWait();
  }

  function resetPixWait() {
    $("[data-pix-veil]").hidden = true;
    $("[data-pix-timer] span").innerHTML = 'Válido por <b data-pix-clock class="tnum">30:00</b>';
    $("[data-pix-qr-card]").classList.remove("is-stale");
    $("[data-pix-renew]").hidden = true;
    $("[data-pix-timer]").className = "pix-timer";
    $("[data-pix-copied]").hidden = true;
    $("[data-pix-copy-label]").textContent = "Copiar";
    pixStatus(
      "waiting",
      "Aguardando o seu pagamento…",
      "Deixe esta página aberta. Assim que o Pix cair, a gente segue sozinho.",
      SPIN
    );
    pixSeconds = PIX_TTL;
    paintClock();
    if (pixTimer) clearInterval(pixTimer);
    pixTimer = setInterval(tickPix, 1000);
    armSettle(PIX_SETTLE_MS);
  }

  function paintClock() {
    var m = Math.floor(pixSeconds / 60), s = pixSeconds % 60;
    $("[data-pix-clock]").textContent = m + ":" + ("0" + s).slice(-2);
  }

  function tickPix() {
    if (pixState === "paid") return;
    pixSeconds--;
    paintClock();
    if (pixSeconds <= 0) pixExpire();
  }

  function pixExpire() {
    clearInterval(pixTimer); pixTimer = null;
    clearTimeout(pixSettleTimer); pixSettleTimer = null;
    $("[data-pix-clock]").textContent = "expirado";
    $("[data-pix-timer]").className = "pix-timer is-expired";
    $("[data-pix-qr-card]").classList.add("is-stale");
    $("[data-pix-renew]").hidden = false;
    pixStatus(
      "expired",
      "O código expirou",
      "Nada foi cobrado. Gere um novo código — ele vale por mais 30 minutos.",
      BANG
    );
    announce("O código Pix expirou. Gere um novo código para continuar.");
  }

  function armSettle(ms) {
    clearTimeout(pixSettleTimer);
    pixSettleTimer = setTimeout(function () {
      if (pixState === "waiting") pixConfirm(false);
    }, ms);
  }

  function pixConfirm(fromButton) {
    if (pixState === "paid") return;
    clearTimeout(pixSettleTimer);
    if (fromButton) {
      pixStatus("checking", "Confirmando o seu pagamento…", "Estamos consultando o Banco Central. Leva alguns segundos.", SPIN);
      announce("Confirmando o seu pagamento Pix.");
      setTimeout(function () { settlePix(); }, 1800);
    } else settlePix();
  }

  function settlePix() {
    if (pixState === "paid") return;
    if (pixTimer) { clearInterval(pixTimer); pixTimer = null; }
    pixState = "paid";
    $("[data-pix-veil]").hidden = false;
    $("[data-pix-timer]").className = "pix-timer is-done";
    $("[data-pix-clock]").textContent = "pago";
    $("[data-pix-timer] span").innerHTML = "Pagamento <b data-pix-clock class=\"tnum\">confirmado</b>";
    $("[data-pix-renew]").hidden = true;
    pixStatus(
      "paid",
      "Pagamento confirmado!",
      "Recebemos " + brl(pricing().total) + " via Pix. Levando você para a confirmação…",
      CHECK
    );
    announce("Pagamento Pix confirmado. Redirecionando para a confirmação da assinatura.");
    setStep(3);
    markPanelDone(2, true);
    persist();
    var btn = $("[data-submit]");
    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    btn.disabled = true;
    setTimeout(goToThanks, 1700);
  }

  $("[data-pix-renew]").addEventListener("click", function () {
    pixBuilt = null;
    buildPix(pricing().total);
    announce("Novo código Pix gerado. Válido por 30 minutos.");
    $("[data-pix-copy]").focus();
  });

  $("[data-pix-copy]").addEventListener("click", function () {
    var code = $("[data-pix-code]").textContent;
    var done = function () {
      var flag = $("[data-pix-copied]");
      flag.hidden = false;
      $("[data-pix-copy-label]").textContent = "Copiado";
      announce("Código Pix copiado para a área de transferência.");
      // Copiar é o sinal mais forte de que o pagamento está a caminho
      if (pixState === "waiting") armSettle(PIX_SETTLE_AFTER_COPY_MS);
      setTimeout(function () {
        flag.hidden = true;
        $("[data-pix-copy-label]").textContent = "Copiar";
      }, 4000);
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

  /* ---------------- Declined payments ---------------- */
  /* O emissor é simulado a partir do número do cartão, usando os PANs de teste
     das bandeiras. Qualquer outro cartão válido é aprovado. */
  var DECLINES = {
    "4000000000000002": "recusado",
    "5555555555554477": "recusado",
    "4000000000009995": "saldo",
    "4000000000000069": "vencido",
    "4000000000000127": "cvv",
    "4000000000000119": "processamento"
  };
  var DECLINE_COPY = {
    recusado: {
      code: "Código do emissor: 05 · transação não autorizada",
      title: "O seu banco não autorizou a cobrança",
      text: "O emissor recusou sem dar o motivo. Na maioria das vezes é o bloqueio automático de compras online no primeiro uso — não é problema no seu cartão.",
      steps: [
        "Abra o app do seu banco e libere compras online ou assinaturas recorrentes.",
        "Se preferir, ligue para o número no verso do cartão e peça a liberação de R$ %TOTAL%.",
        "Depois é só voltar aqui e tentar de novo — nada foi cobrado."
      ]
    },
    saldo: {
      code: "Código do emissor: 51 · saldo/limite insuficiente",
      title: "Saldo ou limite insuficiente",
      text: "O cartão está válido, mas não tem %TOTAL% disponíveis agora. Nenhum valor foi cobrado.",
      steps: [
        "Use outro cartão, ou pague no Pix — o valor sai direto da conta e libera na hora.",
        "Se o seu limite reseta na virada da fatura, dá para voltar depois: o plano fica guardado.",
        "No plano anual dá para parcelar em até 12× sem juros no crédito."
      ]
    },
    vencido: {
      code: "Código do emissor: 54 · cartão vencido",
      title: "Esse cartão está vencido",
      text: "A data de validade já passou. Confira os quatro dígitos MM/AA impressos na frente do cartão.",
      steps: [
        "Se o banco já enviou o cartão novo, use o número e a validade dele.",
        "No app do banco costuma dar para ver o cartão virtual com os dados atualizados."
      ]
    },
    cvv: {
      code: "Código do emissor: 82 · CVV inválido",
      title: "O código de segurança não confere",
      text: "São os 3 dígitos do verso do cartão (na Amex são 4, na frente). Confira e digite de novo.",
      steps: [
        "Digite só os dígitos, sem espaços.",
        "Se estiver usando cartão virtual, o CVV muda a cada cartão gerado."
      ]
    },
    processamento: {
      code: "Código interno: PROC_TIMEOUT",
      title: "Não conseguimos falar com o seu banco",
      text: "A conexão com o emissor caiu no meio da autorização. Nada foi cobrado e nenhum dado seu foi perdido.",
      steps: [
        "Espere alguns segundos e tente de novo — costuma resolver na segunda tentativa.",
        "Se insistir, o Pix cai na hora e não depende do emissor."
      ]
    }
  };

  var payAlert = $("[data-pay-alert]");
  function hidePayAlert() {
    payAlert.hidden = true;
    payAlert.removeAttribute("tabindex");
  }
  function showPayAlert(kind) {
    var c = DECLINE_COPY[kind] || DECLINE_COPY.recusado;
    var total = brl(pricing().total);
    var fill = function (s) { return s.replace(/%TOTAL%/g, total); };
    $("[data-pay-alert-title]").textContent = c.title;
    $("[data-pay-alert-text]").textContent = fill(c.text);
    $("[data-pay-alert-list]").innerHTML = c.steps.map(function (s) { return "<li>" + fill(s) + "</li>"; }).join("");
    $("[data-pay-alert-code]").textContent = c.code;
    payAlert.hidden = false;
    payAlert.setAttribute("tabindex", "-1");
    payAlert.focus({ preventScroll: true });
    payAlert.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    announce(c.title + ". " + fill(c.text));
  }
  $("[data-pay-retry]").addEventListener("click", function () {
    hidePayAlert();
    var el = state.method === "debito" ? $("#db-numero") : $("#cc-numero");
    el.focus();
    el.select();
  });
  $("[data-pay-switch-pix]").addEventListener("click", function () {
    hidePayAlert();
    selectMethod("pix", true);
  });

  function issuerVerdict() {
    var el = state.method === "debito" ? $("#db-numero") : $("#cc-numero");
    return DECLINES[digits(el.value)] || null;
  }

  /* ---------------- Steps & micro-feedback ---------------- */
  var stepNames = { 1: "seus dados", 2: "pagamento", 3: "pronto" };
  var currentStep = 1;
  function setStep(n) {
    if (n === currentStep) return;
    var forward = n > currentStep;
    currentStep = n;
    $$("[data-step-ind]").forEach(function (s) {
      var i = parseInt(s.getAttribute("data-step-ind"), 10);
      var next = i < n ? "done" : i === n ? "current" : "todo";
      var dot = $(".co-step-dot", s);
      if (s.getAttribute("data-state") !== next) {
        s.setAttribute("data-state", next);
        dot.textContent = i < n ? "✓" : String(i);
        if (forward && !reduceMotion) {
          dot.classList.remove("is-pop");
          void dot.offsetWidth;
          dot.classList.add("is-pop");
        }
      }
    });
    $("[data-step-now]").textContent = "Etapa " + n + " de 3: " + stepNames[n] + ".";
  }

  var doneShown = {};
  function markPanelDone(step, done) {
    var badge = $('[data-panel-done="' + step + '"]');
    if (!badge) return;
    if (done && badge.hidden) {
      badge.hidden = false;
      if (!doneShown[step]) {
        doneShown[step] = true;
        announce(step === 1 ? "Seus dados estão completos." : "Dados de pagamento completos.");
      }
    } else if (!done) badge.hidden = true;
  }

  function paymentComplete() {
    if (state.method === "pix") return pixState === "paid";
    if (!groupComplete(GROUPS[state.method] || [])) return false;
    if (state.method === "debito") return !!state.bank && $("[data-auth-check]").checked;
    return true;
  }

  function refreshProgress() {
    var dadosOk = groupComplete(GROUPS.dados);
    markPanelDone(1, dadosOk);
    markPanelDone(2, paymentComplete());
    if (currentStep < 3) setStep(dadosOk ? 2 : 1);
    persist();
  }

  $("[data-auth-check]").addEventListener("change", function () {
    if (this.checked) setError("autorizacao", "");
    refreshProgress();
  });
  $("[data-terms]").addEventListener("change", function () {
    if (this.checked) setError("termos", "");
  });
  var parcelasSel = $("#cc-parcelas");
  if (parcelasSel) parcelasSel.addEventListener("change", function () {
    persist();
    var opt = parcelasSel.options[parcelasSel.selectedIndex];
    if (opt) announce("Parcelamento: " + opt.textContent + ".");
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
        setError("banco", "Escolha o banco da conta que será debitada.");
        ok = false; if (!firstBad) firstBad = $("[data-bank]");
      } else setError("banco", "");
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
      firstBad.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }
    return ok;
  }

  function goToThanks() {
    var p = pricing();
    var qs = new URLSearchParams({
      seg: state.seg, plan: state.plan.key, ciclo: state.cycle,
      metodo: state.method, total: String(p.total),
      nome: ($("#nome").value || "").trim().split(/\s+/)[0] || "",
      email: ($("#email").value || "").trim()
    });
    location.href = "obrigado.html?" + qs.toString();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("[data-submit]");
    var formErr = $("#err-form");
    formErr.textContent = "";
    hidePayAlert();

    if (!validateAll()) {
      formErr.textContent = "Confira os campos destacados acima para continuar.";
      announce("Não foi possível continuar. Confira os campos destacados.");
      return;
    }

    if (state.method === "pix") {
      if (pixState === "expired") {
        formErr.textContent = "O código Pix expirou. Gere um novo código para continuar.";
        $("[data-pix-renew]").focus();
        return;
      }
      pixConfirm(true);
      return;
    }

    btn.classList.add("is-loading");
    btn.setAttribute("aria-busy", "true");
    btn.disabled = true;
    announce("Autorizando o pagamento com o seu banco. Aguarde.");
    persist();

    setTimeout(function () {
      var verdict = issuerVerdict();
      btn.classList.remove("is-loading");
      btn.removeAttribute("aria-busy");
      btn.disabled = false;
      if (verdict) {
        showPayAlert(verdict);
        return;
      }
      btn.classList.add("is-loading");
      btn.setAttribute("aria-busy", "true");
      btn.disabled = true;
      setStep(3);
      markPanelDone(2, true);
      announce("Pagamento aprovado. Levando você para a confirmação.");
      persist();
      setTimeout(goToThanks, 700);
    }, 1500);
  });

  /* ---------------- Boot ---------------- */
  selectMethod(params.get("metodo") === "pix" ? "pix" : params.get("metodo") === "debito" ? "debito" : "credito");
  renderSummary({ silent: true });
  refreshProgress();
})();
