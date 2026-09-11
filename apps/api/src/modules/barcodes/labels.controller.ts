import { Body, Controller, Post, Res, UseGuards, Query, Get, Header } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsArray, IsInt, IsOptional, IsString, ValidateNested, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../common/prisma.service';
import { generateCode128Svg } from '../../domain/barcode/code128';
import { generateLabelsPdf, LabelJob } from '../../domain/labels/label-pdf';
import { JwtAuthGuard, RolesGuard, Roles, CurrentUser, AuthUser } from '../../common/guards/rbac';

class LabelItemDto {
  @IsString() variantId!: string;
  @IsInt() @IsPositive() copies!: number;
}
class LabelsPdfDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => LabelItemDto)
  items!: LabelItemDto[];
  @IsOptional() @IsInt() widthMm?: number;
  @IsOptional() @IsInt() heightMm?: number;
}
class GenerateBarcodeDto { @IsString() text!: string; }

@ApiTags('barcodes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: '', version: '1' })
export class LabelsController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('barcodes/generate')
  @Header('Content-Type', 'image/svg+xml')
  @Roles('ADMIN','MANAGER','STOCK_OPERATOR')
  generate(@Body() dto: GenerateBarcodeDto) { return generateCode128Svg(dto.text); }

  // Reimpressão NÃO altera estoque.
  @Post('labels/pdf')
  @Roles('ADMIN','MANAGER','STOCK_OPERATOR')
  async labelsPdf(@CurrentUser() u: AuthUser, @Body() dto: LabelsPdfDto, @Res() res: any) {
    const jobs: LabelJob[] = [];
    for (const it of dto.items) {
      const v = await this.prisma.productVariant.findFirst({
        where: { id: it.variantId, orgId: u.orgId }, include: { product: true },
      });
      if (!v) continue;
      jobs.push({
        label: { productName: v.product.name, color: v.color ?? '-', size: v.size ?? '-', sku: v.sku },
        copies: it.copies,
      });
    }
    const pdf = await generateLabelsPdf(jobs, { widthMm: dto.widthMm ?? 50, heightMm: dto.heightMm ?? 30 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="etiquetas.pdf"');
    res.send(pdf);
  }
}
