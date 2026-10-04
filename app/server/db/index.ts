/* =========================================================================
   Nutri&Live — camada de dados com dois motores

   Um único objeto `db` atende o sistema inteiro:

     DATABASE_URL presente  ->  Postgres de verdade (Drizzle + postgres.js)
     DATABASE_URL ausente   ->  motor em memória, com o seed carregado

   O motor em memória não tenta ser um Postgres: ele implementa exatamente o
   que as rotas usam — inserir, buscar (com filtro, ordem, limite), atualizar,
   remover e contar — sobre as MESMAS tabelas de `schema.ts` e com os MESMOS
   tipos de valor que o Drizzle devolve (Date em timestamp, string em date,
   number em integer, objeto em jsonb). Por isso a mesma rota roda igual nos
   dois motores e dá para testar tudo sem banco.

   A API é propositalmente pequena. Nada de join automático: quando a rota
   precisa de dois conjuntos, ela faz duas buscas e cruza em memória — o
   volume por usuário é pequeno e o código fica legível.
   ========================================================================= */
import { randomUUID } from "node:crypto";
import {
  and, asc, desc, eq, ne, gt, gte, lt, lte, like, inArray, isNull, isNotNull,
  count, getTableColumns, getTableName, type SQL
} from "drizzle-orm";
import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { schema } from "./schema.js";
import { env } from "../lib/env.js";
import { log } from "../lib/log.js";
import { AppError } from "../lib/http.js";

/* ======================================================================== */
/*  Tipos da API de dados                                                   */
/* ======================================================================== */

export type Tabela = PgTable;
/** Linha como ela sai do banco. */
export type Linha<T extends Tabela> = InferSelectModel<T>;
/** Linha como ela entra no banco (colunas com padrão são opcionais). */
export type Nova<T extends Tabela> = InferInsertModel<T>;

/** Operadores aceitos num campo do filtro. */
export type Operadores<V> = {
  eq?: V;
  ne?: V;
  gt?: V;
  gte?: V;
  lt?: V;
  lte?: V;
  /** Lista vazia nunca casa com nada. */
  in?: readonly V[];
  /** `like` do SQL, com % onde quiser. Comparação sem diferenciar maiúsculas. */
  like?: string;
  /** `true` exige NULL, `false` exige valor. */
  nulo?: boolean;
};

const CHAVES_OPERADOR = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "like", "nulo"] as const;

/**
 * Filtro de uma busca. Chave omitida ou com `undefined` não filtra nada;
 * valor `null` vira `IS NULL`; valor cru vira igualdade.
 */
export type Filtro<T extends Tabela> = {
  [K in keyof Linha<T>]?: Linha<T>[K] | Operadores<Linha<T>[K]> | null;
};

export type Ordem<T extends Tabela> = {
  campo: Extract<keyof Linha<T>, string>;
  dir?: "asc" | "desc";
};

export type Opcoes<T extends Tabela> = {
  ordem?: Ordem<T> | Ordem<T>[];
  limite?: number;
  deslocamento?: number;
};

/** O contrato que os dois motores cumprem. */
export interface Dados {
  readonly motor: "postgres" | "memory";
  inserir<T extends Tabela>(tabela: T, valores: Nova<T>): Promise<Linha<T>>;
  inserirVarios<T extends Tabela>(tabela: T, valores: Nova<T>[]): Promise<Linha<T>[]>;
  buscar<T extends Tabela>(tabela: T, filtro?: Filtro<T>, opcoes?: Opcoes<T>): Promise<Linha<T>[]>;
  primeiro<T extends Tabela>(tabela: T, filtro?: Filtro<T>, opcoes?: Opcoes<T>): Promise<Linha<T> | null>;
  atualizar<T extends Tabela>(tabela: T, filtro: Filtro<T>, patch: Partial<Nova<T>>): Promise<Linha<T>[]>;
  remover<T extends Tabela>(tabela: T, filtro: Filtro<T>): Promise<number>;
  contar<T extends Tabela>(tabela: T, filtro?: Filtro<T>): Promise<number>;
  /** Apaga tudo. Usado pelo seed e pelos testes; bloqueado em produção. */
  limpar(): Promise<void>;
  /** Encerra conexões (no-op em memória). */
  encerrar(): Promise<void>;
}

