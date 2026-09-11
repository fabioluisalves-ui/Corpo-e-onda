/** Erros de domínio do estoque. Mapeados para HTTP no filtro de exceções. */

export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NegativeStockError extends DomainError {
  constructor(details: { variantId: string; locationId: string; requested: number; available: number }) {
    super(
      'ESTOQUE_NEGATIVO',
      'A operação deixaria o estoque negativo. Ajustes abaixo de zero exigem autorização de administrador com justificativa.',
      details,
    );
  }
}

export class VariantNotFoundError extends DomainError {
  constructor(details: Record<string, unknown>) {
    super('VARIANTE_NAO_ENCONTRADA', 'Variante não encontrada para o SKU/código informado.', details);
  }
}

export class InvalidQuantityError extends DomainError {
  constructor(quantity: number) {
    super('QUANTIDADE_INVALIDA', 'A quantidade deve ser um inteiro positivo.', { quantity });
  }
}

export class AdjustmentReasonRequiredError extends DomainError {
  constructor() {
    super('JUSTIFICATIVA_OBRIGATORIA', 'Ajustes autorizados exigem justificativa obrigatória.');
  }
}
