import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryEngine, applyMovementInUow } from '../src/domain/inventory/inventory-engine';
import { MovementType } from '../src/domain/inventory/movement-types';
import { NegativeStockError } from '../src/domain/inventory/inventory.errors';
import { available } from '../src/domain/inventory/inventory.types';
import { suggestSku, normalizeSku } from '../src/domain/inventory/sku';
import { computeVirtualKitAvailability } from '../src/domain/kits/kit-availability';
import { InMemoryInventoryRepository } from './in-memory-repository';

const ORG = 'org-1';
const LOC = 'loc-1';
const V = 'TOP-MARE-AZC-P';

describe('SKU', () => {
  it('sugere SKU a partir de categoria/modelo/cor/tamanho', () => {
    expect(suggestSku({ categoryCode: 'TOP', model: 'Maré', colorCode: 'AZC', size: 'P' })).toBe(
      'TOP-MARE-AZC-P',
    );
  });
  it('unicidade é case-insensitive via normalização', () => {
    expect(normalizeSku('top-mare-azc-p')).toBe(normalizeSku('TOP-MARE-AZC-P'));
  });
});

describe('Conjunto virtual', () => {
  it('disponibilidade = mínimo entre componentes (10 tops, 6 calcinhas -> 6)', () => {
    const avail = computeVirtualKitAvailability([
      { variantId: 'top', quantityPerKit: 1, available: 10 },
      { variantId: 'calcinha', quantityPerKit: 1, available: 6 },
    ]);
    expect(avail).toBe(6);
  });
});

describe('Cenário mínimo de aceite', () => {
  let repo: InMemoryInventoryRepository;
  let engine: InventoryEngine;

  beforeEach(() => {
    repo = new InMemoryInventoryRepository();
    engine = new InventoryEngine(repo);
  });

  it('entrada de produção de 20 -> saldo 20', async () => {
    await engine.productionEntry({
      orgId: ORG,
      locationId: LOC,
      variantId: V,
      quantity: 20,
      origin: 'PRODUCTION_UI',
    });
    expect(repo.getBalance(ORG, LOC, V).onHand).toBe(20);
  });

  it('venda de 3 -> saldo 17; reenvio idempotente mantém 17; venda de 18 é bloqueada', async () => {
    await engine.productionEntry({ orgId: ORG, locationId: LOC, variantId: V, quantity: 20, origin: 'UI' });

    // venda de 3
    await engine.manualSale({
      orgId: ORG,
      locationId: LOC,
      variantId: V,
      quantity: 3,
      origin: 'UI',
      idempotencyKey: 'venda-abc',
    });
    expect(repo.getBalance(ORG, LOC, V).onHand).toBe(17);

    // reenvio da MESMA requisição (mesma idempotencyKey) -> no-op
    await engine.manualSale({
      orgId: ORG,
      locationId: LOC,
      variantId: V,
      quantity: 3,
      origin: 'UI',
      idempotencyKey: 'venda-abc',
    });
    expect(repo.getBalance(ORG, LOC, V).onHand).toBe(17);
    expect(repo.movements.filter((m) => m.type === MovementType.MANUAL_SALE)).toHaveLength(1);

    // tentar vender 18 -> bloqueia, saldo permanece 17
    await expect(
      engine.manualSale({ orgId: ORG, locationId: LOC, variantId: V, quantity: 18, origin: 'UI' }),
    ).rejects.toBeInstanceOf(NegativeStockError);
    expect(repo.getBalance(ORG, LOC, V).onHand).toBe(17);
  });
});

