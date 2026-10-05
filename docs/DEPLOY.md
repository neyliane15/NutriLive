# Pôr no ar na Vercel

Landing e sistema no **mesmo projeto**, no mesmo domínio. A landing é estática
e sai do disco; o app é uma função. Quem decide o quê é `vercel.json`.

Tempo: cerca de 30 minutos, quase todo esperando provisionamento.

---

## 1. Banco: Neon

1. Crie conta em [neon.tech](https://neon.tech) e um projeto na região
   **AWS São Paulo (sa-east-1)** — o banco perto de quem usa.
2. Copie a connection string **pooled** (a que tem `-pooler` no host) e
   acrescente `?sslmode=require` se ainda não tiver.
3. Guarde: é o `DATABASE_URL`.

> Por que a pooled: cada requisição numa função abre conexão nova. Sem pool,
> o Postgres atinge o limite de conexões antes de atingir o de usuários.

Crie o esquema, da sua máquina:

```bash
git clone https://github.com/neyliane15/NutriLive && cd NutriLive
npm install && npm install --prefix app
DATABASE_URL="postgres://..." npm run db:migrate
```

Isso aplica `app/drizzle/0000_*.sql`: 21 tabelas, 13 tipos enumerados e os
índices. Para começar com os dados de demonstração (23 pessoas fictícias,
útil para conhecer o sistema, **não** para produção de verdade):

```bash
DATABASE_URL="postgres://..." npm run db:seed
```

---

## 2. Os segredos

Gere os dois na sua máquina:

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -hex 32      # CRON_SECRET
```

`SESSION_SECRET` é a chave do HMAC da sessão **e** dos links de primeiro
acesso e de redefinição de senha. Trocá-la depois desloga todo mundo e
invalida os links que estiverem na caixa de entrada das pessoas.

---

## 3. E-mail: Resend

Sem e-mail funcionando, **quem paga não entra**: o link de primeiro acesso é
a única porta. Em [resend.com](https://resend.com), verifique o seu domínio
(registros SPF e DKIM no DNS) e crie uma API key.

`EMAIL_FROM` tem de ser um endereço do domínio verificado.

---

## 4. Vercel

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → importe
   `neyliane15/NutriLive`.
2. **Root Directory**: a raiz do repositório (deixe como está).
3. Framework Preset: **Other**. O `vercel.json` já traz o build.
4. Em **Environment Variables**, para *Production* e *Preview*:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | o que você gerou |
| `DATABASE_URL` | a string pooled da Neon |
| `APP_URL` | `https://seudominio.com.br` |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | a chave da Resend |
| `EMAIL_FROM` | `Nutri&Live <oi@seudominio.com.br>` |
| `CRON_SECRET` | o que você gerou |
| `TRUST_PROXY` | `1` |
| `MP_ACCESS_TOKEN` | o do Mercado Pago (produção) |
| `MP_PUBLIC_KEY` | idem |
| `MP_WEBHOOK_SECRET` | idem |
| `COMMISSION_RATE_BP` | `2000` (20%) |

Faltando qualquer uma das quatro primeiras, **o sistema responde 503 dizendo
qual falta**, em vez de servir um site em que ninguém consegue entrar depois
de pagar. É de propósito.

5. **Deploy**.

---

## 5. Mercado Pago

No painel do Mercado Pago, em Suas integrações → Webhooks, aponte para:

```
https://seudominio.com.br/api/webhooks/mercadopago
```

Eventos: **Pagamentos** e **Assinaturas**. Copie a chave secreta que ele
mostra para `MP_WEBHOOK_SECRET` — é com ela que o sistema confere a
assinatura de cada evento e recusa os que não conferem.

### Pix não renova sozinho

No Mercado Pago, Pix é cobrança **avulsa**: não existe recorrência. Por isso
o sistema emite a renovação por conta própria, cinco dias antes do
vencimento, e manda por e-mail (veja `app/server/billing/renovacao.ts`). O
`vercel.json` já traz o Cron Job que dispara isso todo dia ao meio-dia UTC
(9h de Brasília):

```json
"crons": [{ "path": "/api/cron/renovacoes", "schedule": "0 12 * * *" }]
```

Cron Jobs exigem plano **Pro** na Vercel. No plano Hobby, chame a mesma rota
de qualquer agendador externo (cron-job.org, GitHub Actions) com o cabeçalho
`Authorization: Bearer <CRON_SECRET>`.

Quando a sua conta tiver **Pix Automático** habilitado, esse caminho manual
pode sair.

---

## 6. IA pelo n8n (opcional)

Sem `N8N_BASE_URL`, a IA usa o gerador local determinístico — funciona, roda
sem rede, e é o que gera os planos na demonstração. Para usar o n8n:

1. Suba uma instância (n8n Cloud ou própria).
2. Importe `n8n/01-plano-alimentar.json` e `n8n/02-receitas.json`.
3. Defina `NUTRIELIVE_TOKEN` no n8n com o **mesmo valor** de
   `N8N_WEBHOOK_TOKEN` na Vercel.
4. Preencha `N8N_BASE_URL` e `N8N_WEBHOOK_TOKEN` e faça um redeploy.

Detalhes em `n8n/README.md` e `docs/IA.md`.

---

## 7. Domínio

Na Vercel, **Settings → Domains**, adicione o seu e siga os registros de DNS
que ela mostrar. Depois atualize `APP_URL` e refaça o deploy — essa variável
é o que monta o link do e-mail, e ela não se atualiza sozinha.

---

## 8. Conferir que subiu certo

```bash
curl https://seudominio.com.br/api/health
# {"ok":true,"at":"...","driver":"postgres"}
```

`driver` tem de dizer **postgres**. Se disser `memory`, o `DATABASE_URL` não
chegou na função, e os dados somem no próximo deploy.

Depois, pelo navegador:

1. A landing abre em `/`.
2. `/entrar` abre a tela de entrada.
3. Faça uma assinatura de verdade pelo checkout, com um valor que você
   aceite perder, e confirme que o e-mail de primeiro acesso chega.
4. Defina a senha pelo link e entre.

O passo 3 é o único que prova a coisa toda: pagamento, webhook, liberação de
acesso e e-mail. Nenhum teste automatizado cobre a sua conta do Mercado Pago
de verdade.

---

## Como o tráfego se divide

| Caminho | Quem atende |
|---|---|
| `/`, `/nutricionistas.html`, `/academias.html`, `/checkout.html` | estático |
| `/assets/*`, `/app-assets/*` | estático, com cache |
| `/api/*` | função |
| `/hoje`, `/plano`, `/conta`, `/painel`, `/pacientes`, `/admin`, … | função |

As rotas do app estão listadas uma a uma em `vercel.json`. **Tela nova exige
rota nova ali** — senão a Vercel procura um arquivo com aquele nome, não
acha, e responde 404. É a pegadinha mais provável deste deploy.

---

## Custo

| | Hobby | Pro |
|---|---|---|
| Vercel | grátis, **sem Cron Jobs** | US$ 20/mês |
| Neon | grátis até 0,5 GB | US$ 19/mês |
| Resend | 3.000 e-mails/mês grátis | US$ 20/mês |

No Hobby dá para começar inteiro de graça, com a renovação do Pix disparada
por um agendador externo.
