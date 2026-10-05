# Fluxos de IA no n8n — Nutri&Live

Quatro fluxos, um por tipo de job. Importe cada `.json` no n8n
(**Workflows → Import from File**), preencha as duas credenciais e ative.

| Arquivo | Caminho do webhook | Job |
|---|---|---|
| `01-plano-alimentar.json` | `nutrielive-plano-alimentar` | plano de 1, 3 ou 7 dias |
| `02-receitas.json` | `nutrielive-receitas` | receitas a partir do que a pessoa tem em casa |

Os caminhos **não** são livres: estão em `app/server/ai/n8n.ts` (`CAMINHOS`).
Mudar um ali exige mudar o `path` do nó Webhook aqui — e
`test/fluxos-n8n.test.ts` falha se os dois divergirem.

### Os outros dois caminhos, e por que não há fluxo para eles

`CAMINHOS` reserva `nutrielive-lista-compras` e `nutrielive-analise-adesao`,
mas **o app não dispara nenhum dos dois hoje**, e por isso não existe JSON
aqui — fluxo que ninguém chama é configuração morta esperando apodrecer.

- **Lista de compras** já vem *dentro* do plano: `01-plano-alimentar.json`
  monta `listaDeCompras` com preço, e `gravarPlano` grava em
  `shopping_lists`. Um fluxo separado só repetiria o trabalho.
- **Análise de adesão** não tem rota que a peça. Quando tiver, o fluxo segue
  o mesmo molde: confere o token, chama o modelo, monta a saída num nó de
  código e avisa `/api/ai/callback`.

Sem `N8N_BASE_URL` o app usa o gerador local determinístico e nem chama o
n8n — é assim que a demonstração roda sem nada configurado.

## As duas regras que explicam o desenho destes fluxos

**1. O modelo escolhe, o fluxo calcula.** O payload chega com
`alimentosPermitidos` — só o que esta pessoa pode comer, já filtrado pelas
restrições dela no nosso lado. O modelo devolve apenas *quais* alimentos e
*quantos gramas* por refeição. Todo número que aparece na tela (kcal, macros,
totais do dia, preço da feira) é calculado pelo nó de código a partir da
tabela que foi no payload, nunca pelo modelo. Modelo erra soma e inventa
preço; `kcal100 × gramas / 100` não erra.

**2. O fluxo não é a garantia.** Tudo que volta por `POST /api/ai/callback`
passa de novo por `validarPlano` / `validarReceitas` no servidor, que confere
restrição, faixa de proteína e desvio de calorias, e **descarta o plano
inteiro** se algo violar. Se um fluxo editado começar a devolver plano
reprovado, o usuário vê o motivo em português e nada é gravado — o jeito de
descobrir é a tela `/admin/ia`, que mostra a mensagem de erro de cada
execução.

## Credenciais a preencher

| Onde | O que | Observação |
|---|---|---|
| Nó `Conferir token` | nada | lê o header `x-nutrielive-token` e compara com `$env.NUTRIELIVE_TOKEN` |
| Variável de ambiente do n8n | `NUTRIELIVE_TOKEN` | **o mesmo valor** de `N8N_WEBHOOK_TOKEN` no app |
| Nó `Modelo` | credencial do provedor de LLM | qualquer um; o nó devolve texto JSON |

O token vai e volta pelo header, nunca pela URL — URL aparece em log de proxy.
O callback do app recusa qualquer chamada sem ele (`401`), então um fluxo com
token errado falha de forma visível em vez de gravar plano alheio.

## Como estes fluxos são testados

`app/test/fluxos-n8n.test.ts` executa o nó de código de cada fluxo **fora do
n8n** — com o payload de verdade que `ai/n8n.ts` monta, uma saída de modelo
falsa, e o resultado passando pelo validador clínico de produção. Roda em
`npm test`, junto com o resto.

Fluxo é configuração: ninguém compila JSON, e o jeito natural de descobrir
que ele quebrou seria um usuário vendo "a IA não conseguiu gerar". O teste
existe para isso não acontecer. Três defeitos reais apareceram quando ele
foi escrito, e cada um teria recusado o plano em produção:

1. **kcal somada do `kcal100` do alimento** em vez de derivada dos macros.
   O servidor confere `kcal === 4P + 4C + 9G` com 1 kcal de tolerância; a
   soma pelo `kcal100` dá um número *parecido* e o plano era recusado por
   arredondamento.
2. **Título do modelo passando cru.** O modelo escolhia o alimento certo e
   escrevia "Iogurte com fruta" no título de um plano sem lactose. O
   servidor varre títulos contra as restrições e descartava o plano
   **inteiro**. Hoje o fluxo troca o texto pelo rótulo da refeição, usando
   a mesma lista de termos que a validação usa (`termosProibidos` no
   payload) — as duas não podem divergir.
3. **Desvio de calorias de 8% a 15% por dia.** Modelo de linguagem não
   fecha conta. O nó `Montar plano` calibra os gramas por dia, respeitando
   `min`, `max` e `passo` de cada alimento, até entrar na tolerância. No
   teste, isso levou um dia de 14,7% de desvio para 0,3%.

Para testar com o app de ponta a ponta, aponte `N8N_BASE_URL` para a sua
instância e `N8N_WEBHOOK_TOKEN` para o mesmo segredo do n8n.

## Se um fluxo começar a falhar em produção

A tela **/admin/ia** lista cada execução com a mensagem de erro inteira — é
onde o motivo aparece, em português, do jeito que o usuário viu. Erro de
validação clínica (`restricao_violada`, `macros_inconsistentes`,
`saida_malformada`) significa que o fluxo devolveu algo que o servidor
recusou, e nada foi gravado: o plano rejeitado nunca chega ao usuário.
