import { createHmac, timingSafeEqual } from 'node:crypto';
import { CommerceProvider, ExternalVariant } from './commerce-provider.interface';

/**
 * Adapter da Nuvemshop (Tiendanube). Esqueleto de produção.
 *
 * IMPORTANTE:
 *  - Só deve ser ativado com feature flag + credenciais OAuth2 válidas.
 *  - Tokens ficam criptografados no banco; NUNCA vão para o navegador.
 *  - O internal_barcode (Code128 do SKU) NÃO é enviado ao campo barcode/GTIN.
 *    Sincroniza-se o SKU como SKU e apenas um GTIN oficial como barcode externo.
 *  - Endpoints/versão devem ser conferidos na documentação oficial antes do go-live:
 *    https://tiendanube.github.io/api-documentation/intro
 *
 * As chamadas HTTP reais estão marcadas como PENDENTE_CREDENCIAIS.
 */
export interface NuvemshopConfig {
  storeId: string;
  accessToken: string; // descriptografado em memória, curto período
  webhookSecret: string;
  baseUrl?: string; // ex.: https://api.tiendanube.com/v1/{store_id}
}

export class NuvemshopAdapter implements CommerceProvider {
  readonly name = 'nuvemshop';
  constructor(private readonly config: NuvemshopConfig) {}

  async listVariants(): Promise<ExternalVariant[]> {
    // PENDENTE_CREDENCIAIS: GET /products?fields=id,variants (paginado) e mapear por SKU.
    throw new Error('NuvemshopAdapter.listVariants requer credenciais e feature flag habilitada.');
  }

  async publishStock(_input: { externalVariantId: string; externalLocationId?: string; available: number }): Promise<void> {
    // PENDENTE_CREDENCIAIS: PUT de inventory_levels / variante conforme documentação atual.
    throw new Error('NuvemshopAdapter.publishStock requer credenciais e feature flag habilitada.');
  }

  /** Validação HMAC do webhook (confirmar cabeçalho/algoritmo na doc oficial antes do go-live). */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean {
    const provided = headers['x-linkedstore-hmac-sha256'] || headers['http-x-linkedstore-hmac-sha256'];
    if (!provided) return false;
    const digest = createHmac('sha256', this.config.webhookSecret).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(digest), Buffer.from(provided));
    } catch {
      return false;
    }
  }
}
