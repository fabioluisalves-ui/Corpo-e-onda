import { Body, Controller, Get, Param, Post, Req, HttpCode } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { NuvemshopService } from './nuvemshop.service';

@ApiTags('nuvemshop')
@Controller({ path: '', version: '1' })
export class NuvemshopController {
  constructor(private readonly service: NuvemshopService) {}

  // Webhook público: rate-limited, grava primeiro, valida HMAC, processa idempotente.
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Post('integrations/nuvemshop/webhooks')
  @HttpCode(200)
  async webhook(@Req() req: any, @Body() body: any) {
    const event = body?.event ?? req.headers['x-event'] ?? 'unknown';
    const externalId = body?.id ? String(body.id) : null;
    // A validação HMAC real usa o corpo BRUTO + segredo (ver NuvemshopAdapter.verifyWebhook).
    // Enquanto a flag está desativada, marcamos hmacValid=false e apenas ingerimos.
    const hmacValid = false;
    await this.service.ingest({ provider: 'nuvemshop', event, externalId, hmacValid, payload: body });
    return { received: true };
  }

  // Consulta pública somente-leitura por SKU. Nunca executa baixa/entrada.
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('public/availability/:sku')
  async availability(@Param('sku') sku: string) {
    const res = await this.service.publicAvailabilityBySku(sku);
    return res ?? { sku, available: 0 };
  }
}
