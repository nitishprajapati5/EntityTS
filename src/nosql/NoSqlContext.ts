import { INoSqlAdapter, NoSqlTransaction } from './INoSqlAdapter';
import { NoSqlSet } from './NoSqlSet';
import { DbException } from '../errors';

export type CollectionTarget<T = any> = (new (...args: any[]) => T) | string;

/**
 * Top-level context for NoSQL / MongoDB applications in entityTS.
 *
 * Provides typed LINQ `NoSqlSet<T>` collections, connection lifecycle management,
 * and scoped ACID multi-document transactions.
 */
export class NoSqlContext {
  private readonly collectionSets = new Map<string, NoSqlSet<any>>();

  constructor(public readonly adapter: INoSqlAdapter) {}

  /**
   * Returns a typed `NoSqlSet<T>` for the specified collection name or entity class.
   *
   * @param target - Collection name or Entity class constructor.
   * @example
   * ```ts
   * const users = ctx.collection<User>('users');
   * const activeAdmins = await users
   *   .where(u => u.age >= 18 && u.role === 'admin')
   *   .orderByDescending(u => u.createdAt)
   *   .toList();
   * ```
   */
  public collection<T extends object = any>(target: CollectionTarget<T>): NoSqlSet<T> {
    const name = this.resolveCollectionName(target);
    let set = this.collectionSets.get(name);
    if (!set) {
      set = new NoSqlSet<T>(this.adapter, name);
      this.collectionSets.set(name, set);
    }
    return set as NoSqlSet<T>;
  }

  /**
   * Connects the underlying adapter.
   */
  public async connect(): Promise<void> {
    await this.adapter.connect();
  }

  /**
   * Disconnects the underlying adapter.
   */
  public async disconnect(): Promise<void> {
    await this.adapter.disconnect();
  }

  /**
   * Starts a new multi-document transaction on the underlying database.
   */
  public async beginTransaction(): Promise<NoSqlTransaction> {
    if (!this.adapter.beginTransaction) {
      throw new DbException(
        `Adapter '${this.adapter.provider}' does not support multi-document transactions.`,
      );
    }
    return this.adapter.beginTransaction();
  }

  /**
   * Runs an operation inside an atomic multi-document transaction.
   * Commits automatically on completion or rolls back if an error occurs.
   */
  public async withTransaction<R>(fn: (tx: NoSqlTransaction) => Promise<R>): Promise<R> {
    const tx = await this.beginTransaction();
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
    }
  }

  /**
   * Alias for withTransaction().
   */
  public async useTransaction<R>(fn: (tx: NoSqlTransaction) => Promise<R>): Promise<R> {
    return this.withTransaction(fn);
  }

  /**
   * Ensures that defined indexes exist across collections.
   */
  public async ensureIndexes(
    indexMap: Record<
      string,
      Array<{ keys: Record<string, 1 | -1 | 'text' | '2dsphere' | string>; options?: any }>
    > = {},
  ): Promise<void> {
    if (typeof this.adapter.createIndex !== 'function') return;

    for (const [colName, indexes] of Object.entries(indexMap)) {
      for (const idx of indexes) {
        await this.adapter.createIndex(colName, idx.keys, idx.options);
      }
    }
  }

  private resolveCollectionName<T>(target: CollectionTarget<T>): string {
    if (typeof target === 'string') {
      return target;
    }
    const className = target.name || 'document';
    return className.toLowerCase().endsWith('s')
      ? className.toLowerCase()
      : `${className.toLowerCase()}s`;
  }
}
