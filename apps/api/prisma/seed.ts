import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { normalizeSku } from '../src/domain/inventory/sku';

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.create({ data: { name: 'Corpo & Onda' } });

  const location = await prisma.stockLocation.create({
    data: { orgId: org.id, name: 'Estoque Principal', code: 'PRINCIPAL', isDefault: true },
  });

  const senha = await argon2.hash('MudarSenha123!', { type: argon2.argon2id });
  const usuarios: Array<{ email: string; name: string; role: 'ADMIN' | 'MANAGER' | 'STOCK_OPERATOR' | 'VIEWER' }> = [
    { email: 'admin@corpoonda.com.br', name: 'Administradora', role: 'ADMIN' },
    { email: 'gestor@corpoonda.com.br', name: 'Gestor', role: 'MANAGER' },
    { email: 'operador@corpoonda.com.br', name: 'Operador de Estoque', role: 'STOCK_OPERATOR' },
    { email: 'consulta@corpoonda.com.br', name: 'Consulta', role: 'VIEWER' },
  ];
  for (const u of usuarios) {
    const user = await prisma.user.create({
      data: { orgId: org.id, email: u.email, name: u.name, passwordHash: senha },
    });
    await prisma.membership.create({ data: { orgId: org.id, userId: user.id, role: u.role } });
  }

  // Produto SINGLE: Top Maré
  const topMare = await prisma.product.create({
    data: { orgId: org.id, name: 'Top Maré', category: 'Moda Praia', kind: 'SINGLE' },
  });

  async function criarVariante(productId: string, sku: string, color: string, size: string, priceCents: number) {
    const v = await prisma.productVariant.create({
      data: { orgId: org.id, productId, sku, skuNormalized: normalizeSku(sku), color, size, priceCents },
    });
    await prisma.barcode.create({ data: { orgId: org.id, variantId: v.id, kind: 'INTERNAL', value: v.sku } });
    await prisma.stockBalance.create({ data: { orgId: org.id, locationId: location.id, variantId: v.id, onHand: 0, reserved: 0 } });
    return v;
  }

  await criarVariante(topMare.id, 'TOP-MARE-AZC-P', 'Azul Céu', 'P', 8990);
  await criarVariante(topMare.id, 'TOP-MARE-AZC-M', 'Azul Céu', 'M', 8990);
  await criarVariante(topMare.id, 'TOP-MARE-PTO-P', 'Preto', 'P', 8990);

  // Componentes para conjunto virtual Sunset
  const topSunset = await prisma.product.create({ data: { orgId: org.id, name: 'Top Sunset', category: 'Moda Praia', kind: 'SINGLE' } });
  const calcSunset = await prisma.product.create({ data: { orgId: org.id, name: 'Calcinha Sunset', category: 'Moda Praia', kind: 'SINGLE' } });
  const vTop = await criarVariante(topSunset.id, 'TOP-SUNSET-PTO-P', 'Preto', 'P', 8990);
  const vCal = await criarVariante(calcSunset.id, 'CALC-SUNSET-PTO-P', 'Preto', 'P', 6990);

  // Conjunto VIRTUAL_KIT Sunset Preto P
  const cjSunset = await prisma.product.create({ data: { orgId: org.id, name: 'Conjunto Sunset', category: 'Conjuntos', kind: 'VIRTUAL_KIT' } });
  const vKit = await criarVariante(cjSunset.id, 'CJ-SUNSET-PTO-P', 'Preto', 'P', 14990);
  await prisma.kitComponent.create({ data: { orgId: org.id, kitVariantId: vKit.id, componentId: vTop.id, quantityPerKit: 1 } });
  await prisma.kitComponent.create({ data: { orgId: org.id, kitVariantId: vKit.id, componentId: vCal.id, quantityPerKit: 1 } });

  // eslint-disable-next-line no-console
  console.log('Seed concluído. Login inicial: admin@corpoonda.com.br / MudarSenha123!');
}

main().finally(() => prisma.$disconnect());
