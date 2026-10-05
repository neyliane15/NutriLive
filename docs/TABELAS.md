# De onde vêm os números

Todo valor nutricional que o Nutri&Live mostra sai de uma tabela oficial.
Nenhum é digitado à mão, e o código não tem onde "ajustar" um número para
fechar uma conta.

## As duas fontes

| | O quê | Edição | No sistema |
|---|---|---|---|
| **TACO** | Composição por 100 g: proteína, carboidrato, gordura, fibra, sódio, energia | 4ª edição revisada e ampliada, NEPA/UNICAMP, Campinas, 2011 | `app/server/ai/dados/taco-4a-edicao.json` — 597 alimentos |
| **POF** | Medidas caseiras em gramas (colher, concha, filé, unidade) | Tabela de Medidas Referidas, POF 2008-2009, IBGE, 2011 | `app/server/ai/dados/pof-medidas-caseiras.json` — 11.801 medidas |

As duas são extraídas das **planilhas originais** por
`app/scripts/extrair-tabelas.py`, sem alteração de valor. O script lê o
`.xls`, não um CSV de terceiro.

## Como o sistema usa

```
dados/taco-4a-edicao.json     os números
       +
catalogo.ts                   o que a tabela não diz: papel na refeição,
                              setor do mercado, etiquetas de restrição,
                              porção plausível, preço, medida caseira
       ↓
alimentos.ts                  junta os dois na subida do processo
```

`catalogo.ts` **não tem valor nutricional nenhum**. Ele só diz qual é o
número do alimento na TACO; o resto é lido do JSON toda vez. Um alimento sem
número válido derruba a subida, em vez de virar um número sem procedência.

Cada alimento carrega a sua fonte até a tela:

```ts
fonte: { tabela: "TACO 4ª edição", numero: 410,
         descricao: "Frango, peito, sem pele, grelhado",
         categoria: "Carnes e derivados" }
```

## O que mudou quando a tabela entrou

A base anterior tinha 61 alimentos com os valores escritos à mão "conforme a
TACO". Ao casar cada um com a tabela de verdade, **cinco não existiam nela**:

| Era | Virou | Por quê |
|---|---|---|
| Macarrão cozido | **Macarrão (peso cru)** | A TACO só traz o macarrão cru. Pesa-se cru. |
| Grão-de-bico cozido | **Grão-de-bico (peso cru)** | Idem. |
| Goma de tapioca hidratada | **Goma de tapioca (polvilho doce)** | A TACO traz o polvilho seco. |
| Filé de tilápia grelhado | **Filé de abadejo grelhado** | A TACO não tem tilápia. |
| Quinoa cozida | *(saiu)* | Não existe na TACO. Inventar número para ela seria o oposto disto. |

As **medidas caseiras** também mudaram ao encontrar a POF, e algumas muito.
Isso é cálculo, não rótulo — quem serve pela medida comia o que o plano não
previa:

| Medida | Era | POF |
|---|---|---|
| Colher de sopa de arroz | 30 g | **25 g** |
| Concha de feijão | 80 g | **140 g** |
| Colher de chá de azeite | 5 g | **2 g** |
| Unidade de laranja | 130 g | **180 g** |
| Fatia de tofu | 100 g | **20 g** |

46 das 60 medidas vêm da POF, com o código do alimento gravado em
`medida.pof`. As outras 14 ficam estimadas — a POF não traz aquele rótulo
para aquele alimento — e o sistema sabe quais são.

## Energia: por que não usamos a kcal da tabela

O plano calcula energia pelos macronutrientes, com os fatores de Atwater
arredondados (4 kcal/g de proteína, 4 de carboidrato, 9 de gordura). A kcal
da TACO fica guardada em `kcalTaco`, para conferência.

O motivo é a tela: as calorias que mostramos têm de fechar com os macros que
mostramos ao lado delas. Se a energia viesse da tabela e os macros também, a
pessoa somaria 4/4/9 e acharia outro número.

A diferença entre os dois é conhecida e tem causa: a TACO conta carboidrato
*por diferença*, então a fibra está dentro dele, e Atwater cobra 4 kcal por
grama de uma coisa que o corpo quase não aproveita. Brócolis (3,4 g de
fibra) dá 20% a mais; feijão (8,5 g) dá mais ainda. `test/tabelas.test.ts`
confere exatamente isso: desvio grande só passa quando a fibra explica —
sem fibra para explicar, o alimento foi casado com a linha errada.

## Atualizar a tabela

As planilhas originais não são redistribuídas aqui. Para regerar:

1. Baixe `Taco_4a_edicao_2011.xls` (NEPA/UNICAMP) e `tabelamedidas_bd.xls`
   (IBGE/POF) e coloque em `data/raw/taco/` e `data/raw/pof/`.
2. `cd app && python3 scripts/extrair-tabelas.py <pasta-com-data/raw> server/ai/dados`
3. `npm test` — se algum alimento do catálogo deixou de existir na tabela
   nova, o teste aponta qual.

Nada em `catalogo.ts` muda.

## E a TBCA?

A **TBCA** (USP/FoRC, versão 7.3 de 2025) é a tabela brasileira mantida
hoje; a TACO está parada na 4ª edição de 2011. A TBCA seria a fonte
preferível, e a troca é barata: o formato de `dados/*.json` e o campo `taco`
do catálogo viram `tbca`, e o resto do sistema não sabe a diferença.

Não foi possível buscá-la: `tbca.net.br` está bloqueado pela política de
rede do ambiente onde este sistema foi construído. Quando houver acesso,
veja "Atualizar a tabela" acima.

## Como citar

> NEPA/UNICAMP. **Tabela Brasileira de Composição de Alimentos (TACO)**.
> 4ª edição revisada e ampliada. Campinas: NEPA/UNICAMP, 2011.
>
> IBGE. **Tabela de Medidas Referidas para os Alimentos Consumidos no
> Brasil**. Pesquisa de Orçamentos Familiares 2008-2009. Rio de Janeiro:
> IBGE, 2011.
