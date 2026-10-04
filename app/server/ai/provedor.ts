/* =========================================================================
   Nutri&Live — provedor de IA

   Uma interface, dois drivers:

     AI_DRIVER = "local"   gerador determinístico, sem rede  (local.ts)
     AI_DRIVER = "n8n"     webhook assíncrono do n8n         (n8n.ts)

   A diferença entre os dois não é só "onde roda": é QUANDO a resposta chega.
   O local responde na mesma chamada (`{ modo: "pronto" }`); o n8n responde
   depois, por `POST /api/ai/callback` (`{ modo: "aguardando" }`). A rota trata
   os dois do mesmo jeito porque o job em `ai_jobs` é a fonte da verdade do
   andamento — foi para isso que ele existe.

   O que NÃO muda entre os drivers:
   - sinal de cautela clínica bloqueia a geração ANTES de qualquer driver;
   - a saída passa por `validarPlano`/`validarReceitas` antes de ser gravada,
     venha de onde vier.
   ========================================================================= */
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import type {
  ContextoGeracao, OrientacaoProfissional, PedidoPlano, PedidoReceitas,
  PlanoAlimentar, SaidaReceitas
} from "./tipos.js";
import * as local from "./local.js";
import { criarN8n } from "./n8n.js";

/** Nome do driver, como aparece no painel do admin e no log. */
export type NomeDriver = "local" | "n8n";

/**
 * Resultado de um disparo. `pronto` traz a saída na hora; `aguardando` diz
 * que o job vai ser concluído pelo callback.
 */
export type Disparo<T> =
  | { modo: "pronto"; saida: T }
  | { modo: "aguardando"; executionId: string | null };

export interface ProvedorIA {
  readonly nome: NomeDriver;
  /** O driver conclui o job sozinho (local) ou espera callback (n8n)? */
  readonly assincrono: boolean;
  gerarPlano(ctx: ContextoGeracao, pedido: PedidoPlano, jobId: string): Promise<Disparo<PlanoAlimentar>>;
  gerarReceitas(ctx: ContextoGeracao, pedido: PedidoReceitas, jobId: string): Promise<Disparo<SaidaReceitas>>;
}

/* ======================================================================== */
/*  Driver local                                                            */
/* ======================================================================== */

export const provedorLocal: ProvedorIA = {
  nome: "local",
  assincrono: false,
  async gerarPlano(ctx, pedido) {
    return { modo: "pronto", saida: local.gerarPlano(ctx, pedido) };
  },
  async gerarReceitas(ctx, pedido) {
    return { modo: "pronto", saida: local.gerarReceitas(ctx, pedido) };
  }
};

/* ======================================================================== */
/*  Escolha do driver                                                       */
/* ======================================================================== */

let escolhido: ProvedorIA | null = null;

/** O provedor em uso. Decidido uma vez, por `env.AI_DRIVER`. */
export function provedor(): ProvedorIA {
  if (escolhido) return escolhido;
  if (env.AI_DRIVER === "n8n" && env.N8N_BASE_URL) {
    escolhido = criarN8n();
    log.info(`IA: driver n8n em ${env.N8N_BASE_URL}`);
  } else {
    escolhido = provedorLocal;
    log.info("IA: driver local (determinístico, sem rede)");
  }
  return escolhido;
}

/** Troca o provedor. Existe para os testes e para o painel do admin. */
export function trocarProvedor(p: ProvedorIA | null): void {
  escolhido = p;
}

/**
 * Encaminhamento profissional quando o perfil tem sinal de cautela. Vale para
 * os dois drivers: com sinal de cautela nada é enviado para o n8n.
 */
export function orientacaoSePreciso(ctx: ContextoGeracao): OrientacaoProfissional | null {
  return local.orientacaoSePreciso(ctx);
}

export { metasDoPerfil, contextoDeValidacao, TOLERANCIA_KCAL, type MetasCalculadas } from "./local.js";
