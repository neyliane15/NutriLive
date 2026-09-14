/* =========================================================================
   Nutri&Live — ilustrações
   Linguagem: formas chapadas da paleta da marca sobre fundo menta,
   detalhe monolinear em verde escuro, cantos arredondados. Sem gradiente,
   sem sombra: a mesma leveza das peças de campanha.
   ========================================================================= */

const C = {
  ground: "#DCF1E2",
  groundSoft: "#F0F9F2",
  leaf: "#2F9761",
  deep: "#17603D",
  dark: "#0D3524",
  lime: "#C7EC8A",
  cream: "#FFFFFF",
  tomato: "#D96A4E",
  carrot: "#E8934A",
  wheat: "#E8C97A",
  water: "#8ED0E8"
};

const svg = (body, { w = 260, h = 200, label = "" } = {}) => `
<svg class="illu" viewBox="0 0 ${w} ${h}" fill="none" xmlns="http://www.w3.org/2000/svg"
     role="img" aria-label="${label}">
  ${body}
</svg>`;

const ln = (d, { w = 2.4, c = C.dark, cap = "round" } = {}) =>
  `<path d="${d}" stroke="${c}" stroke-width="${w}" stroke-linecap="${cap}" stroke-linejoin="round" fill="none"/>`;

/* folha reutilizável — a forma da marca */
const leaf = (x, y, s = 1, rot = 0, fill = C.leaf) => `
<g transform="translate(${x} ${y}) rotate(${rot}) scale(${s})">
  <path d="M0 0c13 0 22 3.6 27 10.4C32 17 33 25.6 30 35c-9.4 3-18 2-24.6-3S-3 17 0 0Z" fill="${fill}"/>
  ${ln("M2.5 32.5C8 23 15 15.6 25.5 9", { w: 2, c: "rgba(13,53,36,.34)" })}
</g>`;

