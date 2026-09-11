import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  DomainError,
  NegativeStockError,
  VariantNotFoundError,
  InvalidQuantityError,
  AdjustmentReasonRequiredError,
} from '../../domain/inventory/inventory.errors';

/** Resposta de erro padronizada: código, mensagem amigável, detalhes, correlationId, status. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();
    const correlationId = (req.headers['x-correlation-id'] as string) || randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'ERRO_INTERNO';
    let message = 'Ocorreu um erro inesperado.';
    let details: unknown = undefined;

    if (exception instanceof NegativeStockError) {
      status = HttpStatus.CONFLICT;
    } else if (exception instanceof VariantNotFoundError) {
      status = HttpStatus.NOT_FOUND;
    } else if (
      exception instanceof InvalidQuantityError ||
      exception instanceof AdjustmentReasonRequiredError
    ) {
      status = HttpStatus.UNPROCESSABLE_ENTITY;
    }

    if (exception instanceof DomainError) {
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resp = exception.getResponse();
      code = statusToCode(status);
      message = typeof resp === 'string' ? resp : ((resp as { message?: string }).message ?? message);
      details = typeof resp === 'object' ? resp : undefined;
    } else if (exception instanceof Error) {
      this.logger.error(`[${correlationId}] ${exception.message}`, exception.stack);
    }

    res.status(status).json({
      error: { code, message, details, correlationId, statusCode: status },
    });
  }
}

function statusToCode(status: number): string {
  const map: Record<number, string> = {
    400: 'REQUISICAO_INVALIDA',
    401: 'NAO_AUTENTICADO',
    403: 'ACESSO_NEGADO',
    404: 'NAO_ENCONTRADO',
    409: 'CONFLITO',
    422: 'ENTIDADE_NAO_PROCESSAVEL',
    429: 'MUITAS_REQUISICOES',
  };
  return map[status] ?? 'ERRO';
}
