import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';

/**
 * Processamento de webhooks:
 *  1. grava o payload bruto em webhook_inbox (dedupeKey evita duplicatas),
 *  2. valida autenticidade (HMAC) — feito no controller com o corpo bruto,
 *  3. processa de forma idempotente.
 *
 * Fluxo de pedidos (order/*): a implementação de reserva->venda->devolução
 * usa o InventoryEngine (RESERVATION / *_SALE / CUSTOMER_RETURN) e é acionada
 * apenas com a feature flag habilitada. Aqui deixamos a ingestão idempotente pronta.
 */
@Injectable()
export class NuvemshopService {
  private readonly logger = new Logger('Nuvemshop');
  constructor(private readonly prisma: PrismaService) {}

  private dedupeKey(provider: string, event: string, externalId: string | null, payload: unknown): string {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
    return `${provider}:${event}:${externalId ?? 'na'}:${hash}`;
  }

  /** Grava o webhook de forma idempotente. Retorna false se já existia (duplicado). */
  async ingest(input: {
    provider: string; event: string; externalId: string | null; hmacValid: boolean; payload: unknown;
  }): Promise<{ stored: boolean; id?: string }> {
    const dedupeKey = this.dedupeKey(input.provider, input.event, input.externalId, input.payload);
    try {
      const rec = await this.prisma.webhookInbox.create({
        data: {
          provider: input.provider, event: input.event, externalId: input.externalId,
          hmacValid: input.hmacValid, payload: input.payload as object, dedupeKey,
        },
      });
      this.logger.log(`Webhook recebido ${input.event} (${dedupeKey})`);
      return { stored: true, id: rec.id };
    } catch (e) {
      // Violação de unique(dedupeKey) => webhook repetido; ignorado com sucesso.
      this.logger.warn(`Webhook duplicado ignorado (${dedupeKey})`);
      return { stored: false };
    }
  }

  /** Consulta pública somente-leitura de disponibilidade por SKU. */
  async publicAvailabilityBySku(sku: string): Promise<{ sku: string; available: number } | null> {
    const variant = await this.prisma.productVariant.findFirst({
      where: { skuNormalized: sku.trim().toUpperCase() },
    });
    if (!variant) return null;
    const agg = await this.prisma.stockBalance.aggregate({
      where: { variantId: variant.id }, _sum: { onHand: true, reserved: true },
    });
    const available = (agg._sum.onHand ?? 0) - (agg._sum.reserved ?? 0);
    return { sku: variant.sku, available: Math.max(0, available) };
  }
}
