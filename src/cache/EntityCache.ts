import { IQueryCache } from './IQueryCache';
import { TaggedQueryCache } from './TaggedQueryCache';
import { ModelMetadataRegistry } from '../model/EntityMetadata';
import { EntityTarget } from '../set/DbSet';

export interface EntityCacheOptions {
  cache?: IQueryCache;
  defaultTtlMs?: number;
}

/**
 * Second-level (L2) cache for entities keyed by their primary key.
 * Integrates with TaggedQueryCache to enable entity-wide and per-record cache invalidation.
 *
 * @example
 * ```ts
 * const entityCache = new EntityCache();
 * await entityCache.set(User, 1, userInstance, 60000);
 * const cachedUser = await entityCache.get(User, 1);
 * await entityCache.invalidateEntity(User); // evicts all User cache entries
 * ```
 */
export class EntityCache {
  private readonly _cache: TaggedQueryCache;
  private readonly _defaultTtlMs?: number;

  constructor(options?: EntityCacheOptions) {
    if (options?.cache instanceof TaggedQueryCache) {
      this._cache = options.cache;
    } else {
      this._cache = new TaggedQueryCache({ underlyingCache: options?.cache });
    }
    this._defaultTtlMs = options?.defaultTtlMs;
  }

  public get taggedCache(): TaggedQueryCache {
    return this._cache;
  }

  /**
   * Retrieves an entity from the L2 cache by primary key.
   */
  public async get<T extends object>(target: EntityTarget<T>, id: unknown): Promise<T | null> {
    const key = this._buildKey(target, id);
    return this._cache.get<T>(key);
  }

  /**
   * Stores an entity in the L2 cache with optional TTL.
   */
  public async set<T extends object>(
    target: EntityTarget<T>,
    id: unknown,
    entity: T,
    ttlMs?: number,
  ): Promise<void> {
    const key = this._buildKey(target, id);
    const entityName = this._getEntityName(target);
    const tags = [entityName, `${entityName}:${String(id)}`];
    await this._cache.set(key, entity, ttlMs ?? this._defaultTtlMs, tags);
  }

  /**
   * Removes an entity from the L2 cache by primary key.
   */
  public async delete<T extends object>(target: EntityTarget<T>, id: unknown): Promise<void> {
    const key = this._buildKey(target, id);
    await this._cache.delete(key);
  }

  /**
   * Invalidates all cached instances of the given entity type.
   */
  public async invalidateEntity<T extends object>(target: EntityTarget<T>): Promise<string[]> {
    const entityName = this._getEntityName(target);
    return this._cache.invalidateTag(entityName);
  }

  /**
   * Retrieves multiple entities by primary key from L2 cache.
   * Returns a map of ID -> Entity (omitting missing IDs).
   */
  public async getMany<T extends object>(
    target: EntityTarget<T>,
    ids: unknown[],
  ): Promise<Map<unknown, T>> {
    const result = new Map<unknown, T>();
    for (const id of ids) {
      const item = await this.get(target, id);
      if (item !== null) {
        result.set(id, item);
      }
    }
    return result;
  }

  /**
   * Stores multiple entities in L2 cache.
   */
  public async setMany<T extends object>(
    target: EntityTarget<T>,
    items: { id: unknown; entity: T }[],
    ttlMs?: number,
  ): Promise<void> {
    for (const item of items) {
      await this.set(target, item.id, item.entity, ttlMs);
    }
  }

  /**
   * Clears the entire entity cache.
   */
  public async clear(): Promise<void> {
    await this._cache.clear();
  }

  private _getEntityName(target: EntityTarget): string {
    if (typeof target === 'string') return target;
    const meta = ModelMetadataRegistry.getInstance().get(target);
    return meta?.tableName || target.name;
  }

  private _buildKey(target: EntityTarget, id: unknown): string {
    const name = this._getEntityName(target);
    return `entity:${name}:${String(id)}`;
  }
}
