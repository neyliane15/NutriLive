/* =========================================================================
   Ilha: Evolução. Troca o período sem recarregar, redesenha a curva de peso,
   as medidas e a constância, e salva as medidas de hoje.
   ========================================================================= */
(function () {
  "use strict";
  var NL = window.NL;
  var $ = NL.$, $$ = NL.$$;

  var ROTULO = { "7d": "7 dias", "30d": "30 dias", "3m": "3 meses", "6m": "6 meses", "1y": "1 ano" };
  var alturaCm = (NL.boot && NL.boot.alturaCm) || null;

  var num = function (v, c) { c = c || 0; return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c }); };
  var kg = function (v) { return num(v, 1) + " kg"; };
  var cm = function (v) { return num(v, 1) + " cm"; };
  var pct = function (p, t) { return t > 0 ? Math.max(0, Math.min(100, Math.round((p / t) * 100))) : 0; };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };
  var diaBR = function (iso) {
    var d = new Date(iso);
    return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  };

  function variacao(vs) {
    if (!vs || vs.length < 2) return null;
    var delta = vs[vs.length - 1] - vs[0];
    var classe = Math.abs(delta) < 0.05 ? "igual" : delta < 0 ? "desce" : "sobe";
    var sinal = delta > 0 ? "+" : delta < 0 ? "−" : "";
    return { delta: delta, classe: classe, texto: sinal + num(Math.abs(delta), 1) };
  }

  function imc(peso, altura) {
    var m = altura / 100, v = peso / (m * m);
    return {
      valor: Math.round(v * 10) / 10,
      leitura: v < 18.5 ? "abaixo do peso" : v < 25 ? "faixa de peso adequada" : v < 30 ? "sobrepeso" : "obesidade"
    };
  }

  function recadoSequencia(d) {
    if (d >= 21) return "Três semanas seguidas. Isso já é hábito.";
    if (d >= 7) return "Uma semana inteira sem falhar.";
    if (d >= 2) return "Está pegando o ritmo.";
    if (d === 1) return "Primeiro dia da nova sequência.";
    return "Um registro hoje recomeça a contagem.";
  }

  /* ------------------------ desenhos (iguais ao servidor) --------------- */
  function sparkline(pontos, altura) {
    if (!pontos || pontos.length < 2) return "";
    var w = 240, h = altura || 56, cor = "var(--leaf-500)";
    var max = Math.max.apply(null, pontos), min = Math.min.apply(null, pontos), span = (max - min) || 1;
    var pts = pontos.map(function (p, i) {
      return [(i / (pontos.length - 1)) * w, h - 6 - ((p - min) / span) * (h - 14)];
    });
    var d = pts.map(function (p, i) { return (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1); }).join("");
    var last = pts[pts.length - 1];
    return '<svg viewBox="0 0 ' + w + " " + h + '" preserveAspectRatio="none" style="width:100%;height:' + h + 'px;display:block" aria-hidden="true">' +
      '<path d="' + d + "L" + w + "," + h + "L0," + h + 'Z" fill="' + cor + '" opacity=".12"/>' +
      '<path d="' + d + '" fill="none" stroke="' + cor + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + last[0].toFixed(1) + '" cy="' + last[1].toFixed(1) + '" r="3.2" fill="' + cor + '"/></svg>';
  }

  function barras(valores, rotulos) {
    var max = Math.max.apply(null, valores.concat([1]));
    return '<div style="display:flex;align-items:flex-end;gap:5px;height:84px;margin-top:.75rem" aria-hidden="true">' +
      valores.map(function (v, i) {
        return '<span style="flex:1;display:grid;gap:4px;align-content:end">' +
          '<i style="display:block;height:' + Math.max(6, (v / max) * 72) + "px;background:var(--leaf-500);opacity:" +
          (0.45 + 0.55 * (v / max)).toFixed(2) + ';border-radius:4px 4px 2px 2px"></i>' +
          (rotulos && rotulos[i] ? '<small style="font-size:10px;color:var(--ink-500);text-align:center">' + esc(rotulos[i]) + "</small>" : "") +
          "</span>";
      }).join("") + "</div>";
  }

  function semanasDeConstancia(datas, dias) {
    dias = dias || 30;
    var agora = Date.now(), semanas = Math.max(1, Math.ceil(dias / 7)), out = [];
    for (var i = semanas - 1; i >= 0; i--) {
      var fim = agora - i * 7 * 86400000, ini = fim - 7 * 86400000, vistos = {};
      datas.forEach(function (d) {
        var t = Date.parse(d);
        if (!isNaN(t) && t > ini && t <= fim) vistos[new Date(t).toISOString().slice(0, 10)] = 1;
      });
      out.push({ rotulo: diaBR(new Date(ini + 86400000).toISOString()), dias: Object.keys(vistos).length });
    }
    return out;
  }

  /* ------------------------------ redesenho ---------------------------- */
  function pintar(p, faixa) {
    if (!p) return;

    /* peso */
    var pontos = (p.weight || []).map(function (w) { return w.kg; });
    var alvoPeso = $('[data-nl="peso-atual"]');
    if (alvoPeso && pontos.length) {
      alvoPeso.textContent = kg(pontos[pontos.length - 1]);
      var v = variacao(pontos);
      var delta = $('[data-nl="peso-delta"]');
      if (delta) {
        delta.className = v ? "nl-delta " + v.classe : "nl-legenda";
        delta.textContent = v ? v.texto + " kg no período" : "primeira pesagem do período";
      }
      var cont = $('[data-nl="peso-contagem"]');
      if (cont) cont.textContent = String(pontos.length);
      var janela = $('[data-nl="peso-janela"]');
      if (janela) janela.textContent = "de " + diaBR(p.weight[0].at) + " a " + diaBR(p.weight[p.weight.length - 1].at);
      var elImc = $('[data-nl="peso-imc"]');
      if (elImc && alturaCm) elImc.textContent = num(imc(pontos[pontos.length - 1], alturaCm).valor, 1);
      var graf = $('[data-nl="peso-grafico"]');
      if (graf) graf.innerHTML = sparkline(pontos, 96);
      var ext = $('[data-nl="peso-extremos"]');
      if (ext) {
        ext.innerHTML = "<span>" + esc(diaBR(p.weight[0].at)) + " · " + esc(kg(pontos[0])) + "</span>" +
          "<span>mín " + esc(kg(Math.min.apply(null, pontos))) + " · máx " + esc(kg(Math.max.apply(null, pontos))) + "</span>" +
          "<span>" + esc(diaBR(p.weight[p.weight.length - 1].at)) + " · " + esc(kg(pontos[pontos.length - 1])) + "</span>";
      }
      var tab = $('[data-nl="peso-tabela"]');
      if (tab) {
        tab.innerHTML = p.weight.map(function (w) {
          return "<tr><th scope=\"row\">" + esc(diaBR(w.at)) + "</th><td>" + esc(kg(w.kg)) + "</td></tr>";
        }).join("");
      }
    }

    /* medidas */
    [["waist", "Cintura"], ["hip", "Quadril"], ["arm", "Braço"]].forEach(function (par) {
      var alvo = $('[data-nl="medida-' + par[0] + '"]');
      if (!alvo) return;
      var serie = (p.measurements || []).map(function (m) { return m[par[0]]; })
        .filter(function (x) { return typeof x === "number"; });
      if (!serie.length) {
        alvo.innerHTML = '<p class="nl-rotulo">' + par[1] + '</p><p class="nl-forte">—</p><p class="nl-legenda">sem registro</p>';
        return;
      }
      var v = variacao(serie);
      var classe = v ? (par[0] === "arm" ? "igual" : v.classe) : "";
      alvo.innerHTML = '<p class="nl-rotulo">' + par[1] + '</p>' +
        '<p class="nl-forte">' + esc(cm(serie[serie.length - 1])) + "</p>" +
        (v ? '<p class="nl-delta ' + classe + '">' + esc(v.texto) + " cm</p>" : '<p class="nl-legenda">primeira medida</p>') +
        (serie.length > 1 ? sparkline(serie, 42) : "");
    });

    /* constância */
    var logados = $('[data-nl="logados"]');
    if (logados) logados.textContent = String(p.loggedDays || 0);
    var cheio = $('[data-nl="const-barra"]');
    if (cheio) cheio.style.width = pct(p.loggedDays || 0, p.totalDays || 30) + "%";
    var seq = $('[data-nl="sequencia"]');
    if (seq) {
      seq.textContent = String(p.streakDays || 0);
      var recado = seq.closest("div") && $(".nl-legenda", seq.closest("div"));
      if (recado) recado.textContent = recadoSequencia(p.streakDays || 0);
    }
    var cb = $('[data-nl="const-barras"]');
    if (cb) {
      var datas = (p.weight || []).map(function (w) { return w.at; })
        .concat((p.measurements || []).map(function (m) { return m.at; }));
      var sem = semanasDeConstancia(datas, 30);
      cb.innerHTML = barras(sem.map(function (s) { return s.dias; }), sem.map(function (s) { return s.rotulo; }));
    }

    var sub = $("#painel-peso .panel-sub");
    if (sub && ROTULO[faixa]) sub.textContent = "últimos " + ROTULO[faixa];
    var recadoFaixa = $('[data-nl="faixa-recado"]');
    if (recadoFaixa && ROTULO[faixa]) recadoFaixa.textContent = "Mostrando os últimos " + ROTULO[faixa] + ".";
  }

  /* ---------------------------- buscar faixa --------------------------- */
  var buscando = false;
  async function trocarFaixa(faixa) {
    if (buscando) return;
    buscando = true;
    var form = $("#form-faixa");
    if (form) form.setAttribute("aria-busy", "true");
    var recado = $('[data-nl="faixa-recado"]');
    if (recado) recado.textContent = "Buscando os últimos " + (ROTULO[faixa] || faixa) + "…";
    try {
      var p = await NL.api("/api/me/progress?range=" + encodeURIComponent(faixa));
      /* sem nada no período: a tela desenhada no servidor é outra, recarrega */
      var vazia = !p || ((!p.weight || !p.weight.length) && (!p.measurements || !p.measurements.length));
      var temPainel = !!$("#painel-peso");
      if (vazia || !temPainel) {
        location.href = "/evolucao?range=" + encodeURIComponent(faixa);
        return;
      }
      pintar(p, faixa);
      try { history.replaceState(null, "", "/evolucao?range=" + encodeURIComponent(faixa)); } catch (e) {}
    } catch (erro) {
      if (recado) recado.textContent = "Não deu para trocar o período agora.";
      NL.aviso(erro.code === "indisponivel"
        ? "O histórico está fora do ar neste instante. Tente de novo em alguns minutos."
        : (erro.message || "Não deu para buscar esse período."), "erro");
    } finally {
      buscando = false;
      if (form) form.removeAttribute("aria-busy");
    }
  }

  /* --------------------------- salvar medidas -------------------------- */
  var numeroBR = function (v) {
    var t = String(v == null ? "" : v).trim().replace(/\s/g, "").replace(",", ".");
    if (!t) return null;
    var n = Number(t);
    return isFinite(n) && n > 0 ? n : NaN;
  };

  function erroForm(texto) {
    var caixa = $('[data-nl="erro-medidas"]');
    if (!caixa) return;
    if (texto) {
      $('[data-nl="erro-texto"]', caixa).textContent = texto;
      caixa.setAttribute("data-cheio", "1");
    } else caixa.removeAttribute("data-cheio");
  }

  NL.pronto(function () {
    /* período */
    $$('#form-faixa input[name="range"]').forEach(function (r) {
      r.addEventListener("change", function () { if (r.checked) trocarFaixa(r.value); });
    });
    var formFaixa = $("#form-faixa");
    if (formFaixa) formFaixa.addEventListener("submit", function (e) {
      e.preventDefault();
      var m = $('#form-faixa input[name="range"]:checked');
      if (m) trocarFaixa(m.value);
    });

    /* atalho do estado vazio */
    var ir = $('[data-nl="ir-formulario"]');
    if (ir) ir.addEventListener("click", function () {
      var alvo = $("#weightKg");
      var painel = $("#registrar-hoje");
      if (painel) painel.scrollIntoView({ behavior: "smooth", block: "start" });
      if (alvo) alvo.focus({ preventScroll: true });
    });

    /* medidas de hoje */
    var form = $("#form-medidas");
    if (form) {
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        NL.limparErros(form);
        erroForm("");
        var dados = new FormData(form);
        var campos = [["weightKg", "Peso"], ["waistCm", "Cintura"], ["hipCm", "Quadril"], ["armCm", "Braço"]];
        var corpo = {};
        var invalido = null;
        campos.forEach(function (c) {
          var n = numeroBR(dados.get(c[0]));
          if (n === null) return;
          if (isNaN(n)) { if (!invalido) invalido = c; return; }
          corpo[c[0]] = Math.round(n * 10) / 10;
        });
        if (invalido) {
          var campo = {};
          campo[invalido[0]] = "Use só números, com vírgula para o decimal.";
          NL.mostrarErros(form, { code: "dados_invalidos", message: invalido[1] + " não parece um número.", fields: campo });
          return;
        }
        var nota = String(dados.get("note") || "").trim();
        if (nota) corpo.note = nota;
        if (!Object.keys(corpo).filter(function (k) { return k !== "note"; }).length) {
          erroForm("Preencha ao menos um valor: peso, cintura, quadril ou braço.");
          var primeiro = $("#weightKg", form);
          if (primeiro) primeiro.focus();
          return;
        }

        var botao = $('[type="submit"]', form);
        if (botao) { botao.classList.add("is-loading"); botao.setAttribute("aria-busy", "true"); }
        try {
          await NL.api("/api/me/measurements", { method: "POST", body: corpo });
          form.reset();
          NL.aviso("Medidas de hoje registradas.");
          var marcado = $('#form-faixa input[name="range"]:checked');
          var faixa = marcado ? marcado.value : (NL.boot.faixa || "30d");
          try {
            var p = await NL.api("/api/me/progress?range=" + encodeURIComponent(faixa));
            if ($("#painel-peso")) pintar(p, faixa);
            else location.reload();
          } catch (e2) { /* salvou; o gráfico atualiza no próximo carregamento */ }
        } catch (erro) {
          if (erro.code === "indisponivel") {
            erroForm("O registro de medidas está fora do ar neste instante. Tente de novo em alguns minutos.");
          } else if (erro.fields) {
            NL.mostrarErros(form, erro);
          } else {
            erroForm(erro.message || "Não deu para salvar as medidas agora.");
          }
        } finally {
          if (botao) { botao.classList.remove("is-loading"); botao.removeAttribute("aria-busy"); }
        }
      });
    }

    $$('[data-nl="recarregar"]').forEach(function (b) {
      b.addEventListener("click", function () { location.reload(); });
    });
  });
})();
