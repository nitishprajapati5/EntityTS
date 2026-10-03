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
   * Runs an operation inside an atomic multi-document transaction.
   * Commits automatically on completion or rolls back if an error occurs.
   */
  public async withTransaction<R>(fn: (tx: NoSqlTransaction) => Promise<R>): Promise<R> {
    if (!this.adapter.beginTransaction) {
      throw new DbException(
        `Adapter '${this.adapter.provider}' does not support multi-document transactions.`,
      );
    }

    const tx = await this.adapter.beginTransaction();
    try {
      const result = await fn(tx);
      await tx.commit();
      return result;
    } catch (err) {
      await tx.rollback();
      throw err;
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
