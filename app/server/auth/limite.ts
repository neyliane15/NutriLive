/* =========================================================================
   Nutri&Live — limite de tentativas

   Janela deslizante GRAVADA NO BANCO. Duas chaves independentes no login,
   porque defendem de ataques diferentes:

     por e-mail  força bruta numa conta específica
     por IP      varredura de senha comum em muitas contas

   Acerto limpa o contador do e-mail (mas não o do IP, que é defesa de
   vizinhança). Enquanto bloqueado, a resposta é 429 com o tempo de espera
   e a senha nem é conferida — não dá para medir nada pelo tempo de
   resposta.

   POR QUE NO BANCO
   ----------------
   Isto morava num Map em memória do processo, com um comentário dizendo
   que "em produção com mais de uma instância isto migra para Redis". O
   detalhe é que a produção escolhida é a Vercel, onde cada requisição pode
   cair numa instância nova e o processo morre entre requisições: o
   contador contava até um e recomeçava. O limite de 5 tentativas por
   e-mail não existia onde ele é necessário — e não dava erro nenhum, só
   deixava de proteger.

   Uma linha por falha, em vez de um contador incrementado: append-only não
   tem corrida. Duas tentativas simultâneas inserem duas linhas e a
   contagem fica certa; com UPDATE, as duas leriam 4 e gravariam 5.
   ========================================================================= */
import { db } from "../db/index.js";
import { rateLimits } from "../db/schema.js";
import { AppError, IP_DESCONHECIDO } from "../lib/http.js";
import { log } from "../lib/log.js";

export type Politica = {
  /** Falhas toleradas dentro da janela. */
  tentativas: number;
  janelaMs: number;
  bloqueioMs: number;
};

const MIN = 60_000;

export const POLITICAS = {
  login_email: { tentativas: 5, janelaMs: 15 * MIN, bloqueioMs: 15 * MIN },
  login_ip: { tentativas: 25, janelaMs: 15 * MIN, bloqueioMs: 15 * MIN },
  esqueci_email: { tentativas: 3, janelaMs: 60 * MIN, bloqueioMs: 60 * MIN },
  esqueci_ip: { tentativas: 15, janelaMs: 60 * MIN, bloqueioMs: 30 * MIN },
  token_ip: { tentativas: 20, janelaMs: 15 * MIN, bloqueioMs: 15 * MIN }
} satisfies Record<string, Politica>;

export type NomeLimite = keyof typeof POLITICAS;

const identidade = (nome: NomeLimite, chave: string) =>
  `${nome}:${chave.toLowerCase().trim()}`.slice(0, 400);

/**
 * Chave inútil é chave perigosa.
 *
 * Quando não se descobre o IP de quem chamou, `clientIp` devolve
 * IP_DESCONHECIDO — o MESMO valor para todo mundo. Um limite por IP nesse
 * caso não é defesa: é um balde único e compartilhado, em que 25 senhas
 * erradas de um visitante qualquer trancam o login de todos os clientes
 * por 15 minutos. Negação de serviço que nós mesmos causamos.
 *
 * Então, sem IP, o limite por IP não se aplica. O limite por E-MAIL
 * continua valendo, e é ele que protege a conta de cada pessoa — a defesa
 * por IP é só a de vizinhança.
 */
const chaveInutil = (nome: NomeLimite, chave: string): boolean => {
  const vazia = !chave || chave.trim() === "";
  return (vazia || chave === IP_DESCONHECIDO) && nome.endsWith("_ip");
};

const emSegundos = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

const descrever = (ms: number): string => {
  const s = emSegundos(ms);
  if (s < 60) return `${s} segundos`;
  const m = Math.ceil(s / 60);
  return m === 1 ? "1 minuto" : `${m} minutos`;
};

/** As falhas da janela, da mais nova para a mais velha. */
async function falhasNaJanela(nome: NomeLimite, chave: string): Promise<Date[]> {
  const politica = POLITICAS[nome];
  const desde = new Date(Date.now() - politica.janelaMs);
  const linhas = await db.buscar(
    rateLimits,
    { bucket: identidade(nome, chave), createdAt: { gt: desde } },
    { ordem: { campo: "createdAt", dir: "desc" }, limite: politica.tentativas + 1 }
  );
  return linhas.map((l) => l.createdAt);
}

/**
 * Quanto falta do bloqueio, em ms. Zero quando não está bloqueado.
 *
 * O bloqueio começa na N-ésima falha e dura `bloqueioMs` — e não até a
 * janela esvaziar, que é diferente quando as duas durações não são iguais
 * (`esqueci_ip`: janela de 60 min, bloqueio de 30).
 */
async function bloqueioRestante(nome: NomeLimite, chave: string): Promise<number> {
  const politica = POLITICAS[nome];
  const falhas = await falhasNaJanela(nome, chave);
  if (falhas.length < politica.tentativas) return 0;
  /* A falha que estourou o limite é a N-ésima mais recente. */
  const gatilho = falhas[politica.tentativas - 1]!;
  return Math.max(0, gatilho.getTime() + politica.bloqueioMs - Date.now());
}

/** Lança 429 se a chave estiver bloqueada. Chame ANTES de conferir a senha. */
export async function conferirLimite(nome: NomeLimite, chave: string): Promise<void> {
  if (chaveInutil(nome, chave)) return;
  const falta = await bloqueioRestante(nome, chave);
  if (falta > 0) {
    throw new AppError(
      "excesso_de_tentativas",
      `Muitas tentativas. Tente de novo em ${descrever(falta)}.`
    );
  }
}

/** Registra uma falha. */
export async function registrarFalha(nome: NomeLimite, chave: string): Promise<void> {
  if (chaveInutil(nome, chave)) return;
  try {
    await db.inserir(rateLimits, { bucket: identidade(nome, chave) });
  } catch (e) {
    /* O limite não pode derrubar o login: se a gravação falhar, a
       tentativa segue e a falha fica no log. Sem isto, um erro de banco
       nesta tabela viraria recusa de login para todo mundo. */
    log.error("limite: não foi possível gravar a tentativa", e);
  }
}

/** Quantas tentativas ainda restam (para a tela avisar antes de bloquear). */
export async function tentativasRestantes(nome: NomeLimite, chave: string): Promise<number> {
  const politica = POLITICAS[nome];
  if (await bloqueioRestante(nome, chave)) return 0;
  const falhas = await falhasNaJanela(nome, chave);
  return Math.max(0, politica.tentativas - falhas.length);
}

/** Zera o contador — chamado quando a credencial é aceita. */
export async function limparTentativas(nome: NomeLimite, chave: string): Promise<void> {
  await db.remover(rateLimits, { bucket: identidade(nome, chave) });
}

/**
 * Apaga tentativas velhas demais para contar em qualquer política.
 *
 * Sem isto a tabela cresce para sempre. Chamada junto da faxina de
 * sessões, nas rotas de auth.
 */
export async function faxinaDeTentativas(): Promise<number> {
  const maior = Math.max(...Object.values(POLITICAS).map((p) => p.janelaMs + p.bloqueioMs));
  return db.remover(rateLimits, { createdAt: { lt: new Date(Date.now() - maior) } });
}

/** Só para teste: começa do zero. */
export async function limparTodosOsLimites(): Promise<void> {
  await db.remover(rateLimits, {});
}
