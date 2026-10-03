import { Table, PrimaryKey, Column } from '../src/decorators';
import { TaggedQueryCache, EntityCache, WriteThroughCache } from '../src/cache';
import { createTestContext } from '../src/testing/InMemoryContext';

@Table('products')
class Product {
  @PrimaryKey()
  id!: number;

  @Column()
  name!: string;

  @Column()
  price!: number;
}

describe('Advanced Caching & Tag Invalidation', () => {
  describe('TaggedQueryCache', () => {
    it('sets, gets, and associates keys with tags', async () => {
      const cache = new TaggedQueryCache();
      await cache.set('p:1', { id: 1, name: 'Phone' }, 10000, ['products', 'category:electronics']);
      await cache.set('p:2', { id: 2, name: 'Shirt' }, 10000, ['products', 'category:clothing']);

      expect(await cache.get('p:1')).toEqual({ id: 1, name: 'Phone' });
      expect(await cache.get('p:2')).toEqual({ id: 2, name: 'Shirt' });

      expect(cache.getTagsForKey('p:1')).toEqual(
        expect.arrayContaining(['products', 'category:electronics']),
      );
      expect(cache.getKeysForTag('category:clothing')).toEqual(['p:2']);
      expect(cache.getKeysForTag('products')).toEqual(expect.arrayContaining(['p:1', 'p:2']));
    });

    it('invalidates specific tags', async () => {
      const cache = new TaggedQueryCache();
      await cache.set('p:1', { id: 1 }, 10000, ['products', 'featured']);
      await cache.set('p:2', { id: 2 }, 10000, ['products']);
      await cache.set('p:3', { id: 3 }, 10000, ['featured']);

      await cache.invalidateTag('featured');

      expect(await cache.get('p:1')).toBeNull();
      expect(await cache.get('p:3')).toBeNull();
      expect(await cache.get('p:2')).toEqual({ id: 2 });
    });

    it('invalidates wildcard pattern tags (e.g. users:*)', async () => {
      const cache = new TaggedQueryCache();
      await cache.set('order:1', { id: 1 }, 10000, ['orders:2026:jan']);
      await cache.set('order:2', { id: 2 }, 10000, ['orders:2026:feb']);
      await cache.set('order:3', { id: 3 }, 10000, ['orders:2025:dec']);

      const invalidated = await cache.invalidateTag('orders:2026:*');
      expect(invalidated).toEqual(expect.arrayContaining(['order:1', 'order:2']));

      expect(await cache.get('order:1')).toBeNull();
      expect(await cache.get('order:2')).toBeNull();
      expect(await cache.get('order:3')).toEqual({ id: 3 });
    });

    it('supports fluent tag API', async () => {
      const cache = new TaggedQueryCache();
      await cache.set('p:1', { id: 1 }, 10000, ['items:sale']);
      await cache.set('p:2', { id: 2 }, 10000, ['items:regular']);

      const tagHandle = cache.tag('items:*');
      expect(tagHandle.getKeys()).toEqual(expect.arrayContaining(['p:1', 'p:2']));

      await tagHandle.invalidate();
      expect(await cache.get('p:1')).toBeNull();
      expect(await cache.get('p:2')).toBeNull();
    });

    it('cleans up old tags when a key is overwritten with new tags or deleted', async () => {
      const cache = new TaggedQueryCache();
      await cache.set('item:1', 'val1', 10000, ['tagA', 'tagB']);
      expect(cache.getKeysForTag('tagA')).toEqual(['item:1']);

      // Overwrite with new tags
      await cache.set('item:1', 'val2', 10000, ['tagC']);
      expect(cache.getKeysForTag('tagA')).toEqual([]);
      expect(cache.getKeysForTag('tagC')).toEqual(['item:1']);

      // Delete
      await cache.delete('item:1');
      expect(cache.getKeysForTag('tagC')).toEqual([]);
      expect(await cache.get('item:1')).toBeNull();
    });
  });

  describe('EntityCache (L2 Cache)', () => {
    it('stores and retrieves entities by target class and ID', async () => {
      const entityCache = new EntityCache();
      const product = { id: 42, name: 'Keyboard', price: 99 };

      await entityCache.set(Product, 42, product);
      const retrieved = await entityCache.get(Product, 42);
      expect(retrieved).toEqual(product);

      // Other IDs return null
      expect(await entityCache.get(Product, 999)).toBeNull();
    });

    it('supports getMany and setMany', async () => {
      const entityCache = new EntityCache();
      const p1 = { id: 10, name: 'P10', price: 10 };
      const p2 = { id: 20, name: 'P20', price: 20 };

      await entityCache.setMany(Product, [
        { id: 10, entity: p1 },
        { id: 20, entity: p2 },
      ]);

      const map = await entityCache.getMany(Product, [10, 20, 30]);
      expect(map.size).toBe(2);
      expect(map.get(10)).toEqual(p1);
      expect(map.get(20)).toEqual(p2);
      expect(map.get(30)).toBeUndefined();
    });

    it('invalidates all cached entities of a given entity type', async () => {
      const entityCache = new EntityCache();
      await entityCache.set(Product, 1, { id: 1, name: 'P1', price: 10 });
      await entityCache.set(Product, 2, { id: 2, name: 'P2', price: 20 });

      await entityCache.invalidateEntity(Product);

      expect(await entityCache.get(Product, 1)).toBeNull();
      expect(await entityCache.get(Product, 2)).toBeNull();
    });
  });

  describe('WriteThroughCache', () => {
    it('implements read-through caching', async () => {
      const wtCache = new WriteThroughCache();
      let dbCalls = 0;
      const loader = async () => {
        dbCalls++;
        return { id: 1, name: 'Loaded Product' };
      };

      // First call: cache miss, executes loader
      const result1 = await wtCache.readThrough('product:1', loader, { tags: ['products'] });
      expect(result1.name).toBe('Loaded Product');
      expect(dbCalls).toBe(1);

      // Second call: cache hit, loader NOT executed
      const result2 = await wtCache.readThrough('product:1', loader);
      expect(result2.name).toBe('Loaded Product');
      expect(dbCalls).toBe(1);
    });

    it('implements write-through and delete-through', async () => {
      const wtCache = new WriteThroughCache();
      let persisted = false;

      const saved = await wtCache.writeThrough(
        'product:99',
        { id: 99, name: 'Mouse', price: 40 },
        async val => {
          persisted = true;
          return { ...val, price: 45 }; // simulates DB trigger or generated field
        },
      );

      expect(persisted).toBe(true);
      expect(saved.price).toBe(45);
      expect(await wtCache.taggedCache.get('product:99')).toEqual({
        id: 99,
        name: 'Mouse',
        price: 45,
      });

      let deleted = false;
      await wtCache.deleteThrough('product:99', async () => {
        deleted = true;
      });
      expect(deleted).toBe(true);
      expect(await wtCache.taggedCache.get('product:99')).toBeNull();
    });

    it('synchronizes with DbContext lifecycle events', async () => {
      const wtCache = new WriteThroughCache();
      const ctx = createTestContext();
      wtCache.attachToContext(ctx);

      // Populate entity and query caches
      await wtCache.entityCache.set('products', 1, { id: 1, name: 'Old' });
      await wtCache.taggedCache.set('query:products:all', [{ id: 1 }], 10000, ['products']);

      expect(await wtCache.entityCache.get('products', 1)).not.toBeNull();
      expect(await wtCache.taggedCache.get('query:products:all')).not.toBeNull();

      // Emit updated event on context
      await ctx.emit('products:updated', { id: 1, name: 'Updated' }, 'products');

      // Should be evicted
      expect(await wtCache.entityCache.get('products', 1)).toBeNull();
      expect(await wtCache.taggedCache.get('query:products:all')).toBeNull();
    });
  });
});
