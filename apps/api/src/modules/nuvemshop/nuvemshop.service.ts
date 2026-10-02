import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { NuvemshopConfig } from './nuvemshop.config';
import { NuvemshopAdapter } from './nuvemshop.adapter';
import { ExternalOrderItem } from './commerce-provider.interface';

const PROVIDER = 'nuvemshop';

/**
 * Núcleo da integração Nuvemshop.
 *
 * Entrada (webhooks de pedido):
 *   order/paid      -> baixa de estoque (NUVEMSHOP_SALE), idempotente por item
 *   order/cancelled -> devolução (CUSTOMER_RETURN), idempotente por item
 * Saída (outbox):
 *   PUBLISH_STOCK   -> envia a quantidade disponível para a variante no canal
 * Mapeamento:
 *   por SKU (external_variant_mappings), com fallback direto por SKU do item.
 *
 * Segurança: nada processa a menos que a config esteja operacional (flag + credenciais)
 * e, para pedidos, que o HMAC do webhook tenha sido validado.
 */
@Injectable()
export class NuvemshopService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Nuvemshop');
  private outboxTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryService,
    private readonly config: NuvemshopConfig,
    private readonly adapter: NuvemshopAdapter,
  ) {}

  onModuleInit(): void {
    if (this.config.canWrite) {
      // Worker do outbox só roda com a ESCRITA habilitada (publica estoque na loja).
      this.outboxTimer = setInterval(() => {
        this.processOutbox(20).catch((e) => this.logger.error(`Outbox: ${String(e)}`));
      }, 30_000);
      this.logger.log('Integração Nuvemshop ATIVA (leitura + escrita). Worker de outbox iniciado.');
    } else if (this.config.isOperational) {
      this.logger.log('Integração Nuvemshop em modo SOMENTE LEITURA (WRITE_ENABLED=false). Nada será escrito na loja.');
    }
  }
  onModuleDestroy(): void {
    if (this.outboxTimer) clearInterval(this.outboxTimer);
  }

  private dedupeKey(event: string, externalId: string | null, payload: unknown): string {
    const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex').slice(0, 16);
    return `${PROVIDER}:${event}:${externalId ?? 'na'}:${hash}`;
  }

  /** Grava o webhook de forma idempotente. Retorna o id se armazenado, ou null se duplicado. */
  async ingest(input: {
    event: string; externalId: string | null; hmacValid: boolean; payload: unknown;
  }): Promise<{ stored: boolean; id?: string }> {
    const dedupeKey = this.dedupeKey(input.event, input.externalId, input.payload);
    try {
      const rec = await this.prisma.webhookInbox.create({
        data: {
          provider: PROVIDER, event: input.event, externalId: input.externalId,
          hmacValid: input.hmacValid, payload: input.payload as object, dedupeKey,
        },
      });
      this.logger.log(`Webhook ${input.event} recebido (${dedupeKey}) hmac=${input.hmacValid}`);
      return { stored: true, id: rec.id };
    } catch {
      this.logger.warn(`Webhook duplicado ignorado (${dedupeKey})`);
      return { stored: false };
    }
  }

  /** Descobre a org da integração. Para instalação de loja única, usa a primeira org. */
  private async resolveOrgId(): Promise<string | null> {
    const org = await this.prisma.organization.findFirst({ orderBy: { createdAt: 'asc' } });
    return org?.id ?? null;
  }

  /** Resolve a variante interna a partir de um item do pedido (mapeamento por id externo, senão por SKU). */
  private async resolveVariantId(orgId: string, item: ExternalOrderItem): Promise<string | null> {
    if (item.externalVariantId) {
      const map = await this.prisma.externalVariantMapping.findFirst({
        where: { orgId, provider: PROVIDER, externalVariantId: item.externalVariantId },
      });
      if (map) return map.variantId;
    }
    if (item.sku) {
      const v = await this.prisma.productVariant.findFirst({
        where: { orgId, skuNormalized: item.sku.trim().toUpperCase() },
      });
      if (v) return v.id;
    }
    return null;
  }

  /**
   * Processa um pedido do webhook: busca o pedido no canal e aplica os movimentos.
   * Idempotência por (pedido + variante + tipo), então reprocessar o mesmo webhook é seguro.
   */
  async processOrderEvent(event: string, externalOrderId: string): Promise<void> {
    // Baixa/devolução por webhook só ocorre com a ESCRITA habilitada.
    if (!this.config.canWrite) {
      this.logger.log(`Webhook ${event} (${externalOrderId}) recebido, mas escrita desligada — nenhum movimento aplicado.`);
      return;
    }
    const orgId = await this.resolveOrgId();
    if (!orgId) return;

    const isSale = event === 'order/paid';
    const isReturn = event === 'order/cancelled';
    if (!isSale && !isReturn) return; // outros eventos são apenas ingeridos

    const order = await this.adapter.getOrder(externalOrderId);
    const actor = { orgId, userId: null as unknown as string }; // movimento de sistema (userId nulo)

    // Registro do pedido externo (auditoria/conciliação).
    await this.prisma.externalOrder.upsert({
      where: { orgId_provider_externalOrderId: { orgId, provider: PROVIDER, externalOrderId } },
      create: { orgId, provider: PROVIDER, externalOrderId, status: order.status, payload: order as object },
      update: { status: order.status, payload: order as object },
    }).catch(() => undefined);

    for (const item of order.items) {
      if (!item.quantity || item.quantity <= 0) continue;
      const variantId = await this.resolveVariantId(orgId, item);
      if (!variantId) {
        this.logger.warn(`Pedido ${externalOrderId}: item sem mapeamento (variant=${item.externalVariantId} sku=${item.sku}). Ignorado.`);
        continue;
      }
      const key = `${PROVIDER}:${externalOrderId}:${item.externalVariantId ?? item.sku}:${isSale ? 'sale' : 'return'}`;
      try {
        if (isSale) {
          await this.inventory.nuvemshopSale(actor, { variantId, quantity: item.quantity, idempotencyKey: key });
        } else {
          await this.inventory.customerReturn(actor, { variantId, quantity: item.quantity, idempotencyKey: key });
        }
      } catch (e) {
        // Ex.: estoque insuficiente para a baixa. Registra e segue (não derruba o webhook).
        this.logger.error(`Pedido ${externalOrderId} item ${variantId}: ${String(e)}`);
      }
    }
  }

  /** Concilia o catálogo do canal com as variantes internas, mapeando por SKU. (ADMIN) */
  async syncMappings(): Promise<{ matched: number; unmatched: string[]; total: number }> {
    const orgId = await this.resolveOrgId();
    if (!orgId) return { matched: 0, unmatched: [], total: 0 };
    const external = await this.adapter.listVariants();
    let matched = 0;
    const unmatched: string[] = [];
    for (const ev of external) {
      if (!ev.sku) { unmatched.push(`${ev.externalVariantId} (sem sku)`); continue; }
      const internal = await this.prisma.productVariant.findFirst({
        where: { orgId, skuNormalized: ev.sku.trim().toUpperCase() },
      });
      if (!internal) { unmatched.push(ev.sku); continue; }
      await this.prisma.externalVariantMapping.upsert({
        where: { orgId_provider_externalVariantId: { orgId, provider: PROVIDER, externalVariantId: ev.externalVariantId } },
        create: {
          orgId, provider: PROVIDER, variantId: internal.id,
          externalProductId: ev.externalProductId, externalVariantId: ev.externalVariantId, sku: ev.sku,
        },
        update: { variantId: internal.id, externalProductId: ev.externalProductId, sku: ev.sku },
      });
      matched++;
    }
    this.logger.log(`Sync Nuvemshop: ${matched} mapeadas, ${unmatched.length} sem correspondência.`);
    return { matched, unmatched, total: external.length };
  }

  /** Drena jobs PUBLISH_STOCK do outbox, enviando a quantidade disponível ao canal. */
  async processOutbox(limit = 20): Promise<{ processed: number; failed: number; skipped?: string }> {
    // Escrita desligada => não publica nada; jobs permanecem PENDING para quando a escrita for habilitada.
    if (!this.config.canWrite) return { processed: 0, failed: 0, skipped: 'write-disabled' };
    const jobs = await this.prisma.outboxJob.findMany({
      where: { type: 'PUBLISH_STOCK', status: 'PENDING', runAfter: { lte: new Date() } },
      orderBy: { runAfter: 'asc' },
      take: limit,
    });
    let processed = 0, failed = 0;
    for (const job of jobs) {
      const payload = job.payload as { variantId?: string };
      const variantId = payload?.variantId;
      try {
        if (!variantId) throw new Error('payload sem variantId');
        const map = await this.prisma.externalVariantMapping.findFirst({
          where: { orgId: job.orgId, provider: PROVIDER, variantId },
        });
        if (!map) {
          // Sem mapeamento => nada a publicar; conclui para não reprocessar eternamente.
          await this.prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'DONE' } });
          continue;
        }
        const agg = await this.prisma.stockBalance.aggregate({
          where: { variantId }, _sum: { onHand: true, reserved: true },
        });
        const available = Math.max(0, (agg._sum.onHand ?? 0) - (agg._sum.reserved ?? 0));
        await this.adapter.publishStock({
          externalProductId: map.externalProductId,
          externalVariantId: map.externalVariantId,
          available,
        });
        await this.prisma.outboxJob.update({ where: { id: job.id }, data: { status: 'DONE' } });
        processed++;
      } catch (e) {
        failed++;
        const attempts = job.attempts + 1;
        const giveUp = attempts >= 6;
        await this.prisma.outboxJob.update({
          where: { id: job.id },
          data: {
            attempts,
            status: giveUp ? 'FAILED' : 'PENDING',
            lastError: String(e).slice(0, 500),
            runAfter: new Date(Date.now() + Math.min(60_000 * attempts, 15 * 60_000)),
          },
        });
      }
    }
    return { processed, failed };
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

  status() {
    return {
      enabled: this.config.enabled,
      operational: this.config.isOperational,
      writeEnabled: this.config.writeEnabled,
      mode: this.config.canWrite ? 'leitura+escrita' : (this.config.isOperational ? 'somente-leitura' : 'inativa'),
      storeId: this.config.storeId ? `***${this.config.storeId.slice(-3)}` : null,
      apiVersion: this.config.apiVersion,
    };
  }
}
