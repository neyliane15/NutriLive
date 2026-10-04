/* =========================================================================
   Nutri&Live — limite de tentativas

   Janela deslizante em memória do processo. Duas chaves independentes no
   login, porque elas defendem de ataques diferentes:

     por e-mail  força bruta numa conta específica
     por IP      varredura de senha comum em muitas contas

   Acerto limpa o contador do e-mail (mas não o do IP, que é defesa de
   vizinhança). Enquanto bloqueado, a resposta é 429 com o tempo de espera,
   e a senha nem é conferida — não dá pra medir nada pelo tempo de resposta.

   Vale para um processo. Em produção com mais de uma instância isto migra
   para Redis ou para uma tabela; a interface aqui não muda.
   ========================================================================= */
import { AppError } from "../lib/http.js";

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

type Contador = { falhas: number[]; bloqueadoAte: number };

const contadores = new Map<string, Contador>();

const identidade = (nome: NomeLimite, chave: string) => `${nome}:${chave.toLowerCase().trim()}`;

const emSegundos = (ms: number) => Math.max(1, Math.ceil(ms / 1000));

const descrever = (ms: number): string => {
  const s = emSegundos(ms);
  if (s < 60) return `${s} segundos`;
  const m = Math.ceil(s / 60);
  return m === 1 ? "1 minuto" : `${m} minutos`;
};

/** Lança 429 se a chave estiver bloqueada. Chame ANTES de conferir a senha. */
export function conferirLimite(nome: NomeLimite, chave: string): void {
  const c = contadores.get(identidade(nome, chave));
  if (!c) return;
  const falta = c.bloqueadoAte - Date.now();
  if (falta > 0) {
    throw new AppError(
      "excesso_de_tentativas",
      `Muitas tentativas. Tente de novo em ${descrever(falta)}.`
    );
  }
}

/** Registra uma falha e bloqueia quando passar da política. */
export function registrarFalha(nome: NomeLimite, chave: string): void {
  const politica = POLITICAS[nome];
  const id = identidade(nome, chave);
  const agora = Date.now();
  const c = contadores.get(id) ?? { falhas: [], bloqueadoAte: 0 };
  c.falhas = c.falhas.filter((t) => agora - t < politica.janelaMs);
  c.falhas.push(agora);
  if (c.falhas.length >= politica.tentativas) {
    c.bloqueadoAte = agora + politica.bloqueioMs;
    c.falhas = [];
  }
  contadores.set(id, c);
}

/** Quantas tentativas ainda restam (para a tela avisar antes de bloquear). */
export function tentativasRestantes(nome: NomeLimite, chave: string): number {
  const politica = POLITICAS[nome];
  const c = contadores.get(identidade(nome, chave));
  if (!c) return politica.tentativas;
  if (c.bloqueadoAte > Date.now()) return 0;
  const agora = Date.now();
  const vivas = c.falhas.filter((t) => agora - t < politica.janelaMs).length;
  return Math.max(0, politica.tentativas - vivas);
}

/** Zera o contador — chamado quando a credencial é aceita. */
export function limparTentativas(nome: NomeLimite, chave: string): void {
  contadores.delete(identidade(nome, chave));
}

/** Só para teste: começa do zero. */
export function limparTodosOsLimites(): void {
  contadores.clear();
}
