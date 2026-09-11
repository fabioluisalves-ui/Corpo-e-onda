import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { PrismaInventoryRepository } from './prisma-inventory.repository';
import { InventoryEngine } from '../../domain/inventory/inventory-engine';
import { MovementType } from '../../domain/inventory/movement-types';
import { VariantNotFoundError } from '../../domain/inventory/inventory.errors';
import { normalizeSku } from '../../domain/inventory/sku';
import { computeVirtualKitAvailability } from '../../domain/kits/kit-availability';

interface Actor {
  orgId: string;
  userId: string;
}

@Injectable()
export class InventoryService {
  private readonly engine: InventoryEngine;

  constructor(
    private readonly prisma: PrismaService,
    repo: PrismaInventoryRepository,
  ) {
    this.engine = new InventoryEngine(repo);
  }

  /** Resolve variante por SKU exato ou por código de barras (internal_barcode). */
  async lookupVariant(orgId: string, barcodeOrSku: string) {
    const value = barcodeOrSku.trim();
    const bySku = await this.prisma.productVariant.findFirst({
      where: { orgId, skuNormalized: normalizeSku(value) },
      include: { product: true },
    });
    if (bySku) return bySku;

    const byBarcode = await this.prisma.barcode.findFirst({
      where: { orgId, value },
      include: { variant: { include: { product: true } } },
    });
    if (byBarcode) return byBarcode.variant;

    throw new VariantNotFoundError({ barcodeOrSku });
  }

  private async defaultLocationId(orgId: string): Promise<string> {
    const loc = await this.prisma.stockLocation.findFirst({
      where: { orgId },
      orderBy: { isDefault: 'desc' },
    });
    if (!loc) throw new VariantNotFoundError({ reason: 'Nenhum local de estoque configurado' });
    return loc.id;
  }

  async productionEntry(
    actor: Actor,
    input: { barcodeOrSku: string; quantity: number; idempotencyKey?: string; reason?: string },
  ) {
    const variant = await this.lookupVariant(actor.orgId, input.barcodeOrSku);
    const locationId = await this.defaultLocationId(actor.orgId);
    const movement = await this.engine.productionEntry({
      orgId: actor.orgId,
      locationId,
      variantId: variant.id,
      quantity: input.quantity,
      userId: actor.userId,
      origin: 'PRODUCTION_UI',
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    await this.afterMovement(actor, variant.id, locationId, 'PRODUCTION_ENTRY', movement.id);
    return { movement, variant };
  }

  async manualSale(
    actor: Actor,
    input: { barcodeOrSku: string; quantity: number; idempotencyKey?: string; reason?: string },
  ) {
    const variant = await this.lookupVariant(actor.orgId, input.barcodeOrSku);
    const locationId = await this.defaultLocationId(actor.orgId);
    const movement = await this.engine.manualSale({
      orgId: actor.orgId,
      locationId,
      variantId: variant.id,
      quantity: input.quantity,
      userId: actor.userId,
      origin: 'MANUAL_SALE_UI',
      reason: input.reason,
      idempotencyKey: input.idempotencyKey,
    });
    await this.afterMovement(actor, variant.id, locationId, 'MANUAL_SALE', movement.id);
    return { movement, variant };
  }

  async adjustment(
    actor: Actor,
    input: {
      barcodeOrSku: string;
      quantity: number;
      direction: 'IN' | 'OUT';
      reason: string;
      allowNegative?: boolean;
      idempotencyKey?: string;
    },
  ) {
    const variant = await this.lookupVariant(actor.orgId, input.barcodeOrSku);
    const locationId = await this.defaultLocationId(actor.orgId);
    const type = input.direction === 'IN' ? MovementType.ADJUSTMENT_IN : MovementType.ADJUSTMENT_OUT;
    const movement = await this.engine.applyMovement({
      orgId: actor.orgId,
      locationId,
      variantId: variant.id,
      type,
      quantity: input.quantity,
      userId: actor.userId,
      origin: 'ADJUSTMENT_UI',
      reason: input.reason,
      allowNegative: input.allowNegative,
      idempotencyKey: input.idempotencyKey,
    });
    await this.afterMovement(actor, variant.id, locationId, type, movement.id);
    return { movement, variant };
  }

  async assembleKit(
    actor: Actor,
    input: { kitBarcodeOrSku: string; quantity: number; idempotencyKey?: string },
  ) {
    const kit = await this.lookupVariant(actor.orgId, input.kitBarcodeOrSku);
    const locationId = await this.defaultLocationId(actor.orgId);
    const components = await this.prisma.kitComponent.findMany({ where: { kitVariantId: kit.id } });
    const movements = await this.engine.assembleKit({
      orgId: actor.orgId,
      locationId,
      kitVariantId: kit.id,
      components: components.map((c) => ({ variantId: c.componentId, quantityPerKit: c.quantityPerKit })),
      quantity: input.quantity,
      userId: actor.userId,
      origin: 'KIT_UI',
      idempotencyKey: input.idempotencyKey,
    });
    return { movements };
  }

  /** Disponibilidade de kit virtual calculada em tempo real. */
  async virtualKitAvailability(orgId: string, kitVariantId: string): Promise<number> {
    const components = await this.prisma.kitComponent.findMany({ where: { kitVariantId } });
    const withAvail = await Promise.all(
      components.map(async (c) => {
        const bal = await this.prisma.stockBalance.aggregate({
          where: { orgId, variantId: c.componentId },
          _sum: { onHand: true, reserved: true },
        });
        const onHand = bal._sum.onHand ?? 0;
        const reserved = bal._sum.reserved ?? 0;
        return { variantId: c.componentId, quantityPerKit: c.quantityPerKit, available: onHand - reserved };
      }),
    );
    return computeVirtualKitAvailability(withAvail);
  }

  /** Registra auditoria e enfileira publicação de estoque na Nuvemshop (fora da transação). */
  private async afterMovement(
    actor: Actor,
    variantId: string,
    locationId: string,
    action: string,
    movementId: string,
  ): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        orgId: actor.orgId,
        userId: actor.userId,
        action: `INVENTORY_${action}`,
        entity: 'inventory_movement',
        entityId: movementId,
      },
    });
    // Outbox transacional: um worker publica a quantidade disponível na Nuvemshop
    // de forma assíncrona (nunca dentro da transação que confirmou o movimento).
    await this.prisma.outboxJob.create({
      data: {
        orgId: actor.orgId,
        type: 'PUBLISH_STOCK',
        payload: { variantId, locationId },
      },
    });
  }

  async listMovements(orgId: string, query: { variantId?: string; type?: string; take?: number; skip?: number }) {
    const take = Math.min(query.take ?? 50, 200);
    return this.prisma.inventoryMovement.findMany({
      where: {
        orgId,
        ...(query.variantId ? { variantId: query.variantId } : {}),
        ...(query.type ? { type: query.type as MovementType } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take,
      skip: query.skip ?? 0,
    });
  }

  async currentStock(orgId: string, take = 50, skip = 0) {
    return this.prisma.stockBalance.findMany({
      where: { orgId },
      include: { variant: { include: { product: true } } },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(take, 200),
      skip,
    });
  }
}
