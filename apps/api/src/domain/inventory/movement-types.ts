/**
 * Tipos de movimentação do livro de estoque (fonte histórica imutável).
 * Cada tipo define como afeta on_hand e reserved.
 */
export enum MovementType {
  PRODUCTION_ENTRY = 'PRODUCTION_ENTRY',
  PURCHASE_ENTRY = 'PURCHASE_ENTRY',
  MANUAL_SALE = 'MANUAL_SALE',
  NUVEMSHOP_SALE = 'NUVEMSHOP_SALE',
  CUSTOMER_RETURN = 'CUSTOMER_RETURN',
  ADJUSTMENT_IN = 'ADJUSTMENT_IN',
  ADJUSTMENT_OUT = 'ADJUSTMENT_OUT',
  KIT_ASSEMBLY = 'KIT_ASSEMBLY',
  KIT_DISASSEMBLY = 'KIT_DISASSEMBLY',
  RESERVATION = 'RESERVATION',
  RESERVATION_RELEASE = 'RESERVATION_RELEASE',
}

/** Como cada tipo afeta os saldos. */
export interface MovementEffect {
  /** Delta aplicado ao on_hand (quantidade física). */
  onHand: 1 | -1 | 0;
  /** Delta aplicado ao reserved (quantidade reservada). */
  reserved: 1 | -1 | 0;
  /** Exige disponibilidade (available >= qty) antes de aplicar. */
  requiresAvailability: boolean;
}

export const MOVEMENT_EFFECTS: Record<MovementType, MovementEffect> = {
  [MovementType.PRODUCTION_ENTRY]: { onHand: 1, reserved: 0, requiresAvailability: false },
  [MovementType.PURCHASE_ENTRY]: { onHand: 1, reserved: 0, requiresAvailability: false },
  [MovementType.CUSTOMER_RETURN]: { onHand: 1, reserved: 0, requiresAvailability: false },
  [MovementType.ADJUSTMENT_IN]: { onHand: 1, reserved: 0, requiresAvailability: false },
  [MovementType.MANUAL_SALE]: { onHand: -1, reserved: 0, requiresAvailability: true },
  [MovementType.NUVEMSHOP_SALE]: { onHand: -1, reserved: 0, requiresAvailability: true },
  [MovementType.ADJUSTMENT_OUT]: { onHand: -1, reserved: 0, requiresAvailability: true },
  // Componentes/kit são tratados como múltiplos itens no assembleKit; o efeito base
  // de uma linha KIT_ASSEMBLY sobre um SKU montado (produto do kit) é entrada:
  [MovementType.KIT_ASSEMBLY]: { onHand: 1, reserved: 0, requiresAvailability: false },
  [MovementType.KIT_DISASSEMBLY]: { onHand: -1, reserved: 0, requiresAvailability: true },
  [MovementType.RESERVATION]: { onHand: 0, reserved: 1, requiresAvailability: true },
  [MovementType.RESERVATION_RELEASE]: { onHand: 0, reserved: -1, requiresAvailability: false },
};

/** Movimentos de saída física (para relatórios e KPIs). */
export const OUTFLOW_TYPES: ReadonlySet<MovementType> = new Set([
  MovementType.MANUAL_SALE,
  MovementType.NUVEMSHOP_SALE,
  MovementType.ADJUSTMENT_OUT,
]);

/** Movimentos de entrada física. */
export const INFLOW_TYPES: ReadonlySet<MovementType> = new Set([
  MovementType.PRODUCTION_ENTRY,
  MovementType.PURCHASE_ENTRY,
  MovementType.CUSTOMER_RETURN,
  MovementType.ADJUSTMENT_IN,
]);
