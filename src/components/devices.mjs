/* =========================================================================
   Device frames + in-app screen mockups, built from markup only.
   Every screen mirrors a real Nutri&Live surface.
   ========================================================================= */
import { icon } from "./icons.mjs";
import { leafMark } from "./brand.mjs";

const statusbar = () => `
<div class="device-statusbar" aria-hidden="true">
  <span>9:41</span>
  <span class="sb-icons">
    <svg viewBox="0 0 18 12" fill="currentColor"><rect x="0" y="8" width="3" height="4" rx="1"/><rect x="5" y="5.5" width="3" height="6.5" rx="1"/><rect x="10" y="3" width="3" height="9" rx="1"/><rect x="15" y="0" width="3" height="12" rx="1" opacity=".35"/></svg>
    <svg viewBox="0 0 16 12" fill="currentColor"><path d="M8 11.2 5.9 8.8a3.2 3.2 0 0 1 4.2 0L8 11.2Zm0-4.6a5.9 5.9 0 0 0-4.1 1.6L2.4 6.5a8.1 8.1 0 0 1 11.2 0l-1.5 1.7A5.9 5.9 0 0 0 8 6.6Zm0-4.2a10 10 0 0 0-7 2.8L-.4 3.6a12.2 12.2 0 0 1 16.8 0L15 5.2A10 10 0 0 0 8 2.4Z"/></svg>
    <svg viewBox="0 0 26 12" fill="none"><rect x=".8" y=".8" width="21" height="10.4" rx="3" stroke="currentColor" stroke-width="1.2" opacity=".5"/><rect x="2.6" y="2.6" width="15" height="6.8" rx="1.6" fill="currentColor"/><path d="M23.6 4.2v3.6a2 2 0 0 0 0-3.6Z" fill="currentColor" opacity=".5"/></svg>
  </span>
</div>`;

const appbar = (title) => `
<div class="mini-appbar">${leafMark(14)}<span>${title}</span></div>`;

const tabbar = (active = 0) => {
  const tabs = [
    { i: icon.leaf(), l: "Início" },
    { i: icon.book(), l: "Receitas" },
    { i: null, l: "" },
    { i: icon.cart(), l: "Compras" },
    { i: icon.user(), l: "Mais" }
  ];
  return `<div class="mini-tabbar" aria-hidden="true">${tabs
    .map((t, n) =>
      t.i === null
        ? `<span class="mini-fab"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span>`
        : `<span class="mt${n === active ? " on" : ""}">${t.i}<span>${t.l}</span></span>`
    )
    .join("")}</div>`;
};

const ring = (pct, size = 40) => {
  const r = 15.5, c = 2 * Math.PI * r;
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="rgba(255,255,255,.24)" stroke-width="4"/>
    <circle cx="20" cy="20" r="${r}" fill="none" stroke="#C7EC8A" stroke-width="4" stroke-linecap="round"
      stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct / 100)}" transform="rotate(-90 20 20)"/>
    <text x="20" y="21.4" text-anchor="middle" font-family="Inter, sans-serif" font-size="12.5"
      font-weight="800" letter-spacing="-0.04em" fill="#fff">${pct}</text>
    <text x="20" y="27.4" text-anchor="middle" font-family="Inter, sans-serif" font-size="5.4"
      font-weight="700" letter-spacing="0.04em" fill="rgba(255,255,255,.62)">/100</text>
  </svg>`;
};

const sparkline = (points, color = "#2F9761", fill = "rgba(47,151,97,.12)") => {
  const w = 120, h = 40;
  const max = Math.max(...points), min = Math.min(...points);
  const span = max - min || 1;
  const coords = points.map((p, i) => [(i / (points.length - 1)) * w, h - 4 - ((p - min) / span) * (h - 10)]);
  const d = coords.map((c, i) => (i ? `L${c[0].toFixed(1)},${c[1].toFixed(1)}` : `M${c[0].toFixed(1)},${c[1].toFixed(1)}`)).join("");
  return `<svg class="mini-sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${d}L${w},${h}L0,${h}Z" fill="${fill}"/>
    <path d="${d}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${coords[coords.length - 1][0]}" cy="${coords[coords.length - 1][1]}" r="2.6" fill="${color}"/>
  </svg>`;
};

const bars = (values, color = "#2F9761") => {
  const max = Math.max(...values);
  return `<div style="display:flex;align-items:flex-end;gap:3px;height:38px;margin-top:6px" aria-hidden="true">
    ${values.map((v) => `<i style="flex:1;background:${color};opacity:${0.35 + 0.65 * (v / max)};height:${Math.max(12, (v / max) * 100)}%;border-radius:2px 2px 1px 1px;display:block"></i>`).join("")}
  </div>`;
};

/* ---------------------- Screens ---------------------- */
export const screens = {
  home: () => `
