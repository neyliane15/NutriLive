/* =========================================================================
   Nutri&Live — dado que uma pessoa digita não executa na tela de outra

   Todas as telas são string de HTML concatenada. Funciona, mas só enquanto
   cada dado livre passa por `esc`. Um ponto esquecido num campo que OUTRA
   pessoa preenche não é bug de tela: é a sessão de quem olha na mão de
   quem escolheu o próprio nome. Foi exatamente o caso de `shell({title})`,
   que recebia o nome do paciente sem escape.

   A asserção é o payload NÃO aparecer literal na saída, e aparecer na
   forma escapada. Procurar por "<img" ou "onerror=" solto reprova código
   correto: as telas têm ícones SVG próprios, e `onerror=` dentro de
   `nome="&lt;img onerror=&quot;…&quot;&gt;"` é texto inerte. As duas
   versões anteriores deste arquivo erraram assim.
   ========================================================================= */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { orgPessoa, type FichaDados } from "../web/pages/org-pessoa.js";
import { linhaMembro } from "../web/pages/org-pessoas.js";
import { linhaUsuario } from "../web/pages/admin-usuarios.js";
import { linhaPagamento } from "../web/pages/admin-pagamentos.js";
import type { ShellUser } from "../web/layout.js";

/* As três formas de sair de um contexto HTML: fechar a tag, fechar o
   atributo, e o <title>, que tem regra de parsing própria. */
const PAYLOADS = [
  '</h1><img src=x onerror="alert(1)">',
  '</title><script>alert(1)</script>',
  '"><svg onload=alert(1)>',
  "Maria'><iframe src=javascript:alert(1)>"
];

const escapado = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * O payload tem de aparecer — é o nome que a pessoa digitou e quem atende
 * precisa ver — mas só escapado.
 */
function inerte(html: string, payload: string, onde: string): void {
  assert.ok(
    !html.includes(payload),
    `${onde}: o payload saiu literal no HTML, então o navegador o executa`
  );
  assert.ok(
    html.includes(escapado(payload)),
    `${onde}: o payload não apareceu nem escapado — o dado sumiu da tela em vez de ser escapado`
  );
}

const nutri = { name: "Dra. Ana Lima", role: "nutricionista", orgName: "Consultório Lima" } as ShellUser;

const ficha = (nome: string): FichaDados => ({
  user: { id: "u1", name: nome, email: "x@exemplo.com.br", createdAt: new Date().toISOString() },
  profile: null, weights: [], adherence: [], plans: [], notes: [], link: null
} as unknown as FichaDados);

describe("XSS", () => {
  for (const payload of PAYLOADS) {
    const curto = payload.slice(0, 22);

    it(`ficha da pessoa (título da página) — ${curto}…`, () => {
      const html = orgPessoa({ user: nutri, userId: "u1", dados: ficha(payload) });
      inerte(html, payload, "orgPessoa");
      /* Se o nome fechasse o <title>, o resto do documento voltaria a ser
         renderizável: um </title> a mais é o sintoma. */
      assert.equal((html.match(/<\/title>/g) ?? []).length, 1, "orgPessoa: o nome fechou o <title>");
      assert.equal((html.match(/<h1 class="app-title">/g) ?? []).length, 1, "orgPessoa: o nome mexeu no <h1>");
    });

    it(`lista de pacientes — ${curto}…`, () => {
      inerte(linhaMembro({
        userId: "u1", name: payload, email: "a@exemplo.com.br", status: "ativo",
        adherencePct: 80, lastActiveAt: null, planCount: 0
      } as never, "/pessoas", "paciente"), payload, "linhaMembro");
    });

    it(`usuários do admin — ${curto}…`, () => {
      inerte(linhaUsuario({
        id: "u1", name: payload, email: "a@exemplo.com.br", role: "pessoal",
        status: "ativo", orgName: null, createdAt: new Date().toISOString()
      } as never), payload, "linhaUsuario");
    });

    it(`pagamentos do admin — ${curto}…`, () => {
      inerte(linhaPagamento({
        id: "p1", userName: payload, userEmail: "a@exemplo.com.br", amountCents: 3990,
        method: "pix", status: "aprovado", createdAt: new Date().toISOString()
      } as never), payload, "linhaPagamento");
    });
  }
});
