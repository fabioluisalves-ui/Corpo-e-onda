import { randomUUID } from 'node:crypto';
import {
  Balance,
  InventoryRepository,
  InventoryUnitOfWork,
  Movement,
} from '../src/domain/inventory/inventory.types';

/**
 * Repositório em memória para testes de domínio.
 * Simula:
 *  - transações (rollback ao lançar erro),
 *  - bloqueio de linha SELECT ... FOR UPDATE via mutex por chave de saldo,
 *  - índice único de idempotência.
 *
 * A serialização de lockBalance permite testar concorrência real:
 * duas transações que travam o mesmo saldo são serializadas.
 */
export class InMemoryInventoryRepository implements InventoryRepository {
  public movements: Movement[] = [];
  public balances = new Map<string, Balance>();
  private idempotency = new Map<string, Movement>();
  private lockTails = new Map<string, Promise<void>>();

  private balKey(org: string, loc: string, variant: string): string {
    return `${org}::${loc}::${variant}`;
  }
  private idemKey(org: string, key: string): string {
    return `${org}::${key}`;
  }

  private async acquire(key: string): Promise<() => void> {
    let release!: () => void;
    const nextHold = new Promise<void>((r) => (release = r));
    const prev = this.lockTails.get(key) ?? Promise.resolve();
    this.lockTails.set(
      key,
      prev.then(() => nextHold),
    );
    await prev; // aguarda o detentor anterior liberar
    return release;
  }

  async transaction<T>(fn: (uow: InventoryUnitOfWork) => Promise<T>): Promise<T> {
    const releases: Array<() => void> = [];
    // Rollback POR TRANSAÇÃO: guardamos apenas o estado das chaves que ESTA
    // transação travou e as inserções que ela fez. Assim o rollback não sobrescreve
    // o commit de transações concorrentes (como faria um snapshot global).
    const lockedOriginals = new Map<string, Balance | undefined>();
    const insertedMovements: Movement[] = [];
    const insertedIdemKeys: string[] = [];

    const repo = this;
    const uow: InventoryUnitOfWork = {
      newId: () => randomUUID(),
      now: () => new Date(),
      async findMovementByIdempotencyKey(org, key) {
        return repo.idempotency.get(repo.idemKey(org, key)) ?? null;
      },
      async lockBalance(org, loc, variant) {
        const key = repo.balKey(org, loc, variant);
        const release = await repo.acquire(key);
        releases.push(release);
        if (!lockedOriginals.has(key)) {
          const cur = repo.balances.get(key);
          lockedOriginals.set(key, cur ? { ...cur } : undefined);
        }
        const existing = repo.balances.get(key);
        return existing
          ? { ...existing }
          : { orgId: org, locationId: loc, variantId: variant, onHand: 0, reserved: 0 };
      },
      async insertMovement(m) {
        repo.movements.push(m);
        insertedMovements.push(m);
        if (m.idempotencyKey) {
          const ik = repo.idemKey(m.orgId, m.idempotencyKey);
          repo.idempotency.set(ik, m);
          insertedIdemKeys.push(ik);
        }
        return m;
      },
      async upsertBalance(b) {
        repo.balances.set(repo.balKey(b.orgId, b.locationId, b.variantId), { ...b });
      },
    };

    try {
      return await fn(uow);
    } catch (err) {
      // rollback apenas do que ESTA transação alterou
      for (const [key, orig] of lockedOriginals) {
        if (orig === undefined) repo.balances.delete(key);
        else repo.balances.set(key, orig);
      }
      for (const m of insertedMovements) {
        const idx = repo.movements.indexOf(m);
        if (idx >= 0) repo.movements.splice(idx, 1);
      }
      for (const ik of insertedIdemKeys) repo.idempotency.delete(ik);
      throw err;
    } finally {
      for (const r of releases) r();
    }
  }

  getBalance(org: string, loc: string, variant: string): Balance {
    return (
      this.balances.get(this.balKey(org, loc, variant)) ?? {
        orgId: org,
        locationId: loc,
        variantId: variant,
        onHand: 0,
        reserved: 0,
      }
    );
  }
}
