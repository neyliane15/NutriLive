# Nutri&Live — arquitetura do sistema

## O que é
SaaS de nutrição com três perfis pagantes, dois perfis vinculados e um admin.

| Perfil | Paga? | O que faz |
|---|---|---|
| `pessoal` | sim | plano alimentar, diário, receitas, lista de compras, evolução |
| `nutricionista` | sim | tudo do pessoal + carteira de **pacientes** que ela cadastra |
| `academia` | sim | painel de **alunos** que ela cadastra, engajamento, comissão |
| `paciente` / `aluno` | não | app completo, vinculado à organização que o cadastrou |
| `admin` | — | enxerga e opera tudo: usuários, assinaturas, pagamentos, auditoria |

**Regra de ouro do produto:** assim que o pagamento é aprovado, o usuário recebe
e-mail com link de primeiro acesso e define a senha. Nenhuma espera manual.

## Decisões fechadas (não reabrir sem falar com o executor)

| Camada | Escolha | Porquê |
|---|---|---|
| Banco | **PostgreSQL no Neon** | free tier sem cartão, substituto direto do Supabase, portável |
| ORM | **Drizzle** | schema em TS, migração em SQL legível, sem runtime pesado |
| Servidor | **Hono** sobre Node | roda igual em Node, Vercel e Cloudflare |
| Auth | **própria** (argon2 + sessão em cookie httpOnly) | sem mais um fornecedor, sem lock-in |
| Pagamento | **Mercado Pago** — Checkout Transparente + Assinaturas | conta do cliente já existe; mantém o nosso checkout |
| IA | **n8n** por webhook, assíncrono | o cliente já usa n8n; mantém a IA fora do caminho crítico |
| Front | **HTML renderizado no servidor + ilhas de JS puro** | mesma linguagem e mesmo CSS da landing; zero build |
| Arquivos | Cloudflare R2 (fotos de evolução) | free tier, S3-compatível |

**Sem framework de front, sem bundler, sem React.** O CSS é o mesmo
`assets/css/nutrielive.css` que a landing usa, mais `app/web/app.css`.

## Mapa de arquivos

```
app/
  shared/contract.ts      CONTRATO DA API — fonte da verdade, leia primeiro
  server/
    index.ts              monta as rotas  (dono: executor)
    db/schema.ts          22 tabelas      (dono: executor)
    db/index.ts           conexão
    lib/                  http, erros, validação, e-mail, log
    auth/                 senha, sessão, tokens
    billing/              Mercado Pago, assinatura, comissão
    ai/                   ponte com o n8n
    routes/               um arquivo por área
  web/
    layout.ts             casca da aplicação (dono: executor)
    components/           peças compartilhadas (dono: executor)
    pages/                uma função por tela
    islands/              JS puro por tela
n8n/                      workflows exportados
docs/                     esta pasta
```

## Contratos que ninguém quebra

1. **Dinheiro em centavos, inteiro.** Nunca `float`, nunca string com vírgula.
2. **Erro sempre** `{ error: { code, message, fields? } }` com `code` da lista
   em `contract.ts`. HTTP 400/401/403/404/409/422/429/500 conforme o código.
3. **Toda rota autenticada** passa por `requireUser` / `requireRole` de
   `server/auth/guard.ts`. Nenhuma rota lê o cookie na mão.
4. **Todo acesso a dado de outra pessoa** passa por verificação de vínculo:
   nutricionista só vê quem tem `care_links` ativo com ela; academia idem.
   Admin passa por cima, mas **grava em `audit_log`**.
5. **PAN de cartão nunca chega ao servidor.** O front tokeniza com o SDK do
   provedor e manda só o token.
6. **Webhook é idempotente.** Grave em `webhook_events` com
   `(provider, provider_event_id)` único antes de processar.
7. **Nada de segredo no cliente.** `MP_ACCESS_TOKEN` só no servidor.

## Como rodar

```bash
cd app
npm install
cp .env.example .env     # preencha DATABASE_URL
npm run db:generate      # gera a migração a partir do schema
npm run db:migrate
npm run db:seed          # planos + admin + dados de demonstração
npm run dev              # http://localhost:8787
```

Sem `DATABASE_URL` o servidor sobe em **modo memória** (`DB_DRIVER=memory`),
com os mesmos dados do seed. É assim que se testa sem banco.

## Estado atual
Executor entregou: schema, contrato, esqueleto do servidor, casca do front.
O resto está distribuído entre os agentes — veja `docs/EQUIPE.md`.
