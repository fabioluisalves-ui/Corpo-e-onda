import { MovementType } from './movement-types';

export interface Balance {
  orgId: string;
  locationId: string;
  variantId: string;
  onHand: number; // quantidade física
  reserved: number; // quantidade reservada
}

export function available(b: Pick<Balance, 'onHand' | 'reserved'>): number {
  return b.onHand - b.reserved;
}

export interface Movement {
  id: string;
  orgId: string;
  locationId: string;
  variantId: string;
  type: MovementType;
  quantity: number; // sempre positivo; o sinal vem do tipo
  previousOnHand: number;
  newOnHand: number;
  previousReserved: number;
  newReserved: number;
  userId: string | null;
  origin: string; // ex.: 'PRODUCTION_UI', 'NUVEMSHOP_WEBHOOK'
  reason: string | null;
  externalOrderNumber: string | null;
  idempotencyKey: string | null;
  reversalOfMovementId: string | null;
  groupId: string | null; // vincula movimentações da mesma operação (ex.: montagem de kit)
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/** Entrada para aplicar UMA movimentação sobre UM saldo. */
export interface ApplyMovementInput {
  orgId: string;
  locationId: string;
  variantId: string;
  type: MovementType;
  quantity: number;
  userId?: string | null;
  origin: string;
  reason?: string | null;
  externalOrderNumber?: string | null;
  idempotencyKey?: string | null;
  reversalOfMovementId?: string | null;
  groupId?: string | null;
  metadata?: Record<string, unknown> | null;
  /** Permite saldo negativo APENAS em ADJUSTMENT_OUT autorizado por admin + justificativa. */
  allowNegative?: boolean;
}

/**
 * Unidade de trabalho executada DENTRO de uma transação PostgreSQL.
 * A implementação real (Prisma) usa SELECT ... FOR UPDATE em lockBalance
 * para impedir concorrência que gere estoque negativo.
 */
export interface InventoryUnitOfWork {
  /** Idempotência: retorna a movimentação já registrada com esta chave, se houver. */
  findMovementByIdempotencyKey(orgId: string, key: string): Promise<Movement | null>;
  /** Bloqueia (FOR UPDATE) e retorna o saldo; cria zerado se não existir. */
  lockBalance(orgId: string, locationId: string, variantId: string): Promise<Balance>;
  insertMovement(movement: Movement): Promise<Movement>;
  upsertBalance(balance: Balance): Promise<void>;
  newId(): string;
  now(): Date;
}

export interface InventoryRepository {
  /** Executa fn dentro de UMA transação. Rollback automático em caso de erro. */
  transaction<T>(fn: (uow: InventoryUnitOfWork) => Promise<T>): Promise<T>;
}
