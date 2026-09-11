import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../../common/guards/rbac';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'reports', version: '1' })
export class ReportsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('stock')
  @Roles('ADMIN','MANAGER','STOCK_OPERATOR','VIEWER')
  async stock(@CurrentUser() u: AuthUser, @Query('lowStock') lowStock?: string, @Query('threshold') threshold?: string) {
    const th = Number(threshold) || 5;
    const rows = await this.prisma.stockBalance.findMany({
      where: { orgId: u.orgId }, include: { variant: { include: { product: true } } },
    });
    const mapped = rows.map(r => ({
      sku: r.variant.sku, product: r.variant.product.name, color: r.variant.color, size: r.variant.size,
      onHand: r.onHand, reserved: r.reserved, available: r.onHand - r.reserved,
    }));
    return lowStock === 'true' ? mapped.filter(m => m.available <= th) : mapped;
  }

  @Get('stock.csv')
  @Roles('ADMIN','MANAGER','VIEWER')
  async stockCsv(@CurrentUser() u: AuthUser, @Res() res: any) {
    const rows = await this.prisma.stockBalance.findMany({
      where: { orgId: u.orgId }, include: { variant: { include: { product: true } } },
    });
    const header = 'sku,produto,cor,tamanho,on_hand,reserved,available';
    const lines = rows.map(r => [
      r.variant.sku, r.variant.product.name, r.variant.color ?? '', r.variant.size ?? '',
      r.onHand, r.reserved, r.onHand - r.reserved,
    ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="estoque.csv"');
    res.send([header, ...lines].join('\n'));
  }
}
