/* Log em uma linha por evento, legível no terminal e parseável em produção. */
const stamp = () => new Date().toISOString();
const out = (level: string, msg: string, extra?: unknown) => {
  const line = `${stamp()} ${level.padEnd(5)} ${msg}`;
  if (extra instanceof Error) console.error(line, "\n", extra.stack);
  else if (extra !== undefined) console.log(line, JSON.stringify(extra));
  else console.log(line);
};

export const log = {
  info: (m: string, e?: unknown) => out("INFO", m, e),
  warn: (m: string, e?: unknown) => out("WARN", m, e),
  error: (m: string, e?: unknown) => out("ERRO", m, e),
  debug: (m: string, e?: unknown) => { if (process.env.NODE_ENV !== "production") out("DEBG", m, e); }
};