${appbar("Nutri&amp;Live")}
<div class="mini-card mini-card-hero">
  <div class="mini-row">
    <div>
      <div style="font-size:8.5px;font-weight:700;opacity:.85">OLÁ, ANA 👋</div>
      <div class="mini-value mini-value-lg" style="margin-top:2px">Sua saúde hoje</div>
    </div>
    ${ring(80, 42)}
  </div>
  <div class="mini-chipgrid">
    <span class="mini-chip"><span class="mc-em">🍽️</span><span><span class="mc-t">Alimentos</span><span class="mc-v">24/30</span></span></span>
    <span class="mini-chip"><span class="mc-em">💧</span><span><span class="mc-t">Água</span><span class="mc-v">18/25</span></span></span>
    <span class="mini-chip"><span class="mc-em">😴</span><span><span class="mc-t">Sono</span><span class="mc-v">20/25</span></span></span>
    <span class="mini-chip"><span class="mc-em">🏃</span><span><span class="mc-t">Exercício</span><span class="mc-v">18/20</span></span></span>
  </div>
</div>
<div class="mini-card">
  <div class="mini-row"><span class="mini-label">🔥 Calorias</span><span style="font-size:8px;color:#637F72">meta 2.070</span></div>
  <div class="mini-value" style="margin-top:1px">1.642 <span style="font-size:9px;font-weight:600;color:#637F72">kcal</span></div>
  <div class="mini-bar"><i style="width:79%"></i></div>
</div>
<div class="mini-card">
  <div class="mini-row"><span class="mini-label">🥩 Proteínas</span><span style="font-size:8px;color:#637F72">meta 168 g</span></div>
  <div class="mini-value" style="margin-top:1px">141 <span style="font-size:9px;font-weight:600;color:#637F72">g</span></div>
  <div class="mini-bar"><i style="width:84%"></i></div>
</div>
<div class="mini-card">
  <div class="mini-row"><span class="mini-label">💧 Hidratação</span><span style="font-size:8px;color:#637F72">1,8 / 2,5 L</span></div>
  <div class="mini-bar" style="margin-top:7px"><i style="width:72%;background:#56B47F"></i></div>
</div>
<div class="mini-card">
  <div class="mini-row"><span class="mini-label">Próxima refeição</span><span style="font-size:8px;color:#1F7A4D;font-weight:700">19:30</span></div>
  <div style="display:flex;align-items:center;gap:7px;margin-top:5px">
    <span style="width:22px;height:22px;border-radius:7px;background:#DCF1E2;display:grid;place-items:center;font-size:11px">🥗</span>
    <span style="flex:1"><b style="font-size:9px">Omelete de espinafre</b><br><span style="font-size:8px;color:#637F72">386 kcal · 28 g de proteína</span></span>
  </div>
</div>
${tabbar(0)}`,

  plano: () => `
${appbar("Plano alimentar")}
<div class="mini-card">
  <div class="mini-label" style="color:#1F7A4D">GERAR PLANO</div>
  <div style="font-size:9px;color:#435F52;margin-top:3px;line-height:1.4">Pescetariana · 2.070 kcal · 168 g de proteína · sem oleaginosas</div>
  <div class="mini-pillrow">
    <span class="mini-pill">1 dia</span><span class="mini-pill on">3 dias</span><span class="mini-pill">7 dias</span>
  </div>
  <div style="margin-top:8px;background:#1F7A4D;color:#fff;border-radius:8px;padding:6px;text-align:center;font-size:9px;font-weight:700">✨ Gerar plano</div>
