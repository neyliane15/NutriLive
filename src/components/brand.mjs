/* Nutri&Live brand mark — a monoline leaf with a rising stem. */

export const leafMark = (size = 30, cls = "") => `
<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false">
  <path d="M34.2 5.6c.6 0 1.1.4 1.2 1 .9 6.9-.5 12.9-4.2 17.4-3.8 4.5-9 6.6-15 6.2-.3 1.6-.4 3.3-.4 5.1a1.3 1.3 0 1 1-2.6 0c0-2.1.2-4.1.6-6a24 24 0 0 1 4.6-9.7 1.3 1.3 0 0 1 2 1.6 21.4 21.4 0 0 0-3.8 7.5c4.9.3 9-1.5 12-5.1 2.9-3.5 4.2-8.2 3.8-13.7-6.6.2-11.7 1.6-15.3 4-3.8 2.6-5.7 6-5.7 10.3 0 1.7.4 3.2 1.1 4.5a1.3 1.3 0 0 1-2.2 1.3 12 12 0 0 1-1.5-5.8c0-5.2 2.4-9.5 7-12.5C19.7 8.4 26 6.9 33.6 6.7l.6-1.1Z" fill="currentColor"/>
</svg>`;

/* Solid pictogram used for favicon / app icon */
export const leafGlyph = `
<svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="40" height="40" rx="10" fill="#17603D"/>
  <path d="M31.5 8.4c.7 6-.5 11.1-3.7 14.9-3.3 3.9-7.9 5.7-13.4 5.3-.3 1.5-.4 3-.4 4.6a1.2 1.2 0 1 1-2.4 0c0-1.9.2-3.8.6-5.5a22 22 0 0 1 4.2-8.9 1.2 1.2 0 0 1 1.9 1.5 19.6 19.6 0 0 0-3.4 6.8c4.3.2 7.9-1.4 10.5-4.5 2.5-3 3.6-7.1 3.4-11.9-5.7.2-10.1 1.5-13.2 3.6-3.3 2.2-4.9 5.2-4.9 8.9 0 1.4.3 2.7.9 3.9a1.2 1.2 0 0 1-2.1 1.2 10.9 10.9 0 0 1-1.3-5.1c0-4.6 2.1-8.3 6.1-11 3.7-2.5 9-3.8 15.7-4l1.5-.1Z" fill="#A9DD5C"/>
</svg>`;

export const brand = ({ href = "index.html", size = 30, label = true, cls = "" } = {}) => `
<a class="brand ${cls}" href="${href}" aria-label="Nutri&amp;Live — página inicial">
  ${leafMark(size)}
  ${label ? `<span class="brand-word" aria-hidden="true">Nutri<span class="amp">&amp;</span>Live</span>` : ""}
</a>`;

/* Partner / press logos rendered as clean wordmarks (no third-party assets) */
export const wordmark = (text, weight = 800, tracking = "-0.03em") =>
  `<svg viewBox="0 0 ${Math.max(60, text.length * 11.2)} 24" role="img" aria-label="${text}">
    <text x="0" y="17.5" font-family="Inter, sans-serif" font-size="17" font-weight="${weight}" letter-spacing="${tracking}" fill="currentColor">${text}</text>
  </svg>`;
