import { MOVEMENT_EFFECTS, MovementType } from './movement-types';
import {
  ApplyMovementInput,
  InventoryRepository,
  InventoryUnitOfWork,
  Movement,
  available,
} from './inventory.types';
import {
  AdjustmentReasonRequiredError,
  InvalidQuantityError,
  NegativeStockError,
} from './inventory.errors';

function assertPositiveInteger(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new InvalidQuantityError(quantity);
  }
}

/**
 * Aplica UMA movimentação dentro de uma unidade de trabalho já aberta (transação).
 * Reutilizável por operações compostas (ex.: montagem de kit).
 *
 * Garantias:
 *  - Idempotência: se a idempotencyKey já existe, retorna a movimentação anterior (no-op).
 *  - Atomicidade: lockBalance faz SELECT ... FOR UPDATE (impl. Prisma).
 *  - Nunca negativo: saída exige available >= quantidade, exceto ADJUSTMENT_OUT
 *    autorizado (allowNegative) com justificativa.
 */
export async function applyMovementInUow(
  uow: InventoryUnitOfWork,
  input: ApplyMovementInput,
): Promise<Movement> {
  assertPositiveInteger(input.quantity);

  if (input.idempotencyKey) {
    const existing = await uow.findMovementByIdempotencyKey(input.orgId, input.idempotencyKey);
    if (existing) {
      return existing; // requisição repetida (duplo clique / reenvio de webhook) — ignorada
    }
  }

  const effect = MOVEMENT_EFFECTS[input.type];
  const balance = await uow.lockBalance(input.orgId, input.locationId, input.variantId);

  const prevOnHand = balance.onHand;
  const prevReserved = balance.reserved;

  const deltaOnHand = effect.onHand * input.quantity;
  const deltaReserved = effect.reserved * input.quantity;

  const newOnHand = prevOnHand + deltaOnHand;
  const newReserved = prevReserved + deltaReserved;

  // Regra de disponibilidade para saídas físicas e reservas.
  if (effect.requiresAvailability) {
    const avail = available({ onHand: prevOnHand, reserved: prevReserved });
    const authorizedNegative = input.type === MovementType.ADJUSTMENT_OUT && input.allowNegative === true;
    if (input.quantity > avail && !authorizedNegative) {
      throw new NegativeStockError({
        variantId: input.variantId,
        locationId: input.locationId,
        requested: input.quantity,
        available: avail,
      });
    }
  }

  if (input.type === MovementType.ADJUSTMENT_OUT && input.allowNegative === true) {
    if (!input.reason || input.reason.trim().length === 0) {
      throw new AdjustmentReasonRequiredError();
    }
  }

  // Invariantes finais: reserved nunca negativo; on_hand só < 0 em ajuste autorizado.
  if (newReserved < 0) {
    throw new NegativeStockError({
      variantId: input.variantId,
      locationId: input.locationId,
      requested: input.quantity,
      available: prevReserved,
    });
  }

  const movement: Movement = {
    id: uow.newId(),
    orgId: input.orgId,
    locationId: input.locationId,
    variantId: input.variantId,
    type: input.type,
    quantity: input.quantity,
    previousOnHand: prevOnHand,
    newOnHand,
    previousReserved: prevReserved,
    newReserved,
    userId: input.userId ?? null,
    origin: input.origin,
    reason: input.reason ?? null,
    externalOrderNumber: input.externalOrderNumber ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    reversalOfMovementId: input.reversalOfMovementId ?? null,
    groupId: input.groupId ?? null,
    metadata: input.metadata ?? null,
    createdAt: uow.now(),
  };

  const inserted = await uow.insertMovement(movement);
  await uow.upsertBalance({
    orgId: input.orgId,
    locationId: input.locationId,
    variantId: input.variantId,
    onHand: newOnHand,
    reserved: newReserved,
  });

  return inserted;
}

export interface KitComponentInput {
  variantId: string;
  quantityPerKit: number;
}

export interface AssembleKitInput {
  orgId: string;
  locationId: string;
  kitVariantId: string;
  components: KitComponentInput[];
  quantity: number; // quantos kits montar
  userId?: string | null;
  origin: string;
  idempotencyKey?: string | null;
  reason?: string | null;
}

/**
 * Motor de estoque. Opera sempre dentro de transações do repositório.
 */
export class InventoryEngine {
  constructor(private readonly repo: InventoryRepository) {}

  /** Aplica uma movimentação simples em sua própria transação. */
  applyMovement(input: ApplyMovementInput): Promise<Movement> {
    return this.repo.transaction((uow) => applyMovementInUow(uow, input));
  }

  /** Entrada de produção (atalho semântico). */
  productionEntry(
    input: Omit<ApplyMovementInput, 'type'> & { photoLabelsToPrint?: number },
  ): Promise<Movement> {
    return this.applyMovement({ ...input, type: MovementType.PRODUCTION_ENTRY });
  }

  /** Venda/baixa manual (atalho semântico). */
  manualSale(input: Omit<ApplyMovementInput, 'type'>): Promise<Movement> {
    return this.applyMovement({ ...input, type: MovementType.MANUAL_SALE });
  }

  /**
   * Montagem de conjunto físico (STOCKED_KIT):
   *  - dá baixa em cada componente (KIT_ASSEMBLY / saída);
   *  - dá entrada no SKU do conjunto;
   *  - tudo na MESMA transação, vinculado por groupId.
   * Nunca contabiliza a peça como disponível individual e dentro do kit ao mesmo tempo.
   */
  async assembleKit(input: AssembleKitInput): Promise<Movement[]> {
    assertPositiveInteger(input.quantity);
    return this.repo.transaction(async (uow) => {
      // Idempotência da operação inteira.
      if (input.idempotencyKey) {
        const existing = await uow.findMovementByIdempotencyKey(input.orgId, input.idempotencyKey);
        if (existing && existing.groupId) {
          return [existing];
        }
      }
      const groupId = uow.newId();
      const movements: Movement[] = [];

      // 1) Baixa dos componentes (exige disponibilidade -> nunca negativo).
      for (const comp of input.components) {
        const m = await applyMovementInUow(uow, {
          orgId: input.orgId,
          locationId: input.locationId,
          variantId: comp.variantId,
          type: MovementType.MANUAL_SALE, // saída física de componente; efeito on_hand -1, exige disponibilidade
          quantity: comp.quantityPerKit * input.quantity,
          userId: input.userId,
          origin: input.origin,
          reason: input.reason ?? 'Montagem de conjunto',
          groupId,
          metadata: { operation: 'KIT_ASSEMBLY', kitVariantId: input.kitVariantId },
        });
        movements.push(m);
      }

      // 2) Entrada no SKU do conjunto.
      const kitIn = await applyMovementInUow(uow, {
        orgId: input.orgId,
        locationId: input.locationId,
        variantId: input.kitVariantId,
        type: MovementType.KIT_ASSEMBLY,
        quantity: input.quantity,
        userId: input.userId,
        origin: input.origin,
        reason: input.reason ?? 'Montagem de conjunto',
        idempotencyKey: input.idempotencyKey ?? null,
        groupId,
        metadata: { operation: 'KIT_ASSEMBLY', components: input.components },
      });
      movements.push(kitIn);

      return movements;
    });
  }
}
