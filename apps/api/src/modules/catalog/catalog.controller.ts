import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, MinLength } from 'class-validator';
import { CatalogService } from './catalog.service';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../../common/guards/rbac';

class CreateProductDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsIn(['SINGLE','STOCKED_KIT','VIRTUAL_KIT']) kind?: 'SINGLE'|'STOCKED_KIT'|'VIRTUAL_KIT';
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() photoUrl?: string;
}
class CreateVariantDto {
  @IsString() productId!: string;
  @IsString() @MinLength(1) sku!: string;
  @IsOptional() @IsString() color?: string;
  @IsOptional() @IsString() size?: string;
  @IsOptional() @IsInt() priceCents?: number;
  @IsOptional() @IsString() gtin?: string;
}

@ApiTags('catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: '', version: '1' })
export class CatalogController {
  constructor(private readonly service: CatalogService) {}

  @Get('products')
  @Roles('ADMIN','MANAGER','STOCK_OPERATOR','VIEWER')
  products(@CurrentUser() u: AuthUser, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.service.listProducts(u.orgId, Number(take)||50, Number(skip)||0);
  }

  @Post('products')
  @Roles('ADMIN','MANAGER')
  createProduct(@CurrentUser() u: AuthUser, @Body() dto: CreateProductDto) {
    return this.service.createProduct(u.orgId, dto);
  }

  @Get('variants')
  @Roles('ADMIN','MANAGER','STOCK_OPERATOR','VIEWER')
  variants(@CurrentUser() u: AuthUser, @Query('take') take?: string, @Query('skip') skip?: string) {
    return this.service.listVariants(u.orgId, Number(take)||50, Number(skip)||0);
  }

  @Post('variants')
  @Roles('ADMIN','MANAGER')
  createVariant(@CurrentUser() u: AuthUser, @Body() dto: CreateVariantDto) {
    return this.service.createVariant(u.orgId, dto);
  }

  @Get('variants/sku/suggest')
  @Roles('ADMIN','MANAGER')
  suggest(@Query('categoryCode') categoryCode?: string, @Query('model') model?: string,
          @Query('colorCode') colorCode?: string, @Query('size') size?: string) {
    return { sku: this.service.suggest({ categoryCode, model: model||'', colorCode: colorCode||'', size: size||'' }) };
  }
}
