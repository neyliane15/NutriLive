# Divisão de trabalho

Cada agente é **dono exclusivo** dos seus arquivos. Não edite arquivo de outro:
se precisar de algo que não é seu, escreva no seu relatório final e o executor
integra.

| Agente | Dono exclusivo de |
|---|---|
| **BE-1 núcleo** | `server/db/{index,migrate,seed}.ts`, `server/auth/**`, `server/lib/**`, `server/routes/{auth,org,me}.ts` |
| **BE-2 cobrança** | `server/billing/**`, `server/routes/{checkout,webhooks,subscription,admin}.ts` |
| **IA-1 n8n** | `n8n/**`, `docs/IA.md` |
| **IA-2 ponte de IA** | `server/ai/**`, `server/routes/ai.ts` |
| **FE-1 app e pessoal** | `web/pages/{login,primeiro-acesso,hoje,evolucao,compras,receitas,plano,conta}.ts`, `web/islands/{auth,hoje,evolucao,compras,receitas}.js` |
| **FE-2 organização e admin** | `web/pages/{org-*,admin-*}.ts`, `web/islands/{org,admin}.js` |
| **Executor** | `server/index.ts`, `server/db/schema.ts`, `shared/**`, `web/layout.ts`, `web/components/**`, `web/app.css`, `docs/**` |

Ninguém roda `git`. O executor integra e comita.