describe('Concorrência: duas vendas simultâneas nunca geram estoque negativo', () => {
  it('estoque 1, duas vendas de 1 em paralelo: uma passa, outra falha', async () => {
    const repo = new InMemoryInventoryRepository();
    const engine = new InventoryEngine(repo);
    await engine.productionEntry({ orgId: ORG, locationId: LOC, variantId: V, quantity: 1, origin: 'UI' });

    const results = await Promise.allSettled([
      engine.manualSale({ orgId: ORG, locationId: LOC, variantId: V, quantity: 1, origin: 'UI' }),
      engine.manualSale({ orgId: ORG, locationId: LOC, variantId: V, quantity: 1, origin: 'UI' }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const fail = results.filter((r) => r.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(repo.getBalance(ORG, LOC, V).onHand).toBe(0);
  });
});

describe('Reservas e disponibilidade', () => {
  it('reserva reduz available sem alterar on_hand; release devolve', async () => {
    const repo = new InMemoryInventoryRepository();
    const engine = new InventoryEngine(repo);
    await engine.productionEntry({ orgId: ORG, locationId: LOC, variantId: V, quantity: 10, origin: 'UI' });

    await engine.applyMovement({
      orgId: ORG, locationId: LOC, variantId: V, type: MovementType.RESERVATION,
      quantity: 4, origin: 'NUVEMSHOP', externalOrderNumber: '1001', idempotencyKey: 'res-1001',
    });
    let b = repo.getBalance(ORG, LOC, V);
    expect(b.onHand).toBe(10);
    expect(b.reserved).toBe(4);
    expect(available(b)).toBe(6);

    await engine.applyMovement({
      orgId: ORG, locationId: LOC, variantId: V, type: MovementType.RESERVATION_RELEASE,
      quantity: 4, origin: 'NUVEMSHOP', externalOrderNumber: '1001', idempotencyKey: 'rel-1001',
    });
    b = repo.getBalance(ORG, LOC, V);
    expect(available(b)).toBe(10);
  });
});

describe('Montagem de conjunto físico (STOCKED_KIT)', () => {
  it('baixa componentes e dá entrada no kit na mesma transação (vinculadas por groupId)', async () => {
    const repo = new InMemoryInventoryRepository();
    const engine = new InventoryEngine(repo);
    const TOP = 'TOP-SUNSET-PTO-P';
    const CAL = 'CALC-SUNSET-PTO-P';
    const KIT = 'CJ-SUNSET-PTO-P';

    await engine.productionEntry({ orgId: ORG, locationId: LOC, variantId: TOP, quantity: 10, origin: 'UI' });
    await engine.productionEntry({ orgId: ORG, locationId: LOC, variantId: CAL, quantity: 6, origin: 'UI' });

    const movs = await engine.assembleKit({
      orgId: ORG, locationId: LOC, kitVariantId: KIT,
      components: [
        { variantId: TOP, quantityPerKit: 1 },
        { variantId: CAL, quantityPerKit: 1 },
      ],
      quantity: 5, origin: 'KIT_UI', idempotencyKey: 'assembly-1',
    });

    expect(repo.getBalance(ORG, LOC, TOP).onHand).toBe(5);
    expect(repo.getBalance(ORG, LOC, CAL).onHand).toBe(1);
    expect(repo.getBalance(ORG, LOC, KIT).onHand).toBe(5);
    const group = movs[0].groupId;
    expect(group).toBeTruthy();
    expect(movs.every((m) => m.groupId === group)).toBe(true);
  });

  it('não permite montar mais kits do que os componentes suportam', async () => {
    const repo = new InMemoryInventoryRepository();
    const engine = new InventoryEngine(repo);
    const TOP = 'T'; const CAL = 'C'; const KIT = 'K';
    await engine.productionEntry({ orgId: ORG, locationId: LOC, variantId: TOP, quantity: 3, origin: 'UI' });
    await engine.productionEntry({ orgId: ORG, locationId: LOC, variantId: CAL, quantity: 3, origin: 'UI' });
    await expect(
      engine.assembleKit({
        orgId: ORG, locationId: LOC, kitVariantId: KIT,
        components: [{ variantId: TOP, quantityPerKit: 1 }, { variantId: CAL, quantityPerKit: 1 }],
        quantity: 5, origin: 'KIT_UI',
      }),
    ).rejects.toBeInstanceOf(NegativeStockError);
    // rollback: nada consumido
    expect(repo.getBalance(ORG, LOC, TOP).onHand).toBe(3);
    expect(repo.getBalance(ORG, LOC, CAL).onHand).toBe(3);
    expect(repo.getBalance(ORG, LOC, KIT).onHand).toBe(0);
  });
});

describe('Ajuste autorizado com justificativa pode zerar/negativar', () => {
  it('ADJUSTMENT_OUT com allowNegative exige reason', async () => {
    const repo = new InMemoryInventoryRepository();
    const engine = new InventoryEngine(repo);
    await engine.productionEntry({ orgId: ORG, locationId: LOC, variantId: V, quantity: 2, origin: 'UI' });
    await expect(
      engine.applyMovement({
        orgId: ORG, locationId: LOC, variantId: V, type: MovementType.ADJUSTMENT_OUT,
        quantity: 5, origin: 'UI', allowNegative: true, // sem reason
      }),
    ).rejects.toThrow();
  });
});
