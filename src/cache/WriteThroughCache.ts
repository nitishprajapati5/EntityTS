import { TaggedQueryCache } from './TaggedQueryCache';
import { EntityCache } from './EntityCache';
import { EntityTarget } from '../set/DbSet';
import { DbContext } from '../context/DbContext';
import { ModelMetadataRegistry } from '../model/EntityMetadata';

export interface WriteThroughCacheOptions {
  taggedCache?: TaggedQueryCache;
  entityCache?: EntityCache;
  defaultTtlMs?: number;
}

export interface ReadThroughOptions {
  ttlMs?: number;
  tags?: string[];
}

/**
 * High-performance Write-Through & Read-Through caching coordinator.
 * Automatically synchronizes cache state with database operations, evicts stale entries,
 * and handles L2 entity cache invalidation on mutations.
 *
 * @example
 * ```ts
 * const wtCache = new WriteThroughCache();
 *
 * // Read-through caching
 * const user = await wtCache.readThrough(`user:${id}`, () => fetchUserFromDb(id), { tags: ['users'] });
 *
 * // Write-through persistence
 * await wtCache.saveEntityThrough(User, user.id, user, u => ctx.set(User).update(u.id, u));
 * ```
 */
export class WriteThroughCache {
  public readonly taggedCache: TaggedQueryCache;
  public readonly entityCache: EntityCache;
  private readonly _defaultTtlMs?: number;

  constructor(options?: WriteThroughCacheOptions) {
    this.taggedCache = options?.taggedCache ?? new TaggedQueryCache();
    this.entityCache = options?.entityCache ?? new EntityCache({ cache: this.taggedCache });
    this._defaultTtlMs = options?.defaultTtlMs;
  }

  /**
   * Retrieves an item from cache if present; otherwise runs `loader()`, caches the result, and returns it.
   */
  public async readThrough<T>(
    key: string,
    loader: () => Promise<T>,
    options?: ReadThroughOptions,
  ): Promise<T> {
    const cached = await this.taggedCache.get<T>(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const fresh = await loader();
    if (fresh !== null && fresh !== undefined) {
      await this.taggedCache.set(key, fresh, options?.ttlMs ?? this._defaultTtlMs, options?.tags);
    }
    return fresh;
  }

  /**
   * Executes a database write and updates the cache with the newly persisted data.
   */
  public async writeThrough<T>(
    key: string,
    value: T,
    writer: (val: T) => Promise<T>,
    options?: ReadThroughOptions,
  ): Promise<T> {
    const persisted = await writer(value);
    await this.taggedCache.set(key, persisted, options?.ttlMs ?? this._defaultTtlMs, options?.tags);
    return persisted;
  }

  /**
   * Executes a database delete, evicts the cache key, and invalidates any related tags.
   */
  public async deleteThrough(
    key: string,
    deleter: () => Promise<void>,
    invalidateTags?: string[],
  ): Promise<void> {
    await deleter();
    await this.taggedCache.delete(key);
    if (invalidateTags && invalidateTags.length > 0) {
      await this.taggedCache.invalidateTags(invalidateTags);
    }
  }

  /**
   * Read-through helper specifically for entities by primary key via the L2 EntityCache.
   */
  public async readEntityThrough<T extends object>(
    target: EntityTarget<T>,
    id: unknown,
    loader: () => Promise<T | null>,
    ttlMs?: number,
  ): Promise<T | null> {
    const cached = await this.entityCache.get<T>(target, id);
    if (cached !== null) {
      return cached;
    }

    const fresh = await loader();
    if (fresh !== null) {
      await this.entityCache.set(target, id, fresh, ttlMs ?? this._defaultTtlMs);
    }
    return fresh;
  }

  /**
   * Write-through helper for entities: executes persister, writes to L2 EntityCache,
   * and invalidates query cache collections tagged with the entity type.
   */
  public async saveEntityThrough<T extends object>(
    target: EntityTarget<T>,
    id: unknown,
    entity: T,
    persister: (entity: T) => Promise<T>,
    ttlMs?: number,
  ): Promise<T> {
    const persisted = await persister(entity);
    await this.entityCache.set(target, id, persisted, ttlMs ?? this._defaultTtlMs);
    // Invalidate list queries tagged with entity table name
    const entityName = this._getEntityName(target);
    await this.taggedCache.invalidateTag(`${entityName}:list`);
    return persisted;
  }

  /**
   * Delete helper for entities: executes deleter, removes from L2 EntityCache,
   * and invalidates collection tags.
   */
  public async deleteEntityThrough<T extends object>(
    target: EntityTarget<T>,
    id: unknown,
    deleter: () => Promise<void>,
  ): Promise<void> {
    await deleter();
    await this.entityCache.delete(target, id);
    const entityName = this._getEntityName(target);
    await this.taggedCache.invalidateTag(`${entityName}:list`);
  }

  /**
   * Attaches this cache to a DbContext instance, listening for entity lifecycle events
   * and automatically invalidating corresponding L2 cache entries and query tags.
   */
  public attachToContext(context: DbContext): this {
    const extractInfo = (payload: any, eventName?: string, alias?: string) => {
      const entity = payload?.entity ?? payload;
      let table = alias || '';
      if (!table && eventName && eventName.includes(':')) {
        const p = eventName.split(':')[0];
        if (p !== '*') table = p;
      }
      if (!table && entity?.constructor?.name && entity.constructor.name !== 'Object') {
        table = entity.constructor.name;
      }
      const id = payload?.id ?? entity?.id;
      return { entity, table, id };
    };

    context.events.on('*:created', async (payload: any, eventName?: string, alias?: string) => {
      const { table } = extractInfo(payload, eventName, alias);
      if (table) {
        await this.taggedCache.invalidateTag(table);
        await this.taggedCache.invalidateTag(`${table}:*`);
      }
    });

    context.events.on('*:updated', async (payload: any, eventName?: string, alias?: string) => {
      const { table, id } = extractInfo(payload, eventName, alias);
      if (table) {
        if (id !== undefined) {
          await this.entityCache.delete(table, id);
        }
        await this.taggedCache.invalidateTag(table);
        await this.taggedCache.invalidateTag(`${table}:*`);
      }
    });

    context.events.on('*:deleted', async (payload: any, eventName?: string, alias?: string) => {
      const { table, id } = extractInfo(payload, eventName, alias);
      if (table) {
        if (id !== undefined) {
          await this.entityCache.delete(table, id);
        }
        await this.taggedCache.invalidateTag(table);
        await this.taggedCache.invalidateTag(`${table}:*`);
      }
    });

    return this;
  }

  private _getEntityName(target: EntityTarget): string {
    if (typeof target === 'string') return target;
    const meta = ModelMetadataRegistry.getInstance().get(target);
    return meta?.tableName || target.name;
  }
}
