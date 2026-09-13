export const brl = (cents) =>
  "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const brlParts = (cents) => {
  const [int, dec] = (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split(",");
  return { int, dec };
};

export const pct = (from, to) => Math.round((1 - to / from) * 100);
