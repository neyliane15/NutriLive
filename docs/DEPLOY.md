# Pôr no ar: Supabase + Vercel

Landing e sistema no **mesmo projeto da Vercel**, no mesmo domínio. A landing
é estática e sai do disco; o app é uma função. O banco é o Supabase.

Tempo: cerca de 40 minutos, quase todo esperando provisionamento.

---

## Antes de começar: o que o Supabase é aqui

O Supabase é usado como **Postgres gerenciado**, e só isso. O sistema tem
autenticação própria (Argon2 + sessão em cookie, já testada), então o
**Supabase Auth não é usado** — e não deve ser ligado. Se um dia for, é
reescrever o login inteiro, não uma configuração.

Isso traz uma consequência de segurança que o passo 2 trata, e que é a parte
mais importante deste documento.

---

## 1. Criar o projeto no Supabase

1. [supabase.com](https://supabase.com) → **New project**.
2. Região: **South America (São Paulo)** — o banco perto de quem usa.
3. Guarde a senha do banco que ele pedir para criar. Ela não aparece de novo.
4. Espere terminar de provisionar (uns 2 minutos).

### As duas strings de conexão

Em **Project Settings → Database → Connection string**, você verá portas
diferentes. **Elas não são intercambiáveis:**

| Porta | Modo | Para quê |
|---|---|---|
| **6543** | transação (Supavisor) | **a Vercel** — muitas conexões curtas |
| **5432** | sessão | **as migrações**, da sua máquina |

A porta 6543 devolve a conexão ao pool a cada transação, então nada que
dependa de estado de sessão sobrevive — e isso inclui *prepared statements*,
que o driver usa por padrão. O sistema **reconhece a 6543 sozinho** e os
desliga (`app/server/db/index.ts`). Sem isso, as primeiras consultas passam e
depois começam a falhar com `prepared statement already exists`, de forma
intermitente, sob carga: não aparece em teste, aparece com usuário.

> Troque `[YOUR-PASSWORD]` pela senha do passo 3 em qualquer uma das duas.

---

## 2. Criar o esquema — e fechar a porta que o Supabase abre sozinho

Da sua máquina, com a string da **porta 5432**:

```bash
git clone https://github.com/neyliane15/NutriLive && cd NutriLive
npm install && npm install --prefix app
DATABASE_URL="postgresql://postgres.xxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" \
  npm run db:migrate
```

Isso aplica duas migrações:

**`0000`** — 21 tabelas, 13 tipos enumerados, 31 índices.

**`0001`** — e esta é a que importa.

### Por que a 0001 existe

O Supabase publica o schema `public` numa **API REST automática**
(PostgREST), alcançável com a **chave anônima** — que é pública por desenho:
ela vai no JavaScript do navegador. O que decide o que essa chave pode fazer
não é a chave: é o Row Level Security de cada tabela.

Sem a 0001, qualquer pessoa com o endereço do seu projeto e a chave anônima
lê `users` (com `password_hash`), `sessions` (com o token de sessão),
`clinical_notes` (prontuário dos pacientes) e `payments` — **e escreve
neles**.

A 0001 liga RLS nas 21 tabelas e **não cria política nenhuma**. Sem política,
`anon` e `authenticated` não enxergam linha alguma. O nosso servidor não usa
a API REST: conecta direto no Postgres com o papel `postgres`, que tem
`BYPASSRLS`. Então o app continua igual e a porta fecha.

Conferido em Postgres de verdade antes de escrever isto:

```
21 tabelas · 21 com RLS ligado · 0 políticas · 0 privilégios para anon
anon tentando ler users    -> ERROR: permission denied for table users
anon tentando ler sessions -> ERROR: permission denied for table sessions
anon tentando escrever     -> ERROR: permission denied for table users
```

> Se o painel do Supabase mostrar o aviso **"RLS disabled in public"**, a
> migração 0001 não rodou. Não ignore esse aviso.

### Conferir, em vez de confiar

As duas coisas que mais quebram num banco gerenciado **não dão erro** — elas
simplesmente não acontecem. A migração 0001 não rodar deixa o banco aberto em
silêncio; a porta errada só quebra sob carga, depois do lançamento. Então:

```bash
DATABASE_URL="postgresql://postgres.xxx:SENHA@aws-0-sa-east-1.pooler.supabase.com:5432/postgres" \
  npm run db:conferir
```

Ele não escreve nada e pode rodar quantas vezes quiser. Confere ligação e
porta, as 21 tabelas, RLS em cada uma, políticas, privilégios de `anon` e
`authenticated`, e se ainda há usuários de demonstração. Termina em uma linha:

```
O banco está pronto.          -> siga para o passo 5 (Vercel)
O banco NÃO está pronto.      -> o que falta está marcado com ✗ acima
```

Se a URL estiver errada, ele diz qual é o erro em português — senha recusada,
`[YOUR-PASSWORD]` esquecido, host de conexão direta (só IPv6), projeto
hibernando — em vez de mostrar um erro do Node.

### Dados de demonstração (opcional)

```bash
DATABASE_URL="...:5432/postgres" npm run db:seed
```

23 pessoas fictícias, útil para conhecer o sistema. **Não rode em produção
de verdade** — depois é trabalho separar o que é real do que é demonstração.

---

## 3. Os segredos

```bash
openssl rand -base64 48   # SESSION_SECRET
openssl rand -hex 32      # CRON_SECRET
```

`SESSION_SECRET` é a chave do HMAC da sessão **e** dos links de primeiro
acesso e de redefinição de senha. Trocá-la depois desloga todo mundo e
invalida os links que estiverem na caixa de entrada das pessoas.

---

## 4. E-mail: Resend

Sem e-mail funcionando, **quem paga não entra**: o link de primeiro acesso é
a única porta. Em [resend.com](https://resend.com), verifique o seu domínio
(registros SPF e DKIM no DNS) e crie uma API key. `EMAIL_FROM` tem de ser um
endereço do domínio verificado.

---

## 5. Vercel

1. [vercel.com](https://vercel.com) → **Add New** → **Project** → importe
   `neyliane15/NutriLive`.
2. **Root Directory**: a raiz do repositório. Framework Preset: **Other**.
   O `vercel.json` já traz o build.
3. Em **Environment Variables**, para *Production* e *Preview*:

| Variável | Valor |
|---|---|
| `NODE_ENV` | `production` |
| `SESSION_SECRET` | o que você gerou |
| `DATABASE_URL` | a string do Supabase **na porta 6543** |
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

**A porta 6543 aqui, não a 5432.** A 5432 na Vercel esgota o limite de
conexões do Supabase com pouca gente online.

Faltando qualquer uma das quatro primeiras, **o sistema responde 503 dizendo
qual falta**, em vez de servir um site em que ninguém consegue entrar depois
de pagar. É de propósito.

4. **Deploy**.

---

## 6. Mercado Pago

No painel, em Suas integrações → Webhooks, aponte para:

```
https://seudominio.com.br/api/webhooks/mercadopago
```

Eventos: **Pagamentos** e **Assinaturas**. Copie a chave secreta que ele
mostra para `MP_WEBHOOK_SECRET` — é com ela que o sistema confere a
assinatura de cada evento e recusa os que não conferem.

### Pix não renova sozinho

No Mercado Pago, Pix é cobrança **avulsa**: não existe recorrência. Por isso
o sistema emite a renovação por conta própria, cinco dias antes do
vencimento, e manda por e-mail (`app/server/billing/renovacao.ts`). O
`vercel.json` já traz o Cron Job diário:

```json
"crons": [{ "path": "/api/cron/renovacoes", "schedule": "0 12 * * *" }]
```

Cron Jobs exigem plano **Pro** na Vercel. No plano Hobby, chame a mesma rota
de qualquer agendador externo (cron-job.org, GitHub Actions) com o cabeçalho
`Authorization: Bearer <CRON_SECRET>`.

---

## 7. IA pelo n8n (opcional)

Sem `N8N_BASE_URL`, a IA usa o gerador local determinístico — funciona, roda
sem rede, e é o que gera os planos na demonstração. Para usar o n8n: suba uma
instância, importe `n8n/01-plano-alimentar.json` e `n8n/02-receitas.json`,
defina `NUTRIELIVE_TOKEN` no n8n com o **mesmo valor** de `N8N_WEBHOOK_TOKEN`
na Vercel, preencha as duas variáveis e refaça o deploy. Detalhes em
`n8n/README.md` e `docs/IA.md`.

---

## 8. Domínio

Na Vercel, **Settings → Domains**, adicione o seu e siga os registros de DNS
que ela mostrar. Depois atualize `APP_URL` e refaça o deploy — essa variável
é o que monta o link do e-mail, e ela não se atualiza sozinha.

---

## 9. Conferir que subiu certo

```bash
curl https://seudominio.com.br/api/health
# {"ok":true,"at":"...","driver":"postgres"}
```

`driver` tem de dizer **postgres**. Se disser `memory`, o `DATABASE_URL` não
chegou na função, e os dados somem no próximo deploy.

No painel do Supabase, **Table Editor**: as 21 tabelas têm de aparecer, e
nenhuma com o aviso de RLS desligado.

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
acha, e responde 404. `app/test/vercel.test.ts` compara os dois lados e falha
antes do deploy.

---

## Custo

| | Grátis | Pago |
|---|---|---|
| Supabase | 500 MB, **pausa após 1 semana sem uso** | US$ 25/mês (Pro) |
| Vercel | Hobby, **sem Cron Jobs** | US$ 20/mês (Pro) |
| Resend | 3.000 e-mails/mês | US$ 20/mês |

Duas armadilhas do plano grátis do Supabase, que valem saber antes:

- **O projeto pausa** depois de uma semana sem consulta nenhuma. Para um
  produto com clientes pagantes isso é inaceitável — o plano Pro resolve. Até
  lá, o Cron Job diário da renovação mantém o banco acordado.
- **Sem backup automático.** O plano Pro tem backup diário com 7 dias de
  retenção. Enquanto estiver no grátis, exporte à mão o que não pode perder.

---

## Se alguma coisa der errado

| Sintoma | Causa provável |
|---|---|
| `/api/health` diz `driver: memory` | `DATABASE_URL` não chegou na função |
| 503 com lista de variáveis | é a conferência de produção; preencha o que ela nomear |
| `prepared statement already exists` | `DATABASE_URL` não está na 6543, ou o pooler mudou de forma — veja `ehPooler` em `app/server/db/index.ts` |
| `too many connections` | `DATABASE_URL` está na 5432 na Vercel; troque para a 6543 |
| 404 numa tela do app | falta a rota em `vercel.json` |
| aviso "RLS disabled in public" | a migração 0001 não rodou |
| e-mail não chega | domínio não verificado na Resend, ou `EMAIL_FROM` fora dele |