</div>
<div class="mini-card">
  <div class="mini-row"><b style="font-size:10px">Segunda · 3 dias</b><span style="font-size:8px;color:#1F7A4D;font-weight:700">Trocar</span></div>
  <ul class="mini-list" style="margin-top:4px">
    <li><span class="mini-tick on"></span><span style="flex:1"><b style="font-size:9px">Café</b><br><span style="font-size:8px;color:#637F72">Ovos mexidos + tapioca · 412 kcal</span></span></li>
    <li><span class="mini-tick on"></span><span style="flex:1"><b style="font-size:9px">Almoço</b><br><span style="font-size:8px;color:#637F72">Tilápia, arroz integral, brócolis · 618 kcal</span></span></li>
    <li><span class="mini-tick"></span><span style="flex:1"><b style="font-size:9px">Lanche</b><br><span style="font-size:8px;color:#637F72">Iogurte natural + banana · 214 kcal</span></span></li>
    <li><span class="mini-tick"></span><span style="flex:1"><b style="font-size:9px">Jantar</b><br><span style="font-size:8px;color:#637F72">Omelete de espinafre + salada · 386 kcal</span></span></li>
  </ul>
</div>
<div class="mini-card" style="display:flex;align-items:center;gap:7px">
  <span style="width:22px;height:22px;border-radius:7px;background:#DCF1E2;color:#17603D;display:grid;place-items:center">
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M2.5 3.5h2.6l2.5 12.1h11.1l1.8-8.6H6.1"/></svg>
  </span>
  <span style="flex:1;font-size:9px;font-weight:600">Enviar lista de compras</span>
  <span style="font-size:8px;color:#637F72">23 itens</span>
</div>`,

  receitas: () => `
${appbar("Receitas inteligentes")}
<div class="mini-card">
  <div style="font-size:9px;color:#435F52;line-height:1.45">Diga o que tem em casa e a gente monta o jantar.</div>
  <div style="margin-top:7px;background:#F5FAF7;border:1px solid #D7E5DD;border-radius:8px;padding:6px 8px;font-size:8.5px;color:#435F52">
    peito de frango, batata-doce, cenoura<span style="color:#8CA598">|</span>
  </div>
  <div class="mini-pillrow"><span class="mini-pill on">⏱ até 30 min</span><span class="mini-pill">1 panela</span><span class="mini-pill">alta proteína</span></div>
</div>
<div class="mini-card">
  <div class="mini-row"><b style="font-size:9.5px">Frango dourado com purê de batata-doce</b></div>
  <div style="font-size:8px;color:#637F72;margin-top:3px">⏱ 25 min · 486 kcal · 42 g proteína</div>
  <div class="mini-bar" style="margin-top:6px"><i style="width:92%"></i></div>
  <div style="font-size:7.5px;color:#1F7A4D;font-weight:700;margin-top:4px">92% de combinação com o seu plano</div>
</div>
<div class="mini-card">
  <div class="mini-row"><b style="font-size:9.5px">Tirinhas de frango com cenoura na air fryer</b></div>
  <div style="font-size:8px;color:#637F72;margin-top:3px">⏱ 18 min · 398 kcal · 38 g proteína</div>
  <div class="mini-bar" style="margin-top:6px"><i style="width:84%"></i></div>
  <div style="font-size:7.5px;color:#1F7A4D;font-weight:700;margin-top:4px">84% de combinação com o seu plano</div>
</div>
<div class="mini-card">
  <div class="mini-row"><b style="font-size:9.5px">Sopa cremosa de cenoura e frango</b></div>
  <div style="font-size:8px;color:#637F72;margin-top:3px">⏱ 30 min · 342 kcal · 31 g proteína</div>
</div>
${tabbar(1)}`,

  evolucao: () => `
${appbar("Minha evolução")}
<div class="mini-card">
  <div class="mini-pillrow" style="margin-top:0">
    <span class="mini-pill">7 dias</span><span class="mini-pill on">30 dias</span><span class="mini-pill">3 meses</span><span class="mini-pill">1 ano</span>
  </div>
  <div class="mini-row" style="margin-top:8px"><span class="mini-label">Peso</span><span style="font-size:8px;color:#1F7A4D;font-weight:700">−3,4 kg</span></div>
  <div class="mini-value">78,6 <span style="font-size:9px;font-weight:600;color:#637F72">kg</span></div>
  ${sparkline([82, 81.6, 81.2, 80.9, 80.2, 80.4, 79.8, 79.3, 79.1, 78.6])}
