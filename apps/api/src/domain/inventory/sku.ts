/**
 * Geração e normalização de SKU.
 *
 * Regra: o SKU é único SEM diferenciação entre maiúsculas/minúsculas.
 * Persistimos o valor como digitado (para exibição) e mantemos uma coluna
 * normalizada (sku_normalized) com UNIQUE para garantir a unicidade real.
 */

/** Remove acentos, mantém A-Z 0-9 e hífen. Usado em cada segmento do SKU. */
export function slugSegment(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacríticos
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Normaliza um SKU completo para comparação de unicidade (case-insensitive). */
export function normalizeSku(sku: string): string {
  return sku.trim().toUpperCase();
}

export interface SkuParts {
  categoryCode?: string; // ex.: TOP, CALC
  model: string; // ex.: Maré
  colorCode: string; // ex.: AZC (Azul Céu)
  size: string; // P, M, G, GG
}

/**
 * Sugere um SKU a partir de categoria/modelo/cor/tamanho.
 * O administrador pode editar antes de salvar.
 * Ex.: { categoryCode:'TOP', model:'Maré', colorCode:'AZC', size:'P' } -> TOP-MARE-AZC-P
 */
export function suggestSku(parts: SkuParts): string {
  const segments = [parts.categoryCode, parts.model, parts.colorCode, parts.size]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map(slugSegment)
    .filter((s) => s.length > 0);
  return segments.join('-');
}

/** Valida formato aceitável de SKU (segmentos alfanuméricos separados por hífen). */
export function isValidSku(sku: string): boolean {
  return /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/.test(sku.trim());
}
