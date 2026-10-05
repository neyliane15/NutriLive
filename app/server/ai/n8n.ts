/* =========================================================================
   Nutri&Live — driver n8n

   Dispara o webhook do fluxo certo e sai do caminho. Quem conclui o job é o
   próprio n8n, chamando de volta `POST /api/ai/callback` com o `jobId`.

   Decisões deste arquivo, porque custaram pensamento:

   1. O DISPARO É CURTO, A GERAÇÃO É LONGA. O webhook do n8n responde na hora
      ("recebi") e o fluxo segue em segundo plano. Por isso o timeout aqui é
      de poucos segundos: ele mede o aperto de mão, não a geração. Fluxo que
      demora 40 s para montar o plano não estoura este timeout.
   2. UMA NOVA TENTATIVA, SÓ. Falha de rede e 5xx merecem uma segunda
      chance; 4xx (token errado, fluxo inativo, URL errada) não — repetir não
      corrige configuração. Repetir sem limite, com o usuário esperando na
      tela, é pior que falhar rápido e deixar ele pedir de novo.
   3. O PEDIDO VAI COM A BASE SEGURA DENTRO. O payload leva os alimentos que
      esta pessoa PODE comer, já filtrados pelas restrições. O modelo escolhe
      dentro de uma lista permitida em vez de inventar — e, mesmo assim, o
      callback revalida tudo com `validarPlano`. O prompt é instrução, não
      garantia: a garantia é a validação.
   4. O TOKEN VAI NO CABEÇALHO, nunca na URL: URL aparece em log de proxy.
   ========================================================================= */
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import { AppError } from "../lib/http.js";
import { kcal100 } from "./alimentos.js";
import { montarBloqueio, termosBloqueados } from "./seguranca.js";
import { baseSegura, metasDoPerfil, macrosMeta, TOLERANCIA_KCAL } from "./local.js";
import type { ContextoGeracao, PedidoPlano, PedidoReceitas, PlanoAlimentar, SaidaReceitas } from "./tipos.js";
import type { Disparo, ProvedorIA } from "./provedor.js";
import type { TipoJob } from "./tipos.js";

/** Caminho do webhook de cada fluxo. Igual ao `path` do nó Webhook no n8n. */
export const CAMINHOS: Record<TipoJob, string> = {
  plano: "webhook/nutrielive-plano-alimentar",
  receita: "webhook/nutrielive-receitas",
  lista_compras: "webhook/nutrielive-lista-compras",
  analise: "webhook/nutrielive-analise-adesao"
};

/** Nome do cabeçalho que carrega o segredo compartilhado, nos dois sentidos. */
export const CABECALHO_TOKEN = "x-nutrielive-token";

/** Timeout do aperto de mão com o n8n, em milissegundos. */
export const TIMEOUT_MS = 8000;
/** Espera antes da segunda tentativa. */
export const ESPERA_RETENTATIVA_MS = 1200;

const urlDo = (tipo: TipoJob): string =>
  `${env.N8N_BASE_URL.replace(/\/+$/, "")}/${CAMINHOS[tipo]}`;

const callbackUrl = (): string => `${env.APP_URL.replace(/\/+$/, "")}/api/ai/callback`;

const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/* ======================================================================== */
/*  Payload                                                                 */
/* ======================================================================== */

/** O que o fluxo do n8n recebe. Documentado por inteiro em `docs/IA.md`. */
export interface PayloadN8n {
  jobId: string;
  kind: TipoJob;
  callbackUrl: string;
  /** Eco do token: o fluxo confere no primeiro nó e o devolve no callback. */
  usuario: { id: string; primeiroNome: string };
  perfil: {
    sexo: string | null;
    idadeAnos: number | null;
    alturaCm: number | null;
    pesoKg: number | null;
    objetivo: string;
    atividade: string | null;
    estiloAlimentar: string | null;
  };
  metas: {
    kcal: number;
    proteinaG: number;
    aguaMl: number;
    macros: { protein: number; carb: number; fat: number };
    toleranciaKcalPct: number;
  };
  restricoes: {
    declaradas: string[];
    etiquetasBloqueadas: string[];
    rotulos: string[];
    evitar: string[];
    /** Palavras que o servidor varre em título, item e preparo. O fluxo
        higieniza o texto com elas antes de devolver, e o prompt manda o
        modelo não escrevê-las: sem isso, um título como "Iogurte com
        fruta" num plano sem lactose derruba o plano inteiro — mesmo com
        o alimento escolhido correto. */
    termosProibidos: string[];
  };
  /** Somente o que esta pessoa pode comer. O modelo escolhe DAQUI.
      `nomeDeCompra` e `centavosPorKg` vão junto porque o fluxo precisa
      montar a lista de compras COM PREÇO: sem eles, a única saída seria
      mandar `cents: 0`, e a tela de compras exibiria "R$ 0,00" como se a
      feira fosse de graça. Preço inventado pelo modelo seria pior. */
  alimentosPermitidos: {
    id: string; nome: string; papel: string; setor: string;
    kcal100: number; proteina100: number; carbo100: number; gordura100: number;
    min: number; max: number; passo: number; medida: string;
    nomeDeCompra: string; centavosPorKg: number;
  }[];
  pedido: Record<string, unknown>;
  /** Para o fluxo datar o plano sem depender do relógio dele. */
  dataBase: string;
  semente: string;
}

