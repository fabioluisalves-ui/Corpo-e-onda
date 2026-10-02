import {
  CommerceProvider,
  ExternalOrder,
  ExternalVariant,
  PublishStockInput,
} from './commerce-provider.interface';

/** Provider simulado — NUNCA faz chamadas externas. Usado quando a flag Nuvemshop está desligada. */
export class MockCommerceProvider implements CommerceProvider {
  readonly name = 'mock';
  private published: PublishStockInput[] = [];

  async listVariants(): Promise<ExternalVariant[]> {
    return [
      { externalProductId: '1001', externalVariantId: '2001', sku: 'TOP-MARE-AZC-P', gtin: null },
    ];
  }
  async publishStock(input: PublishStockInput): Promise<void> {
    this.published.push(input);
  }
  async getOrder(externalOrderId: string): Promise<ExternalOrder> {
    return {
      externalOrderId,
      status: 'open',
      paymentStatus: 'paid',
      items: [{ externalVariantId: '2001', sku: 'TOP-MARE-AZC-P', quantity: 1 }],
    };
  }
  verifyWebhook(): boolean {
    return true;
  }
  getPublished(): PublishStockInput[] {
    return this.published;
  }
}
