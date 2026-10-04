/* Páginas renderizadas no servidor. Cada tela é uma função em web/pages. */
import { Hono } from "hono";
const r = new Hono();
r.get("/", (c) => c.redirect("/entrar"));
r.all("*", (c) => c.html("<p>Tela ainda não implementada.</p>", 503));
export default r;