function montarPayload(ctx: ContextoGeracao, kind: TipoJob, jobId: string, pedido: Record<string, unknown>): PayloadN8n {
  const bloq = montarBloqueio(ctx.perfil);
  const metas = metasDoPerfil(ctx.perfil);
  const permitidos = baseSegura(bloq);
  const idade = ctx.perfil.birthDate
    ? Math.floor((Date.parse(`${ctx.dataBase}T00:00:00Z`) - Date.parse(`${ctx.perfil.birthDate.slice(0, 10)}T00:00:00Z`)) / 31557600000)
    : null;

  return {
    jobId,
    kind,
    callbackUrl: callbackUrl(),
    usuario: { id: ctx.userId, primeiroNome: (ctx.nomeUsuario || "").split(" ")[0] ?? "" },
    perfil: {
      sexo: ctx.perfil.sex ?? null,
      idadeAnos: idade !== null && Number.isFinite(idade) ? idade : null,
      alturaCm: ctx.perfil.heightCm ?? null,
      pesoKg: ctx.perfil.weightKg ?? null,
      objetivo: metas.objetivo,
      atividade: ctx.perfil.activityLevel ?? null,
      estiloAlimentar: ctx.perfil.dietStyle ?? null
    },
    metas: {
      kcal: metas.kcal,
      proteinaG: metas.proteinaG,
      aguaMl: metas.aguaMl,
      macros: macrosMeta(metas.kcal, metas.proteinaG),
      toleranciaKcalPct: Math.round(TOLERANCIA_KCAL * 100)
    },
    restricoes: {
      declaradas: bloq.declaradas,
      etiquetasBloqueadas: [...bloq.etiquetas],
      rotulos: bloq.rotulos,
      evitar: bloq.evitar,
      termosProibidos: termosBloqueados(bloq)
    },
    alimentosPermitidos: permitidos.map((a) => ({
      id: a.id, nome: a.nome, papel: a.papel, setor: a.setor,
      kcal100: Math.round(kcal100(a)),
      proteina100: a.proteina, carbo100: a.carbo, gordura100: a.gordura,
      min: a.min, max: a.max, passo: a.passo,
      medida: `${a.medida.gramas} g = 1 ${a.medida.rotulo}`,
      nomeDeCompra: a.compra ?? a.nome,
      centavosPorKg: a.centavosPorKg
    })),
    pedido,
    dataBase: ctx.dataBase,
    semente: ctx.semente
  };
}

/* ======================================================================== */
/*  Disparo com timeout e uma nova tentativa                                */
/* ======================================================================== */

export interface RespostaDisparo {
  executionId: string | null;
}

/**
 * Faz o POST no webhook. Lança `AppError("indisponivel")` quando não dá para
 * entregar o pedido — a rota marca o job como erro e o usuário vê um recado
 * em português, não um stack trace.
 */
export async function dispararWebhook(tipo: TipoJob, payload: PayloadN8n): Promise<RespostaDisparo> {
  if (!env.N8N_BASE_URL) {
    throw new AppError("indisponivel", "A geração por IA não está configurada neste ambiente.");
  }
  if (!env.N8N_WEBHOOK_TOKEN) {
    /* Sem segredo compartilhado o callback não poderia ser autenticado, e um
       callback sem autenticação deixaria qualquer um gravar plano alheio. */
    throw new AppError("indisponivel", "A geração por IA está sem credencial configurada. Avise o suporte.");
  }

  const url = urlDo(tipo);
  let ultimoErro = "";

  for (let tentativa = 1; tentativa <= 2; tentativa++) {
    try {
      const resposta = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [CABECALHO_TOKEN]: env.N8N_WEBHOOK_TOKEN,
          "x-nutrielive-job": payload.jobId
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      if (resposta.ok) {
        const corpo = await resposta.json().catch(() => ({}) as Record<string, unknown>);
        const execucao = (corpo as Record<string, unknown>)?.["executionId"];
        log.info(`IA n8n: fluxo ${tipo} aceito para o job ${payload.jobId}`);
        return { executionId: typeof execucao === "string" ? execucao : null };
      }

      ultimoErro = `HTTP ${resposta.status}`;
      /* 4xx é configuração errada: repetir não resolve. */
      if (resposta.status >= 400 && resposta.status < 500) break;
    } catch (e) {
      ultimoErro = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    if (tentativa === 1) {
      log.warn(`IA n8n: falha ao disparar ${tipo} (${ultimoErro}); tentando mais uma vez`);
      await dormir(ESPERA_RETENTATIVA_MS);
    }
  }

  log.error(`IA n8n: fluxo ${tipo} não aceitou o job ${payload.jobId} — ${ultimoErro}`);
  throw new AppError(
    "indisponivel",
    "A geração por IA não respondeu agora. Tente de novo em alguns minutos — nada do seu plano foi perdido."
  );
}

/* ======================================================================== */
/*  O provedor                                                              */
/* ======================================================================== */

export function criarN8n(): ProvedorIA {
  return {
    nome: "n8n",
    assincrono: true,

    async gerarPlano(ctx: ContextoGeracao, pedido: PedidoPlano, jobId: string): Promise<Disparo<PlanoAlimentar>> {
      const payload = montarPayload(ctx, "plano", jobId, {
        dias: pedido.days,
        observacoes: pedido.notes ?? null,
        temNutricionistaVinculada: ctx.temNutricionistaVinculada
      });
      const { executionId } = await dispararWebhook("plano", payload);
      return { modo: "aguardando", executionId };
    },

    async gerarReceitas(ctx: ContextoGeracao, pedido: PedidoReceitas, jobId: string): Promise<Disparo<SaidaReceitas>> {
      const payload = montarPayload(ctx, "receita", jobId, {
        ingredientes: pedido.ingredients,
        maxMinutos: pedido.maxMinutes ?? null
      });
      const { executionId } = await dispararWebhook("receita", payload);
      return { modo: "aguardando", executionId };
    }
  };
}
