/**
 * Abstração do canal de venda. O backend é a fonte central de estoque;
 * a Nuvemshop é tratada como um canal. Implementações concretas:
 *  - MockCommerceProvider (desenvolvimento/testes; nunca chama a rede)
 *  - NuvemshopAdapter (produção, atrás de feature flag + credenciais)
 */
export interface ExternalVariant {
  externalProductId: string;
  externalVariantId: string;
  sku: string | null;
  gtin: string | null;
}

export interface PublishStockInput {
  externalProductId: string;
  externalVariantId: string;
  available: number;
}

/** Item de um pedido, normalizado a partir do canal. */
export interface ExternalOrderItem {
  externalVariantId: string | null;
  sku: string | null;
  quantity: number;
}

export interface ExternalOrder {
  externalOrderId: string;
  status: string;
  paymentStatus?: string | null;
  items: ExternalOrderItem[];
}

export interface CommerceProvider {
  readonly name: string;
  /** Lista variantes do canal (para conciliação/mapeamento por SKU). */
  listVariants(): Promise<ExternalVariant[]>;
  /** Publica a quantidade disponível de uma variante no canal. */
  publishStock(input: PublishStockInput): Promise<void>;
  /** Busca um pedido pelo id externo (para processar webhooks de pedido). */
  getOrder(externalOrderId: string): Promise<ExternalOrder>;
  /** Valida a autenticidade de um webhook conforme a documentação oficial. */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean;
}
