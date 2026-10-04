/* =========================================================================
   Resposta conforme o contrato.

   Toda rota devolve `conforme(contract.area.rota.out, valor)`. O Zod então
   trabalha de três jeitos ao mesmo tempo:

     1. documenta o que sai (o schema é o contrato);
     2. remove campo que não está no contrato — nada de `password_hash`
        escapando por descuido;
     3. quebra alto e cedo quando o servidor e o contrato divergem, em vez
        de o front descobrir em produção.
   ========================================================================= */
import { AppError } from "./http.js";
import { log } from "./log.js";
import { isProd } from "./env.js";

export function conforme<T>(schema: { parse: (v: unknown) => T }, valor: unknown): T {
  try {
    return schema.parse(valor);
  } catch (e: any) {
    const detalhe = (e?.issues ?? []).map((i: any) => `${i.path.join(".")}: ${i.message}`).join("; ");
    log.error(`resposta fora do contrato — ${detalhe}`);
    if (isProd) throw new AppError("erro_interno", "Algo quebrou do nosso lado. Já estamos sabendo.");
    throw new AppError("erro_interno", `Resposta fora do contrato: ${detalhe}`);
  }
}

/** Data em ISO-8601 com fuso, ou null. É o formato que o contrato pede. */
export const iso = (d: Date | string | null | undefined): string | null =>
  d === null || d === undefined ? null : (d instanceof Date ? d : new Date(d)).toISOString();

/** Igual a `iso`, mas para campo que o contrato exige preenchido. */
export const isoObrigatorio = (d: Date | string): string =>
  (d instanceof Date ? d : new Date(d)).toISOString();