/* ======================================================================== */
/*  Utilidades comuns aos dois motores                                      */
/* ======================================================================== */

const ehOperador = (v: unknown): v is Operadores<unknown> =>
  typeof v === "object" && v !== null && !(v instanceof Date) && !Array.isArray(v) &&
  CHAVES_OPERADOR.some((k) => k in (v as Record<string, unknown>));

const colunas = (tabela: Tabela): Record<string, any> => getTableColumns(tabela) as Record<string, any>;

const coluna = (tabela: Tabela, campo: string): any => {
  const c = colunas(tabela)[campo];
  if (!c) throw new Error(`Coluna inexistente em ${getTableName(tabela)}: ${campo}`);
  return c;
};

/** Normaliza o filtro em pares [campo, operadores], ignorando `undefined`. */
function pares<T extends Tabela>(filtro: Filtro<T> | undefined): [string, Operadores<any>][] {
  const saida: [string, Operadores<any>][] = [];
  for (const [campo, valor] of Object.entries(filtro ?? {})) {
    if (valor === undefined) continue;
    if (valor === null) saida.push([campo, { nulo: true }]);
    else if (ehOperador(valor)) saida.push([campo, valor as Operadores<any>]);
    else saida.push([campo, { eq: valor }]);
  }
  return saida;
}

const listaOrdem = <T extends Tabela>(opcoes?: Opcoes<T>): Ordem<T>[] =>
  !opcoes?.ordem ? [] : Array.isArray(opcoes.ordem) ? opcoes.ordem : [opcoes.ordem];

/* ======================================================================== */
/*  Motor 1 — Postgres (Drizzle + postgres.js)                              */
/* ======================================================================== */

function criarPostgres(): Dados {
  /* Importação preguiçosa: em modo memória nem o driver é carregado. */
  const { drizzle } = require("drizzle-orm/postgres-js") as typeof import("drizzle-orm/postgres-js");
  const postgres = require("postgres") as typeof import("postgres")["default"];
  const sql = postgres(env.DATABASE_URL, { max: 10, idle_timeout: 20 });
  const pg = drizzle(sql, { schema });

  const condicoes = <T extends Tabela>(tabela: T, filtro?: Filtro<T>): SQL | undefined => {
    const partes: SQL[] = [];
    for (const [campo, ops] of pares(filtro)) {
      const col = coluna(tabela, campo);
      if (ops.nulo === true) partes.push(isNull(col));
      if (ops.nulo === false) partes.push(isNotNull(col));
      if (ops.eq !== undefined) partes.push(ops.eq === null ? isNull(col) : eq(col, ops.eq));
      if (ops.ne !== undefined) partes.push(ne(col, ops.ne));
      if (ops.gt !== undefined) partes.push(gt(col, ops.gt));
      if (ops.gte !== undefined) partes.push(gte(col, ops.gte));
      if (ops.lt !== undefined) partes.push(lt(col, ops.lt));
      if (ops.lte !== undefined) partes.push(lte(col, ops.lte));
      if (ops.like !== undefined) partes.push(like(col, ops.like));
      if (ops.in !== undefined) partes.push(inArray(col, [...ops.in]));
    }
    return partes.length ? and(...partes) : undefined;
  };

  /** `in: []` nunca casa: evita ida ao banco e SQL inválido. */
  const filtroImpossivel = <T extends Tabela>(filtro?: Filtro<T>): boolean =>
    pares(filtro).some(([, ops]) => ops.in !== undefined && ops.in.length === 0);

  return {
    motor: "postgres",

    async inserir(tabela, valores) {
      const linhas = await pg.insert(tabela).values(valores as any).returning();
      return linhas[0] as any;
    },

    async inserirVarios(tabela, valores) {
      if (!valores.length) return [];
      return (await pg.insert(tabela).values(valores as any).returning()) as any;
    },

    async buscar(tabela, filtro, opcoes) {
      if (filtroImpossivel(filtro)) return [];
      let q: any = pg.select().from(tabela as any).$dynamic();
      const onde = condicoes(tabela, filtro);
      if (onde) q = q.where(onde);
      const ordem = listaOrdem(opcoes);
      if (ordem.length) {
        q = q.orderBy(...ordem.map((o) => (o.dir === "desc" ? desc(coluna(tabela, o.campo)) : asc(coluna(tabela, o.campo)))));
      }
      if (opcoes?.limite !== undefined) q = q.limit(opcoes.limite);
      if (opcoes?.deslocamento !== undefined) q = q.offset(opcoes.deslocamento);
      return (await q) as any;
    },

    async primeiro(tabela, filtro, opcoes) {
      const linhas = await this.buscar(tabela, filtro, { ...opcoes, limite: 1 });
      return linhas[0] ?? null;
    },

    async atualizar(tabela, filtro, patch) {
      if (filtroImpossivel(filtro)) return [];
      const onde = condicoes(tabela, filtro);
      let q: any = pg.update(tabela).set(patch as any);
      if (onde) q = q.where(onde);
      return (await q.returning()) as any;
    },

    async remover(tabela, filtro) {
      if (filtroImpossivel(filtro)) return 0;
      const onde = condicoes(tabela, filtro);
      let q: any = pg.delete(tabela);
      if (onde) q = q.where(onde);
      const linhas = await q.returning();
      return linhas.length;
    },

    async contar(tabela, filtro) {
      if (filtroImpossivel(filtro)) return 0;
      const onde = condicoes(tabela, filtro);
      let q: any = pg.select({ n: count() }).from(tabela as any).$dynamic();
      if (onde) q = q.where(onde);
      const linhas = await q;
      return Number(linhas[0]?.n ?? 0);
    },

    async limpar() {
      if (env.NODE_ENV === "production") throw new Error("limpar() é proibido em produção.");
      /* Ordem reversa de dependência não importa: TRUNCATE em cascata. */
      const nomes = Object.values(schema).map((t) => `"${getTableName(t as Tabela)}"`).join(", ");
      await sql.unsafe(`TRUNCATE ${nomes} CASCADE`);
    },

    async encerrar() {
      await sql.end({ timeout: 5 });
    }
  };
}

