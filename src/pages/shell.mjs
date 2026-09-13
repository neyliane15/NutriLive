import { site } from "../data/site.mjs";

const FAVICON =
  "data:image/svg+xml," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#17603D"/><path d="M31.5 8.4c.7 6-.5 11.1-3.7 14.9-3.3 3.9-7.9 5.7-13.4 5.3-.3 1.5-.4 3-.4 4.6a1.2 1.2 0 1 1-2.4 0c0-1.9.2-3.8.6-5.5a22 22 0 0 1 4.2-8.9 1.2 1.2 0 0 1 1.9 1.5 19.6 19.6 0 0 0-3.4 6.8c4.3.2 7.9-1.4 10.5-4.5 2.5-3 3.6-7.1 3.4-11.9-5.7.2-10.1 1.5-13.2 3.6-3.3 2.2-4.9 5.2-4.9 8.9 0 1.4.3 2.7.9 3.9a1.2 1.2 0 0 1-2.1 1.2 10.9 10.9 0 0 1-1.3-5.1c0-4.6 2.1-8.3 6.1-11 3.7-2.5 9-3.8 15.7-4l1.5-.1Z" fill="#A9DD5C"/></svg>`
  );

export const shell = ({
  title,
  desc,
  canonical = "",
  bodyClass = "",
  body,
  scripts = ["main"],
  jsonLd = "",
  ogType = "website",
  ogImage = "assets/img/og-voce.jpg"
}) => `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<meta name="description" content="${desc}">
<meta name="theme-color" content="${site.themeColor}">
<meta name="color-scheme" content="light">
<link rel="canonical" href="${site.url}/${canonical}">
<link rel="icon" href="${FAVICON}">
<link rel="apple-touch-icon" href="${FAVICON}">
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${site.name}">
<meta property="og:locale" content="pt_BR">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${desc}">
<meta property="og:url" content="${site.url}/${canonical}">
<meta property="og:image" content="${site.url}/${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${title}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:image" content="${site.url}/${ogImage}">
<link rel="preload" as="font" type="font/woff2" href="assets/fonts/inter-latin.woff2" crossorigin>
<link rel="stylesheet" href="assets/css/tokens.css">
<link rel="stylesheet" href="assets/css/base.css">
<link rel="stylesheet" href="assets/css/components.css">
<link rel="stylesheet" href="assets/css/layout.css">
<link rel="stylesheet" href="assets/css/sections.css">
<link rel="stylesheet" href="assets/css/checkout.css">
<link rel="stylesheet" href="assets/css/motion.css">
${jsonLd ? `<script type="application/ld+json">${jsonLd}</script>` : ""}
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
${body}
${scripts.map((s) => `<script src="assets/js/${s}.js" defer></script>`).join("\n")}
</body>
</html>
`;
