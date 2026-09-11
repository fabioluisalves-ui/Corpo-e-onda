import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import {
  Balance,
  InventoryRepository,
  InventoryUnitOfWork,
  Movement,
} from '../../domain/inventory/inventory.types';

/**
 * Implementação da porta do motor de estoque sobre PostgreSQL/Prisma.
 *
 * Pontos-chave de confiabilidade:
 *  - Toda operação roda dentro de prisma.$transaction (interactive).
 *  - lockBalance usa SELECT ... FOR UPDATE para bloquear a linha do saldo,
 *    impedindo que operações concorrentes gerem estoque negativo.
 *  - A idempotência também é garantida no banco pelo índice único
 *    (orgId, idempotencyKey) — se dois processos passarem pela verificação,
 *    o INSERT concorrente falha e a transação sofre rollback.
 */
@Injectable()
export class PrismaInventoryRepository implements InventoryRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(fn: (uow: InventoryUnitOfWork) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const uow: InventoryUnitOfWork = {
          newId: () => randomUUID(),
          now: () => new Date(),

          async findMovementByIdempotencyKey(orgId, key) {
            const m = await tx.inventoryMovement.findFirst({
              where: { orgId, idempotencyKey: key },
            });
            return m ? mapMovement(m) : null;
          },

          async lockBalance(orgId, locationId, variantId) {
            // Bloqueio pessimista da linha do saldo.
            const rows = await tx.$queryRaw<Array<{ onHand: number; reserved: number }>>(Prisma.sql`
              SELECT "onHand", "reserved"
              FROM "stock_balances"
              WHERE "orgId" = ${orgId}::uuid
                AND "locationId" = ${locationId}::uuid
                AND "variantId" = ${variantId}::uuid
              FOR UPDATE
            `);
            if (rows.length > 0) {
              return { orgId, locationId, variantId, onHand: rows[0].onHand, reserved: rows[0].reserved };
            }
            // Cria a linha zerada e bloqueia. Se outra transação criar ao mesmo tempo,
            // o UNIQUE (orgId, locationId, variantId) força serialização/rollback.
            await tx.stockBalance.create({
              data: { orgId, locationId, variantId, onHand: 0, reserved: 0 },
            });
            return { orgId, locationId, variantId, onHand: 0, reserved: 0 };
          },

          async insertMovement(m) {
            const created = await tx.inventoryMovement.create({
              data: {
                id: m.id,
                orgId: m.orgId,
                locationId: m.locationId,
                variantId: m.variantId,
                type: m.type as Prisma.InventoryMovementCreateInput['type'],
                quantity: m.quantity,
                previousOnHand: m.previousOnHand,
                newOnHand: m.newOnHand,
                previousReserved: m.previousReserved,
                newReserved: m.newReserved,
                userId: m.userId,
                origin: m.origin,
                reason: m.reason,
                externalOrderNumber: m.externalOrderNumber,
                idempotencyKey: m.idempotencyKey,
                reversalOfMovementId: m.reversalOfMovementId,
                groupId: m.groupId,
                metadata: (m.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
              },
            });
            return mapMovement(created);
          },

          async upsertBalance(b: Balance) {
            await tx.stockBalance.update({
              where: {
                orgId_locationId_variantId: {
                  orgId: b.orgId,
                  locationId: b.locationId,
                  variantId: b.variantId,
                },
              },
              data: { onHand: b.onHand, reserved: b.reserved },
            });
          },
        };

        return fn(uow);
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000 },
    );
  }
}

function mapMovement(m: {
  id: string; orgId: string; locationId: string; variantId: string; type: string;
  quantity: number; previousOnHand: number; newOnHand: number; previousReserved: number;
  newReserved: number; userId: string | null; origin: string; reason: string | null;
  externalOrderNumber: string | null; idempotencyKey: string | null;
  reversalOfMovementId: string | null; groupId: string | null; metadata: unknown; createdAt: Date;
}): Movement {
  return {
    id: m.id, orgId: m.orgId, locationId: m.locationId, variantId: m.variantId,
    type: m.type as Movement['type'], quantity: m.quantity,
    previousOnHand: m.previousOnHand, newOnHand: m.newOnHand,
    previousReserved: m.previousReserved, newReserved: m.newReserved,
    userId: m.userId, origin: m.origin, reason: m.reason,
    externalOrderNumber: m.externalOrderNumber, idempotencyKey: m.idempotencyKey,
    reversalOfMovementId: m.reversalOfMovementId, groupId: m.groupId,
    metadata: (m.metadata as Record<string, unknown> | null) ?? null, createdAt: m.createdAt,
  };
}
