/* =========================================================================
   Nutri&Live — BR Code do Pix (EMV®QRCPS-MPM) e o QR em SVG

   Duas coisas já existem no projeto e são reaproveitadas aqui em vez de
   reescritas:
     1. o payload do BR Code com CRC16/CCITT-FALSE, igual ao de
        assets/js/checkout.js (mesmo beneficiário, mesmo formato);
     2. o codificador de QR de assets/js/qr.js, que desenha a matriz de
        verdade (ISO/IEC 18004) e é carregado aqui sem rede e sem build.

   O arquivo assets/js/qr.js é um IIFE de navegador: ele recebe o objeto
   global e pendura `NLQR` nele. Carregamos num objeto nosso, para não sujar
   o globalThis do servidor.
   ========================================================================= */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

/* ------------------------------ CRC16 e TLV ------------------------------ */
/** CRC16/CCITT-FALSE, polinômio 0x1021, semente 0xFFFF — exigência do BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return `0000${crc.toString(16).toUpperCase()}`.slice(-4);
}

/** Campo no formato id + tamanho em dois dígitos + valor. */
export const tlv = (id: string, valor: string): string =>
  id + `00${valor.length}`.slice(-2) + valor;

/** Identificador da transação: até 25 caracteres, só A-Z0-9. */
export function txidDe(semente: string): string {
  const limpo = semente.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return `NL${limpo}`.slice(0, 25) || "NL";
}

export const BENEFICIARIO = {
  chave: "pagamentos@nutrielive.com.br",
  nome: "NUTRI E LIVE TECNOLOGIA",
  cidade: "SAO PAULO"
};

/**
 * Monta o BR Code estático-com-valor de uso único.
 * `cents` é inteiro em centavos; o BR Code pede o valor em reais com ponto.
 */
export function brCode(cents: number, txid: string): string {
  const valor = (cents / 100).toFixed(2);
  const mai = tlv("00", "br.gov.bcb.pix") + tlv("01", BENEFICIARIO.chave);
  const payload =
    tlv("00", "01") +
    tlv("01", "12") +            // uso único, com valor
    tlv("26", mai) +
    tlv("52", "0000") +
    tlv("53", "986") +           // BRL
    tlv("54", valor) +
    tlv("58", "BR") +
    tlv("59", BENEFICIARIO.nome) +
    tlv("60", BENEFICIARIO.cidade) +
    tlv("62", tlv("05", txid)) +
    "6304";
  return payload + crc16(payload);
}

/** Confere o CRC de um BR Code recebido. Usado no teste. */
export function brCodeValido(codigo: string): boolean {
  if (codigo.length < 8) return false;
  const corpo = codigo.slice(0, -4);
  const crc = codigo.slice(-4);
  return corpo.endsWith("6304") && crc16(corpo) === crc;
}

/* ----------------------------- QR de verdade ----------------------------- */
interface ApiQr {
  encode(texto: string, ecc?: string): { size: number; modules: boolean[][]; version: number };
  toSvg(texto: string, opts?: Record<string, unknown>): string;
}

let apiQr: ApiQr | null = null;

/** Caminhos possíveis de assets/js/qr.js, rodando de server/ ou de dist/. */
function caminhoQr(): string | null {
  const aqui = dirname(fileURLToPath(import.meta.url));
  const candidatos = [
    resolve(aqui, "../../../assets/js/qr.js"),      // app/server/billing -> raiz
    resolve(aqui, "../../../../assets/js/qr.js"),   // dist/server/billing -> raiz
    resolve(process.cwd(), "../assets/js/qr.js"),   // npm run dev dentro de app/
    resolve(process.cwd(), "assets/js/qr.js")
  ];
  return candidatos.find((p) => existsSync(p)) ?? null;
}

function carregarQr(): ApiQr | null {
  if (apiQr) return apiQr;
  const caminho = caminhoQr();
  if (!caminho) return null;
  const fonte = readFileSync(caminho, "utf8");
  /* O IIFE recebe o global e pendura NLQR nele. Damos a ele um objeto nosso. */
  const caixa: { NLQR?: ApiQr } = {};
  // eslint-disable-next-line no-new-func
  const executar = new Function("globalThis", fonte) as (g: unknown) => void;
  executar(caixa);
  apiQr = caixa.NLQR ?? null;
  return apiQr;
}

/** SVG do QR do BR Code. Devolve null se o gerador não for encontrado. */
export function qrSvg(codigo: string, rotulo = "QR Code do Pix"): string | null {
  const api = carregarQr();
  if (!api) return null;
  return api.toSvg(codigo, { ecc: "M", border: 2, dark: "#06120D", light: "#FFFFFF", label: rotulo });
}

/** O mesmo SVG em base64, que é o que o contrato chama de `qrCodeBase64`. */
export function qrBase64(codigo: string, rotulo?: string): string | undefined {
  const svg = qrSvg(codigo, rotulo);
  if (!svg) return undefined;
  return Buffer.from(svg, "utf8").toString("base64");
}

/** Tamanho da matriz — serve de prova de que o QR foi realmente gerado. */
export function dimensaoQr(codigo: string): number | null {
  const api = carregarQr();
  if (!api) return null;
  return api.encode(codigo, "M").size;
}