export const illu = {
  /* 1 — o prato: o que entra no dia */
  prato: () =>
    svg(
      `<ellipse cx="130" cy="106" rx="104" ry="80" fill="${C.ground}"/>
       <circle cx="130" cy="100" r="66" fill="${C.cream}"/>
       <circle cx="130" cy="100" r="56" fill="${C.groundSoft}"/>
       <path d="M130 44a56 56 0 0 1 56 56h-56z" fill="${C.lime}"/>
       <path d="M74 100a56 56 0 0 1 56-56v56z" fill="${C.leaf}"/>
       <path d="M130 100v56a56 56 0 0 1-56-56z" fill="${C.wheat}"/>
       <circle cx="130" cy="100" r="56" stroke="${C.dark}" stroke-width="2.6"/>
       ${ln("M130 44v112M74 100h112", { w: 2.6 })}
       <circle cx="158" cy="72" r="9" fill="${C.tomato}"/>
       ${ln("M158 63v-4", { w: 2.2, c: C.deep })}
       <ellipse cx="100" cy="128" rx="11" ry="7" fill="${C.carrot}" transform="rotate(-18 100 128)"/>
       ${leaf(150, 118, 0.58, 14, C.deep)}
       ${leaf(36, 34, 0.8, -22, C.leaf)}
       ${ln("M214 150c0-10 6-18 16-20", { w: 2.4, c: C.deep })}
       <circle cx="232" cy="126" r="7" fill="${C.lime}"/>`,
      { label: "Prato dividido em porções de vegetais, proteína e carboidrato" }
    ),

  /* 2 — a feira: a lista de compras virando comida */
  feira: () =>
    svg(
      `<ellipse cx="130" cy="112" rx="106" ry="76" fill="${C.ground}"/>
       <path d="M62 78h136l-12 96a12 12 0 0 1-12 10H86a12 12 0 0 1-12-10z" fill="${C.cream}" stroke="${C.dark}" stroke-width="2.6"/>
       <path d="M62 78h136l-3.4 27H65.4z" fill="${C.lime}"/>
       ${ln("M96 78V56a34 34 0 0 1 68 0v22", { w: 2.6 })}
       <circle cx="104" cy="132" r="17" fill="${C.leaf}"/>
       ${leaf(100, 108, 0.62, -12, C.deep)}
       <circle cx="146" cy="140" r="13" fill="${C.tomato}"/>
       ${ln("M146 127v-6", { w: 2.2, c: C.deep })}
       <ellipse cx="176" cy="134" rx="9" ry="16" fill="${C.carrot}" transform="rotate(12 176 134)"/>
       ${ln("M176 118v-8", { w: 2.2, c: C.deep })}
       <rect x="88" y="152" width="84" height="22" rx="8" fill="${C.wheat}"/>
       ${ln("M96 163h16M122 163h10", { w: 2.4, c: "rgba(13,53,36,.45)" })}
       ${leaf(206, 40, 0.74, 28, C.leaf)}`,
      { label: "Sacola de feira cheia de vegetais" }
    ),

  /* 3 — a evolução: o progresso que a balança não mostra */
  evolucao: () =>
    svg(
      `<ellipse cx="130" cy="110" rx="106" ry="78" fill="${C.ground}"/>
       <rect x="44" y="40" width="172" height="124" rx="18" fill="${C.cream}" stroke="${C.dark}" stroke-width="2.6"/>
       <rect x="44" y="40" width="172" height="26" rx="18" fill="${C.lime}"/>
       <path d="M44 58h172v8H44z" fill="${C.lime}"/>
       ${ln("M60 53h12M80 53h8", { w: 2.4, c: C.dark })}
       <path d="M64 136c18-4 26-22 40-30s24 10 38-6 20-30 34-34v46c0 6-4 10-10 10H74c-6 0-10-4-10-10z" fill="${C.ground}"/>
       ${ln("M64 136c18-4 26-22 40-30s24 10 38-6 20-30 34-34", { w: 3, c: C.leaf })}
       <circle cx="176" cy="66" r="6.5" fill="${C.leaf}" stroke="${C.cream}" stroke-width="2.6"/>
       ${ln("M64 146h124", { w: 2.4, c: "rgba(13,53,36,.28)" })}
       <rect x="64" y="152" width="26" height="6" rx="3" fill="${C.leaf}"/>
       <rect x="96" y="152" width="18" height="6" rx="3" fill="${C.leaf}" opacity=".5"/>
       ${leaf(222, 128, 0.72, 34, C.leaf)}
       ${leaf(14, 54, 0.6, -40, C.deep)}`,
      { label: "Gráfico de evolução com medidas e constância" }
    ),

  /* 4 — a consulta: o nutricionista e o paciente no mesmo plano */
  consulta: () =>
    svg(
      `<ellipse cx="130" cy="112" rx="108" ry="76" fill="${C.ground}"/>
       <rect x="30" y="34" width="112" height="140" rx="16" fill="${C.cream}" stroke="${C.dark}" stroke-width="2.6"/>
       <rect x="58" y="22" width="56" height="26" rx="10" fill="${C.lime}" stroke="${C.dark}" stroke-width="2.6"/>
       ${ln("M48 74h76M48 96h58M48 118h68M48 140h44", { w: 2.6, c: "rgba(13,53,36,.34)" })}
       <rect x="132" y="66" width="98" height="108" rx="18" fill="${C.deep}"/>
       <rect x="142" y="78" width="78" height="10" rx="5" fill="${C.lime}"/>
       <rect x="142" y="96" width="62" height="7" rx="3.5" fill="rgba(255,255,255,.34)"/>
       <rect x="142" y="110" width="70" height="7" rx="3.5" fill="rgba(255,255,255,.24)"/>
       <rect x="142" y="130" width="78" height="30" rx="10" fill="rgba(199,236,138,.22)"/>
       ${ln("M152 145h22M184 145h12", { w: 2.4, c: C.lime })}
       ${leaf(206, 22, 0.7, 18, C.leaf)}
       ${ln("M18 150c0-12 8-20 20-22", { w: 2.4, c: C.deep })}`,
      { label: "Prontuário do nutricionista ao lado do app do paciente" }
    ),

  /* 5 — a academia: treino e nutrição na mesma conta */
  academia: () =>
    svg(
      `<ellipse cx="130" cy="112" rx="108" ry="76" fill="${C.ground}"/>
       <rect x="26" y="96" width="30" height="46" rx="10" fill="${C.deep}"/>
       <rect x="204" y="96" width="30" height="46" rx="10" fill="${C.deep}"/>
       <rect x="14" y="108" width="14" height="22" rx="6" fill="${C.dark}"/>
       <rect x="232" y="108" width="14" height="22" rx="6" fill="${C.dark}"/>
       <rect x="52" y="110" width="156" height="18" rx="9" fill="${C.leaf}"/>
       <rect x="88" y="42" width="84" height="54" rx="14" fill="${C.cream}" stroke="${C.dark}" stroke-width="2.6"/>
       ${ln("M100 60h28M100 74h44", { w: 2.6, c: "rgba(13,53,36,.34)" })}
       <circle cx="152" cy="62" r="10" fill="${C.lime}"/>
       ${ln("M147.5 62l3.2 3.4 6-7", { w: 2.4, c: C.dark })}
       ${leaf(196, 150, 0.72, 26, C.leaf)}
       ${leaf(30, 34, 0.66, -26, C.deep)}`,
      { label: "Halteres com o painel de alunos da academia" }
    ),

  /* 6 — a hidratação e o ritmo do dia */
  rotina: () =>
    svg(
      `<ellipse cx="130" cy="112" rx="104" ry="74" fill="${C.ground}"/>
       <path d="M96 44h68l-8 122a14 14 0 0 1-14 13h-24a14 14 0 0 1-14-13z" fill="${C.cream}" stroke="${C.dark}" stroke-width="2.6"/>
       <path d="M101 110h58l-4 56a14 14 0 0 1-14 13h-22a14 14 0 0 1-14-13z" fill="${C.water}"/>
       <rect x="108" y="26" width="44" height="22" rx="9" fill="${C.lime}" stroke="${C.dark}" stroke-width="2.6"/>
       ${ln("M104 94h52", { w: 2.4, c: "rgba(13,53,36,.3)" })}
       ${ln("M104 76h30", { w: 2.4, c: "rgba(13,53,36,.3)" })}
       <circle cx="208" cy="76" r="26" fill="${C.cream}" stroke="${C.dark}" stroke-width="2.6"/>
       ${ln("M208 62v14l9 6", { w: 2.6 })}
       ${leaf(34, 62, 0.78, -24, C.leaf)}
       ${leaf(216, 136, 0.6, 30, C.deep)}`,
      { label: "Garrafa de água com meta de hidratação e relógio" }
    )
};

export const illuNames = Object.keys(illu);
