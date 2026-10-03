import { INoSqlAdapter, MongoDbAdapter, MockNoSqlAdapter, NoSqlProvider } from '../src/nosql';
import { ConnectionException, QueryException } from '../src/errors';
import { DRIVER_REGISTRY, normalizeProvider, loadDriver } from '../src/adapters/DriverLoader';

describe('NoSQL Architecture — Phase 1 & Phase 2 (INoSqlAdapter & MongoDbAdapter)', () => {
  describe('DriverLoader Integration', () => {
    it('recognizes mongodb in DRIVER_REGISTRY and normalizeProvider', () => {
      expect(DRIVER_REGISTRY.mongodb).toBeDefined();
      expect(DRIVER_REGISTRY.mongodb.packageName).toBe('mongodb');
      expect(DRIVER_REGISTRY.mongodb.displayName).toBe('MongoDB');

      expect(normalizeProvider('mongodb')).toBe('mongodb');
      expect(normalizeProvider('mongo')).toBe('mongodb');
      expect(normalizeProvider('MONGODB')).toBe('mongodb');
    });

    it('throws informative ConnectionException if driver is missing when loading dynamically', async () => {
      // Mock require to fail
      await expect(loadDriver('non_existent_driver' as any)).rejects.toThrow(ConnectionException);
    });
  });

  describe('MongoDbAdapter (Phase 2)', () => {
    let mockCol: any;
    let mockDb: any;
    let mockClient: any;
    let adapter: MongoDbAdapter;

    beforeEach(() => {
      mockCol = {
        insertOne: jest.fn().mockResolvedValue({ insertedId: 'id_123', acknowledged: true }),
        insertMany: jest.fn().mockResolvedValue({
          insertedIds: ['id_1', 'id_2'],
          insertedCount: 2,
          acknowledged: true,
        }),
        find: jest.fn().mockReturnValue({
          project: jest.fn().mockReturnThis(),
          sort: jest.fn().mockReturnThis(),
          skip: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          toArray: jest.fn().mockResolvedValue([
            { _id: '1', title: 'Doc 1', score: 10 },
            { _id: '2', title: 'Doc 2', score: 20 },
          ]),
          [Symbol.asyncIterator]: async function* () {
            yield { _id: '1', title: 'Doc 1' };
            yield { _id: '2', title: 'Doc 2' };
          },
        }),
        findOne: jest.fn().mockResolvedValue({ _id: '1', title: 'Doc 1' }),
        updateOne: jest.fn().mockResolvedValue({
          matchedCount: 1,
          modifiedCount: 1,
          upsertedCount: 0,
          acknowledged: true,
        }),
        updateMany: jest.fn().mockResolvedValue({
          matchedCount: 5,
          modifiedCount: 5,
          upsertedCount: 0,
          acknowledged: true,
        }),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1, acknowledged: true }),
        deleteMany: jest.fn().mockResolvedValue({ deletedCount: 3, acknowledged: true }),
        countDocuments: jest.fn().mockResolvedValue(42),
        aggregate: jest.fn().mockReturnValue({
          toArray: jest.fn().mockResolvedValue([{ total: 100 }]),
        }),
      };

      const mockSession = {
        startTransaction: jest.fn(),
        commitTransaction: jest.fn().mockResolvedValue(undefined),
        abortTransaction: jest.fn().mockResolvedValue(undefined),
        endSession: jest.fn().mockResolvedValue(undefined),
      };

      mockDb = {
        collection: jest.fn().mockReturnValue(mockCol),
        command: jest.fn().mockResolvedValue({ ok: 1 }),
      };

      mockClient = {
        connect: jest.fn().mockResolvedValue(undefined),
        close: jest.fn().mockResolvedValue(undefined),
        db: jest.fn().mockReturnValue(mockDb),
        startSession: jest.fn().mockReturnValue(mockSession),
      };

      adapter = new MongoDbAdapter({
        database: 'test_db',
        client: mockClient,
      });
    });

    it('implements INoSqlAdapter with provider mongodb', () => {
      expect(adapter.provider).toBe('mongodb');
    });

    it('connects and pings successfully', async () => {
      await adapter.connect();
      expect(mockClient.db).toHaveBeenCalledWith('test_db');

      const pingResult = await adapter.ping();
      expect(pingResult).toBe(true);
      expect(mockDb.command).toHaveBeenCalledWith({ ping: 1 });
    });

    it('disconnects gracefully', async () => {
      await adapter.connect();
      await adapter.disconnect();
      // External client is not closed automatically
      expect(mockClient.close).not.toHaveBeenCalled();
    });

    it('performs insertOne and returns InsertOneResult', async () => {
      const res = await adapter.insertOne('posts', { title: 'Hello World' });
      expect(res.insertedId).toBe('id_123');
      expect(res.acknowledged).toBe(true);
      expect(mockCol.insertOne).toHaveBeenCalledWith({ title: 'Hello World' }, undefined);
    });

    it('performs insertMany and returns InsertManyResult', async () => {
      const docs = [{ title: 'Doc 1' }, { title: 'Doc 2' }];
      const res = await adapter.insertMany('posts', docs);
      expect(res.insertedCount).toBe(2);
      expect(res.insertedIds).toEqual(['id_1', 'id_2']);
      expect(mockCol.insertMany).toHaveBeenCalledWith(docs, undefined);
    });

    it('performs find with sort, skip, limit and projection options', async () => {
      const results = await adapter.find<{ _id: string; title: string; score: number }>(
        'posts',
        { status: 'published' },
        {
          projection: { title: 1, score: 1 },
          sort: { score: -1 },
          skip: 10,
          limit: 5,
        },
      );

      expect(mockCol.find).toHaveBeenCalledWith({ status: 'published' }, undefined);
      expect(results).toHaveLength(2);
      expect(results[0].title).toBe('Doc 1');
    });

    it('performs findOne', async () => {
      const doc = await adapter.findOne('posts', { _id: '1' });
      expect(doc).toEqual({ _id: '1', title: 'Doc 1' });
    });

    it('normalizes update payloads automatically into $set if no operator is provided', async () => {
      await adapter.updateOne('posts', { _id: '1' }, { title: 'Updated Title' });
      expect(mockCol.updateOne).toHaveBeenCalledWith(
        { _id: '1' },
        { $set: { title: 'Updated Title' } },
        {},
      );
    });

    it('preserves existing MongoDB atomic operators ($set, $inc, etc.) in updates', async () => {
      await adapter.updateOne(
        'posts',
        { _id: '1' },
        { $inc: { views: 1 }, $set: { status: 'popular' } },
        { upsert: true },
      );
      expect(mockCol.updateOne).toHaveBeenCalledWith(
        { _id: '1' },
        { $inc: { views: 1 }, $set: { status: 'popular' } },
        { upsert: true },
      );
    });

    it('performs updateMany with operator normalization', async () => {
      const res = await adapter.updateMany('posts', { archived: true }, { status: 'archived' });
      expect(res.matchedCount).toBe(5);
      expect(res.modifiedCount).toBe(5);
      expect(mockCol.updateMany).toHaveBeenCalledWith(
        { archived: true },
        { $set: { status: 'archived' } },
        {},
      );
    });

    it('performs deleteOne and deleteMany', async () => {
      const del1 = await adapter.deleteOne('posts', { _id: '1' });
      expect(del1.deletedCount).toBe(1);

      const delMany = await adapter.deleteMany('posts', { status: 'draft' });
      expect(delMany.deletedCount).toBe(3);
    });

    it('performs countDocuments', async () => {
      const count = await adapter.countDocuments('posts', { status: 'active' }, { skip: 5 });
      expect(count).toBe(42);
      expect(mockCol.countDocuments).toHaveBeenCalledWith({ status: 'active' }, { skip: 5 });
    });

    it('performs aggregate pipelines', async () => {
      const pipeline = [
        { $match: { score: { $gt: 50 } } },
        { $group: { _id: '$category', total: { $sum: 1 } } },
      ];
      const aggResult = await adapter.aggregate('posts', pipeline, { allowDiskUse: true });
      expect(aggResult).toEqual([{ total: 100 }]);
      expect(mockCol.aggregate).toHaveBeenCalledWith(pipeline, { allowDiskUse: true });
    });

    it('handles ACID multi-document transactions using ClientSession', async () => {
      const tx = await adapter.beginTransaction();
      expect(mockClient.startSession).toHaveBeenCalled();

      await tx.commit();
      const session = tx.session as any;
      expect(session.commitTransaction).toHaveBeenCalled();
      expect(session.endSession).toHaveBeenCalled();
    });

    it('supports streaming via executeStream', async () => {
      const stream = adapter.executeStream('posts', {});
      const items: any[] = [];
      for await (const doc of stream) {
        items.push(doc);
      }
      expect(items).toHaveLength(2);
      expect(items[0]._id).toBe('1');
    });

    it('throws QueryException on collection errors', async () => {
      mockCol.insertOne.mockRejectedValueOnce(new Error('Duplicate key E11000'));
      await expect(adapter.insertOne('posts', { _id: '1' })).rejects.toThrow(QueryException);
    });
  });

  describe('MockNoSqlAdapter (In-Memory Verification)', () => {
    let mockAdapter: MockNoSqlAdapter;

    beforeEach(async () => {
      mockAdapter = new MockNoSqlAdapter();
      await mockAdapter.connect();
    });

    afterEach(async () => {
      await mockAdapter.disconnect();
    });

    it('conforms to INoSqlAdapter with provider "mock"', () => {
      expect(mockAdapter.provider).toBe('mock');
      expect(mockAdapter.connected).toBe(true);
    });

    it('supports basic CRUD operations in memory', async () => {
      // Insert
      const ins1 = await mockAdapter.insertOne('users', { name: 'Alice', age: 30, role: 'admin' });
      const ins2 = await mockAdapter.insertOne('users', { name: 'Bob', age: 25, role: 'member' });
      expect(ins1.insertedId).toBeDefined();
      expect(ins2.insertedId).toBeDefined();

      // Count
      expect(await mockAdapter.countDocuments('users')).toBe(2);

      // Find all
      const all = await mockAdapter.find('users');
      expect(all).toHaveLength(2);

      // Filter with $gt
      const older = await mockAdapter.find<{ name: string; age: number; role: string }>('users', {
        age: { $gt: 26 },
      });
      expect(older).toHaveLength(1);
      expect(older[0].name).toBe('Alice');

      // Update with $set
      await mockAdapter.updateOne('users', { name: 'Bob' }, { $set: { role: 'moderator' } });
      const bob = await mockAdapter.findOne<{ name: string; role: string }>('users', {
        name: 'Bob',
      });
      expect(bob?.role).toBe('moderator');

      // Delete
      await mockAdapter.deleteOne('users', { name: 'Alice' });
      expect(await mockAdapter.countDocuments('users')).toBe(1);
    });

    it('supports query comparison operators ($eq, $ne, $gte, $lte, $in, $nin, $regex)', async () => {
      await mockAdapter.insertMany('products', [
        { sku: 'A1', price: 10, tags: ['sale', 'electronics'] },
        { sku: 'B2', price: 20, tags: ['electronics'] },
        { sku: 'C3', price: 30, tags: ['home'] },
      ]);

      // $in
      const electronics = await mockAdapter.find<{ sku: string; price: number }>('products', {
        sku: { $in: ['A1', 'B2'] },
      });
      expect(electronics).toHaveLength(2);

      // $gte and $lte
      const mid = await mockAdapter.find<{ sku: string; price: number }>('products', {
        price: { $gte: 15, $lte: 25 },
      });
      expect(mid).toHaveLength(1);
      expect(mid[0].sku).toBe('B2');

      // $regex
      const matched = await mockAdapter.find<{ sku: string; price: number }>('products', {
        sku: { $regex: '^C' },
      });
      expect(matched).toHaveLength(1);
      expect(matched[0].sku).toBe('C3');
    });

    it('supports sort, skip, limit, and projection', async () => {
      await mockAdapter.insertMany('items', [
        { code: 'X', order: 1, secret: 'hide_me' },
        { code: 'Y', order: 2, secret: 'hide_me' },
        { code: 'Z', order: 3, secret: 'hide_me' },
      ]);

      const paged = await mockAdapter.find<{ code: string; order: number; secret?: string }>(
        'items',
        {},
        {
          sort: { order: -1 },
          skip: 1,
          limit: 1,
          projection: { code: 1, order: 1 },
        },
      );

      expect(paged).toHaveLength(1);
      expect(paged[0].code).toBe('Y');
      expect(paged[0].secret).toBeUndefined();
    });

    it('supports aggregate pipeline stages ($match, $sort, $count, $limit)', async () => {
      await mockAdapter.insertMany('events', [
        { type: 'click', val: 10 },
        { type: 'view', val: 5 },
        { type: 'click', val: 20 },
      ]);

      const countResult = await mockAdapter.aggregate('events', [
        { $match: { type: 'click' } },
        { $count: 'clickCount' },
      ]);

      expect(countResult).toEqual([{ clickCount: 2 }]);
    });

    it('supports stream processing with executeStream', async () => {
      await mockAdapter.insertMany('stream_test', [{ n: 1 }, { n: 2 }, { n: 3 }]);

      const collected: number[] = [];
      for await (const doc of mockAdapter.executeStream<{ n: number }>('stream_test')) {
        collected.push(doc.n);
      }
      expect(collected).toEqual([1, 2, 3]);
    });
  });
});
