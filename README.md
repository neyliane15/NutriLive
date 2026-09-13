# Nutri&Live — landing + checkout

Landing pages e fluxo de assinatura recorrente (cartão de crédito, cartão de débito e Pix)
para três públicos: pessoa física, nutricionistas e academias.

## Rodar

```bash
node build.mjs          # gera os HTML na raiz a partir de src/
python3 -m http.server  # serve (as fontes precisam de HTTP, não file://)
```

## Estrutura

```
src/data/         conteúdo (site global + os três segmentos)
src/components/   header, footer, seções, ícones, mockups de app
src/pages/        montagem de cada página
src/lib/          utilitários (formatação)
build.mjs         gerador estático → *.html na raiz
assets/css/       tokens → base → components → layout → sections → checkout → motion
assets/js/        main.js (site), checkout.js (assinatura), qr.js (Pix), obrigado.js
```

Sem dependências de runtime e sem CDN: fontes, ícones, gráficos e o gerador de QR Code
do Pix são todos locais.
