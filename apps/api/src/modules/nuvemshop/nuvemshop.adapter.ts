import { Injectable, Logger } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { NuvemshopConfig } from './nuvemshop.config';
import {
  CommerceProvider,
  ExternalOrder,
  ExternalVariant,
  PublishStockInput,
} from './commerce-provider.interface';

/**
 * Adapter real da Nuvemshop (Tiendanube).
 *
 * Regras de negócio importantes:
 *  - Só chama a rede quando a config está operacional (flag + credenciais).
 *  - Cabeçalho de auth é "Authentication: bearer TOKEN" (peculiaridade da Nuvemshop;
 *    NÃO é "Authorization"). User-Agent é obrigatório, senão a API responde 400.
 *  - O internal_barcode (Code128 do SKU) NUNCA é enviado como GTIN/barcode do canal.
 *    Sincronizamos o SKU como identificador; estoque é enviado no campo "stock".
 *  - HMAC do webhook: SHA-256 em hex sobre o CORPO BRUTO, segredo = client_secret do app.
 */
@Injectable()
export class NuvemshopAdapter implements CommerceProvider {
  readonly name = 'nuvemshop';
  private readonly logger = new Logger('NuvemshopAdapter');

  constructor(private readonly config: NuvemshopConfig) {}

  private headers(withBody = false): Record<string, string> {
    const h: Record<string, string> = {
      Authentication: `bearer ${this.config.accessToken}`,
      'User-Agent': this.config.userAgent,
      Accept: 'application/json',
    };
    if (withBody) h['Content-Type'] = 'application/json; charset=utf-8';
    return h;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<{ data: T; res: Response }> {
    if (!this.config.isOperational) {
      throw new Error('Integração Nuvemshop inativa (flag desligada ou credenciais ausentes).');
    }
    const url = `${this.config.baseUrl}${path}`;
    const res = await fetch(url, {
      method,
      headers: this.headers(body !== undefined),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    const data = text ? (JSON.parse(text) as T) : (undefined as unknown as T);
    if (!res.ok) {
      this.logger.warn(`Nuvemshop ${method} ${path} -> ${res.status}: ${text.slice(0, 300)}`);
      throw new Error(`Nuvemshop API ${res.status} em ${method} ${path}`);
    }
    return { data, res };
  }

  /** Lista todas as variantes da loja (paginado), achatando produto->variantes. */
  async listVariants(): Promise<ExternalVariant[]> {
    const out: ExternalVariant[] = [];
    let page = 1;
    const perPage = 200;
    // Segurança: teto de páginas para evitar loop acidental.
    for (let guard = 0; guard < 100; guard++) {
      const { data } = await this.request<any[]>(
        'GET',
        `/products?per_page=${perPage}&page=${page}&fields=id,variants`,
      );
      if (!Array.isArray(data) || data.length === 0) break;
      for (const product of data) {
        for (const v of product.variants ?? []) {
          out.push({
            externalProductId: String(product.id),
            externalVariantId: String(v.id),
            sku: v.sku ? String(v.sku) : null,
            gtin: v.barcode ? String(v.barcode) : null,
          });
        }
      }
      if (data.length < perPage) break;
      page++;
    }
    return out;
  }

  /** Publica a quantidade disponível de uma variante (estoque simples, sem multi-local). */
  async publishStock(input: PublishStockInput): Promise<void> {
    await this.request(
      'PUT',
      `/products/${input.externalProductId}/variants/${input.externalVariantId}`,
      { stock: Math.max(0, Math.trunc(input.available)) },
    );
  }

  /** Busca o pedido e normaliza os itens (id da variante, sku, quantidade). */
  async getOrder(externalOrderId: string): Promise<ExternalOrder> {
    const { data } = await this.request<any>('GET', `/orders/${externalOrderId}`);
    const items = (data.products ?? []).map((p: any) => ({
      externalVariantId: p.variant_id != null ? String(p.variant_id) : null,
      sku: p.sku ? String(p.sku) : null,
      quantity: Number(p.quantity ?? 0),
    }));
    return {
      externalOrderId: String(data.id),
      status: String(data.status ?? ''),
      paymentStatus: data.payment_status != null ? String(data.payment_status) : null,
      items,
    };
  }

  /** Validação HMAC do webhook (SHA-256 hex sobre o corpo bruto). */
  verifyWebhook(rawBody: Buffer, headers: Record<string, string>): boolean {
    const provided =
      headers['x-linkedstore-hmac-sha256'] ||
      headers['http-x-linkedstore-hmac-sha256'] ||
      headers['X-LinkedStore-HMAC-SHA256'];
    if (!provided || !this.config.clientSecret) return false;
    const digest = createHmac('sha256', this.config.clientSecret).update(rawBody).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(digest), Buffer.from(provided));
    } catch {
      return false;
    }
  }
}
