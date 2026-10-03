import { IQueryCache } from './IQueryCache';
import { MemoryQueryCache } from './MemoryQueryCache';

export interface TaggedQueryCacheOptions {
  underlyingCache?: IQueryCache;
}

/**
 * Advanced cache layer supporting tag-based associations and wildcard tag invalidations.
 *
 * @example
 * ```ts
 * const cache = new TaggedQueryCache();
 * await cache.set('users:active', users, 60000, ['users', 'users:active']);
 * await cache.set('user:1', user1, 60000, ['users', 'users:1']);
 *
 * // Invalidate everything matching 'users:*' or specific 'users' tag
 * await cache.tag('users:*').invalidate();
 * ```
 */
export class TaggedQueryCache implements IQueryCache {
  private readonly _cache: IQueryCache;
  private readonly _keyToTags = new Map<string, Set<string>>();
  private readonly _tagToKeys = new Map<string, Set<string>>();

  constructor(options?: TaggedQueryCacheOptions) {
    this._cache = options?.underlyingCache ?? new MemoryQueryCache();
  }

  public get underlyingCache(): IQueryCache {
    return this._cache;
  }

  public async get<T>(key: string): Promise<T | null> {
    return this._cache.get<T>(key);
  }

  /**
   * Stores a value in the cache with optional TTL and tags.
   */
  public async set<T>(key: string, value: T, ttlMs?: number, tags?: string[]): Promise<void> {
    // Remove previous tag mappings for this key if overwriting
    this._removeKeyTagMappings(key);

    await this._cache.set(key, value, ttlMs);

    if (tags && tags.length > 0) {
      const keyTags = new Set<string>();
      for (const t of tags) {
        keyTags.add(t);
        let keys = this._tagToKeys.get(t);
        if (!keys) {
          keys = new Set();
          this._tagToKeys.set(t, keys);
        }
        keys.add(key);
      }
      this._keyToTags.set(key, keyTags);
    }
  }

  public async delete(key: string): Promise<void> {
    this._removeKeyTagMappings(key);
    await this._cache.delete(key);
  }

  public async clear(): Promise<void> {
    this._keyToTags.clear();
    this._tagToKeys.clear();
    await this._cache.clear();
  }

  /**
   * Returns all tags currently associated with a cache key.
   */
  public getTagsForKey(key: string): string[] {
    const tags = this._keyToTags.get(key);
    return tags ? Array.from(tags) : [];
  }

  /**
   * Returns all cache keys currently associated with a given tag.
   */
  public getKeysForTag(tag: string): string[] {
    const keys = this._tagToKeys.get(tag);
    return keys ? Array.from(keys) : [];
  }

  /**
   * Invalidates all cache entries tagged with the given tag or wildcard pattern (e.g. 'users:*').
   */
  public async invalidateTag(tagPattern: string): Promise<string[]> {
    const keysToInvalidate = new Set<string>();

    if (tagPattern.includes('*')) {
      const regexPattern = new RegExp(
        '^' + tagPattern.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*') + '$',
      );
      for (const [tag, keys] of this._tagToKeys.entries()) {
        if (regexPattern.test(tag)) {
          for (const k of keys) {
            keysToInvalidate.add(k);
          }
        }
      }
    } else {
      const keys = this._tagToKeys.get(tagPattern);
      if (keys) {
        for (const k of keys) {
          keysToInvalidate.add(k);
        }
      }
    }

    const invalidatedList = Array.from(keysToInvalidate);
    for (const key of invalidatedList) {
      await this.delete(key);
    }

    return invalidatedList;
  }

  /**
   * Invalidates multiple tags or patterns in a single operation.
   */
  public async invalidateTags(tagPatterns: string[]): Promise<string[]> {
    const allInvalidated = new Set<string>();
    for (const pattern of tagPatterns) {
      const keys = await this.invalidateTag(pattern);
      for (const k of keys) {
        allInvalidated.add(k);
      }
    }
    return Array.from(allInvalidated);
  }

  /**
   * Fluent API for operating on a tag or pattern.
   *
   * @example
   * ```ts
   * await cache.tag('users:*').invalidate();
   * ```
   */
  public tag(tagOrPattern: string | string[]) {
    const patterns = Array.isArray(tagOrPattern) ? tagOrPattern : [tagOrPattern];
    return {
      invalidate: async (): Promise<string[]> => {
        return this.invalidateTags(patterns);
      },
      getKeys: (): string[] => {
        const keys = new Set<string>();
        for (const p of patterns) {
          if (p.includes('*')) {
            const regex = new RegExp(
              '^' + p.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&').replace(/\*/g, '.*') + '$',
            );
            for (const [t, kSet] of this._tagToKeys.entries()) {
              if (regex.test(t)) {
                for (const k of kSet) keys.add(k);
              }
            }
          } else {
            const kSet = this._tagToKeys.get(p);
            if (kSet) {
              for (const k of kSet) keys.add(k);
            }
          }
        }
        return Array.from(keys);
      },
    };
  }

  private _removeKeyTagMappings(key: string): void {
    const tags = this._keyToTags.get(key);
    if (tags) {
      for (const t of tags) {
        const keys = this._tagToKeys.get(t);
        if (keys) {
          keys.delete(key);
          if (keys.size === 0) {
            this._tagToKeys.delete(t);
          }
        }
      }
      this._keyToTags.delete(key);
    }
  }
}
