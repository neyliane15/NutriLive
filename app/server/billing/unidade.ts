/* =========================================================================
   Nutri&Live — unidade de trabalho ("tudo ou nada") da cobrança

   A contratação grava quatro coisas que só fazem sentido juntas: usuário,
   organização, assinatura e pagamento. Se a terceira falhar, as duas
   primeiras não podem ficar no banco.

   `server/db/index.ts` (dono: BE-1) expõe inserir/atualizar/remover, mas
   ainda NÃO expõe transação. Até expor, a atomicidade aqui é por diário de
   reversão: cada escrita registra como se desfaz, e um erro desfaz tudo na
   ordem inversa.

   Limites, ditos com clareza:
   - no motor de memória isso é equivalente a uma transação, porque o processo
     é um só e não há concorrência real no meio;
   - no Postgres isso é COMPENSAÇÃO, não transação: se o processo morrer entre
     a escrita e o desfazer, sobra lixo. Está pedido ao BE-1 um
     `db.transacao(fn)` de verdade; quando existir, `emTransacao` passa a
     delegar para ele e o diário vira um detalhe de implementação.
   ========================================================================= */
import { db } from "../db/index.js";
import type { Filtro, Linha, Nova, Tabela } from "../db/index.js";
import { log } from "../lib/log.js";

export interface Unidade {
  inserir<T extends Tabela>(tabela: T, valores: Nova<T>): Promise<Linha<T>>;
  atualizar<T extends Tabela>(tabela: T, filtro: Filtro<T>, patch: Partial<Nova<T>>): Promise<Linha<T>[]>;
}

type Desfazer = () => Promise<void>;

/** Chave de identidade da linha, para saber como desfazer. */
const chaveDe = (linha: Record<string, unknown>): Record<string, unknown> | null => {
  if (linha["id"] !== undefined) return { id: linha["id"] };
  if (linha["key"] !== undefined) return { key: linha["key"] };
  if (linha["userId"] !== undefined) return { userId: linha["userId"] };
  return null;
};

export async function emTransacao<R>(fn: (u: Unidade) => Promise<R>): Promise<R> {
  const diario: Desfazer[] = [];

  const unidade: Unidade = {
    async inserir(tabela, valores) {
      const linha = await db.inserir(tabela, valores);
      const chave = chaveDe(linha as Record<string, unknown>);
      if (chave) diario.push(async () => { await db.remover(tabela, chave as Filtro<typeof tabela>); });
      return linha;
    },

    async atualizar(tabela, filtro, patch) {
      /* Guarda o antes de cada linha afetada, campo por campo do patch. */
      const antes = await db.buscar(tabela, filtro);
      const campos = Object.keys(patch);
      const atualizadas = await db.atualizar(tabela, filtro, patch);
      for (const linha of antes) {
        const chave = chaveDe(linha as Record<string, unknown>);
        if (!chave) continue;
        const original: Record<string, unknown> = {};
        for (const campo of campos) original[campo] = (linha as Record<string, unknown>)[campo];
        diario.push(async () => {
          await db.atualizar(tabela, chave as Filtro<typeof tabela>, original as Partial<Nova<typeof tabela>>);
        });
      }
      return atualizadas;
    }
  };

  try {
    return await fn(unidade);
  } catch (erro) {
    for (const desfazer of diario.reverse()) {
      try {
        await desfazer();
      } catch (e) {
        /* Falha ao desfazer não pode esconder o erro original. */
        log.error("cobrança: falha ao desfazer escrita após erro na contratação", e);
      }
    }
    throw erro;
  }
}