</div>
<div class="mini-card">
  <div class="mini-label">MEDIDAS DE HOJE</div>
  <ul class="mini-list" style="margin-top:4px">
    <li><span style="flex:1;font-size:9px">Cintura</span><b style="font-size:9px">86 cm</b><span style="font-size:7.5px;color:#1F7A4D;font-weight:700">−4</span></li>
    <li><span style="flex:1;font-size:9px">Quadril</span><b style="font-size:9px">102 cm</b><span style="font-size:7.5px;color:#1F7A4D;font-weight:700">−2</span></li>
    <li><span style="flex:1;font-size:9px">Braço</span><b style="font-size:9px">32 cm</b><span style="font-size:7.5px;color:#637F72;font-weight:700">=</span></li>
  </ul>
</div>
<div class="mini-card">
  <div class="mini-label">CONSTÂNCIA · 30 DIAS</div>
  ${bars([3, 5, 4, 6, 5, 7, 6, 7, 5, 7, 6, 7, 7, 6])}
  <div style="font-size:7.5px;color:#637F72;margin-top:4px">24 dos últimos 30 dias registrados</div>
</div>`,

  compras: () => `
${appbar("Lista de compras")}
<div class="mini-card">
  <div class="mini-row"><b style="font-size:10px">Semana de 14 a 20 de abril</b></div>
  <div style="font-size:8px;color:#637F72;margin-top:2px">23 itens · estimativa R$ 214,80</div>
  <div class="mini-bar" style="margin-top:7px"><i style="width:35%"></i></div>
</div>
<div class="mini-card">
  <div class="mini-label">🥬 HORTIFRÚTI</div>
  <ul class="mini-list" style="margin-top:3px">
    <li><span class="mini-tick on"></span><span style="flex:1;font-size:9px">Alface crespa · 1 pé</span><span style="font-size:8px;color:#637F72">R$ 4,50</span></li>
    <li><span class="mini-tick on"></span><span style="flex:1;font-size:9px">Tomate italiano · 500 g</span><span style="font-size:8px;color:#637F72">R$ 6,90</span></li>
    <li><span class="mini-tick"></span><span style="flex:1;font-size:9px">Cenoura · 500 g</span><span style="font-size:8px;color:#637F72">R$ 3,80</span></li>
    <li><span class="mini-tick"></span><span style="flex:1;font-size:9px">Brócolis · 1 maço</span><span style="font-size:8px;color:#637F72">R$ 7,20</span></li>
  </ul>
</div>
<div class="mini-card">
  <div class="mini-label">🥩 PROTEÍNAS</div>
  <ul class="mini-list" style="margin-top:3px">
    <li><span class="mini-tick"></span><span style="flex:1;font-size:9px">Filé de tilápia · 600 g</span><span style="font-size:8px;color:#637F72">R$ 32,90</span></li>
    <li><span class="mini-tick"></span><span style="flex:1;font-size:9px">Ovos caipira · 20 un</span><span style="font-size:8px;color:#637F72">R$ 21,40</span></li>
    <li><span class="mini-tick"></span><span style="flex:1;font-size:9px">Atum em água · 3 latas</span><span style="font-size:8px;color:#637F72">R$ 18,00</span></li>
  </ul>
</div>
<div class="mini-card">
  <div class="mini-label">🌾 MERCEARIA</div>
  <ul class="mini-list" style="margin-top:3px">
    <li><span class="mini-tick on"></span><span style="flex:1;font-size:9px">Arroz integral · 1 kg</span><span style="font-size:8px;color:#637F72">R$ 9,80</span></li>
    <li><span class="mini-tick"></span><span style="flex:1;font-size:9px">Tapioca granulada · 500 g</span><span style="font-size:8px;color:#637F72">R$ 7,40</span></li>
  </ul>
</div>
${tabbar(3)}`,

  dashboard: () => `