/* ======================================================================== */
/*  Motor 2 — memória                                                       */
/* ======================================================================== */

/** Índices únicos que o motor em memória faz questão de respeitar. */
const UNICOS: Record<string, string[][]> = {
  organizations: [["slug"]],
  users: [["email"]],
  sessions: [["tokenHash"]],
  auth_tokens: [["tokenHash"]],
  plans: [["key"]],
  subscriptions: [["providerSubId"]],
  payments: [["providerPaymentId"]],
  webhook_events: [["provider", "providerEventId"]],
  profiles: [["userId"]],
  shopping_lists: [["userId", "weekStart"]],
  care_links: [["professionalUserId", "memberUserId"]],
  invitations: [["tokenHash"]]
};

const clonar = <V>(v: V): V => (v === null || typeof v !== "object" ? v : (structuredClone(v) as V));

const iguais = (a: unknown, b: unknown): boolean => {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  if (a instanceof Date && typeof b === "string") return a.getTime() === new Date(b).getTime();
  if (a === null || a === undefined) return b === null || b === undefined;
  return a === b;
};

const numerico = (v: unknown): number | null =>
  v instanceof Date ? v.getTime() : typeof v === "number" ? v : typeof v === "string" ? NaN : null;

const compara = (a: unknown, b: unknown): number => {
  if (a instanceof Date || b instanceof Date) {
    return (a instanceof Date ? a.getTime() : 0) - (b instanceof Date ? b.getTime() : 0);
  }
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return Number(a) - Number(b);
  return String(a).localeCompare(String(b), "pt-BR");
};

/** Avalia um operador sobre um valor da linha. */
function satisfaz(valor: unknown, ops: Operadores<any>): boolean {
  const vazio = valor === null || valor === undefined;
  if (ops.nulo === true && !vazio) return false;
  if (ops.nulo === false && vazio) return false;
  if (ops.eq !== undefined && !iguais(valor, ops.eq)) return false;
  if (ops.ne !== undefined && iguais(valor, ops.ne)) return false;
  for (const [chave, limite] of [["gt", ops.gt], ["gte", ops.gte], ["lt", ops.lt], ["lte", ops.lte]] as const) {
    if (limite === undefined) continue;
    if (vazio) return false;                       /* NULL nunca satisfaz comparação, como no SQL */
    const c = compara(valor, limite);
    if (chave === "gt" && !(c > 0)) return false;
    if (chave === "gte" && !(c >= 0)) return false;
    if (chave === "lt" && !(c < 0)) return false;
    if (chave === "lte" && !(c <= 0)) return false;
  }
  if (ops.like !== undefined) {
    if (vazio) return false;
    const padrao = new RegExp(
      "^" + ops.like.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".") + "$",
      "i"
    );
    if (!padrao.test(String(valor))) return false;
  }
  if (ops.in !== undefined && !ops.in.some((v) => iguais(valor, v))) return false;
  return true;
}

