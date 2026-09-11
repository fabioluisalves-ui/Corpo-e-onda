/**
 * Disponibilidade de CONJUNTO VIRTUAL (VIRTUAL_KIT).
 *
 * O kit virtual não tem estoque próprio: sua disponibilidade é calculada
 * a partir do estoque disponível de cada componente.
 *
 * Ex.: 1 Top Sunset Preto P + 1 Calcinha Sunset Preto P.
 * Se há 10 tops e 6 calcinhas -> disponibilidade do conjunto = 6.
 */
export interface KitComponentAvailability {
  variantId: string;
  quantityPerKit: number; // quantas unidades deste componente cada kit consome
  available: number; // disponibilidade atual do componente (on_hand - reserved)
}

export function computeVirtualKitAvailability(components: KitComponentAvailability[]): number {
  if (components.length === 0) return 0;
  let min = Infinity;
  for (const c of components) {
    if (c.quantityPerKit <= 0) continue;
    const possible = Math.floor(c.available / c.quantityPerKit);
    if (possible < min) min = possible;
  }
  return min === Infinity ? 0 : Math.max(0, min);
}
