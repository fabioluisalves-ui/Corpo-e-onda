import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { normalizeSku, suggestSku, isValidSku, SkuParts } from '../../domain/inventory/sku';
import { generateCode128Svg } from '../../domain/barcode/code128';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  listProducts(orgId: string, take = 50, skip = 0) {
    return this.prisma.product.findMany({
      where: { orgId }, include: { variants: true },
      orderBy: { name: 'asc' }, take: Math.min(take, 200), skip,
    });
  }

  createProduct(orgId: string, data: { name: string; category?: string; kind?: 'SINGLE'|'STOCKED_KIT'|'VIRTUAL_KIT'; description?: string; photoUrl?: string }) {
    return this.prisma.product.create({ data: { orgId, ...data } });
  }

  suggest(parts: SkuParts): string { return suggestSku(parts); }

  async createVariant(orgId: string, data: {
    productId: string; sku: string; color?: string; size?: string; priceCents?: number; gtin?: string;
  }) {
    if (!isValidSku(data.sku)) throw new ConflictException('SKU em formato inválido.');
    const skuNormalized = normalizeSku(data.sku);
    const exists = await this.prisma.productVariant.findFirst({ where: { orgId, skuNormalized } });
    if (exists) throw new ConflictException('Já existe uma variante com este SKU (ignorando maiúsculas/minúsculas).');

    const variant = await this.prisma.productVariant.create({
      data: { orgId, productId: data.productId, sku: data.sku, skuNormalized,
        color: data.color, size: data.size, priceCents: data.priceCents, gtin: data.gtin },
    });
    // internal_barcode = Code128 do SKU (nunca vai para o campo GTIN da Nuvemshop)
    await this.prisma.barcode.create({ data: { orgId, variantId: variant.id, kind: 'INTERNAL', value: variant.sku } });
    if (data.gtin) {
      await this.prisma.barcode.create({ data: { orgId, variantId: variant.id, kind: 'GTIN', value: data.gtin } });
    }
    return variant;
  }

  listVariants(orgId: string, take = 50, skip = 0) {
    return this.prisma.productVariant.findMany({
      where: { orgId }, include: { product: true },
      orderBy: { sku: 'asc' }, take: Math.min(take, 200), skip,
    });
  }

  async barcodeSvg(orgId: string, sku: string): Promise<string> {
    return generateCode128Svg(sku);
  }
}
