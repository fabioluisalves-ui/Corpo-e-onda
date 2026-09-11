import { CommerceProvider, ExternalVariant } from './commerce-provider.interface';

/** Provider simulado — NUNCA faz chamadas externas. Usado enquanto a flag Nuvemshop está desativada. */
export class MockCommerceProvider implements CommerceProvider {
  readonly name = 'mock';
  private published: Array<{ externalVariantId: string; available: number }> = [];

  async listVariants(): Promise<ExternalVariant[]> {
    return [
      { externalProductId: '1001', externalVariantId: '2001', sku: 'TOP-MARE-AZC-P', gtin: null },
    ];
  }
  async publishStock(input: { externalVariantId: string; available: number }): Promise<void> {
    this.published.push({ externalVariantId: input.externalVariantId, available: input.available });
  }
  verifyWebhook(): boolean { return true; }
  getPublished() { return this.published; }
}
