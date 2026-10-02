import { Body, Controller, Get, Param, Post, Req, HttpCode, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NuvemshopService } from './nuvemshop.service';
import { NuvemshopAdapter } from './nuvemshop.adapter';
import { NuvemshopConfig } from './nuvemshop.config';
import { JwtAuthGuard, RolesGuard, Roles } from '../../common/guards/rbac';

@ApiTags('nuvemshop')
@Controller({ path: '', version: '1' })
export class NuvemshopController {
  constructor(
    private readonly service: NuvemshopService,
    private readonly adapter: NuvemshopAdapter,
    private readonly config: NuvemshopConfig,
  ) {}

  /**
   * Webhook público. Fluxo: grava (idempotente) -> valida HMAC sobre o corpo BRUTO
   * -> se válido e for pedido, processa a baixa/devolução. Responde 200 sempre,
   * para a Nuvemshop não reenfileirar por causa de erro no processamento.
   */
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('integrations/nuvemshop/webhooks')
  @HttpCode(200)
  async webhook(@Req() req: any, @Body() body: any) {
    const event: string = body?.event ?? req.headers['x-event'] ?? 'unknown';
    const externalId = body?.id != null ? String(body.id) : null;

    const rawBody: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(body ?? {}));
    const hmacValid = this.config.isOperational
      ? this.adapter.verifyWebhook(rawBody, req.headers as Record<string, string>)
      : false;

    await this.service.ingest({ event, externalId, hmacValid, payload: body });

    // Só processa efeitos de estoque com HMAC válido e pedido identificado.
    if (hmacValid && externalId && event.startsWith('order/')) {
      try {
        await this.service.processOrderEvent(event, externalId);
      } catch {
        // Erros de processamento não devem quebrar o ACK do webhook.
      }
    }
    return { received: true };
  }

  /** Consulta pública somente-leitura por SKU. Nunca executa baixa/entrada. */
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public/availability/:sku')
  async availability(@Param('sku') sku: string) {
    const res = await this.service.publicAvailabilityBySku(sku);
    return res ?? { sku, available: 0 };
  }

  /** Status da integração (autenticado). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER', 'STOCK_OPERATOR', 'VIEWER')
  @Get('integrations/nuvemshop/status')
  status() {
    return this.service.status();
  }

  /** Conciliação catálogo->interno por SKU (ADMIN/MANAGER). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('integrations/nuvemshop/sync-mappings')
  syncMappings() {
    return this.service.syncMappings();
  }

  /** Força o processamento imediato do outbox de estoque (ADMIN/MANAGER). */
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'MANAGER')
  @Post('integrations/nuvemshop/process-outbox')
  processOutbox() {
    return this.service.processOutbox(100);
  }
}