${appbar("Painel · Dra. Marina")}
<div class="mini-card">
  <div class="mini-row"><span class="mini-label">HOJE</span><span style="font-size:8px;color:#637F72">14 abr</span></div>
  <div style="display:flex;gap:6px;margin-top:6px">
    <div style="flex:1;background:#F0F9F2;border-radius:8px;padding:6px"><div class="mini-value" style="font-size:14px">48</div><div style="font-size:7px;color:#637F72;line-height:1.2">pacientes ativos</div></div>
    <div style="flex:1;background:#F0F9F2;border-radius:8px;padding:6px"><div class="mini-value" style="font-size:14px">86%</div><div style="font-size:7px;color:#637F72;line-height:1.2">adesão média</div></div>
    <div style="flex:1;background:#FDF1DC;border-radius:8px;padding:6px"><div class="mini-value" style="font-size:14px;color:#7A4A00">5</div><div style="font-size:7px;color:#7A4A00;line-height:1.2">em risco</div></div>
  </div>
</div>
<div class="mini-card">
  <div class="mini-row"><b style="font-size:9.5px">Precisam de você</b><span style="font-size:8px;color:#1F7A4D;font-weight:700">Ver todos</span></div>
  <ul class="mini-list" style="margin-top:3px">
    <li><span style="width:18px;height:18px;border-radius:50%;background:#FCEBEA;color:#C7362F;display:grid;place-items:center;font-size:7px;font-weight:800">JS</span><span style="flex:1"><b style="font-size:9px">Julia Santos</b><br><span style="font-size:7.5px;color:#C7362F">6 dias sem registrar</span></span></li>
    <li><span style="width:18px;height:18px;border-radius:50%;background:#FDF1DC;color:#7A4A00;display:grid;place-items:center;font-size:7px;font-weight:800">RC</span><span style="flex:1"><b style="font-size:9px">Rafael Costa</b><br><span style="font-size:7.5px;color:#7A4A00">adesão caiu 32%</span></span></li>
    <li><span style="width:18px;height:18px;border-radius:50%;background:#DCF1E2;color:#17603D;display:grid;place-items:center;font-size:7px;font-weight:800">BM</span><span style="flex:1"><b style="font-size:9px">Bianca Melo</b><br><span style="font-size:7.5px;color:#637F72">retorno em 2 dias</span></span></li>
  </ul>
</div>
<div class="mini-card">
  <div class="mini-label">ADESÃO DA CARTEIRA · 8 SEMANAS</div>
  ${bars([62, 68, 71, 69, 78, 82, 84, 86], "#1F7A4D")}
</div>`,

  acompanhamento: () => `
${appbar("Acompanhamento")}
<div class="mini-card">
  <div style="display:flex;align-items:center;gap:7px">
    <span style="width:26px;height:26px;border-radius:50%;background:#DCF1E2;color:#17603D;display:grid;place-items:center;font-size:9px;font-weight:800">AP</span>
    <span style="flex:1"><b style="font-size:10px">Ana Prudente</b><br><span style="font-size:7.5px;color:#637F72">Emagrecimento · 12ª semana</span></span>
    <span style="font-size:8px;font-weight:800;color:#1F7A4D">92%</span>
  </div>
</div>
<div class="mini-card">
  <div class="mini-label">EVOLUÇÃO DO PESO</div>
  ${sparkline([86, 85.2, 84.6, 84.1, 83.2, 82.6, 81.9, 81.1, 80.4, 79.6])}
  <div style="font-size:7.5px;color:#637F72">−6,4 kg desde o início</div>