function criarMemoria(): Dados {
  const tabelas = new Map<string, Record<string, any>[]>();
  const linhasDe = (tabela: Tabela): Record<string, any>[] => {
    const nome = getTableName(tabela);
    let lista = tabelas.get(nome);
    if (!lista) { lista = []; tabelas.set(nome, lista); }
    return lista;
  };

  /* ---- semente preguiçosa -------------------------------------------- */
  let estado: "virgem" | "semeando" | "pronto" = "virgem";
  let semente: Promise<void> | null = null;

  async function preparar(): Promise<void> {
    if (estado === "pronto") return;
    if (estado === "semeando") return;             /* chamadas vindas de dentro do próprio seed */
    if (process.env.SEED_AUTO === "0") { estado = "pronto"; return; }
    estado = "semeando";
    semente = (async () => {
      const { semear } = await import("./seed.js");
      await semear(memoria, { silencioso: true });
      estado = "pronto";
    })();
    await semente;
  }

  const padraoDe = (col: any): unknown => {
    if (typeof col.defaultFn === "function") return col.defaultFn();
    const d = col.default;
    if (d && typeof d === "object" && "queryChunks" in d) {
      const texto = JSON.stringify(d.queryChunks);
      if (texto.includes("gen_random_uuid")) return randomUUID();
      if (texto.includes("now()")) return new Date();
      return null;
    }
    return d === undefined ? null : clonar(d);
  };

  function montar<T extends Tabela>(tabela: T, valores: Nova<T>): Record<string, any> {
    const linha: Record<string, any> = {};
    for (const [campo, col] of Object.entries(colunas(tabela))) {
      const v = (valores as Record<string, any>)[campo];
      if (v !== undefined) { linha[campo] = clonar(v); continue; }
      linha[campo] = col.hasDefault ? padraoDe(col) : null;
    }
    for (const [campo, col] of Object.entries(colunas(tabela))) {
      if (col.notNull && (linha[campo] === null || linha[campo] === undefined)) {
        throw new AppError("dados_invalidos", `Campo obrigatório ausente em ${getTableName(tabela)}: ${campo}`);
      }
    }
    return linha;
  }

  function checarUnicos(tabela: Tabela, nova: Record<string, any>, ignorar?: Record<string, any>): void {
    for (const chaves of UNICOS[getTableName(tabela)] ?? []) {
      if (chaves.some((k) => nova[k] === null || nova[k] === undefined)) continue;  /* NULL não colide */
      const choque = linhasDe(tabela).find(
        (l) => l !== ignorar && chaves.every((k) => iguais(l[k], nova[k]))
      );
      if (choque) {
        throw new AppError("conflito", `Registro duplicado em ${getTableName(tabela)} (${chaves.join(", ")}).`);
      }
    }
  }

  function filtrar<T extends Tabela>(tabela: T, filtro?: Filtro<T>): Record<string, any>[] {
    const condicoes = pares(filtro);
    if (condicoes.some(([, ops]) => ops.in !== undefined && ops.in.length === 0)) return [];
    return linhasDe(tabela).filter((l) => condicoes.every(([campo, ops]) => satisfaz(l[campo], ops)));
  }

  function ordenar<T extends Tabela>(linhas: Record<string, any>[], opcoes?: Opcoes<T>): Record<string, any>[] {
    const ordens = listaOrdem(opcoes);
    if (!ordens.length) return linhas;
    return [...linhas].sort((a, b) => {
      for (const o of ordens) {
        const va = a[o.campo], vb = b[o.campo];
        const vazioA = va === null || va === undefined, vazioB = vb === null || vb === undefined;
        /* Postgres: NULLS LAST no asc, NULLS FIRST no desc. */
        if (vazioA || vazioB) {
          if (vazioA && vazioB) continue;
          return (o.dir === "desc" ? -1 : 1) * (vazioA ? 1 : -1);
        }
        const c = compara(va, vb) * (o.dir === "desc" ? -1 : 1);
        if (c !== 0) return c;
      }
      return 0;
    });
  }

  const memoria: Dados = {
    motor: "memory",

    async inserir(tabela, valores) {
      await preparar();
      const linha = montar(tabela, valores);
      checarUnicos(tabela, linha);
      linhasDe(tabela).push(linha);
      return clonar(linha) as any;
    },

    async inserirVarios(tabela, valores) {
      await preparar();
      const criadas: Record<string, any>[] = [];
      for (const v of valores) {
        const linha = montar(tabela, v);
        checarUnicos(tabela, linha);
        linhasDe(tabela).push(linha);
        criadas.push(linha);
      }
      return criadas.map((l) => clonar(l)) as any;
    },

    async buscar(tabela, filtro, opcoes) {
      await preparar();
      let linhas = ordenar(filtrar(tabela, filtro), opcoes);
      const inicio = opcoes?.deslocamento ?? 0;
      if (inicio) linhas = linhas.slice(inicio);
      if (opcoes?.limite !== undefined) linhas = linhas.slice(0, opcoes.limite);
      return linhas.map((l) => clonar(l)) as any;
    },

    async primeiro(tabela, filtro, opcoes) {
      const linhas = await this.buscar(tabela, filtro, { ...opcoes, limite: 1 });
      return linhas[0] ?? null;
    },

    async atualizar(tabela, filtro, patch) {
      await preparar();
      const alvo = filtrar(tabela, filtro);
      const cols = colunas(tabela);
      for (const linha of alvo) {
        for (const [campo, valor] of Object.entries(patch as Record<string, any>)) {
          if (valor === undefined) continue;
          if (!cols[campo]) throw new Error(`Coluna inexistente em ${getTableName(tabela)}: ${campo}`);
          linha[campo] = clonar(valor);
        }
        checarUnicos(tabela, linha, linha);
      }
      return alvo.map((l) => clonar(l)) as any;
    },

    async remover(tabela, filtro) {
      await preparar();
      const alvo = new Set(filtrar(tabela, filtro));
      if (!alvo.size) return 0;
      const lista = linhasDe(tabela);
      const restantes = lista.filter((l) => !alvo.has(l));
      lista.length = 0;
      lista.push(...restantes);
      return alvo.size;
    },

    async contar(tabela, filtro) {
      await preparar();
      return filtrar(tabela, filtro).length;
    },

    async limpar() {
      tabelas.clear();
      estado = "pronto";                            /* quem limpou assume o controle dos dados */
      semente = null;
    },

    async encerrar() { /* nada a encerrar */ }
  };

  return memoria;
}

