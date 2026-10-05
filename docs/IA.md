# A IA do Nutri&Live

## A regra que organiza tudo

**O modelo escolhe; o sistema calcula e valida.**

Nenhum número que a pessoa vê saiu de um modelo de linguagem. O modelo decide
*quais* alimentos e *quanto* de cada um; calorias, macros, totais do dia e
preço da feira são calculados a partir da nossa tabela de alimentos. E o que
voltar do modelo, por qualquer caminho, passa pelas guardas clínicas antes de
ser gravado — se violar, **o plano inteiro é descartado** e a pessoa recebe o
motivo em português, nunca um plano pela metade.

Isso não é desconfiança gratuita do modelo. É que os dois erros que ele comete
com mais naturalidade são justamente os que machucam aqui: somar errado e
escrever o nome de um alimento que a pessoa não pode comer.

## Dois drivers, a mesma saída

| | quando | o que faz |
|---|---|---|
| `local` | padrão, sem `N8N_BASE_URL` | gerador determinístico em `server/ai/local.ts`. Mesma entrada, mesma saída — é o que roda a demonstração e os testes, sem rede |
| `n8n` | com `N8N_BASE_URL` e `N8N_WEBHOOK_TOKEN` | dispara o webhook do fluxo e sai do caminho; quem conclui é o n8n, chamando de volta |

Os dois produzem o **mesmo formato** (`server/ai/tipos.ts`) e passam pela
**mesma validação**. Trocar de driver não muda o que o front recebe.

O driver é escolhido por ambiente, não por código:
`AI_DRIVER = N8N_BASE_URL ? "n8n" : "local"` (`server/lib/env.ts`).

## O caminho de um pedido

```
POST /api/ai/meal-plan
   │  cria ai_jobs (status "fila"), responde { jobId } na hora
   │  — a pessoa não espera 40 s num request pendurado
   ▼
driver local ───────────► gera e conclui no mesmo processo
driver n8n   ───────────► POST no webhook do fluxo (aperto de mão de 8 s)
                              │  fluxo chama o modelo, monta a saída
                              ▼
                          POST /api/ai/callback  { jobId, status, output }
   │
   ▼
validarPlano / validarReceitas  ── reprovou? job vira "erro" com o motivo,
   │                                e NADA é gravado
   ▼
grava meal_plans + shopping_lists (ou recipes)
   │
   ▼
a ilha de JS, que vinha perguntando GET /api/ai/jobs/:id, mostra o resultado
```

## As guardas clínicas

Em `server/ai/seguranca.ts`. Cada uma recusa o lote todo, nunca "conserta"
um plano arriscado.

| Guarda | O que recusa |
|---|---|
| `restricao_violada` | alimento, título, item ou passo de preparo que mencione algo das restrições declaradas |
| `macros_inconsistentes` | `kcal` que não bate com `4P + 4C + 9G`, ou dia fora da tolerância de calorias |
| `proteina_fora_da_faixa` | proteína por quilo de peso acima do que é seguro sem acompanhamento |
| `saida_malformada` | formato ilegível — melhor nada que um plano pela metade |
| `kcal_abaixo_do_piso` | meta abaixo do piso seguro para o perfil |

Duas decisões de produto moram aqui:

**Com nutricionista vinculada, o plano nasce `rascunho`**, para ela revisar
antes de o paciente ver. Sem ela, nasce `ativo` e marcado
`materialEducativo: true` — o sistema não prescreve.

**Sinal de cautela não gera plano, encaminha.** Gravidez, amamentação e
condições declaradas que pedem acompanhamento viram uma saída
`orientacao_profissional`, com o recado de procurar uma profissional. É
`orientacaoSePreciso` em `server/ai/provedor.ts`.

## O que o fluxo do n8n recebe

`PayloadN8n` em `server/ai/n8n.ts`. Três campos explicam o desenho:

**`alimentosPermitidos`** — só o que esta pessoa pode comer, já filtrado pelas
restrições dela **no nosso lado**. O modelo escolhe de dentro de uma lista
permitida em vez de inventar. Leva `nomeDeCompra` e `centavosPorKg` porque o
fluxo precisa montar a lista de compras com preço: sem eles, a única saída
seria `cents: 0`, e a tela de compras diria "R$ 0,00" como se a feira fosse
de graça.

**`restricoes.termosProibidos`** — as palavras que a validação vai varrer em
título, item e preparo. Vai no payload por um motivo concreto: sem ela, o
modelo escolhia o alimento certo e escrevia "Iogurte com fruta" no título de
um plano sem lactose, e o plano **inteiro** era recusado. Com a lista em mão,
o fluxo troca o texto antes de devolver, e o prompt manda o modelo não
escrever aquelas palavras. É a mesma lista que a validação usa
(`termosBloqueados`), então as duas não podem divergir.

**`dataBase`** — para o fluxo datar os dias sem depender do relógio do n8n,
que pode estar em outro fuso.

## Autenticação, nos dois sentidos

Um segredo compartilhado, no header `x-nutrielive-token`, nunca na URL — URL
aparece em log de proxy. `N8N_WEBHOOK_TOKEN` no app, `NUTRIELIVE_TOKEN` no
n8n, **o mesmo valor**.

- **Na ida**, o primeiro nó do fluxo confere o header e para se não bater.
- **Na volta**, `/api/ai/callback` confere em tempo constante
  (`tokenConfere`) e devolve 401 sem ele. Callback sem autenticação deixaria
  qualquer um gravar plano na conta de outra pessoa.

Sem `N8N_WEBHOOK_TOKEN` configurado, o driver n8n **se recusa a disparar**:
geraria um job que ninguém poderia concluir com segurança.

## Idempotência e falha

O n8n reentrega quando fica em dúvida. O callback trata isso:

- job já `concluido` ou `erro` → só registra a medição de tokens e responde
  `ok`. Não regrava, não duplica plano.
- falha de rede ou 5xx no disparo → **uma** nova tentativa, depois de 1,2 s.
  4xx (token errado, fluxo inativo, URL errada) não é repetido: repetir não
  corrige configuração, e falhar rápido é melhor que pendurar a pessoa.
- o timeout de 8 s mede o **aperto de mão**, não a geração. Fluxo que leva
  40 s para montar o plano não estoura esse timeout.

## Onde se vê que está funcionando

**/admin/ia** — execuções das últimas 24 h, tempo médio da fila até o retorno,
consumo de tokens e, principalmente, **a mensagem de erro inteira de cada
falha**. A tela existe para responder uma pergunta só: a IA está entregando?
A média só conta job terminado — job preso na fila entraria como zero e
derrubaria a média justo quando a fila travou, que é quando o número precisa
acusar.

## Como mexer nisto sem quebrar

- `npm test` cobre as guardas clínicas, o determinismo do driver local, o
  callback (token, idempotência) **e os nós de código dos fluxos do n8n**,
  executados fora do n8n contra o validador de produção
  (`test/fluxos-n8n.test.ts`).
- Mudar o `path` de um nó Webhook exige mudar `CAMINHOS` em `ai/n8n.ts`. O
  teste falha se os dois divergirem.
- Acrescentar campo ao payload é seguro. **Tirar** campo quebra os fluxos
  publicados: eles leem o payload por nome.
- Nunca afrouxe uma guarda para um plano passar. Se um plano legítimo está
  sendo recusado, o defeito está em quem o gerou — foi assim que a
  calibragem de calorias do fluxo foi descoberta.
