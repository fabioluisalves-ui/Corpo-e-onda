/**
 * Abstração do canal de venda. O backend é a fonte central de estoque;
 * a Nuvemshop é tratada como um canal. Implementações concretas:
 *  - MockCommerceProvider (desenvolvimento/testes)
 *  - NuvemshopAdapter (produção, atrás de feature flag + credenciais)
 */
export interface ExternalVariant {
  externalProductId: string;
  externalVariantId: string;
  sku: string | null;
  gtin: string | null;
}

export interface CommerceProvider {
  readonly name: string;
  /** Lista variantes do canal (para conciliação/mapeamento por SKU). */
  listVariants(): Promise<ExternalVariant[]>;
  /** Publica a quantidade disponível de uma variante no canal. */
  publishStock(input: { externalVariantId: string; externalLocationId?: string; available: number }): Promise<void>;
  /** Valida a autenticidade de um webhook conforme a documentação oficial. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean;
}