/* ======================================================================== */
/*  O objeto exportado                                                      */
/* ======================================================================== */

export const db: Dados = env.DB_DRIVER === "postgres" ? criarPostgres() : criarMemoria();

/**
 * Garante que o banco está utilizável. Em Postgres é imediato; em memória
 * dispara (uma única vez) o seed de demonstração. Os guardas de `auth/guard.ts`
 * chamam isso antes de qualquer consulta, e os testes chamam na preparação.
 */
export async function bancoPronto(): Promise<void> {
  if (db.motor === "memory") await db.contar(schema.users);
}

/**
 * Reinicia o banco em memória. `semear: true` recarrega os dados de
 * demonstração; `false` deixa tudo vazio (o que os testes querem).
 */
export async function reiniciarBanco(opcoes: { semear?: boolean } = {}): Promise<void> {
  if (db.motor !== "memory") throw new Error("reiniciarBanco() só existe no motor de memória.");
  await db.limpar();
  if (opcoes.semear) {
    const { semear } = await import("./seed.js");
    await semear(db, { silencioso: true });
  }
}

if (env.DB_DRIVER === "memory" && process.env.SEED_AUTO !== "0") {
  /* Aquece o seed junto com a subida do processo, para a primeira requisição
     já encontrar dados. Falha aqui é fatal: sem dados não há demonstração. */
  void bancoPronto().catch((e) => log.error("falha ao carregar o seed em memória", e));
}

export { schema };
export default db;