</div>
<div class="mini-card">
  <div class="mini-label">REGISTROS DA SEMANA</div>
  <div style="display:flex;gap:3px;margin-top:6px">
    ${["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => `<span style="flex:1;text-align:center"><span style="display:block;height:18px;border-radius:5px;background:${i < 5 ? "#2F9761" : i === 5 ? "#B7E3C7" : "#EAF2ED"}"></span><span style="font-size:6.5px;color:#637F72">${d}</span></span>`).join("")}
  </div>
</div>
<div class="mini-card" style="background:#F0F9F2">
  <div style="font-size:8.5px;color:#17603D;line-height:1.45"><b>Nova orientação enviada</b><br>“Aumente 20 g de proteína no lanche da tarde.”</div>
</div>`,

  academia: () => `
${appbar("Rede Movimento")}
<div class="mini-card">
  <div class="mini-row"><span class="mini-label">ABRIL · 9 UNIDADES</span></div>
  <div style="display:flex;gap:6px;margin-top:6px">
    <div style="flex:1;background:#F0F9F2;border-radius:8px;padding:6px"><div class="mini-value" style="font-size:14px">3.184</div><div style="font-size:7px;color:#637F72;line-height:1.2">alunos ativos</div></div>
    <div style="flex:1;background:#F0F9F2;border-radius:8px;padding:6px"><div class="mini-value" style="font-size:14px">71%</div><div style="font-size:7px;color:#637F72;line-height:1.2">ativaram nutrição</div></div>
  </div>
  <div style="margin-top:6px;background:#DCF1E2;border-radius:8px;padding:6px 8px"><div style="font-size:8px;color:#17603D;font-weight:700">Churn −31% vs. quem não ativou</div></div>
</div>
<div class="mini-card">
  <div class="mini-row"><b style="font-size:9.5px">Unidades</b><span style="font-size:8px;color:#1F7A4D;font-weight:700">Ranking</span></div>
  <ul class="mini-list" style="margin-top:3px">
    <li><span style="flex:1;font-size:9px">Santo Amaro</span><span style="font-size:8px;color:#637F72">412</span><b style="font-size:8px;color:#1F7A4D">84%</b></li>
    <li><span style="flex:1;font-size:9px">Vila Mariana</span><span style="font-size:8px;color:#637F72">388</span><b style="font-size:8px;color:#1F7A4D">79%</b></li>
    <li><span style="flex:1;font-size:9px">Tatuapé</span><span style="font-size:8px;color:#637F72">356</span><b style="font-size:8px;color:#7A4A00">61%</b></li>
  </ul>
</div>
<div class="mini-card">
  <div class="mini-label">RECEITA ADICIONAL · 6 MESES</div>
  ${bars([48, 62, 79, 94, 118, 131], "#1F7A4D")}
  <div style="font-size:7.5px;color:#637F72;margin-top:4px">R$ 131 mil no último mês</div>
</div>`,

  whitelabel: () => `
<div class="mini-appbar" style="color:#124B31">
  <span style="width:14px;height:14px;border-radius:4px;background:#124B31;color:#C7EC8A;display:grid;place-items:center;font-size:8px;font-weight:900">M</span>
  <span>Movimento Nutri</span>
</div>
<div class="mini-card mini-card-hero" style="background:linear-gradient(148deg,#124B31,#06120D)">
  <div class="mini-row">
    <div><div style="font-size:8.5px;font-weight:700;opacity:.85">OLÁ, PEDRO 👋</div><div class="mini-value mini-value-lg" style="margin-top:2px">Seu plano de hoje</div></div>
    ${ring(74, 40)}
  </div>
  <div class="mini-chipgrid">
    <span class="mini-chip"><span class="mc-em">🏋️</span><span><span class="mc-t">Treino</span><span class="mc-v">B · Costas</span></span></span>
    <span class="mini-chip"><span class="mc-em">🍽️</span><span><span class="mc-t">Refeições</span><span class="mc-v">3/5</span></span></span>
  </div>
</div>
<div class="mini-card">
  <div class="mini-label">PÓS-TREINO SUGERIDO</div>
  <div style="font-size:9px;margin-top:3px;line-height:1.4"><b>Shake de whey com banana</b><br><span style="color:#637F72;font-size:8px">312 kcal · 34 g proteína · em 15 min</span></div>
</div>
<div class="mini-card" style="background:#F0F9F2;border:1px dashed #B7E3C7">
  <div style="font-size:8px;color:#17603D;line-height:1.45">Seu app, sua marca. O aluno vê a academia — não a gente.</div>
</div>`
};

export const device = (screen, { size = "", float = "", cls = "", tilt = "" } = {}) => `
<div class="device ${size} ${cls}"${tilt ? ` style="${tilt}"` : ""}>
  <div class="device-notch" aria-hidden="true"></div>
  <div class="device-screen">
    ${statusbar()}
    <div class="device-body mini">${screens[screen] ? screens[screen]() : ""}</div>
  </div>
</div>${float}`;

export const screenNames = Object.keys(screens);
