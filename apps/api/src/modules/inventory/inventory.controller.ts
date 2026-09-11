import { Body, Controller, Get, Headers, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiTags } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { ProductionEntryDto, ManualSaleDto, AdjustmentDto, AssembleKitDto } from './inventory.dto';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../../common/guards/rbac';

@ApiTags('inventory')
@ApiBearerAuth()
@ApiHeader({ name: 'Idempotency-Key', required: false, description: 'Evita reprocessar a mesma operação' })
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'inventory', version: '1' })
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get('variants/lookup')
  @Roles('ADMIN', 'MANAGER', 'STOCK_OPERATOR', 'VIEWER')
  lookup(@CurrentUser() user: AuthUser, @Query('barcode') barcode: string) {
    return this.service.lookupVariant(user.orgId, barcode);
  }

  @Post('production-entry')
  @Roles('ADMIN', 'MANAGER', 'STOCK_OPERATOR')
  productionEntry(
    @CurrentUser() user: AuthUser,
    @Body() dto: ProductionEntryDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.productionEntry(
      { orgId: user.orgId, userId: user.userId },
      { ...dto, idempotencyKey },
    );
  }

  @Post('manual-sale')
  @Roles('ADMIN', 'MANAGER', 'STOCK_OPERATOR')
  manualSale(
    @CurrentUser() user: AuthUser,
    @Body() dto: ManualSaleDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.manualSale(
      { orgId: user.orgId, userId: user.userId },
      { ...dto, idempotencyKey },
    );
  }

  @Post('adjustment')
  @Roles('ADMIN', 'MANAGER') // ajuste autorizado apenas para admin/gestor
  adjustment(
    @CurrentUser() user: AuthUser,
    @Body() dto: AdjustmentDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.adjustment(
      { orgId: user.orgId, userId: user.userId },
      { ...dto, idempotencyKey },
    );
  }

  @Post('kits/assemble')
  @Roles('ADMIN', 'MANAGER', 'STOCK_OPERATOR')
  assemble(
    @CurrentUser() user: AuthUser,
    @Body() dto: AssembleKitDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.service.assembleKit(
      { orgId: user.orgId, userId: user.userId },
      { ...dto, idempotencyKey },
    );
  }

  @Get()
  @Roles('ADMIN', 'MANAGER', 'STOCK_OPERATOR', 'VIEWER')
  stock(@CurrentUser() user: AuthUser, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.service.currentStock(user.orgId, Number(take) || 50, Number(skip) || 0);
  }

  @Get('movements')
  @Roles('ADMIN', 'MANAGER', 'STOCK_OPERATOR', 'VIEWER')
  movements(
    @CurrentUser() user: AuthUser,
    @Query('variantId') variantId?: string,
    @Query('type') type?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    return this.service.listMovements(user.orgId, {
      variantId,
      type,
      take: Number(take) || 50,
      skip: Number(skip) || 0,
    });
  }
}
