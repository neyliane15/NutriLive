/* Marcas de meio de pagamento desenhadas em SVG — sem imagem de terceiros. */
const wrap = (w, body, label) =>
  `<svg viewBox="0 0 ${w} 26" role="img" aria-label="${label}" fill="none">${body}</svg>`;

export const payMark = {
  pix: () =>
    wrap(
      54,
      `<g fill="currentColor">
        <path d="M13 1.9a2.8 2.8 0 0 1 2 .8l3.5 3.5H16a3 3 0 0 0-2.1.9l-3.6 3.6a1.8 1.8 0 0 1-2.5 0L4.2 7.1l3.5-3.5A2.8 2.8 0 0 1 9.7 2.7z" opacity=".92"/>
        <path d="M13 24.1a2.8 2.8 0 0 0 2-.8l3.5-3.5H16a3 3 0 0 1-2.1-.9l-3.6-3.6a1.8 1.8 0 0 0-2.5 0l-3.6 3.6 3.5 3.5a2.8 2.8 0 0 0 2 .8z" opacity=".92"/>
        <path d="M2.7 8.6.9 10.4a2.3 2.3 0 0 0 0 3.2l1.8 1.8 3.6-3.4z" opacity=".62"/>
        <path d="M23.3 8.6l1.8 1.8a2.3 2.3 0 0 1 0 3.2l-1.8 1.8-3.6-3.4z" opacity=".62"/>
      </g>
      <text x="54" y="17.5" text-anchor="end" font-family="Inter,sans-serif" font-size="13.5" font-weight="800" letter-spacing="-0.03em" fill="currentColor">pix</text>`,
      "Pix"
    ),
  visa: () =>
    wrap(46, `<text x="0" y="18" font-family="Inter,sans-serif" font-size="16" font-style="italic" font-weight="800" letter-spacing="-0.02em" fill="currentColor">VISA</text>`, "Visa"),
  master: () =>
    wrap(
      44,
      `<circle cx="15" cy="13" r="9.5" fill="currentColor" opacity=".85"/>
       <circle cx="29" cy="13" r="9.5" fill="currentColor" opacity=".45"/>`,
      "Mastercard"
    ),
  elo: () =>
    wrap(
      50,
      `<circle cx="11" cy="13" r="9" stroke="currentColor" stroke-width="2.6" stroke-dasharray="28 11" stroke-linecap="round" transform="rotate(-32 11 13)"/>
       <text x="50" y="18" text-anchor="end" font-family="Inter,sans-serif" font-size="13.5" font-weight="800" letter-spacing="-0.02em" fill="currentColor">elo</text>`,
      "Elo"
    ),
  amex: () =>
    wrap(
      54,
      `<rect x=".9" y="3.6" width="52.2" height="18.8" rx="3" stroke="currentColor" stroke-width="1.6"/>
       <text x="27" y="17" text-anchor="middle" font-family="Inter,sans-serif" font-size="9.5" font-weight="800" letter-spacing="0.02em" fill="currentColor">AMEX</text>`,
      "American Express"
    ),
  hiper: () =>
    wrap(
      66,
      `<text x="0" y="18" font-family="Inter,sans-serif" font-size="12.5" font-weight="800" letter-spacing="-0.02em" fill="currentColor">hipercard</text>`,
      "Hipercard"
    ),
  boleto: () =>
    wrap(
      52,
      `<g fill="currentColor">
        ${[0, 4, 6, 11, 13, 19, 24, 26, 31, 35, 41, 43, 48]
          .map((x, i) => `<rect x="${x}" y="4" width="${i % 3 === 0 ? 2.4 : 1.2}" height="18" rx=".4"/>`)
          .join("")}
      </g>`,
      "Boleto bancário"
    )
};
