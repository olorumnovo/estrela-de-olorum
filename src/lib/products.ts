export function normalizeProductName(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\bCamisa\b/gi, (match) =>
      match === match.toUpperCase() ? "CAMISETA" : "Camiseta"
    );
}

export function normalizeProductForDisplay<T extends { nome: string }>(product: T): T {
  return {
    ...product,
    nome: normalizeProductName(product.nome),
  };
}
