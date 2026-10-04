/* PLACEHOLDER — substituído pelo agente dono deste arquivo (veja docs/EQUIPE.md). */
import { Hono } from "hono";
const r = new Hono();
r.all("*", (c) => c.json({ error: { code: "indisponivel", message: "Rota ainda não implementada: subscription" } }, 503));
export default r;
