/* Roda o gerador de QR do navegador dentro do Node, em tempo de build,
   para que a landing não precise carregar qr.js só por um código estático. */
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const sandbox = {};
const prev = globalThis.window;
globalThis.window = sandbox;
require("../../assets/js/qr.js");
globalThis.window = prev;

export const qrSvg = (text, opts = {}) => sandbox.NLQR.toSvg(text, opts);
