/* =========================================================================
   Nutri&Live — site behaviour
   Progressive enhancement only: every page works with JS disabled.
   ========================================================================= */
(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------------- Sticky header state ---------------- */
  var header = $("#site-header");
  if (header) {
    var onScroll = function () {
      header.setAttribute("data-stuck", window.scrollY > 8 ? "true" : "false");
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---------------- Mobile drawer ---------------- */
  var toggle = $("[data-nav-toggle]");
  var drawer = $("#nav-drawer");
  if (toggle && drawer) {
    drawer.hidden = false;
    var setDrawer = function (open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Fechar menu" : "Abrir menu");
      drawer.setAttribute("data-open", String(open));
      document.body.classList.toggle("is-locked", open);
      if (open) {
        var first = drawer.querySelector("a, button");
        if (first) first.focus({ preventScroll: true });
      }
    };
    setDrawer(false);
    toggle.addEventListener("click", function () {
      setDrawer(toggle.getAttribute("aria-expanded") !== "true");
    });
    drawer.addEventListener("click", function (e) {
      if (e.target.closest("a")) setDrawer(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setDrawer(false);
        toggle.focus();
      }
    });
    var mq = window.matchMedia("(min-width: 1024px)");
    (mq.addEventListener ? mq.addEventListener.bind(mq, "change") : mq.addListener.bind(mq))(function (e) {
      if (e.matches) setDrawer(false);
    });
  }

  /* ---------------- Reveal on scroll ---------------- */
  var revealables = $$("[data-reveal]");
  if (revealables.length) {
    if (reduce || !("IntersectionObserver" in window)) {
      revealables.forEach(function (el) { el.classList.add("is-in"); });
    } else {
      var io = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            if (entry.isIntersecting) {
              entry.target.classList.add("is-in");
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
      );
      revealables.forEach(function (el) { io.observe(el); });
      // Anything already above the fold shows immediately (no flash on load)
      requestAnimationFrame(function () {
        revealables.forEach(function (el) {
          if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add("is-in");
        });
      });
    }
  }

  /* ---------------- Segmented control thumb ---------------- */
  $$("[data-segmented]").forEach(function (seg) {
    var thumb = $(".seg-thumb", seg);
    var active = $('.seg[aria-current="true"], .seg.is-active', seg) || $(".seg", seg);
    if (!thumb || !active) return;
    var place = function () {
      thumb.style.width = active.offsetWidth + "px";
      thumb.style.transform = "translateX(" + active.offsetLeft + "px)";
    };
    place();
    // Re-place after fonts settle so the thumb never sits off-target
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
    window.addEventListener("resize", place);
    setTimeout(place, 120);
  });

  /* ---------------- Accordion ---------------- */
  $$("[data-accordion]").forEach(function (acc) {
    $$(".accordion-trigger", acc).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var open = btn.getAttribute("aria-expanded") === "true";
        var panel = document.getElementById(btn.getAttribute("aria-controls"));
        btn.setAttribute("aria-expanded", String(!open));
        if (panel) panel.setAttribute("data-open", String(!open));
      });
    });
    // Arrow-key roving between questions
    acc.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var items = $$(".accordion-trigger", acc);
      var i = items.indexOf(document.activeElement);
      if (i === -1) return;
      e.preventDefault();
      items[(i + (e.key === "ArrowDown" ? 1 : items.length - 1)) % items.length].focus();
    });
  });

  /* ---------------- Pricing: monthly / yearly ---------------- */
  var billToggle = $("[data-bill-toggle]");
  if (billToggle) {
    var applyBilling = function () {
      var yearly = billToggle.checked;
      var k = yearly ? "y" : "m";
      $$("[data-price-int]").forEach(function (el) { el.textContent = el.getAttribute("data-" + k); });
      $$("[data-price-dec]").forEach(function (el) { el.textContent = "," + el.getAttribute("data-" + k); });
      $$("[data-price-note]").forEach(function (el) { el.innerHTML = el.getAttribute("data-" + k); });
      $$("[data-bill-label]").forEach(function (el) {
        el.classList.toggle("is-on", el.getAttribute("data-bill-label") === k);
      });
      $$("[data-plan-cta]").forEach(function (a) {
        var url = a.getAttribute("href").split("&ciclo=")[0];
        a.setAttribute("href", url + "&ciclo=" + (yearly ? "anual" : "mensal"));
      });
      try { sessionStorage.setItem("nl:ciclo", yearly ? "anual" : "mensal"); } catch (e) {}
    };
    try {
      if (sessionStorage.getItem("nl:ciclo") === "anual") billToggle.checked = true;
    } catch (e) {}
    billToggle.addEventListener("change", applyBilling);
    applyBilling();
  }

  /* ---------------- Animated counters ---------------- */
  var counters = $$("[data-count]");
  if (counters.length && !reduce && "IntersectionObserver" in window) {
    var parse = function (raw) {
      var m = raw.match(/^(\D*)([\d.,]+)(.*)$/);
      if (!m) return null;
      var numeric = m[2].replace(/\./g, "").replace(",", ".");
      var value = parseFloat(numeric);
      if (isNaN(value)) return null;
      var decimals = (m[2].split(",")[1] || "").length;
      return { prefix: m[1], value: value, suffix: m[3], decimals: decimals };
    };
    var co = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        co.unobserve(entry.target);
        var el = entry.target;
        var p = parse(el.getAttribute("data-count"));
        // Valores pequenos (notas, multiplicadores) não animam: contar de 0 até
        // 4,9 mostraria "0,2★" na tela por meio segundo.
        if (!p || p.value < 100) return;
        var start = performance.now(), dur = 850;
        var tick = function (now) {
          var t = Math.min(1, (now - start) / dur);
          var eased = 1 - Math.pow(1 - t, 3);
          el.textContent =
            p.prefix +
            (p.value * eased).toLocaleString("pt-BR", {
              minimumFractionDigits: p.decimals,
              maximumFractionDigits: p.decimals
            }) +
            p.suffix;
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { co.observe(el); });
  }

  /* ---------------- Sticky mobile CTA ---------------- */
  var sticky = $("[data-sticky-cta]");
  if (sticky) {
    var pricingSection = $("#planos");
    var showAfter = function () {
      var past = window.scrollY > window.innerHeight * 0.85;
      var insidePricing = false;
      if (pricingSection) {
        var r = pricingSection.getBoundingClientRect();
        insidePricing = r.top < window.innerHeight && r.bottom > 0;
      }
      var atFoot = document.body.scrollHeight - (window.scrollY + window.innerHeight) < 260;
      sticky.setAttribute("data-show", String(past && !insidePricing && !atFoot));
    };
    showAfter();
    window.addEventListener("scroll", showAfter, { passive: true });
    window.addEventListener("resize", showAfter);
  }

  /* ---------------- Inert placeholder links ---------------- */
  $$("[data-noop]").forEach(function (a) {
    a.addEventListener("click", function (e) {
      if (a.getAttribute("href") === "#") e.preventDefault();
    });
  });
})();
